import { forkSession, listSessions } from "@anthropic-ai/claude-agent-sdk";
import {
  type AgentSnapshot,
  type ClientCommand,
  DEFAULT_BUDGET_USD,
  DEFAULT_MODEL,
  type JournalLine,
  LIVE_SESSION_WINDOW_MS,
  type PermissionMode,
  type PlayerState,
  type Raid,
  type ServerEvent,
  type SideQuest,
  type Ward,
} from "../../shared/protocol";
import { AgentSession, type WorldContext } from "./agentSession";
import { BudgetTracker } from "./budget";
import { FakeAgentSession } from "./fakeSession";
import { detectRaid, isSameRaid } from "./raid";
import {
  findRepoRoot,
  findRevertedShas,
  listDistricts,
  scanQuestBoard,
} from "./repo";
import { readWards } from "./wards";

// §8/§12: NPCs are cheap to look at, not to run — the village renders ~6
// individually and camps the rest, but the server cap is the real limit.
const MAX_CONCURRENT_AGENTS = Number(process.env.AGENT_QUEST_MAX_AGENTS ?? 8);
const BOARD_REFRESH_MS = 5 * 60 * 1000;
/** §9c — a revert should show up while you're still looking at the trophy. */
const REVERT_POLL_MS = 30 * 1000;

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
  /** §14 — hooks configured for this repo, rendered as wards on the world. */
  private wards: Ward[] = [];
  /** §9b — the current boss fight, kept across snapshots so its clock runs. */
  private raid: Raid | null = null;

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
    setInterval(() => void this.checkReverts(), REVERT_POLL_MS).unref();
  }

  /**
   * §9c — a revert doesn't destroy the trophy it undoes; it rewinds it. Match
   * reverted shas against what each agent committed and mark those agents.
   */
  private async checkReverts(): Promise<void> {
    const reverted = await findRevertedShas(this.world.repoRoot);
    if (reverted.length === 0) return;
    for (const session of this.sessions.values()) {
      const snapshot = session.snapshot();
      if (snapshot.rewound || snapshot.commits.length === 0) continue;
      // Reverts may name an abbreviated sha, so compare by prefix.
      const undone = snapshot.commits.some((sha) =>
        reverted.some((r) => sha.startsWith(r) || r.startsWith(sha)),
      );
      if (!undone) continue;
      session.markRewound();
      this.toast(
        "info",
        `⟲ ${session.label}'s work was reverted — the trophy rewinds, but stays.`,
      );
    }
  }

  private async refreshBoard(): Promise<void> {
    const [{ sideQuests, recentCommits }, wards] = await Promise.all([
      scanQuestBoard(this.world.repoRoot),
      readWards(this.world.repoRoot),
    ]);
    this.sideQuests = sideQuests;
    this.recentCommits = recentCommits;
    this.wards = wards;
    this.scheduleBroadcast();
  }

  /**
   * §9b — re-detect the party each snapshot, but keep the clock running as
   * long as it's the same fight; a member joining shouldn't restart the boss.
   */
  private updateRaid(agents: AgentSnapshot[]): Raid | null {
    const next = detectRaid(agents, this.raid?.startedTs ?? Date.now());
    if (next && !isSameRaid(this.raid, next)) {
      next.startedTs = Date.now();
      this.toast(
        "info",
        `⚔ A raid forms — ${next.agentIds.length} agents on one objective.`,
      );
    }
    this.raid = next;
    return next;
  }

  snapshotEvent(): ServerEvent {
    const agents = this.agents();
    return {
      type: "snapshot",
      agents,
      player: this.player(),
      defaultCwd: this.world.repoRoot,
      sideQuests: this.sideQuests,
      recentCommits: this.recentCommits,
      wards: this.wards,
      raid: this.updateRaid(agents),
      demoMode: this.demoMode,
    };
  }

  handle(command: ClientCommand): void {
    switch (command.type) {
      case "summon":
        void this.summon(command);
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
      const now = Date.now();
      // Sessions we're already driving aren't candidates to attach to.
      const ours = new Set(
        [...this.sessions.values()]
          .map((session) => session.snapshot().sessionId)
          .filter((id): id is string => id !== null),
      );
      this.emit({
        type: "sessions",
        sessions: sessions.map((s) => ({
          sessionId: s.sessionId,
          summary: s.customTitle ?? s.summary,
          lastModified: s.lastModified,
          cwd: s.cwd ?? null,
          live:
            !ours.has(s.sessionId) &&
            now - s.lastModified < LIVE_SESSION_WINDOW_MS,
        })),
      });
    } catch (error) {
      this.toast("error", `Couldn't list saved sessions: ${String(error)}`);
    }
  }

  private async summon(
    command: Extract<ClientCommand, { type: "summon" }>,
  ): Promise<void> {
    if (this.budget.locked) {
      // §15: the dry, self-aware line — not a plain error.
      this.toast("warn", "The mirror looks back at you, unimpressed.");
      return;
    }
    const active = [...this.sessions.values()].filter((s) => !s.ended).length;
    if (active >= MAX_CONCURRENT_AGENTS) {
      this.toast(
        "warn",
        `The village can sustain only ${MAX_CONCURRENT_AGENTS} agents at once.`,
      );
      return;
    }

    // §8a/§11 path 3 — attaching means forking: the SDK can't take over
    // another process's input, so we branch the transcript and drive our own
    // copy. The original keeps running, which is why this is a twin.
    let resume = command.resume;
    let forkedFrom: string | undefined;
    if (command.attach) {
      try {
        const fork = await forkSession(command.attach, {
          title: "Agent Quest attach",
        });
        resume = fork.sessionId;
        forkedFrom = command.attach;
      } catch (error) {
        this.toast(
          "error",
          `The mirror couldn't catch that session: ${String(error)}`,
        );
        return;
      }
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
      resume,
      forkedFrom,
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
    // §8a — an attach is a twin stepping out of the mirror, not the original
    // walking in. Say so plainly; the other session is still out there.
    this.toast(
      "info",
      forkedFrom
        ? `${session.label} steps out of the mirror — a twin of a session still running elsewhere. Steering this one won't stop that one.`
        : command.resume
          ? `${session.label} returns, carrying an old tome of memories.`
          : `${session.label} answers the summons.`,
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
