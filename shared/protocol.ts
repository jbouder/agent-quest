// Wire protocol between the Agent Quest control server and the game client.
// This is the concrete form of DESIGN.md §10 (data model) and §7/§8 (control
// actions), scoped to Phase 1.

export type AgentStatus =
  | "summoning" // spawn requested, session not yet initialized
  | "idle" // turn complete, waiting for input
  | "thinking" // generating
  | "tool_running" // a tool call is in flight
  | "blocked_permission" // waiting on an approve/deny from the player
  | "compacting" // context ceiling hit — faint → auto-compact → back up
  | "sleeping" // player budget exhausted; paused, not ended
  | "ended" // dismissed or finished for good
  | "error";

export type PermissionMode = "default" | "acceptEdits" | "plan";

export interface PendingPermission {
  requestId: string;
  toolName: string;
  /** Compact human-readable summary of the tool input (e.g. the bash command). */
  inputSummary: string;
}

/** §5 — what this agent can actually do, from the session init message. */
export interface AgentInventory {
  tools: string[];
  skills: string[];
  slashCommands: string[];
  mcpServers: { name: string; status: string }[];
}

/** §5 — "available" vs "actually reached for": per-tool usage this session. */
export interface ToolUseStat {
  count: number;
  lastTs: number;
}

/** §6 — one quest-log entry, mirroring the agent's todo/plan list. */
export interface Quest {
  title: string;
  status: "pending" | "in_progress" | "completed";
}

export interface AgentSnapshot {
  id: string;
  /** Short display name, e.g. "Agent 1". */
  label: string;
  /** The task it was summoned with. */
  task: string;
  cwd: string;
  model: string;
  status: AgentStatus;
  /** Thought-bubble text: current tool name or last activity line. */
  thought: string;
  /** NPC health: current context size vs the model's window (DESIGN.md §2). */
  contextTokens: number;
  contextLimit: number;
  /** Cumulative spend for this agent — chips the *player's* hearts (§2). */
  tokensSpent: number;
  costUsd: number;
  sessionId: string | null;
  pendingPermission: PendingPermission | null;
  /** Final text of the last completed turn, for the talk dialog. */
  lastResult: string | null;
  /** How many times this session has auto-compacted (fainted and gotten up). */
  compactions: number;
  /** §5 inventory screen; null until the session's init message arrives. */
  inventory: AgentInventory | null;
  /** §5 usage glow: tool name → count + last-used timestamp. */
  toolUses: Record<string, ToolUseStat>;
  /** §6 quest log, from the agent's todo list. */
  quests: Quest[];
}

export interface PlayerState {
  /** Cumulative budget spent across all agents (hearts, §2). */
  spentUsd: number;
  budgetUsd: number;
  tokensSpent: number;
  /** True when spent >= budget: no summons, agents asleep. */
  locked: boolean;
}

export type JournalKind =
  | "status"
  | "text"
  | "tool"
  | "tool_result"
  | "permission"
  | "result"
  | "error";

export interface JournalLine {
  agentId: string;
  ts: number;
  kind: JournalKind;
  text: string;
}

export type ServerEvent =
  | {
      type: "snapshot";
      agents: AgentSnapshot[];
      player: PlayerState;
      /** Where the control server is running — prefills the portal's cwd. */
      defaultCwd: string;
    }
  | { type: "journal"; line: JournalLine }
  | { type: "toast"; level: "info" | "warn" | "error"; text: string };

export type ClientCommand =
  // §8 portal summon
  | {
      type: "summon";
      task: string;
      cwd: string;
      model?: string;
      permissionMode?: PermissionMode;
    }
  // §7 wand/talk — inject an instruction mid-task
  | { type: "steer"; agentId: string; text: string }
  // §7 sword — halt the current turn, no data loss
  | { type: "interrupt"; agentId: string }
  // §7 resume — continue after a stop
  | { type: "resume"; agentId: string; text?: string }
  // §7 dismiss — actually end the session
  | { type: "dismiss"; agentId: string }
  // §7 shield / open palm on a pending tool-use request
  | { type: "permission"; agentId: string; requestId: string; allow: boolean }
  // §5a — swap the model mid-session: a visible re-equip, not a silent change
  | { type: "equipModel"; agentId: string; model: string }
  // dev convenience: raise the budget so sleeping agents can be woken
  | { type: "topUp"; amountUsd: number };

/** Rough context windows per model family; used for NPC max health. */
export function contextLimitFor(model: string): number {
  if (model.includes("sonnet")) return 1_000_000;
  return 200_000;
}

export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_BUDGET_USD = 5;
