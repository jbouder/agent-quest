import {
  type AgentSnapshot,
  type ClientCommand,
  DEFAULT_BUDGET_USD,
  DEFAULT_MODEL,
  type JournalLine,
  type PlayerState,
  type ServerEvent,
} from "../../shared/protocol";
import { AgentSession } from "./agentSession";
import { BudgetTracker } from "./budget";

// §8/§12: NPCs are cheap to look at, not to run — the village renders ~6
// individually and camps the rest, but the server cap is the real limit.
const MAX_CONCURRENT_AGENTS = Number(process.env.AGENT_QUEST_MAX_AGENTS ?? 8);

export class SessionManager {
  private sessions = new Map<string, AgentSession>();
  private budget: BudgetTracker;
  private nextAgentNumber = 1;
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor(
    private emit: (event: ServerEvent) => void,
    budgetUsd = DEFAULT_BUDGET_USD,
  ) {
    this.budget = new BudgetTracker(budgetUsd);
  }

  snapshotEvent(): ServerEvent {
    return {
      type: "snapshot",
      agents: this.agents(),
      player: this.player(),
      defaultCwd: process.cwd(),
    };
  }

  handle(command: ClientCommand): void {
    switch (command.type) {
      case "summon":
        this.summon(
          command.task,
          command.cwd,
          command.model,
          command.permissionMode,
        );
        break;
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

  private summon(
    task: string,
    cwd: string,
    model = DEFAULT_MODEL,
    permissionMode: "default" | "acceptEdits" | "plan" = "default",
  ): void {
    if (this.budget.locked) {
      this.toast("warn", "The portal fizzles — you're out of budget.");
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
    const session = new AgentSession(
      {
        id,
        label: `Agent ${number}`,
        task,
        cwd,
        model,
        permissionMode,
      },
      {
        onChange: () => this.scheduleBroadcast(),
        onJournal: (kind, text) =>
          this.journal({ agentId: id, ts: Date.now(), kind, text }),
        onSpend: (deltaUsd, deltaTokens) =>
          this.recordSpend(deltaUsd, deltaTokens),
      },
    );
    this.sessions.set(id, session);
    this.toast("info", `${session.label} steps through the portal.`);
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
