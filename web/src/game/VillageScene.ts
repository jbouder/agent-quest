import Phaser from "phaser";
import { contextHealth } from "@/lib/format";
import type { AgentSnapshot, AgentStatus } from "@/lib/protocol";
import {
  agentsAtom,
  gameStore,
  type Interactable,
  journalOpenAtom,
  nearbyAtom,
  uiModeAtom,
  warpTargetAtom,
} from "@/store/gameAtoms";
import { generateTextures, modelTier } from "./textures";
import { MAX_VILLAGE_NPCS, pickEviction, SlotAllocator } from "./villagePlan";

const WORLD_W = 1280;
const WORLD_H = 960;
const PLAZA = { x: 640, y: 430 };
const PORTAL = { x: 640, y: 810 };
const CAMP = { x: 985, y: 760 };
const PLAYER_SPEED = 190;
const INTERACT_RANGE = 64;

const HOUSES = [
  { x: 300, y: 260 },
  { x: 640, y: 200 },
  { x: 980, y: 260 },
  { x: 300, y: 620 },
  { x: 980, y: 620 },
];

/** Fixed standing spots for the pinned agents (§12). */
const SLOTS = [
  ...HOUSES.map((house) => ({ x: house.x, y: house.y + 84 })),
  { x: PLAZA.x + 120, y: PLAZA.y + 130 },
];

function slotFor(index: number): { x: number; y: number } {
  return SLOTS[index % SLOTS.length] ?? PLAZA;
}

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
  private body: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Text;
  private healthFill: Phaser.GameObjects.Rectangle;
  private statusTween: Phaser.Tweens.Tween | null = null;
  private lastStatus: AgentStatus | null = null;
  private lastTier: string | null = null;
  private endedHandled = false;

  constructor(
    private scene: Phaser.Scene,
    agent: AgentSnapshot,
    slot: { x: number; y: number },
    from: { x: number; y: number },
  ) {
    const tier = modelTier(agent.model);
    this.body = scene.add.image(0, 0, `npc-${tier}`).setOrigin(0.5, 1);
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

    this.container = scene.add.container(from.x, from.y, [
      this.body,
      this.nameText,
      healthBg,
      this.healthFill,
      this.statusIcon,
      this.bubble,
    ]);
    this.container.setDepth(10);

    // §8: entrance animation — walk from the portal (or camp) to your post.
    scene.tweens.add({
      targets: this.container,
      x: slot.x,
      y: slot.y,
      duration: 2200,
      ease: "Sine.easeInOut",
    });
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

  get x(): number {
    return this.container.x;
  }
  get y(): number {
    return this.container.y;
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

    if (agent.status !== this.lastStatus) {
      this.applyStatus(agent.status);
      this.lastStatus = agent.status;
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
  private interactKey!: Phaser.Input.Keyboard.Key;
  private mirrorKey!: Phaser.Input.Keyboard.Key;
  private journalKey!: Phaser.Input.Keyboard.Key;
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

  constructor() {
    super("village");
  }

  create(): void {
    generateTextures(this);
    this.buildWorld();

    this.player = this.physics.add
      .sprite(PLAZA.x, PLAZA.y + 130, "player")
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(18, 12);
    this.player.body?.setOffset(3, 16);

    const houses = this.physics.add.staticGroup();
    for (const pos of HOUSES) {
      houses.create(pos.x, pos.y, "house").setSize(90, 48).setOffset(3, 30);
    }
    this.physics.add.collider(this.player, houses);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.6);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("keyboard plugin missing");
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys("W,A,S,D") as VillageScene["wasd"];
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.mirrorKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.journalKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);

    this.prompt = this.add
      .text(0, 0, "E", {
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

  private buildWorld(): void {
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, "grass").setOrigin(0);
    // path from the portal to the plaza, plus the plaza itself
    this.add
      .tileSprite(PLAZA.x - 32, PLAZA.y, 64, PORTAL.y - PLAZA.y, "path")
      .setOrigin(0.5, 0);
    this.add.tileSprite(PLAZA.x, PLAZA.y, 288, 224, "path").setOrigin(0.5, 0.5);
    this.add.image(PLAZA.x, PLAZA.y, "fountain").setDepth(4);
    for (const pos of HOUSES) {
      this.add.image(pos.x, pos.y, "house").setDepth(3);
    }
    const portal = this.add.image(PORTAL.x, PORTAL.y, "portal").setDepth(4);
    this.tweens.add({
      targets: portal,
      scaleX: { from: 0.94, to: 1.06 },
      alpha: { from: 0.85, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // §12 camp: hidden until someone actually has to pitch a tent.
    this.campTent = this.add
      .image(CAMP.x, CAMP.y, "tent")
      .setDepth(4)
      .setVisible(false);
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

  private syncAgents(): void {
    if (this.dead) return;
    const agents = gameStore.get(agentsAtom);
    for (const agent of agents) {
      const view = this.npcs.get(agent.id);

      if (agent.status === "ended") {
        this.camped.delete(agent.id);
        if (view) {
          // The view plays its own fade-to-chest; free the ground for reuse.
          this.releasePin(agent.id);
          view.update(agent);
        } else if (!this.endedMarkers.has(agent.id)) {
          // Departed before this scene existed — just the trace (§9).
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

      // New active agent: pin it if the village has room, else camp it.
      const slotIndex = this.slots.take(agent.id);
      if (slotIndex === null) {
        this.camped.add(agent.id);
        continue;
      }
      this.pinOrder.push(agent.id);
      const npc = new NpcView(this, agent, slotFor(slotIndex), {
        x: PORTAL.x,
        y: PORTAL.y - 20,
      });
      this.npcs.set(agent.id, npc);
      npc.update(agent);
    }
    this.updateCamp();
  }

  private releasePin(id: string): void {
    this.slots.release(id);
    this.pinOrder = this.pinOrder.filter((pinned) => pinned !== id);
  }

  private updateCamp(): void {
    const count = this.camped.size;
    this.campTent.setVisible(count > 0);
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
    const npc = new NpcView(this, agent, slotFor(slotIndex), {
      x: CAMP.x,
      y: CAMP.y + 26,
    });
    this.npcs.set(id, npc);
    npc.update(agent);
    this.updateCamp();
  }

  /** §4 Mirror warp: teleport the player next to the agent's NPC. */
  private handleWarp(id: string): void {
    this.promoteFromCamp(id);
    const slotIndex = this.slots.slotOf(id);
    if (slotIndex === null) return;
    const slot = slotFor(slotIndex);
    this.player.setPosition(slot.x + 44, slot.y + 14);
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

    if (roaming) {
      if (Phaser.Input.Keyboard.JustDown(this.mirrorKey)) {
        gameStore.set(uiModeAtom, { mode: "mirror" });
      }
      if (Phaser.Input.Keyboard.JustDown(this.journalKey)) {
        gameStore.set(journalOpenAtom, !gameStore.get(journalOpenAtom));
      }
    }

    this.updateMovement(roaming);
    this.updateInteraction(roaming);
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
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity(
      (vx / len) * PLAYER_SPEED,
      (vy / len) * PLAYER_SPEED,
    );
    if (vx !== 0) this.player.setFlipX(vx < 0);
  }

  private updateInteraction(roaming: boolean): void {
    const px = this.player.x;
    const py = this.player.y;

    let nearest: Interactable = null;
    let nearestDist = INTERACT_RANGE;
    let promptX = 0;
    let promptY = 0;

    const portalDist = Phaser.Math.Distance.Between(px, py, PORTAL.x, PORTAL.y);
    if (portalDist < nearestDist) {
      nearest = { kind: "portal" };
      nearestDist = portalDist;
      promptX = PORTAL.x;
      promptY = PORTAL.y - 48;
    }
    if (this.camped.size > 0) {
      const campDist = Phaser.Math.Distance.Between(px, py, CAMP.x, CAMP.y);
      if (campDist < nearestDist) {
        nearest = { kind: "camp" };
        nearestDist = campDist;
        promptX = CAMP.x;
        promptY = CAMP.y - 40;
      }
    }
    for (const [id, view] of this.npcs) {
      const agent = gameStore.get(agentsAtom).find((a) => a.id === id);
      if (!agent || agent.status === "ended") continue;
      const dist = Phaser.Math.Distance.Between(px, py, view.x, view.y);
      if (dist < nearestDist) {
        nearest = { kind: "npc", agentId: id };
        nearestDist = dist;
        promptX = view.x;
        promptY = view.y - 92;
      }
    }

    const current = gameStore.get(nearbyAtom);
    if (JSON.stringify(current) !== JSON.stringify(nearest)) {
      gameStore.set(nearbyAtom, nearest);
    }

    this.prompt.setVisible(roaming && nearest !== null);
    if (nearest) this.prompt.setPosition(promptX, promptY);

    if (
      roaming &&
      nearest &&
      Phaser.Input.Keyboard.JustDown(this.interactKey)
    ) {
      // The camp opens the Mirror — the dispatch console for everyone
      // without a sprite (§12).
      gameStore.set(
        uiModeAtom,
        nearest.kind === "portal"
          ? { mode: "summon" }
          : nearest.kind === "camp"
            ? { mode: "mirror" }
            : { mode: "talk", agentId: nearest.agentId },
      );
    }
  }
}
