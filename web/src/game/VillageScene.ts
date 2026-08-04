import Phaser from "phaser";
import { contextHealth } from "@/lib/format";
import type { AgentSnapshot, AgentStatus } from "@/lib/protocol";
import { localToast } from "@/lib/socket";
import {
  agentsAtom,
  cheatWarpAtom,
  chronicleOpenAtom,
  gameStore,
  type Interactable,
  lastSteerAtom,
  nearbyAtom,
  noclipAtom,
  revealMapAtom,
  shieldAtom,
  speedBoostAtom,
  uiModeAtom,
  warpTargetAtom,
} from "@/store/gameAtoms";
import { generateTextures, modelTier } from "./textures";
import { MAX_VILLAGE_NPCS, pickEviction, SlotAllocator } from "./villagePlan";

const WORLD_W = 1280;
const WORLD_H = 960;
const PLAZA = { x: 640, y: 430 };
/** §8 — where summoned NPCs walk in from: the south road out of the village. */
const ENTRANCE = { x: 640, y: 810 };
const CAMP = { x: 985, y: 760 };
const TAVERN = { x: 160, y: 640 };
const TOWER = { x: 1150, y: 160 };
const BOARD = { x: 810, y: 398 };
const POND = { x: 200, y: 830 };
/** §18 — the guide waits by the fountain, right where you spawn. */
const GUIDE = { x: 560, y: 540 };
const PLAYER_SPEED = 190;
const INTERACT_RANGE = 64;

/** Fixed idle spots for pinned agents, ringing the plaza (§12). */
const SLOTS = [
  { x: 500, y: 350 },
  { x: 780, y: 350 },
  { x: 480, y: 520 },
  { x: 800, y: 520 },
  { x: 570, y: 590 },
  { x: 710, y: 590 },
];

function slotFor(index: number): { x: number; y: number } {
  return SLOTS[index % SLOTS.length] ?? PLAZA;
}

/** §15 Easter eggs — placed around the village. */
const EGGS: { id: string; x: number; y: number }[] = [
  { id: "duck", x: POND.x + 40, y: POND.y - 10 },
  { id: "statue1", x: 80, y: 120 },
  { id: "statue2", x: 140, y: 120 },
  { id: "oldman", x: 1215, y: 430 },
  { id: "skeleton", x: 1070, y: 800 },
  { id: "wall", x: 60, y: 260 },
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

/** Circles decorations must stay out of (structures and eggs). */
const KEEPOUT: { x: number; y: number; r: number }[] = [
  { x: PLAZA.x, y: PLAZA.y, r: 210 },
  { x: ENTRANCE.x, y: ENTRANCE.y, r: 90 },
  { x: CAMP.x, y: CAMP.y, r: 90 },
  { x: TAVERN.x, y: TAVERN.y, r: 120 },
  { x: TOWER.x, y: TOWER.y, r: 120 },
  { x: POND.x, y: POND.y, r: 100 },
  { x: GUIDE.x, y: GUIDE.y, r: 50 },
  { x: 110, y: 110, r: 90 }, // statues
  { x: 1215, y: 430, r: 60 }, // old man
  { x: 1070, y: 800, r: 60 }, // skeleton
  { x: 60, y: 260, r: 60 }, // cracked rock
  { x: 688, y: 648, r: 50 }, // gatekeeper post
];

function nearStructure(x: number, y: number): boolean {
  // the plaza-to-south-road
  if (Math.abs(x - PLAZA.x) < 60 && y > PLAZA.y - 20 && y < ENTRANCE.y + 20) {
    return true;
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

  constructor(
    private scene: Phaser.Scene,
    agent: AgentSnapshot,
    slot: { x: number; y: number },
    from: { x: number; y: number },
    onClick: () => void,
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
    this.nameText = scene.add
      .text(0, -30, agent.label, {
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
    }
    this.finishedTasks = finished;
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
              this.scene.add.image(x, y - 6, "chest").setDepth(5);
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
  private wallHits = 0;
  private wallOpened = false;
  private revealed = false;
  private noclipApplied = false;

  constructor() {
    super("village");
  }

  create(): void {
    generateTextures(this);
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

    // Unsubscribe on both SHUTDOWN and DESTROY: game.destroy() emits only
    // DESTROY, and a zombie subscription from a dead scene would throw
    // inside the store's notify loop (breaking every later listener).
    const unsubscribe = () => {
      this.dead = true;
      this.unsubAgents?.();
      this.unsubAgents = null;
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
      case "npc":
        gameStore.set(uiModeAtom, { mode: "talk", agentId: target.agentId });
        break;
    }
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
    for (let i = 0; i < 220; i++) {
      const tx = Math.floor(rng() * (WORLD_W / 32)) * 32;
      const ty = Math.floor(rng() * (WORLD_H / 32)) * 32;
      this.add.image(tx, ty, rng() < 0.5 ? "grass-1" : "grass-2").setOrigin(0);
    }

    // paths get an ALttP-style darker packed-earth rim
    const rim = this.add.graphics().setDepth(1);
    rim.fillStyle(0x7d5f33);
    rim.fillRect(PLAZA.x - 38, PLAZA.y - 6, 76, ENTRANCE.y - PLAZA.y + 12);
    rim.fillRect(PLAZA.x - 150, PLAZA.y - 118, 300, 236);
    this.add
      .tileSprite(PLAZA.x, PLAZA.y, 64, ENTRANCE.y - PLAZA.y, "path")
      .setOrigin(0.5, 0)
      .setDepth(1);
    this.add
      .tileSprite(PLAZA.x, PLAZA.y, 288, 224, "path")
      .setOrigin(0.5, 0.5)
      .setDepth(1);

    this.buildForestBorder(rng);
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
    this.addLabel(TAVERN.x, TAVERN.y + 48, "tavern");
    this.clickable(this.add.image(TOWER.x, TOWER.y, "tower").setDepth(3), {
      kind: "scry",
    });
    this.addLabel(TOWER.x, TOWER.y + 48, "scrying pool");

    // §18 — the guide, waiting by the fountain for anyone who wants the tour.
    this.addShadow(GUIDE.x, GUIDE.y + 1, 0.55);
    this.clickable(
      this.add.image(GUIDE.x, GUIDE.y, "guide").setOrigin(0.5, 1).setDepth(9),
      { kind: "guide" },
    );
    this.addLabel(GUIDE.x, GUIDE.y + 10, "guide");
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

    // §15 — the delightful and slightly arbitrary
    this.add.image(POND.x, POND.y, "pond").setDepth(2);
    this.clickable(
      this.add.image(POND.x + 40, POND.y - 10, "duck").setDepth(3),
      { kind: "egg", eggId: "duck" },
    );
    this.addSparkle(POND.x - 20, POND.y + 4);
    this.addSparkle(POND.x + 14, POND.y - 12);
    this.addSparkle(PLAZA.x - 6, PLAZA.y - 4);
    this.addShadow(80, 130, 0.75);
    this.addShadow(140, 130, 0.75);
    this.clickable(this.add.image(80, 108, "statue").setDepth(3), {
      kind: "egg",
      eggId: "statue1",
    });
    this.clickable(this.add.image(140, 108, "statue").setDepth(3), {
      kind: "egg",
      eggId: "statue2",
    });
    this.addLabel(80, 132, "Claude 1");
    this.addLabel(140, 132, "Claude 2");
    this.addShadow(1215, 438, 0.55);
    this.clickable(this.add.image(1215, 424, "oldman").setDepth(3), {
      kind: "egg",
      eggId: "oldman",
    });
    this.clickable(this.add.image(1070, 796, "bones").setDepth(3), {
      kind: "egg",
      eggId: "skeleton",
    });
    this.addShadow(60, 268, 0.7);
    this.clickable(this.add.image(60, 254, "rock").setDepth(3), {
      kind: "egg",
      eggId: "wall",
    });

    // §14 the gatekeeper — appears when the classifier holds the gates
    this.gatekeeper = this.add
      .image(688, 648, "gatekeeper")
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

  /** ALttP frames its maps: a tree line rings the whole world. */
  private buildForestBorder(rng: () => number): void {
    const step = 46;
    const jitter = () => (rng() - 0.5) * 14;
    for (let x = 20; x < WORLD_W; x += step) {
      this.add.image(x + jitter(), 18 + jitter(), "tree").setDepth(8);
      this.add.image(x + jitter(), WORLD_H - 14 + jitter(), "tree").setDepth(8);
    }
    for (let y = 60; y < WORLD_H - 40; y += step) {
      this.add.image(16 + jitter(), y + jitter(), "tree").setDepth(8);
      this.add.image(WORLD_W - 16 + jitter(), y + jitter(), "tree").setDepth(8);
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
    place(46, 70, (x, y) => this.add.image(x, y, "tuft").setDepth(2));
    place(22, 70, (x, y) => this.add.image(x, y, "flower").setDepth(2));
    place(14, 80, (x, y) => {
      this.addShadow(x, y + 9, 0.55);
      this.add.image(x, y, "bush").setDepth(3);
    });
    place(7, 120, (x, y) => {
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
          this.add.image(slot.x, slot.y - 6, "chest").setDepth(5);
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
      );
      this.npcs.set(agent.id, npc);
      npc.update(agent);
    }
    this.updateCamp();

    // §14 gatekeeper appears when any live agent runs in auto mode.
    this.gatekeeper.setVisible(
      agents.some((a) => a.permissionMode === "auto" && a.status !== "ended"),
    );
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
      tavern: { x: TAVERN.x, y: TAVERN.y + 70 },
      pool: { x: TOWER.x, y: TOWER.y + 80 },
      board: { x: BOARD.x, y: BOARD.y + 40 },
      pond: { x: POND.x + 60, y: POND.y },
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
    const roaming = gameStore.get(uiModeAtom).mode === "roam";
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

    this.updateMovement(roaming);
    this.updateInteraction(roaming);
    this.playerShadow.setPosition(this.player.x, this.player.y + 1);
    this.playerShadow.setAlpha(this.player.alpha);
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
    const speed = gameStore.get(speedBoostAtom)
      ? PLAYER_SPEED * 2
      : PLAYER_SPEED;
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
