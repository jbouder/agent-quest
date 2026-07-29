import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { contextHealth, formatTokens, formatUsd } from "@/lib/format";
import type { AgentSnapshot } from "@/lib/protocol";
import { sendCommand } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { agentsAtom, journalAtom, uiModeAtom } from "@/store/gameAtoms";

const STATUS_LABEL: Record<AgentSnapshot["status"], string> = {
  summoning: "stepping through the portal",
  idle: "awaiting orders",
  thinking: "thinking",
  tool_running: "swinging a tool",
  blocked_permission: "asking permission",
  compacting: "compacting memories",
  sleeping: "asleep (budget)",
  ended: "departed",
  error: "wounded (error)",
};

export default function TalkDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const agents = useAtomValue(agentsAtom);
  const journal = useAtomValue(journalAtom);
  const [text, setText] = useState("");

  if (ui.mode !== "talk") return null;
  const agent = agents.find((a) => a.id === ui.agentId);
  if (!agent) return null;

  const close = () => setUi({ mode: "roam" });
  const steer = () => {
    if (!text.trim()) return;
    sendCommand({ type: "steer", agentId: agent.id, text: text.trim() });
    setText("");
  };

  const health = contextHealth(agent.contextTokens, agent.contextLimit);
  const lines = journal.filter((l) => l.agentId === agent.id).slice(-8);
  const busy = agent.status === "thinking" || agent.status === "tool_running";

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-4">
      <div className="w-[640px] max-w-[95vw] rounded-lg border-2 border-accent bg-card p-4 shadow-xl">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-accent">
            {agent.label}{" "}
            <span className="text-xs text-muted">
              · {agent.model} · {STATUS_LABEL[agent.status]}
            </span>
          </h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setUi({ mode: "inventory", agentId: agent.id })}
              className="text-xs text-primary hover:opacity-80"
            >
              🎒 inventory
            </button>
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted hover:text-foreground"
            >
              leave (Esc)
            </button>
          </div>
        </div>

        <p className="mb-2 text-xs text-muted">quest: {agent.task}</p>

        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-muted">context</span>
          <div className="h-2 flex-1 rounded bg-background">
            <div
              className={cn(
                "h-2 rounded",
                health > 0.5
                  ? "bg-accent"
                  : health > 0.25
                    ? "bg-primary"
                    : "bg-destructive",
              )}
              style={{ width: `${health * 100}%` }}
            />
          </div>
          <span className="text-muted">
            {formatTokens(agent.contextTokens)}/
            {formatTokens(agent.contextLimit)}
          </span>
          <span className="text-muted">· spent {formatUsd(agent.costUsd)}</span>
        </div>

        {agent.quests.length > 0 && (
          <div className="mb-2 max-h-24 overflow-y-auto rounded border border-border bg-background p-2 text-xs">
            <p className="mb-1 text-muted">Quest log</p>
            {agent.quests.map((quest) => (
              <p
                key={quest.title}
                className={cn(
                  quest.status === "completed" && "text-muted line-through",
                  quest.status === "in_progress" && "text-accent",
                )}
              >
                {quest.status === "completed"
                  ? "☑"
                  : quest.status === "in_progress"
                    ? "◈"
                    : "☐"}{" "}
                {quest.title}
              </p>
            ))}
          </div>
        )}

        <div className="mb-2 max-h-32 overflow-y-auto rounded border border-border bg-background p-2 text-xs">
          {lines.length === 0 && (
            <p className="text-muted">No tale to tell yet.</p>
          )}
          {lines.map((line) => (
            <p
              key={`${line.ts}-${line.text}`}
              className={cn(
                line.kind === "error" && "text-destructive",
                line.kind === "permission" && "text-primary",
                line.kind === "result" && "text-accent",
              )}
            >
              {line.text}
            </p>
          ))}
        </div>

        {agent.pendingPermission && (
          <div className="mb-2 rounded border border-primary bg-background p-2 text-xs">
            <p className="mb-2 text-primary">
              ❗ Wants to use: {agent.pendingPermission.inputSummary}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-accent px-3 py-1 text-accent-foreground"
                onClick={() =>
                  sendCommand({
                    type: "permission",
                    agentId: agent.id,
                    requestId: agent.pendingPermission?.requestId ?? "",
                    allow: true,
                  })
                }
              >
                🖐 Allow
              </button>
              <button
                type="button"
                className="rounded bg-destructive px-3 py-1 text-destructive-foreground"
                onClick={() =>
                  sendCommand({
                    type: "permission",
                    agentId: agent.id,
                    requestId: agent.pendingPermission?.requestId ?? "",
                    allow: false,
                  })
                }
              >
                🛡 Deny
              </button>
            </div>
          </div>
        )}

        {agent.status !== "ended" && (
          <div className="mb-2 flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") steer();
                if (e.key === "Escape") close();
              }}
              placeholder={
                agent.status === "sleeping"
                  ? "Asleep — top up the budget first"
                  : "Speak to steer the agent…"
              }
              disabled={agent.status === "sleeping"}
              className="flex-1 rounded border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={steer}
              disabled={!text.trim() || agent.status === "sleeping"}
              className="rounded bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-40"
            >
              🪄 Speak
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {busy && (
            <button
              type="button"
              className="rounded border border-destructive px-3 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() =>
                sendCommand({ type: "interrupt", agentId: agent.id })
              }
            >
              ⚔ Interrupt
            </button>
          )}
          {(agent.status === "idle" ||
            agent.status === "sleeping" ||
            agent.status === "error") && (
            <button
              type="button"
              className="rounded border border-accent px-3 py-1 text-xs text-accent hover:bg-accent hover:text-accent-foreground"
              onClick={() => sendCommand({ type: "resume", agentId: agent.id })}
            >
              ↻ Resume
            </button>
          )}
          {agent.status !== "ended" && (
            <button
              type="button"
              className="ml-auto rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground"
              onClick={() => {
                sendCommand({ type: "dismiss", agentId: agent.id });
                close();
              }}
            >
              ✕ Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
