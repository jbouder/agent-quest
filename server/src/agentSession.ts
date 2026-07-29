import {
  type Options,
  type PermissionResult,
  type Query,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  type AgentSnapshot,
  type AgentStatus,
  contextLimitFor,
  type JournalKind,
  type PendingPermission,
  type PermissionMode,
} from "../../shared/protocol";
import { MonotonicCounter } from "./budget";

export interface SessionEvents {
  /** Snapshot state changed — schedule a broadcast. */
  onChange(): void;
  onJournal(kind: JournalKind, text: string): void;
  /** Spend deltas roll up into the player's hearts. */
  onSpend(deltaUsd: number, deltaTokens: number): void;
}

export interface SpawnSpec {
  id: string;
  label: string;
  task: string;
  cwd: string;
  model: string;
  permissionMode: PermissionMode;
}

/**
 * Streaming-input queue for a live session. Keeping the AsyncIterable open
 * is what lets us inject new user messages mid-task (§7 wand/steer) instead
 * of one-shotting a prompt.
 */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = [];
  private waiter: ((result: IteratorResult<SDKUserMessage>) => void) | null =
    null;
  private closed = false;

  push(text: string): void {
    if (this.closed) return;
    const msg: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    };
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ value: msg, done: false });
    } else {
      this.buffer.push(msg);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const buffered = this.buffer.shift();
        if (buffered) return Promise.resolve({ value: buffered, done: false });
        if (this.closed)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
          this.waiter = resolve;
        });
      },
    };
  }
}

function truncate(text: string, max = 90): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Compact human-readable summary of a tool call for the thought bubble. */
export function summarizeToolInput(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
  };
  const detail =
    pick(
      "command",
      "file_path",
      "path",
      "pattern",
      "query",
      "description",
      "prompt",
      "url",
    ) ?? JSON.stringify(input);
  return truncate(`${toolName}: ${detail}`, 90);
}

interface PendingPermissionInternal extends PendingPermission {
  resolve: (result: PermissionResult) => void;
}

/**
 * One live Claude Code session, wrapped as an NPC. Holds the real control
 * handle (§11): the Query object plus the open input queue.
 */
export class AgentSession {
  readonly id: string;
  readonly label: string;
  readonly task: string;
  readonly cwd: string;

  private model: string;
  private status: AgentStatus = "summoning";
  private thought = "walking in from the portal…";
  private contextTokens = 0;
  private contextLimit: number;
  private tokensSpent = 0;
  private costUsd = 0;
  private sessionId: string | null = null;
  private lastResult: string | null = null;
  private compactions = 0;

  private queue = new InputQueue();
  private q: Query | null = null;
  private pendingPermission: PendingPermissionInternal | null = null;
  private outstandingTools = new Map<string, string>(); // toolUseId -> name
  private costCounter = new MonotonicCounter();
  private tokenCounter = new MonotonicCounter();
  private permissionSeq = 0;

  constructor(
    spec: SpawnSpec,
    private events: SessionEvents,
  ) {
    this.id = spec.id;
    this.label = spec.label;
    this.task = spec.task;
    this.cwd = spec.cwd;
    this.model = spec.model;
    this.contextLimit = contextLimitFor(spec.model);

    this.q = query({
      prompt: this.queue,
      options: {
        cwd: spec.cwd,
        model: spec.model,
        permissionMode: spec.permissionMode,
        canUseTool: (toolName, input, options) =>
          this.requestPermission(toolName, input, options.title),
        settingSources: ["user", "project", "local"],
      } satisfies Options,
    });
    this.queue.push(spec.task);
    void this.run();
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
      sessionId: this.sessionId,
      pendingPermission: this.pendingPermission
        ? {
            requestId: this.pendingPermission.requestId,
            toolName: this.pendingPermission.toolName,
            inputSummary: this.pendingPermission.inputSummary,
          }
        : null,
      lastResult: this.lastResult,
      compactions: this.compactions,
    };
  }

  get ended(): boolean {
    return this.status === "ended";
  }

  get sleeping(): boolean {
    return this.status === "sleeping";
  }

  /** §7 wand/talk — inject an instruction mid-task. */
  steer(text: string): void {
    if (this.ended) return;
    this.queue.push(text);
    this.setStatus("thinking", "considering your words…");
    this.events.onJournal("text", `You: ${truncate(text)}`);
  }

  /** §7 sword — interrupt the current turn. The tool call has to unwind
   * first, which is why the NPC flinches rather than freezing instantly. */
  async interrupt(): Promise<void> {
    if (this.ended || !this.q) return;
    this.events.onJournal("status", "⚔ interrupted");
    try {
      await this.q.interrupt();
      if (this.status !== "sleeping") {
        this.setStatus("idle", "…was I saying something?");
      }
    } catch (error) {
      this.events.onJournal("error", `interrupt failed: ${String(error)}`);
    }
  }

  /** §7 resume — continue after a stop. */
  resume(text?: string): void {
    if (this.ended) return;
    this.steer(text ?? "Please continue where you left off.");
  }

  /** §7 dismiss — final, not a freeze. */
  dismiss(): void {
    if (this.ended) return;
    this.denyPendingPermission("The session was dismissed.");
    this.queue.close();
    this.q?.close();
    this.q = null;
    this.setStatus("ended", "farewell");
    this.events.onJournal("status", "dismissed");
  }

  /** §2 budget exhausted — pause in place, don't end. */
  async sleep(): Promise<void> {
    if (this.ended || this.sleeping) return;
    this.denyPendingPermission("The player is out of budget.");
    try {
      await this.q?.interrupt();
    } catch {
      // already idle
    }
    this.setStatus("sleeping", "zzz…");
    this.events.onJournal("status", "fell asleep (budget exhausted)");
  }

  wake(): void {
    if (!this.sleeping) return;
    this.setStatus("idle", "good morning");
    this.events.onJournal("status", "woke up (budget restored)");
  }

  /** §7 shield (deny) / open palm (allow) on a pending tool-use request. */
  resolvePermission(requestId: string, allow: boolean): void {
    const pending = this.pendingPermission;
    if (!pending || pending.requestId !== requestId) return;
    this.pendingPermission = null;
    if (allow) {
      pending.resolve({ behavior: "allow" });
      this.events.onJournal("permission", `🖐 allowed ${pending.toolName}`);
      this.setStatus("tool_running", pending.inputSummary);
    } else {
      pending.resolve({
        behavior: "deny",
        message: "The player raised their shield — request denied.",
      });
      this.events.onJournal("permission", `🛡 denied ${pending.toolName}`);
      this.setStatus("thinking", "rethinking after the shield…");
    }
  }

  private denyPendingPermission(message: string): void {
    const pending = this.pendingPermission;
    if (!pending) return;
    this.pendingPermission = null;
    pending.resolve({ behavior: "deny", message });
  }

  private requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    title: string | undefined,
  ): Promise<PermissionResult> {
    return new Promise((resolve) => {
      this.permissionSeq += 1;
      const summary = title ?? summarizeToolInput(toolName, input);
      this.pendingPermission = {
        requestId: `${this.id}-perm-${this.permissionSeq}`,
        toolName,
        inputSummary: truncate(summary, 160),
        resolve,
      };
      this.setStatus("blocked_permission", `may I? ${truncate(summary, 60)}`);
      this.events.onJournal("permission", `❗ wants to use ${summary}`);
    });
  }

  private setStatus(status: AgentStatus, thought?: string): void {
    this.status = status;
    if (thought !== undefined) this.thought = thought;
    this.events.onChange();
  }

  private async run(): Promise<void> {
    if (!this.q) return;
    try {
      for await (const message of this.q) {
        this.handleMessage(message);
      }
      if (!this.ended) {
        this.setStatus("ended", "quest complete");
        this.events.onJournal("status", "session ended");
      }
    } catch (error) {
      if (!this.ended) {
        this.setStatus("error", truncate(String(error)));
        this.events.onJournal("error", String(error));
      }
    }
  }

  private handleMessage(message: SDKMessage): void {
    switch (message.type) {
      case "system":
        if (message.subtype === "init") {
          this.sessionId = message.session_id;
          this.model = message.model;
          if (this.status === "summoning") {
            this.setStatus("thinking", "reading the quest…");
          }
          this.events.onJournal(
            "status",
            `session ${message.session_id.slice(0, 8)} started (${message.model}, ${message.tools.length} tools)`,
          );
        } else if (message.subtype === "compact_boundary") {
          // §2: faint → auto-compact → back up, health restored to the
          // post-compaction context size.
          this.compactions += 1;
          const post = message.compact_metadata.post_tokens;
          if (typeof post === "number") this.contextTokens = post;
          this.setStatus("compacting", "fainted… compacting memories…");
          this.events.onJournal(
            "status",
            `compacted: ${message.compact_metadata.pre_tokens} → ${post ?? "?"} tokens (${message.compact_metadata.trigger})`,
          );
        }
        break;

      case "assistant": {
        const usage = message.message.usage;
        if (usage) {
          const input = usage.input_tokens ?? 0;
          const cacheRead = usage.cache_read_input_tokens ?? 0;
          const cacheCreate = usage.cache_creation_input_tokens ?? 0;
          const output = usage.output_tokens ?? 0;
          // NPC health: current context size ≈ everything in the latest
          // request plus what it generated.
          this.contextTokens = input + cacheRead + cacheCreate + output;
        }
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            this.outstandingTools.set(
              block.id,
              summarizeToolInput(
                block.name,
                (block.input ?? {}) as Record<string, unknown>,
              ),
            );
            this.setStatus("tool_running", this.outstandingTools.get(block.id));
            this.events.onJournal(
              "tool",
              `→ ${this.outstandingTools.get(block.id)}`,
            );
          } else if (block.type === "text" && block.text.trim().length > 0) {
            this.setStatus("thinking", truncate(block.text));
            this.events.onJournal("text", truncate(block.text, 200));
          }
        }
        break;
      }

      case "user": {
        // Tool results come back replayed as user messages.
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              typeof block === "object" &&
              block !== null &&
              "type" in block &&
              block.type === "tool_result" &&
              "tool_use_id" in block
            ) {
              const id = String(block.tool_use_id);
              const name = this.outstandingTools.get(id);
              this.outstandingTools.delete(id);
              if (name) this.events.onJournal("tool_result", `✓ ${name}`);
              if (this.outstandingTools.size === 0 && !this.sleeping) {
                this.setStatus("thinking", "pondering the result…");
              }
            }
          }
        }
        break;
      }

      case "result": {
        this.outstandingTools.clear();
        // total_cost_usd/usage on result messages are session-cumulative;
        // MonotonicCounter turns them into deltas either way.
        const usage = message.usage;
        const totalTokens =
          (usage.input_tokens ?? 0) +
          (usage.output_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
        const deltaUsd = this.costCounter.feed(message.total_cost_usd);
        const deltaTokens = this.tokenCounter.feed(totalTokens);
        this.costUsd += deltaUsd;
        this.tokensSpent += deltaTokens;
        for (const modelUsage of Object.values(message.modelUsage)) {
          if (modelUsage.contextWindow > 0) {
            this.contextLimit = modelUsage.contextWindow;
          }
        }
        if (message.subtype === "success") {
          this.lastResult = message.result;
          if (!this.sleeping) {
            this.setStatus("idle", truncate(message.result));
          }
          this.events.onJournal("result", truncate(message.result, 300));
        } else {
          this.setStatus("error", message.subtype);
          this.events.onJournal(
            "error",
            `${message.subtype}: ${message.errors.join("; ") || "turn failed"}`,
          );
        }
        this.events.onSpend(deltaUsd, deltaTokens);
        break;
      }

      default:
        break;
    }
  }
}
