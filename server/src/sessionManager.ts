import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import {
  type AgentSnapshot,
  type ClientCommand,
  DEFAULT_BUDGET_USD,
  DEFAULT_MODEL,
  type JournalLine,
  type PermissionMode,
  type PlayerState,
  type ServerEvent,
  type SideQuest,
} from "../../shared/protocol";
import { AgentSession, type WorldContext } from "./agentSession";
import { BudgetTracker } from "./budget";
import { FakeAgentSession } from "./fakeSession";
import { findRepoRoot, listDistricts, scanQuestBoard } from "./repo";

// §8/§12: NPCs are cheap to look at, not to run — the village renders ~6
// individually and camps the rest, but the server cap is the real limit.
const MAX_CONCURRENT_AGENTS = Number(process.env.AGENT_QUEST_MAX_AGENTS ?? 8);
const BOARD_REFRESH_MS = 5 * 60 * 1000;

/** AgentSession and the §16 demo FakeAgentSession share this surface. */
type Session = AgentSession | FakeAgentSession;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private budget: BudgetTracker;
  private nextAgentNumber = 1;
  private broadcastTimer: NodeJS.Timeout | null = null;
  private world: WorldContext;
  private sideQuests: SideQuest[] = [];
  private recentCommits: string[] = [];

  constructor(
    private emit: (event: ServerEvent) => void,
    budgetUsd = DEFAULT_BUDGET_USD,
    private demoMode = false,
  ) {
    this.budget = new BudgetTracker(budgetUsd);
    const repoRoot = findRepoRoot(process.cwd());
    this.world = { repoRoot, districts: listDistricts(repoRoot) };
    void this.refreshBoard();
    setInterval(() => void this.refreshBoard(), BOARD_REFRESH_MS).unref();
  }

  private async refreshBoard(): Promise<void> {
    const { sideQuests, recentCommits } = await scanQuestBoard(
      this.world.repoRoot,
    );
    this.sideQuests = sideQuests;
    this.recentCommits = recentCommits;
    this.scheduleBroadcast();
  }

  snapshotEvent(): ServerEvent {
    return {
      type: "snapshot",
      agents: this.agents(),
      player: this.player(),
      defaultCwd: this.world.repoRoot,
      districts: this.world.districts,
      sideQuests: this.sideQuests,
      recentCommits: this.recentCommits,
      demoMode: this.demoMode,
    };
  }

  handle(command: ClientCommand): void {
    switch (command.type) {
      case "summon":
        this.summon(command);
        break;
      case "listSessions":
        void this.sendSessions();
        break;
      case "autoMode": {
        const mode: PermissionMode = command.enabled ? "auto" : "default";
        for (const session of this.sessions.values()) {
          if (!session.ended) void session.setPermissionMode(mode);
        }
        this.toast(
          "info",
          command.enabled
            ? "God mode: the gatekeeper now decides on its own."
            : "God mode off: the gatekeeper looks to you again.",
        );
        break;
      }
      case "steer":
        this.sessions.get(command.agentId)?.steer(command.text);
        break;
      case "interrupt":
        void this.sessions.get(command.agentId)?.interrupt();
        break;
      case "resume": {
        if (this.budget.locked) {
          this.toast("warn", "Out of budget — top up before waking anyone.");
          return;
        }
        const session = this.sessions.get(command.agentId);
        if (session?.sleeping) session.wake();
        session?.resume(command.text);
        break;
      }
      case "dismiss":
        this.sessions.get(command.agentId)?.dismiss();
        break;
      case "permission":
        this.sessions
          .get(command.agentId)
          ?.resolvePermission(command.requestId, command.allow);
        break;
      case "equipModel":
        void this.sessions.get(command.agentId)?.equipModel(command.model);
        break;
      case "topUp": {
        this.budget.topUp(command.amountUsd);
        this.toast("info", `Budget topped up by $${command.amountUsd}.`);
        for (const session of this.sessions.values()) session.wake();
        this.scheduleBroadcast();
        break;
      }
    }
  }

  private async sendSessions(): Promise<void> {
    if (this.demoMode) {
      this.emit({ type: "sessions", sessions: [] });
      return;
    }
    try {
      const sessions = await listSessions({ limit: 12 });
      this.emit({
        type: "sessions",
        sessions: sessions.map((s) => ({
          sessionId: s.sessionId,
          summary: s.customTitle ?? s.summary,
          lastModified: s.lastModified,
          cwd: s.cwd ?? null,
        })),
      });
    } catch (error) {
      this.toast("error", `Couldn't list saved sessions: ${String(error)}`);
    }
  }

  private summon(command: Extract<ClientCommand, { type: "summon" }>): void {
    if (this.budget.locked) {
      // §15: the dry, self-aware line — not a plain error.
      this.toast("warn", "The mirror looks back at you, unimpressed.");
      return;
    }
    const active = [...this.sessions.values()].filter((s) => !s.ended).length;
    if (active >= MAX_CONCURRENT_AGENTS) {
      this.toast(
        "warn",
        `The portal can sustain only ${MAX_CONCURRENT_AGENTS} agents at once.`,
      );
      return;
    }
    const number = this.nextAgentNumber++;
    const id = `agent-${number}`;
    const spec = {
      id,
      label: `Agent ${number}`,
      task: command.task,
      cwd: command.cwd,
      model: command.model ?? DEFAULT_MODEL,
      permissionMode: command.permissionMode ?? "default",
      resume: command.resume,
    };
    const events = {
      onChange: () => this.scheduleBroadcast(),
      onJournal: (kind: JournalLine["kind"], text: string) =>
        this.journal({ agentId: id, ts: Date.now(), kind, text }),
      onSpend: (deltaUsd: number, deltaTokens: number) =>
        this.recordSpend(deltaUsd, deltaTokens),
    };
    const session = this.demoMode
      ? new FakeAgentSession(spec, this.world, events)
      : new AgentSession(spec, this.world, events);
    this.sessions.set(id, session);
    this.toast(
      "info",
      command.resume
        ? `${session.label} returns, carrying an old tome of memories.`
        : `${session.label} steps through the portal.`,
    );
    this.scheduleBroadcast();
  }

  private recordSpend(deltaUsd: number, deltaTokens: number): void {
    this.budget.add(deltaUsd, deltaTokens);
    if (this.budget.locked) {
      // §2: zero hearts — everyone still running goes to sleep in place.
      for (const session of this.sessions.values()) {
        void session.sleep();
      }
      this.toast("warn", "Budget exhausted — your agents drift to sleep.");
    }
    this.scheduleBroadcast();
  }

  private agents(): AgentSnapshot[] {
    return [...this.sessions.values()].map((s) => s.snapshot());
  }

  private player(): PlayerState {
    return {
      spentUsd: this.budget.spentUsd,
      budgetUsd: this.budget.budgetUsd,
      tokensSpent: this.budget.tokensSpent,
      locked: this.budget.locked,
    };
  }

  private journal(line: JournalLine): void {
    this.emit({ type: "journal", line });
  }

  private toast(level: "info" | "warn" | "error", text: string): void {
    this.emit({ type: "toast", level, text });
  }

  /** Coalesce rapid state changes into ~10 broadcasts/second. */
  private scheduleBroadcast(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.emit(this.snapshotEvent());
    }, 100);
  }
}
