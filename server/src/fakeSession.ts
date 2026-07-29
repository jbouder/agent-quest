import type {
  AgentSnapshot,
  AgentStatus,
  AgentTask,
  PermissionMode,
  Quest,
} from "../../shared/protocol";
import { contextLimitFor } from "../../shared/protocol";
import type { SessionEvents, SpawnSpec, WorldContext } from "./agentSession";

const FAKE_TOOLS = ["Read", "Edit", "Bash", "Grep", "Write", "WebSearch"];
const FAKE_FILES = ["index.ts", "config.ts", "utils.ts", "main.py", "app.tsx"];

/**
 * §16 sandbox/demo mode: a scripted agent with the same control surface as
 * AgentSession, running against fake budget entirely. Lets the game be shown
 * off (and tested) without spending anything real.
 */
export class FakeAgentSession {
  readonly id: string;
  readonly label: string;
  readonly task: string;
  readonly cwd: string;

  private model: string;
  private status: AgentStatus = "summoning";
  private thought = "walking in from the portal…";
  private contextTokens = 12_000;
  private contextLimit: number;
  private tokensSpent = 0;
  private costUsd = 0;
  private quests: Quest[] = [];
  private tasks = new Map<string, AgentTask>();
  private district: string | null = null;
  private permissionMode: PermissionMode;
  private pendingPermission: AgentSnapshot["pendingPermission"] = null;
  private lastResult: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private step = 0;
  private taskSeq = 0;

  constructor(
    spec: SpawnSpec,
    private world: WorldContext,
    private events: SessionEvents,
  ) {
    this.id = spec.id;
    this.label = spec.label;
    this.task = spec.task;
    this.cwd = spec.cwd;
    this.model = spec.model;
    this.contextLimit = contextLimitFor(spec.model);
    this.permissionMode = spec.permissionMode;
    this.quests = [
      { title: "Scout the area", status: "pending" },
      { title: spec.task.slice(0, 40) || "Do the thing", status: "pending" },
      { title: "Report back", status: "pending" },
    ];
    this.events.onJournal("status", "session started (demo — nothing is real)");
    this.schedule(1200);
  }

  get ended(): boolean {
    return this.status === "ended";
  }
  get sleeping(): boolean {
    return this.status === "sleeping";
  }

  snapshot(): AgentSnapshot {
    return {
      id: this.id,
      label: this.label,
      task: this.task,
      cwd: this.cwd,
      model: this.model,
      status: this.status,
      thought: this.thought,
      contextTokens: this.contextTokens,
      contextLimit: this.contextLimit,
      tokensSpent: this.tokensSpent,
      costUsd: this.costUsd,
      sessionId: `demo-${this.id}`,
      pendingPermission: this.pendingPermission,
      lastResult: this.lastResult,
      compactions: 0,
      inventory: {
        tools: FAKE_TOOLS,
        skills: ["demo-lore"],
        slashCommands: [],
        mcpServers: [],
      },
      toolUses: {},
      quests: this.quests,
      district: this.district,
      permissionMode: this.permissionMode,
      planPending: false,
      tomePreview: null,
      tasks: [...this.tasks.values()],
    };
  }

  steer(text: string): void {
    if (this.ended) return;
    this.events.onJournal("text", `You: ${text.slice(0, 80)}`);
    this.status = "thinking";
    this.thought = "considering your words…";
    this.step = Math.max(0, this.step - 4);
    this.events.onChange();
    this.schedule(1000);
  }

  async interrupt(): Promise<void> {
    if (this.ended) return;
    this.clearTimer();
    this.status = "idle";
    this.thought = "…was I saying something?";
    this.events.onJournal("status", "⚔ interrupted");
    this.events.onChange();
  }

  resume(text?: string): void {
    this.steer(text ?? "Please continue.");
  }

  dismiss(): void {
    if (this.ended) return;
    this.clearTimer();
    this.status = "ended";
    this.thought = "farewell";
    this.events.onJournal("status", "dismissed");
    this.events.onChange();
  }

  async sleep(): Promise<void> {
    if (this.ended || this.sleeping) return;
    this.clearTimer();
    this.status = "sleeping";
    this.thought = "zzz…";
    this.events.onChange();
  }

  wake(): void {
    if (!this.sleeping) return;
    this.status = "idle";
    this.thought = "good morning";
    this.events.onChange();
  }

  resolvePermission(requestId: string, allow: boolean): void {
    if (this.pendingPermission?.requestId !== requestId) return;
    this.pendingPermission = null;
    this.status = "thinking";
    this.thought = allow ? "granted — onward" : "rethinking after the shield…";
    this.events.onJournal("permission", allow ? "🖐 allowed" : "🛡 denied");
    this.events.onChange();
    this.schedule(1200);
  }

  async equipModel(model: string): Promise<void> {
    this.model = model;
    this.contextLimit = contextLimitFor(model);
    this.events.onJournal("status", `⚔ re-equipped: now wielding ${model}`);
    this.events.onChange();
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.permissionMode = mode;
    this.events.onJournal("status", `permission mode set to ${mode}`);
    this.events.onChange();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private pick<T>(items: T[]): T {
    return items[this.step % items.length] as T;
  }

  private tick(): void {
    if (this.ended || this.sleeping) return;
    this.step += 1;

    // fake spend and context growth
    const deltaTokens = 800 + (this.step % 5) * 400;
    const deltaUsd = deltaTokens * 0.000004;
    this.tokensSpent += deltaTokens;
    this.costUsd += deltaUsd;
    this.contextTokens = Math.min(
      this.contextLimit,
      this.contextTokens + deltaTokens,
    );
    this.events.onSpend(deltaUsd, deltaTokens);

    if (this.step >= 14) {
      this.status = "idle";
      this.thought = "quest complete — awaiting orders";
      this.lastResult = "Demo quest finished. Everything was pretend.";
      this.quests = this.quests.map((q) => ({ ...q, status: "completed" }));
      this.events.onJournal("result", this.lastResult);
      this.events.onChange();
      return;
    }

    // progress quests
    const active = this.quests.findIndex((q) => q.status !== "completed");
    if (active >= 0 && this.step % 4 === 0) {
      const quest = this.quests[active];
      if (quest) {
        quest.status =
          quest.status === "in_progress" ? "completed" : "in_progress";
      }
    }

    // occasionally ask permission (unless the gatekeeper decides)
    if (this.step % 6 === 3 && this.permissionMode === "default") {
      this.status = "blocked_permission";
      const summary = `Bash: rm -rf ./${this.pick(FAKE_FILES)} (pretend)`;
      this.pendingPermission = {
        requestId: `${this.id}-perm-${this.step}`,
        toolName: "Bash",
        inputSummary: summary,
      };
      this.thought = `may I? ${summary}`;
      this.events.onJournal("permission", `❗ wants to use ${summary}`);
      this.events.onChange();
      return; // waits for the player
    }

    // occasionally send a subagent out / bring one home (§13)
    if (this.step % 5 === 2) {
      this.taskSeq += 1;
      const id = `${this.id}-sub-${this.taskSeq}`;
      this.tasks.set(id, {
        id,
        description: `scout ${this.pick(this.world.districts) ?? "the wilds"}`,
        kind: this.taskSeq % 3 === 0 ? "background" : "subagent",
        status: "running",
      });
      this.events.onJournal("status", "⚔ subagent sets out (demo)");
    } else {
      const running = [...this.tasks.values()].find(
        (t) => t.status === "running",
      );
      if (running && this.step % 5 === 4) {
        running.status = "completed";
        this.events.onJournal("status", `📜 ${running.kind} returns (demo)`);
      }
    }

    // wander districts and swing tools
    const tool = this.pick(FAKE_TOOLS);
    const district = this.pick(this.world.districts) ?? null;
    if (district && this.step % 3 === 0 && district !== this.district) {
      this.district = district;
      this.events.onJournal("status", `entered ${district}/`);
    }
    this.status = this.step % 3 === 1 ? "thinking" : "tool_running";
    this.thought =
      this.status === "thinking"
        ? "pondering the next move…"
        : `${tool}: ${this.pick(FAKE_FILES)}`;
    if (this.status === "tool_running") {
      this.events.onJournal("tool", `→ ${this.thought}`);
    }
    this.events.onChange();
    this.schedule(1600 + (this.step % 3) * 700);
  }
}
