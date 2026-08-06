import Phaser from "phaser";
import { domControlFocused } from "@/lib/focus";
import { contextHealth, describeWard } from "@/lib/format";
import { hexToNumber, type WorldOverrides } from "@/lib/overrides";
import type {
  AgentSnapshot,
  AgentStatus,
  ShopKind,
  Ward,
} from "@/lib/protocol";
import { hintOnce, localToast } from "@/lib/socket";
import {
  agentsAtom,
  cheatWarpAtom,
  chronicleOpenAtom,
  discoveredAreasAtom,
  gameStore,
  type Interactable,
  lastSteerAtom,
  longWaitAtom,
  mapTravelAtom,
  nearbyAtom,
  noclipAtom,
  overridesAtom,
  playerAreaAtom,
  playerPosAtom,
  revealMapAtom,
  shieldAtom,
  sideQuestsAtom,
  speedBoostAtom,
  uiModeAtom,
  wardsAtom,
  warpTargetAtom,
} from "@/store/gameAtoms";
import {
  AREAS,
  areaAt,
  areaById,
  CELL_H,
  CELL_W,
  cellOrigin,
  GRID,
  inArea,
  LANDINGS,
  saveDiscovered,
  WORLD_H,
  WORLD_W,
} from "./areas";
import { generateTextures, modelTier, shade } from "./textures";
import {
  freeTrophySpot,
  MAX_SUBAGENT_MARKS,
  MAX_VILLAGE_NPCS,
  pickEviction,
  SlotAllocator,
  trophyKindFor,
} from "./villagePlan";

// §1a — the village square is now the hub cell of a 3×3 world. Everything it
// used to own keeps its internal layout, shifted into the center cell; the
// tavern, watchtower, and pond move out to their own areas.
const SQ = cellOrigin("square");
const sq = (x: number, y: number) => ({ x: SQ.x + x, y: SQ.y + y });

const PLAZA = sq(640, 430);
/** §8 — where summoned NPCs walk in from: the south road out of the village. */
const ENTRANCE = sq(640, 810);
const CAMP = sq(985, 760);
const BOARD = sq(810, 398);
/** §18 — the guide waits by the fountain, right where you spawn. */
const GUIDE = sq(560, 540);
// §1a — set apart in their own areas now
const TAVERN = inArea("tavern", 620, 360);
const TOWER = inArea("watchtower", 640, 380);
const POND = inArea("docks", 560, 380);
const WAGON = inArea("frontier", 640, 430);
const ARENA = inArea("arena", 640, 460);
const STALLS = inArea("shopping", 640, 420);
const PLAYER_SPEED = 190;
const INTERACT_RANGE = 64;

/** Fixed idle spots for pinned agents, ringing the plaza (§12). */
const SLOTS = [
  sq(500, 350),
  sq(780, 350),
  sq(480, 520),
  sq(800, 520),
  sq(570, 590),
  sq(710, 590),
];

function slotFor(index: number): { x: number; y: number } {
  return SLOTS[index % SLOTS.length] ?? PLAZA;
}

/** §15 Easter eggs — the village keeps its oddities; the duck follows the pond. */
const EGGS: { id: string; x: number; y: number }[] = [
  { id: "duck", x: POND.x + 90, y: POND.y - 20 },
  { id: "statue1", ...sq(80, 120) },
  { id: "statue2", ...sq(140, 120) },
  { id: "oldman", ...sq(1215, 430) },
  { id: "skeleton", ...sq(1070, 800) },
  { id: "wall", ...sq(60, 260) },
  // §1a flavor for the new areas
  { id: "wagon", x: WAGON.x, y: WAGON.y },
];

/**
 * §14 — where rune circles land. Fixed open-grass spots ringing the village,
 * so a repo's wards always appear in the same places run to run.
 */
const WARD_SPOTS = [
  sq(350, 250),
  sq(930, 250),
  sq(330, 700),
  sq(900, 520),
  sq(450, 810),
  sq(1080, 560),
  sq(250, 430),
  sq(760, 800),
];

/** Deterministic PRNG so the decoration layout is identical every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Circles decorations must stay out of (structures, eggs, and landmarks). */
const KEEPOUT: { x: number; y: number; r: number }[] = [
  { x: PLAZA.x, y: PLAZA.y, r: 210 },
  { x: ENTRANCE.x, y: ENTRANCE.y, r: 90 },
  { x: CAMP.x, y: CAMP.y, r: 90 },
  { x: TAVERN.x, y: TAVERN.y, r: 130 },
  { x: TOWER.x, y: TOWER.y, r: 130 },
  { x: POND.x, y: POND.y, r: 190 },
  { x: GUIDE.x, y: GUIDE.y, r: 50 },
  { ...sq(110, 110), r: 90 }, // statues
  { ...sq(1215, 430), r: 60 }, // old man
  { ...sq(1070, 800), r: 60 }, // skeleton
  { ...sq(60, 260), r: 60 }, // cracked rock
  { ...sq(688, 648), r: 50 }, // gatekeeper post
  // §1a — the new areas' landmarks
  { x: WAGON.x, y: WAGON.y, r: 110 },
  { x: ARENA.x, y: ARENA.y, r: 280 },
  { x: STALLS.x, y: STALLS.y, r: 170 },
  { ...inArea("ruins", 640, 420), r: 250 },
  // §20 — fast-travel landings and their signposts stay clear
  ...AREAS.map((area) => ({ ...LANDINGS[area.id], r: 70 })),
  // §14 — keep scattered greenery out of the rune circles
  ...WARD_SPOTS.map((spot) => ({ ...spot, r: 46 })),
];

function nearStructure(x: number, y: number): boolean {
  // the south road: plaza, out of the village, down to the world's edge
  if (Math.abs(x - PLAZA.x) < 60 && y > PLAZA.y - 20 && y < WORLD_H - 40) {
    return true;
  }
  // the cell-border tree lines and their crossing gaps
  for (let line = 1; line < GRID; line++) {
    if (Math.abs(x - line * CELL_W) < 40 || Math.abs(y - line * CELL_H) < 40) {
      return true;
    }
  }
  return KEEPOUT.some(
    (k) => Phaser.Math.Distance.Between(x, y, k.x, k.y) < k.r,
  );
}

/** §7a — the in-range prompt shows what interacting will do, not a keycap. */
const PROMPT_VERB: Record<Exclude<Interactable, null>["kind"], string> = {
  npc: "talk",
  camp: "visit",
  board: "read",
  tavern: "enter",
  scry: "gaze",
  egg: "look",
  guide: "talk",
  ward: "read",
  trophy: "read",
  dock: "fish",
  shop: "browse",
};

const STATUS_ICON: Record<AgentStatus, string> = {
  summoning: "✨",
  idle: "",
  thinking: "…",
  tool_running: "⚒",
  blocked_permission: "❗",
  compacting: "💫",
  sleeping: "💤",
  ended: "",
  error: "✖",
};

function healthColor(pct: number): number {
  if (pct > 0.5) return 0x53c964;
  if (pct > 0.25) return 0xd4a017;
  return 0xc74a4a;
}

class NpcView {
  container: Phaser.GameObjects.Container;
  readonly home: { x: number; y: number };
  private body: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Text;
  private healthFill: Phaser.GameObjects.Rectangle;
  private minions: Phaser.GameObjects.Arc[] = [];
  private partyBadge: Phaser.GameObjects.Text;
  private campfire: Phaser.GameObjects.Text;
  private statusTween: Phaser.Tweens.Tween | null = null;
  private lastStatus: AgentStatus | null = null;
  private lastTier: string | null = null;
  private finishedTasks = 0;
  private endedHandled = false;
  /** §13 — how many scratch marks returning subagents have left so far. */
  private subagentMarks = 0;

  constructor(
    private scene: Phaser.Scene,
    agent: AgentSnapshot,
    slot: { x: number; y: number },
    from: { x: number; y: number },
    onClick: () => void,
    /** §9 — where to leave this agent's trophy once it's gone for good. */
    private onEnded: (x: number, y: number) => void,
  ) {
    this.home = slot;
    const tier = modelTier(agent.model);
    const shadow = scene.add.image(0, 1, "shadow").setScale(0.55, 0.45);
    // §7a — click/tap the NPC directly; no walking required.
    this.body = scene.add
      .image(0, 0, `npc-${tier}`)
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true });
    this.body.on("pointerdown", onClick);
    // §8a — a forked twin wears a mark, so it's never mistaken for the
    // session it branched from (which is still running elsewhere).
    this.nameText = scene.add
      .text(0, -30, agent.forkedFrom ? `⧉ ${agent.label}` : agent.label, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#e8e3d0",
        backgroundColor: "#151b28",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1);
    const healthBg = scene.add
      .rectangle(-16, -44, 32, 4, 0x151b28)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add
      .rectangle(-16, -44, 32, 4, 0x53c964)
      .setOrigin(0, 0.5);
    this.statusIcon = scene.add
      .text(14, -60, "", { fontSize: "12px" })
      .setOrigin(0.5);
    this.bubble = scene.add
      .text(0, -66, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#c8d4f0",
        backgroundColor: "#151b28",
        padding: { x: 4, y: 3 },
        wordWrap: { width: 150 },
        align: "center",
      })
      .setOrigin(0.5, 1);
    this.partyBadge = scene.add
      .text(-24, -14, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#1a1408",
        backgroundColor: "#d4a017",
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.campfire = scene.add
      .text(24, -8, "🔥", { fontSize: "11px" })
      .setOrigin(0.5)
      .setVisible(false);

    this.container = scene.add.container(from.x, from.y, [
      shadow,
      this.body,
      this.nameText,
      healthBg,
      this.healthFill,
      this.statusIcon,
      this.bubble,
      this.partyBadge,
      this.campfire,
    ]);
    this.container.setDepth(10);

    // §8: entrance animation — walk in from the village edge (or camp).
    scene.tweens.add({
      targets: this.container,
      x: slot.x,
      y: slot.y,
      duration: 2200,
      ease: "Sine.easeInOut",
    });
  }

  get x(): number {
    return this.container.x;
  }
  get y(): number {
    return this.container.y;
  }

  /** §12 eviction: strike the tents and head to camp, then despawn. */
  walkToCampAndDestroy(camp: { x: number; y: number }): void {
    this.statusTween?.remove();
    this.statusTween = null;
    this.scene.tweens.add({
      targets: this.container,
      x: camp.x,
      y: camp.y + 26,
      alpha: 0.4,
      duration: 1600,
      ease: "Sine.easeInOut",
      onComplete: () => this.destroy(),
    });
  }

  update(agent: AgentSnapshot): void {
    // §5a: a model swap mid-task is a visible re-equip, not a silent change.
    const tier = modelTier(agent.model);
    if (tier !== this.lastTier) {
      this.body.setTexture(`npc-${tier}`);
      if (this.lastTier !== null) {
        this.scene.tweens.add({
          targets: this.body,
          scale: { from: 1.4, to: 1 },
          duration: 350,
          ease: "Back.easeOut",
        });
      }
      this.lastTier = tier;
    }

    const pct = contextHealth(agent.contextTokens, agent.contextLimit);
    this.healthFill.width = Math.max(1, 32 * pct);
    this.healthFill.fillColor = healthColor(pct);

    const thought =
      agent.thought.length > 64
        ? `${agent.thought.slice(0, 63)}…`
        : agent.thought;
    this.bubble.setText(thought);
    this.bubble.setVisible(thought.length > 0 && agent.status !== "ended");
    this.statusIcon.setText(STATUS_ICON[agent.status]);

    this.updateTasks(agent);

    if (agent.status !== this.lastStatus) {
      this.applyStatus(agent.status);
      this.lastStatus = agent.status;
    }
  }

  /** §13/§14 — subagent minions, party badge, and campfires. */
  private updateTasks(agent: AgentSnapshot): void {
    const runningSubs = agent.tasks.filter(
      (t) => t.kind === "subagent" && t.status === "running",
    );
    const showDots = runningSubs.length <= 3 ? runningSubs.length : 0;
    while (this.minions.length < showDots) {
      const offsets = [
        { x: -24, y: -4 },
        { x: 26, y: -2 },
        { x: -30, y: 8 },
      ];
      const at = offsets[this.minions.length] ?? { x: 0, y: 10 };
      const dot = this.scene.add.circle(at.x, at.y, 4, 0x9ec4f0);
      this.container.add(dot);
      this.minions.push(dot);
    }
    while (this.minions.length > showDots) {
      this.minions.pop()?.destroy();
    }
    // §13 batch resolution: past a small threshold, one badge, not a crowd.
    this.partyBadge.setVisible(runningSubs.length > 3);
    if (runningSubs.length > 3) {
      this.partyBadge.setText(`⚔×${runningSubs.length}`);
    }

    this.campfire.setVisible(
      agent.tasks.some(
        (t) => t.kind === "background" && t.status === "running",
      ),
    );

    // §13 return, don't vanish: a scroll flash when work comes home.
    const finished = agent.tasks.filter((t) => t.status !== "running").length;
    if (finished > this.finishedTasks) {
      const burst = finished - this.finishedTasks;
      const scroll = this.scene.add
        .text(
          this.container.x,
          this.container.y - 70,
          burst >= 3 ? `📜 the party returns (${burst})` : "📜",
          {
            fontFamily: "monospace",
            fontSize: burst >= 3 ? "10px" : "14px",
            color: "#e8e3d0",
          },
        )
        .setOrigin(0.5)
        .setDepth(30);
      this.scene.tweens.add({
        targets: scroll,
        y: scroll.y - 26,
        alpha: 0,
        duration: 1400,
        onComplete: () => scroll.destroy(),
      });
      this.dropSubagentMarks(burst);
    }
    this.finishedTasks = finished;
  }

  /**
   * §13 — a returning subagent leaves a scratch where it worked, so the
   * village accumulates a walkable history. Capped: past a handful the party
   * badge is the record, or a hundred-agent fan-out would bury the ground.
   */
  private dropSubagentMarks(burst: number): void {
    for (let i = 0; i < burst && this.subagentMarks < MAX_SUBAGENT_MARKS; i++) {
      // Deterministic ring around the NPC's feet — no two marks overlap.
      const angle = (this.subagentMarks / MAX_SUBAGENT_MARKS) * Math.PI * 2;
      const mark = this.scene.add
        .image(
          this.container.x + Math.cos(angle) * 34,
          this.container.y + 6 + Math.sin(angle) * 14,
          "scratch",
        )
        .setDepth(3)
        .setAlpha(0);
      this.scene.tweens.add({ targets: mark, alpha: 0.8, duration: 500 });
      this.subagentMarks += 1;
    }
  }

  private applyStatus(status: AgentStatus): void {
    this.statusTween?.remove();
    this.statusTween = null;
    this.body.setAlpha(1).setAngle(0).setScale(1);
    this.container.setAlpha(1);

    switch (status) {
      case "thinking":
      case "summoning":
        this.statusTween = this.scene.tweens.add({
          targets: this.body,
          y: "-=3",
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      case "tool_running":
        this.statusTween = this.scene.tweens.add({
          targets: this.body,
          angle: { from: -5, to: 5 },
          duration: 130,
          yoyo: true,
          repeat: -1,
        });
        break;
      case "compacting":
        // §2: faint → auto-compact → back up.
        this.statusTween = this.scene.tweens.add({
          targets: this.body,
          scaleY: 0.25,
          duration: 350,
          yoyo: true,
          hold: 700,
          ease: "Quad.easeIn",
        });
        break;
      case "sleeping":
        this.container.setAlpha(0.55);
        break;
      case "error":
        this.body.setTint(0xc74a4a);
        return; // keep tint until status changes
      case "ended":
        if (!this.endedHandled) {
          this.endedHandled = true;
          const { x, y } = this.container;
          this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            duration: 900,
            onComplete: () => {
              this.container.setVisible(false);
              // §9: leave a walkable trace behind.
              this.onEnded(x, y - 6);
            },
          });
        }
        break;
      default:
        break;
    }
    this.body.clearTint();
    if (status === "sleeping") this.body.setTint(0x8a8a9a);
  }

  destroy(): void {
    this.statusTween?.remove();
    this.container.destroy();
  }
}

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  /** §7a — one consistent interact action: Space or Enter (E kept as an accelerator). */
  private interactKeys: Phaser.Input.Keyboard.Key[] = [];
  private mirrorKey!: Phaser.Input.Keyboard.Key;
  private chronicleKey!: Phaser.Input.Keyboard.Key;
  private cheatKey!: Phaser.Input.Keyboard.Key;
  private npcs = new Map<string, NpcView>();
  private endedMarkers = new Set<string>();
  // §9c — the trophy each finished agent left, and which have been rewound
  private trophies = new Map<string, Phaser.GameObjects.Image>();
  private rewound = new Set<string>();
  private prompt!: Phaser.GameObjects.Text;
  private keysEnabled = true;
  private unsubAgents: (() => void) | null = null;
  private dead = false;
  // §12 camp clustering
  private slots = new SlotAllocator(MAX_VILLAGE_NPCS);
  private pinOrder: string[] = [];
  private camped = new Set<string>();
  private campBadge!: Phaser.GameObjects.Text;
  private campTent!: Phaser.GameObjects.Image;
  private campShadow!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  // §14/§16 gatekeeper + cheats + eggs
  private gatekeeper!: Phaser.GameObjects.Image;
  /** §9b — the pond's dock; only fishable during a long wait. */
  private dock!: Phaser.GameObjects.Image;
  // §14 wards — rune circles per hook, plus the boundary fence
  private wardCircles = new Map<string, Phaser.GameObjects.Image>();
  private wardFence: Phaser.GameObjects.Container | null = null;
  private unsubWards: (() => void) | null = null;
  private wallHits = 0;
  private wallOpened = false;
  private revealed = false;
  private noclipApplied = false;
  // §20 — discovery + the Map's you-are-here dot
  private lastArea: string | null = null;
  private lastPosWrite = 0;
  /** §19 — the overrides this world was built from (fresh scene per change). */
  private overrides!: WorldOverrides;

  constructor() {
    super("village");
  }

  create(): void {
    // §19 — the world renders from the overrides document; the GameCanvas
    // rebuilds the whole game when it changes, so one read here suffices.
    this.overrides = gameStore.get(overridesAtom);
    generateTextures(this, {
      grass: hexToNumber(this.overrides.palette.grass),
      path: hexToNumber(this.overrides.palette.path),
      playerTunic: hexToNumber(this.overrides.player.tunic),
      wardWatch: hexToNumber(this.overrides.wards.watch),
      wardGuard: hexToNumber(this.overrides.wards.guard),
    });
    this.buildWorld();

    this.playerShadow = this.add
      .image(PLAZA.x, PLAZA.y + 131, "shadow")
      .setScale(0.55, 0.45)
      .setDepth(19);
    this.player = this.physics.add
      .sprite(PLAZA.x, PLAZA.y + 130, "player")
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(18, 12);
    this.player.body?.setOffset(3, 16);

    // inset so the player stays out of the border tree line
    this.physics.world.setBounds(34, 40, WORLD_W - 68, WORLD_H - 78);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.6);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("keyboard plugin missing");
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys("W,A,S,D") as VillageScene["wasd"];
    // §7a — the platform's natural confirm buttons, plus legacy E.
    this.interactKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    ];
    this.mirrorKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.chronicleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.cheatKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);

    this.prompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#1a1408",
        backgroundColor: "#d4a017",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    this.unsubAgents = gameStore.sub(agentsAtom, () => this.syncAgents());
    this.syncAgents();
    this.unsubWards = gameStore.sub(wardsAtom, () => this.syncWards());
    this.syncWards();

    // Unsubscribe on both SHUTDOWN and DESTROY: game.destroy() emits only
    // DESTROY, and a zombie subscription from a dead scene would throw
    // inside the store's notify loop (breaking every later listener).
    const unsubscribe = () => {
      this.dead = true;
      this.unsubAgents?.();
      this.unsubAgents = null;
      this.unsubWards?.();
      this.unsubWards = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubscribe);
  }

  /**
   * §7a — one shared entry point for both interaction paths: walking up and
   * pressing the interact button, or clicking/tapping the thing directly.
   */
  private trigger(target: Exclude<Interactable, null>): void {
    if (gameStore.get(uiModeAtom).mode !== "roam") return;
    switch (target.kind) {
      case "board":
        gameStore.set(uiModeAtom, { mode: "board" });
        break;
      case "tavern":
        gameStore.set(uiModeAtom, { mode: "tavern" });
        break;
      case "scry":
        gameStore.set(uiModeAtom, { mode: "scry" });
        break;
      case "camp":
        // The camp opens the Mirror — the dispatch console (§12).
        gameStore.set(uiModeAtom, { mode: "mirror" });
        break;
      case "egg":
        this.interactEgg(target.eggId);
        break;
      case "guide":
        gameStore.set(uiModeAtom, { mode: "tutorial" });
        break;
      case "ward":
        this.readWard(target.wardId);
        break;
      case "trophy":
        this.readTrophy(target.agentId);
        break;
      case "dock":
        // §9b — nothing to wait out means nothing to do here.
        if (gameStore.get(longWaitAtom)) {
          gameStore.set(uiModeAtom, { mode: "fishing" });
        } else {
          localToast(
            "info",
            "🎣 The water is still. Come back when something long is running.",
          );
        }
        break;
      case "shop":
        gameStore.set(uiModeAtom, { mode: "shop", shop: target.shop });
        break;
      case "npc":
        gameStore.set(uiModeAtom, { mode: "talk", agentId: target.agentId });
        break;
    }
  }

  /** §14 — a ward states its rule; it isn't something you can negotiate with. */
  private readWard(wardId: string): void {
    const ward = gameStore.get(wardsAtom).find((w) => w.id === wardId);
    if (ward) localToast("info", describeWard(ward));
  }

  /** §9 — the village's history, legible rather than merely decorative. */
  private readTrophy(agentId: string): void {
    const agent = gameStore.get(agentsAtom).find((a) => a.id === agentId);
    if (!agent) return;
    const task = agent.task.slice(0, 110).replace(/[.\s]+$/, "");
    const sentences = [`🏛 ${agent.label} came here to: ${task}.`];
    if (agent.commits.length > 0) {
      sentences.push(
        `Landed ${agent.commits.map((sha) => sha.slice(0, 7)).join(", ")}.`,
      );
    }
    // §9c — a rewound trophy says so; the work happened, and was undone.
    if (agent.rewound) {
      sentences.push("Later reverted — the work stands undone.");
    }
    localToast("info", sentences.join(" "));
  }

  /** §7a — make a world object respond to a direct click/tap. */
  private clickable(
    object: Phaser.GameObjects.Image,
    target: Exclude<Interactable, null>,
  ): Phaser.GameObjects.Image {
    object.setInteractive({ useHandCursor: true });
    object.on("pointerdown", () => this.trigger(target));
    return object;
  }

  private buildWorld(): void {
    const rng = mulberry32(0x517e17);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, "grass").setOrigin(0);

    // break up the tiling with variant grass tiles on the same grid
    for (let i = 0; i < 640; i++) {
      const tx = Math.floor(rng() * (WORLD_W / 32)) * 32;
      const ty = Math.floor(rng() * (WORLD_H / 32)) * 32;
      this.add.image(tx, ty, rng() < 0.5 ? "grass-1" : "grass-2").setOrigin(0);
    }

    // paths get an ALttP-style darker packed-earth rim; the south road now
    // runs past the old entrance, through the road cell, to the world's edge
    const roadEnd = WORLD_H - 60;
    const rim = this.add.graphics().setDepth(1);
    rim.fillStyle(shade(hexToNumber(this.overrides.palette.path), 0.6));
    rim.fillRect(PLAZA.x - 38, PLAZA.y - 6, 76, roadEnd - PLAZA.y + 12);
    rim.fillRect(PLAZA.x - 150, PLAZA.y - 118, 300, 236);
    this.add
      .tileSprite(PLAZA.x, PLAZA.y, 64, roadEnd - PLAZA.y, "path")
      .setOrigin(0.5, 0)
      .setDepth(1);
    this.add
      .tileSprite(PLAZA.x, PLAZA.y, 288, 224, "path")
      .setOrigin(0.5, 0.5)
      .setDepth(1);

    this.buildForestBorder(rng);
    this.buildAreas();
    this.scatterDecorations(rng);

    this.addShadow(PLAZA.x, PLAZA.y + 20, 1.15);
    this.add.image(PLAZA.x, PLAZA.y, "fountain").setDepth(4);

    // §9a quest board, §9d tavern, §9e watchtower + scrying pool — all
    // directly clickable (§7a) as well as walk-up-and-press.
    this.addShadow(BOARD.x, BOARD.y + 25, 1.15);
    this.clickable(this.add.image(BOARD.x, BOARD.y, "board").setDepth(4), {
      kind: "board",
    });
    this.addShadow(TAVERN.x, TAVERN.y + 41, 2.6);
    this.clickable(this.add.image(TAVERN.x, TAVERN.y, "tavern").setDepth(3), {
      kind: "tavern",
    });
    this.addLabel(TAVERN.x, TAVERN.y + 48, this.overrides.names.tavern);
    this.clickable(this.add.image(TOWER.x, TOWER.y, "tower").setDepth(3), {
      kind: "scry",
    });
    this.addLabel(TOWER.x, TOWER.y + 48, this.overrides.names.pool);

    // §18 — the guide, waiting by the fountain for anyone who wants the tour.
    this.addShadow(GUIDE.x, GUIDE.y + 1, 0.55);
    this.clickable(
      this.add.image(GUIDE.x, GUIDE.y, "guide").setOrigin(0.5, 1).setDepth(9),
      { kind: "guide" },
    );
    this.addLabel(GUIDE.x, GUIDE.y + 10, this.overrides.names.guide);
    const guideMark = this.add
      .text(GUIDE.x, GUIDE.y - 38, "?", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d4a017",
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({
      targets: guideMark,
      y: guideMark.y - 4,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // §15 — the delightful and slightly arbitrary (the pond and its duck now
    // live at the Docks; the village keeps its statues, old man, and bones)
    this.addSparkle(PLAZA.x - 6, PLAZA.y - 4);
    const statue1 = sq(80, 120);
    const statue2 = sq(140, 120);
    this.addShadow(statue1.x, statue1.y + 10, 0.75);
    this.addShadow(statue2.x, statue2.y + 10, 0.75);
    this.clickable(
      this.add.image(statue1.x, statue1.y - 12, "statue").setDepth(3),
      { kind: "egg", eggId: "statue1" },
    );
    this.clickable(
      this.add.image(statue2.x, statue2.y - 12, "statue").setDepth(3),
      { kind: "egg", eggId: "statue2" },
    );
    this.addLabel(statue1.x, statue1.y + 12, "Claude 1");
    this.addLabel(statue2.x, statue2.y + 12, "Claude 2");
    const oldman = sq(1215, 430);
    this.addShadow(oldman.x, oldman.y + 8, 0.55);
    this.clickable(
      this.add.image(oldman.x, oldman.y - 6, "oldman").setDepth(3),
      { kind: "egg", eggId: "oldman" },
    );
    const bones = sq(1070, 800);
    this.clickable(this.add.image(bones.x, bones.y - 4, "bones").setDepth(3), {
      kind: "egg",
      eggId: "skeleton",
    });
    const rock = sq(60, 260);
    this.addShadow(rock.x, rock.y + 8, 0.7);
    this.clickable(this.add.image(rock.x, rock.y - 6, "rock").setDepth(3), {
      kind: "egg",
      eggId: "wall",
    });

    // §14 the gatekeeper — appears when the classifier holds the gates
    const gate = sq(688, 648);
    this.gatekeeper = this.add
      .image(gate.x, gate.y, "gatekeeper")
      .setDepth(9)
      .setVisible(false);

    // §12 camp: hidden until someone actually has to pitch a tent.
    this.campShadow = this.addShadow(CAMP.x, CAMP.y + 19, 1.25).setVisible(
      false,
    );
    this.campTent = this.clickable(
      this.add.image(CAMP.x, CAMP.y, "tent").setDepth(4).setVisible(false),
      { kind: "camp" },
    );
    this.campBadge = this.add
      .text(CAMP.x + 26, CAMP.y - 24, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#1a1408",
        backgroundColor: "#d4a017",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setVisible(false);
  }

  /** §1a — everything that lives outside the village square. */
  private buildAreas(): void {
    // The Docks (SW): the pond grows into a proper fishing spot.
    this.add.image(POND.x, POND.y, "pond").setScale(2).setDepth(2);
    this.dock = this.clickable(
      this.add
        .image(POND.x + 40, POND.y + 60, "dock")
        .setScale(1.6)
        .setDepth(3),
      { kind: "dock" },
    );
    this.clickable(
      this.add.image(POND.x + 90, POND.y - 20, "duck").setDepth(3),
      { kind: "egg", eggId: "duck" },
    );
    this.addSparkle(POND.x - 40, POND.y + 8);
    this.addSparkle(POND.x + 28, POND.y - 24);
    this.addSparkle(POND.x + 64, POND.y + 30);

    // The Ruins (NW): a collapsed keep, half-eaten by the green. §9b's
    // tech-debt quests point here in spirit; the board still posts them.
    const ruins = inArea("ruins", 640, 420);
    for (const [dx, dy, flip] of [
      [-140, -60, false],
      [-10, -110, true],
      [120, -50, false],
      [-90, 60, true],
      [90, 80, false],
    ] as const) {
      this.add
        .image(ruins.x + dx, ruins.y + dy, "ruinwall")
        .setFlipX(flip)
        .setDepth(3);
    }
    this.addShadow(ruins.x - 30, ruins.y + 12, 0.75);
    this.add
      .image(ruins.x - 30, ruins.y - 10, "statue")
      .setDepth(3)
      .setAlpha(0.8);
    this.add.image(ruins.x + 40, ruins.y + 20, "rock").setDepth(3);
    this.add.image(ruins.x - 150, ruins.y + 90, "bush").setDepth(3);
    this.add.image(ruins.x + 160, ruins.y + 40, "bush").setDepth(3);

    // The Frontier (NE): the traveling merchant's wagon (§9b), open ground.
    this.addShadow(WAGON.x, WAGON.y + 24, 1.6);
    this.clickable(this.add.image(WAGON.x, WAGON.y, "wagon").setDepth(4), {
      kind: "egg",
      eggId: "wagon",
    });
    this.addLabel(WAGON.x, WAGON.y + 36, "traveling merchant");

    // The Arena (E): a stone ring on packed earth, waiting for a raid (§9b).
    this.add
      .tileSprite(ARENA.x, ARENA.y, 420, 300, "path")
      .setOrigin(0.5)
      .setDepth(1);
    const ringStones = 14;
    for (let i = 0; i < ringStones; i++) {
      const angle = (i / ringStones) * Math.PI * 2;
      this.add
        .image(
          ARENA.x + Math.cos(angle) * 230,
          ARENA.y + Math.sin(angle) * 165,
          "rock",
        )
        .setDepth(3);
    }

    // The Shopping District (SE): three specialty shops, open for business
    // (§5b) — each stall has its keeper standing at the counter.
    const shopStalls: { dx: number; shop: ShopKind; label: string }[] = [
      { dx: -160, shop: "skills", label: "skill apothecary" },
      { dx: 0, shop: "plugins", label: "plugin smithy" },
      { dx: 160, shop: "mcp", label: "connector emporium" },
    ];
    for (const stall of shopStalls) {
      const x = STALLS.x + stall.dx;
      this.addShadow(x, STALLS.y + 22, 1.3);
      this.clickable(this.add.image(x, STALLS.y, "stall").setDepth(4), {
        kind: "shop",
        shop: stall.shop,
      });
      this.addShadow(x, STALLS.y + 41, 0.55);
      this.clickable(
        this.add
          .image(x, STALLS.y + 40, `keeper-${stall.shop}`)
          .setOrigin(0.5, 1)
          .setDepth(5),
        { kind: "shop", shop: stall.shop },
      );
      this.addLabel(x, STALLS.y + 52, stall.label);
    }

    // §20 — a signpost at every landing, naming where you've arrived.
    for (const area of AREAS) {
      if (area.id === "square") continue;
      const landing = LANDINGS[area.id];
      this.add.image(landing.x, landing.y - 8, "signpost").setDepth(4);
      this.addLabel(
        landing.x,
        landing.y + 14,
        (this.overrides.names.areas[area.id] ?? area.name).toLowerCase(),
      );
    }
  }

  private addShadow(
    x: number,
    y: number,
    scale: number,
  ): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, "shadow")
      .setScale(scale, scale * 0.8)
      .setDepth(2);
  }

  private addSparkle(x: number, y: number): void {
    const sparkle = this.add.image(x, y, "sparkle").setDepth(3).setAlpha(0);
    this.tweens.add({
      targets: sparkle,
      alpha: { from: 0, to: 0.9 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      repeatDelay: 1100,
      delay: (x * 7 + y * 3) % 900,
      ease: "Sine.easeInOut",
    });
  }

  /**
   * ALttP frames its maps: a tree line rings the whole world, and thinner
   * lines separate the areas (§1a) — with a gap in the middle of every shared
   * edge, so each neighbor is reachable and discovery means walking there.
   */
  private buildForestBorder(rng: () => number): void {
    const step = 46;
    const GAP = 130;
    const jitter = () => (rng() - 0.5) * 14;

    // outer ring
    for (let x = 20; x < WORLD_W; x += step) {
      this.add.image(x + jitter(), 18 + jitter(), "tree").setDepth(8);
      this.add.image(x + jitter(), WORLD_H - 14 + jitter(), "tree").setDepth(8);
    }
    for (let y = 60; y < WORLD_H - 40; y += step) {
      this.add.image(16 + jitter(), y + jitter(), "tree").setDepth(8);
      this.add.image(WORLD_W - 16 + jitter(), y + jitter(), "tree").setDepth(8);
    }

    // internal borders between cells, gapped at each shared edge's midpoint;
    // the south road keeps its own gap where it crosses into the road cell
    for (let line = 1; line < GRID; line++) {
      const x = line * CELL_W;
      for (let y = 40; y < WORLD_H - 20; y += step) {
        const mid = (Math.floor(y / CELL_H) + 0.5) * CELL_H;
        if (Math.abs(y - mid) < GAP) continue;
        this.add.image(x + jitter(), y + jitter(), "tree").setDepth(8);
      }
      const yLine = line * CELL_H;
      for (let x2 = 40; x2 < WORLD_W - 20; x2 += step) {
        const mid = (Math.floor(x2 / CELL_W) + 0.5) * CELL_W;
        if (Math.abs(x2 - mid) < GAP) continue;
        if (Math.abs(x2 - PLAZA.x) < 90) continue; // the south/north road
        this.add.image(x2 + jitter(), yLine + jitter(), "tree").setDepth(8);
      }
    }

    // short path patches through the gaps, so exits read as exits
    for (let line = 1; line < GRID; line++) {
      for (let cell = 0; cell < GRID; cell++) {
        this.add
          .tileSprite(line * CELL_W, (cell + 0.5) * CELL_H, 96, 128, "path")
          .setOrigin(0.5)
          .setDepth(1);
        this.add
          .tileSprite((cell + 0.5) * CELL_W, line * CELL_H, 128, 96, "path")
          .setOrigin(0.5)
          .setDepth(1);
      }
    }
  }

  /** Tufts, flowers, bushes, and the odd tree fill the empty grass. */
  private scatterDecorations(rng: () => number): void {
    const place = (
      count: number,
      margin: number,
      fn: (x: number, y: number) => void,
    ) => {
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 30) {
        attempts += 1;
        const x = margin + rng() * (WORLD_W - margin * 2);
        const y = margin + rng() * (WORLD_H - margin * 2);
        if (nearStructure(x, y)) continue;
        fn(x, y);
        placed += 1;
      }
    };
    // ~6× the single-village counts, spread across the 3×3 world (§1a)
    place(280, 70, (x, y) => this.add.image(x, y, "tuft").setDepth(2));
    place(130, 70, (x, y) => this.add.image(x, y, "flower").setDepth(2));
    place(80, 80, (x, y) => {
      this.addShadow(x, y + 9, 0.55);
      this.add.image(x, y, "bush").setDepth(3);
    });
    place(42, 120, (x, y) => {
      this.addShadow(x, y + 26, 0.95);
      this.add.image(x, y, "tree").setDepth(8);
    });
  }

  private addLabel(
    x: number,
    y: number,
    text: string,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#e8e3d0",
        backgroundColor: "#151b28",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  private syncAgents(): void {
    if (this.dead) return;
    const agents = gameStore.get(agentsAtom);
    for (const agent of agents) {
      const view = this.npcs.get(agent.id);

      if (agent.status === "ended") {
        this.camped.delete(agent.id);
        if (view) {
          this.releasePin(agent.id);
          view.update(agent);
        } else if (!this.endedMarkers.has(agent.id)) {
          this.endedMarkers.add(agent.id);
          const spot = this.slots.take(agent.id);
          const slot = slotFor(spot ?? 0);
          if (spot !== null) this.slots.release(agent.id);
          this.placeTrophy(agent.id, slot.x, slot.y - 6);
        }
        continue;
      }

      if (view) {
        view.update(agent);
        continue;
      }
      if (this.camped.has(agent.id)) continue;

      const slotIndex = this.slots.take(agent.id);
      if (slotIndex === null) {
        this.camped.add(agent.id);
        continue;
      }
      this.pinOrder.push(agent.id);
      const npc = new NpcView(
        this,
        agent,
        slotFor(slotIndex),
        { x: ENTRANCE.x, y: ENTRANCE.y - 20 },
        () => this.trigger({ kind: "npc", agentId: agent.id }),
        (x, y) => this.placeTrophy(agent.id, x, y),
      );
      this.npcs.set(agent.id, npc);
      npc.update(agent);
    }
    this.syncRewinds(agents);
    this.updateCamp();

    // §14 gatekeeper appears when any live agent runs in auto mode.
    this.gatekeeper.setVisible(
      agents.some((a) => a.permissionMode === "auto" && a.status !== "ended"),
    );
  }

  /**
   * §14 — draw the repo's hooks onto the world. Each ward is a rune circle at
   * a fixed spot; if any of them can actually block an action, a ward-line
   * also rings the village — the invisible fence made visible.
   */
  private syncWards(): void {
    if (this.dead) return;
    const wards = gameStore.get(wardsAtom).slice(0, WARD_SPOTS.length);
    const live = new Set(wards.map((ward) => ward.id));

    for (const [id, circle] of this.wardCircles) {
      if (live.has(id)) continue;
      circle.destroy();
      this.wardCircles.delete(id);
    }

    wards.forEach((ward, index) => {
      if (this.wardCircles.has(ward.id)) return;
      const spot = WARD_SPOTS[index];
      if (!spot) return;
      this.wardCircles.set(ward.id, this.addRuneCircle(ward, spot));
    });

    // §19 — the fence is a customizable look; the hooks stay real either way.
    const guarded =
      this.overrides.wards.fence && wards.some((ward) => ward.blocking);
    if (guarded && !this.wardFence) this.wardFence = this.buildWardFence();
    if (!guarded && this.wardFence) {
      this.wardFence.destroy(true);
      this.wardFence = null;
    }
  }

  private addRuneCircle(
    ward: Ward,
    spot: { x: number; y: number },
  ): Phaser.GameObjects.Image {
    const circle = this.clickable(
      this.add
        .image(spot.x, spot.y, ward.blocking ? "rune-guard" : "rune-watch")
        .setDepth(2)
        .setAlpha(0.75),
      { kind: "ward", wardId: ward.id },
    );
    // A slow pulse, so a ward reads as active rather than painted on.
    this.tweens.add({
      targets: circle,
      alpha: { from: 0.45, to: 0.95 },
      duration: ward.blocking ? 1400 : 2200,
      yoyo: true,
      repeat: -1,
      delay: (spot.x * 3 + spot.y) % 1200,
      ease: "Sine.easeInOut",
    });
    return circle;
  }

  /**
   * The §14 "invisible fence": posts and a faint line at the *village*
   * boundary — hooks govern the village, so the fence rings the hub cell,
   * not the whole wider world.
   */
  private buildWardFence(): Phaser.GameObjects.Container {
    const inset = 44;
    const left = SQ.x + inset;
    const top = SQ.y + inset;
    const right = SQ.x + CELL_W - inset;
    const bottom = SQ.y + CELL_H - inset;
    const parts: Phaser.GameObjects.GameObject[] = [];

    const line = this.add.graphics().setDepth(2);
    line.lineStyle(2, 0xd4a017, 0.28);
    line.strokeRect(left, top, right - left, bottom - top);
    parts.push(line);

    const step = 128;
    for (let x = left; x <= right; x += step) {
      parts.push(this.add.image(x, top, "ward-post").setDepth(7));
      parts.push(this.add.image(x, bottom, "ward-post").setDepth(7));
    }
    for (let y = top + step; y < bottom; y += step) {
      parts.push(this.add.image(left, y, "ward-post").setDepth(7));
      parts.push(this.add.image(right, y, "ward-post").setDepth(7));
    }

    const fence = this.add.container(0, 0, parts);
    this.tweens.add({
      targets: fence,
      alpha: { from: 0.6, to: 1 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return fence;
  }

  /**
   * §9 — a finished session leaves a walkable trace in the village: a
   * monument if it landed real work, a chest if it was a quick errand.
   */
  private placeTrophy(agentId: string, x: number, y: number): void {
    if (this.trophies.has(agentId)) return;
    const agent = gameStore.get(agentsAtom).find((a) => a.id === agentId);
    const kind = agent ? trophyKindFor(agent) : "chest";
    const spot = freeTrophySpot({ x, y }, [...this.trophies.values()]);
    const trophy = this.clickable(
      this.add
        .image(spot.x, spot.y, kind)
        .setOrigin(0.5, kind === "monument" ? 1 : 0.5)
        .setDepth(5),
      { kind: "trophy", agentId },
    );
    this.trophies.set(agentId, trophy);
    // An agent whose work was already reverted before its trophy appeared
    // (e.g. the page was reloaded) should show up rewound, not pristine.
    if (this.rewound.has(agentId)) this.showRewound(trophy, false);
  }

  /**
   * §9c — a revert rewinds a trophy rather than deleting it: the work having
   * happened, and having been undone, both stay visible.
   */
  private syncRewinds(agents: AgentSnapshot[]): void {
    for (const agent of agents) {
      if (!agent.rewound || this.rewound.has(agent.id)) continue;
      this.rewound.add(agent.id);
      const trophy = this.trophies.get(agent.id);
      if (trophy) this.showRewound(trophy, true);
    }
  }

  private showRewound(
    trophy: Phaser.GameObjects.Image,
    animate: boolean,
  ): void {
    const settle = () => {
      // Left standing but visibly undone — weathered, not erased.
      trophy.setTint(0x8a8a9a).setAlpha(0.75);
      this.add
        .text(trophy.x + 14, trophy.y - 10, "⟲", {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#9ec4f0",
        })
        .setOrigin(0.5)
        .setDepth(6);
    };

    if (!animate) {
      settle();
      return;
    }
    // The rewind itself: history spins backwards, then stops where it was.
    this.tweens.add({
      targets: trophy,
      angle: { from: 0, to: -360 },
      scale: { from: 1, to: 0.75 },
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => {
        trophy.setAngle(0);
        settle();
      },
    });
    const glyph = this.add
      .text(trophy.x, trophy.y - 14, "⟲", {
        fontSize: "16px",
        color: "#9ec4f0",
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: glyph,
      y: glyph.y - 24,
      alpha: 0,
      duration: 1200,
      onComplete: () => glyph.destroy(),
    });
  }

  private releasePin(id: string): void {
    this.slots.release(id);
    this.pinOrder = this.pinOrder.filter((pinned) => pinned !== id);
  }

  private updateCamp(): void {
    const count = this.camped.size;
    this.campTent.setVisible(count > 0);
    this.campShadow.setVisible(count > 0);
    this.campBadge.setVisible(count > 0);
    if (count > 0) this.campBadge.setText(String(count));
  }

  /** §12: give a camped agent a full sprite, evicting the LRU pin if full. */
  private promoteFromCamp(id: string): void {
    if (!this.camped.has(id)) return;
    if (this.slots.full) {
      const evicted = pickEviction(this.pinOrder);
      if (!evicted) return;
      const evictedView = this.npcs.get(evicted);
      this.releasePin(evicted);
      this.npcs.delete(evicted);
      this.camped.add(evicted);
      evictedView?.walkToCampAndDestroy(CAMP);
    }
    const slotIndex = this.slots.take(id);
    if (slotIndex === null) return;
    this.camped.delete(id);
    this.pinOrder.push(id);
    const agent = gameStore.get(agentsAtom).find((a) => a.id === id);
    if (!agent) return;
    const npc = new NpcView(
      this,
      agent,
      slotFor(slotIndex),
      { x: CAMP.x, y: CAMP.y + 26 },
      () => this.trigger({ kind: "npc", agentId: id }),
      (x, y) => this.placeTrophy(id, x, y),
    );
    this.npcs.set(id, npc);
    npc.update(agent);
    this.updateCamp();
  }

  /** §4 Mirror warp: teleport the player next to the agent's NPC. */
  private handleWarp(id: string): void {
    this.promoteFromCamp(id);
    const view = this.npcs.get(id);
    if (!view) return;
    this.player.setPosition(view.home.x + 44, view.home.y + 14);
  }

  /** §16 level select — jump to the Mirror, a named agent, or a place. */
  private handleCheatWarp(name: string): void {
    if (name === "mirror") {
      gameStore.set(uiModeAtom, { mode: "mirror" });
      return;
    }
    // teleport directly to a named agent, skipping the walk
    const agent = gameStore
      .get(agentsAtom)
      .find(
        (a) =>
          a.label.toLowerCase() === name ||
          a.id === name ||
          a.id === `agent-${name}`,
      );
    if (agent) {
      this.handleWarp(agent.id);
      localToast("info", `✦ warped to ${agent.label}`);
      return;
    }
    const places: Record<string, { x: number; y: number }> = {
      plaza: PLAZA,
      entrance: ENTRANCE,
      camp: CAMP,
      pool: { x: TOWER.x, y: TOWER.y + 80 },
      board: { x: BOARD.x, y: BOARD.y + 40 },
      pond: { x: POND.x + 60, y: POND.y + 120 },
      // §20 — every named area, by id and by short name
      ...Object.fromEntries(
        AREAS.map((area) => [
          area.id,
          { x: LANDINGS[area.id].x, y: LANDINGS[area.id].y + 16 },
        ]),
      ),
    };
    const target = places[name];
    if (target) {
      this.player.setPosition(target.x, target.y + 10);
      localToast("info", `✦ warped to ${name}`);
    } else {
      localToast("warn", `No such place: ${name}`);
    }
  }

  /** §16 reveal map — light up every hidden thing at once. */
  private revealEggs(): void {
    if (this.revealed) return;
    this.revealed = true;
    for (const egg of EGGS) {
      const marker = this.add
        .text(egg.x, egg.y - 26, "✦", {
          fontSize: "14px",
          color: "#d4a017",
        })
        .setOrigin(0.5)
        .setDepth(25);
      this.tweens.add({
        targets: marker,
        alpha: { from: 1, to: 0.3 },
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** §15 — talk to the strange things scattered around the village. */
  private interactEgg(eggId: string): void {
    switch (eggId) {
      case "duck": {
        const last = gameStore.get(lastSteerAtom);
        localToast(
          "info",
          last
            ? `🦆 the duck repeats, flatly: "${last.slice(0, 90)}"`
            : "🦆 the duck waits. Rubber-duck debugging requires you to go first.",
        );
        break;
      }
      case "statue1":
        localToast(
          "info",
          "A dusty statue of Claude 1. The plaque reads: “it wrote poems, slowly, and we loved it anyway.”",
        );
        break;
      case "statue2":
        localToast(
          "info",
          "Claude 2's statue. Someone has scratched “100k context ought to be enough for anybody” into the base.",
        );
        break;
      case "oldman":
        if (!gameStore.get(shieldAtom)) {
          gameStore.set(shieldAtom, true);
          localStorage.setItem("aq-shield", "1");
          localToast(
            "info",
            "🛡 “It's dangerous to git push --force alone — take this.”",
          );
        } else {
          localToast("info", "“Ah, you still carry my shield,” he smiles.");
        }
        break;
      case "skeleton":
        localToast(
          "info",
          "💀 A skeleton in the weeds. Its name tag reads: “TODO: fix later”.",
        );
        break;
      case "wagon": {
        // §9b — the merchant nods toward the board when there's stock.
        const stock = gameStore
          .get(sideQuestsAtom)
          .find((quest) => quest.kind === "merchant");
        localToast(
          "info",
          stock
            ? `🛒 “Fresh versions, straight off the cart!” — ${stock.title}. The paperwork's posted on the village board.`
            : "🛒 “Nothing for you today,” the merchant shrugs. Your dependencies are current.",
        );
        break;
      }
      case "wall":
        if (this.wallOpened) {
          localToast("info", "The crack in the rock glitters faintly.");
          break;
        }
        this.wallHits += 1;
        if (this.wallHits >= 5) {
          this.wallOpened = true;
          localToast(
            "info",
            "✨ The rock cracks open! Inside: a very shiny pebble. It does nothing. You love it.",
          );
        } else {
          localToast("info", `The rock sounds hollow… (${this.wallHits}/5)`);
        }
        break;
      default:
        break;
    }
  }

  update(): void {
    // The world only owns the keyboard when nothing in the DOM does. Phaser's
    // global capture calls preventDefault() on Enter and Space, so without
    // standing down here a Tab-focused button (the icon row, a dialog's
    // controls) would never receive its activation click.
    const roaming =
      gameStore.get(uiModeAtom).mode === "roam" && !domControlFocused();
    const keyboard = this.input.keyboard;
    if (keyboard && roaming !== this.keysEnabled) {
      this.keysEnabled = roaming;
      keyboard.enabled = roaming;
      if (roaming) {
        keyboard.enableGlobalCapture();
        keyboard.resetKeys();
      } else {
        keyboard.disableGlobalCapture();
      }
    }

    const warpTarget = gameStore.get(warpTargetAtom);
    if (warpTarget) {
      gameStore.set(warpTargetAtom, null);
      this.handleWarp(warpTarget);
    }
    // §20 fast travel — the Map picked a destination.
    const travel = gameStore.get(mapTravelAtom);
    if (travel) {
      gameStore.set(mapTravelAtom, null);
      const landing = LANDINGS[travel];
      // Arrive just south of the signpost, clear of its label.
      this.player.setPosition(landing.x, landing.y + 48);
    }
    this.trackArea();
    const cheatWarp = gameStore.get(cheatWarpAtom);
    if (cheatWarp) {
      gameStore.set(cheatWarpAtom, null);
      this.handleCheatWarp(cheatWarp);
    }
    if (gameStore.get(revealMapAtom)) this.revealEggs();

    // §16 noclip — float over everything, purely cosmetic.
    const noclip = gameStore.get(noclipAtom);
    if (noclip !== this.noclipApplied) {
      this.noclipApplied = noclip;
      const body = this.player.body as Phaser.Physics.Arcade.Body | null;
      if (body) body.checkCollision.none = noclip;
      this.player.setAlpha(noclip ? 0.6 : 1);
    }

    // §7a — optional accelerators; every overlay is also on the icon row.
    if (roaming) {
      if (Phaser.Input.Keyboard.JustDown(this.mirrorKey)) {
        gameStore.set(uiModeAtom, { mode: "mirror" });
      }
      if (Phaser.Input.Keyboard.JustDown(this.chronicleKey)) {
        gameStore.set(chronicleOpenAtom, !gameStore.get(chronicleOpenAtom));
      }
      if (Phaser.Input.Keyboard.JustDown(this.cheatKey)) {
        gameStore.set(uiModeAtom, { mode: "cheat" });
      }
    }

    // §9b — a lit dock is the only hint that there's a wait worth filling.
    this.dock.setAlpha(gameStore.get(longWaitAtom) ? 1 : 0.55);

    this.updateMovement(roaming);
    this.updateInteraction(roaming);
    this.playerShadow.setPosition(this.player.x, this.player.y + 1);
    this.playerShadow.setAlpha(this.player.alpha);
  }

  /**
   * §20 — discovery is walking somewhere: the first time the player enters
   * an area it lights up on the Map, with a small toast to mark the moment.
   */
  private trackArea(): void {
    const areaNow = areaAt(this.player.x, this.player.y);
    if (areaNow !== this.lastArea) {
      this.lastArea = areaNow;
      gameStore.set(playerAreaAtom, areaNow);
      const discovered = gameStore.get(discoveredAreasAtom);
      if (!discovered.has(areaNow)) {
        const next = new Set(discovered).add(areaNow);
        gameStore.set(discoveredAreasAtom, next);
        saveDiscovered(next);
        const area = areaById(areaNow);
        const name = this.overrides.names.areas[areaNow] ?? area.name;
        localToast("info", `✦ Discovered: ${name} — ${area.blurb}`);
        hintOnce(
          "map-discovery",
          "🗺 Discovered places appear on your Map — open it to fast travel back.",
        );
      }
    }
    // Throttled you-are-here dot for the Map (§20).
    if (this.time.now - this.lastPosWrite > 250) {
      this.lastPosWrite = this.time.now;
      gameStore.set(playerPosAtom, { x: this.player.x, y: this.player.y });
    }
  }

  private updateMovement(roaming: boolean): void {
    let vx = 0;
    let vy = 0;
    if (roaming) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;
    }
    // §19 — base pace is customizable; the §16 speed cheat stacks on top.
    const base = PLAYER_SPEED * this.overrides.player.speed;
    const speed = gameStore.get(speedBoostAtom) ? base * 2 : base;
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * speed, (vy / len) * speed);
    if (vx !== 0) this.player.setFlipX(vx < 0);
  }

  private updateInteraction(roaming: boolean): void {
    const px = this.player.x;
    const py = this.player.y;

    const found: {
      value: Interactable;
      dist: number;
      x: number;
      y: number;
    } = { value: null, dist: INTERACT_RANGE, x: 0, y: 0 };

    const consider = (
      candidate: Exclude<Interactable, null>,
      x: number,
      y: number,
      promptOffset = 48,
    ) => {
      const dist = Phaser.Math.Distance.Between(px, py, x, y);
      if (dist < found.dist) {
        found.value = candidate;
        found.dist = dist;
        found.x = x;
        found.y = y - promptOffset;
      }
    };

    consider({ kind: "board" }, BOARD.x, BOARD.y);
    consider({ kind: "tavern" }, TAVERN.x, TAVERN.y + 40, 84);
    consider({ kind: "scry" }, TOWER.x, TOWER.y + 60, 110);
    consider({ kind: "guide" }, GUIDE.x, GUIDE.y - 14, 44);
    if (this.camped.size > 0) consider({ kind: "camp" }, CAMP.x, CAMP.y, 40);
    for (const egg of EGGS) {
      consider({ kind: "egg", eggId: egg.id }, egg.x, egg.y, 34);
    }
    for (const [wardId, circle] of this.wardCircles) {
      consider({ kind: "ward", wardId }, circle.x, circle.y, 30);
    }
    for (const [agentId, trophy] of this.trophies) {
      consider({ kind: "trophy", agentId }, trophy.x, trophy.y, 40);
    }
    // §9b — the dock only advertises itself when there's a wait to fill.
    if (gameStore.get(longWaitAtom)) {
      consider({ kind: "dock" }, this.dock.x, this.dock.y, 32);
    }
    // §5b — the three shop counters
    consider(
      { kind: "shop", shop: "skills" },
      STALLS.x - 160,
      STALLS.y + 30,
      64,
    );
    consider({ kind: "shop", shop: "plugins" }, STALLS.x, STALLS.y + 30, 64);
    consider({ kind: "shop", shop: "mcp" }, STALLS.x + 160, STALLS.y + 30, 64);
    for (const [id, view] of this.npcs) {
      const agent = gameStore.get(agentsAtom).find((a) => a.id === id);
      if (!agent || agent.status === "ended") continue;
      consider({ kind: "npc", agentId: id }, view.x, view.y, 92);
    }

    const current = gameStore.get(nearbyAtom);
    if (JSON.stringify(current) !== JSON.stringify(found.value)) {
      gameStore.set(nearbyAtom, found.value);
    }

    // §7a — a contextual verb, so it's never a guess whether you're in range.
    this.prompt.setVisible(roaming && found.value !== null);
    if (found.value) {
      this.prompt.setText(`${PROMPT_VERB[found.value.kind]} ⏎`);
      this.prompt.setPosition(found.x, found.y);
    }

    if (
      roaming &&
      found.value &&
      this.interactKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))
    ) {
      this.trigger(found.value);
    }
  }
}
