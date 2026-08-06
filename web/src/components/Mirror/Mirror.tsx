import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { contextHealth, formatUsd } from "@/lib/format";
import type { AgentSnapshot } from "@/lib/protocol";
import { cn } from "@/lib/utils";
import { agentsAtom, uiModeAtom, warpTargetAtom } from "@/store/gameAtoms";

const TIER_CLASS: Record<string, string> = {
  haiku: "text-tier-haiku",
  sonnet: "text-tier-sonnet",
  opus: "text-tier-opus",
  legendary: "text-tier-legendary",
};

function tierOf(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("opus")) return "opus";
  if (m.includes("fable") || m.includes("mythos")) return "legendary";
  return "sonnet";
}

const STATUS_TEXT: Record<AgentSnapshot["status"], string> = {
  summoning: "✨ arriving",
  idle: "awaiting orders",
  thinking: "… thinking",
  tool_running: "⚒ working",
  blocked_permission: "❗ needs you",
  compacting: "💫 compacting",
  sleeping: "💤 asleep",
  ended: "departed",
  error: "✖ wounded",
};

/** §4: agents that need attention get the pulsing border. */
function needsAttention(agent: AgentSnapshot): boolean {
  return agent.status === "blocked_permission" || agent.status === "error";
}

export default function Mirror() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const agents = useAtomValue(agentsAtom);
  const setWarp = useSetAtom(warpTargetAtom);
  const open = ui.mode === "mirror";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "m") {
        setUi({ mode: "roam" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUi]);

  if (!open) return null;

  const warpTo = (agent: AgentSnapshot) => {
    if (agent.status === "ended") return;
    setWarp(agent.id);
    setUi({ mode: "roam" });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div className="w-[720px] max-w-[95vw]">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-accent">◇ The Mirror</h2>
          <span className="text-xs text-muted">
            tap an agent to warp to them · Esc/M to close
          </span>
        </div>
        {agents.length === 0 && (
          <p className="rounded border border-border bg-card p-6 text-center text-sm text-muted">
            The mirror shows only your own reflection. Summon an agent with the
            ✨ scroll (top right).
          </p>
        )}
        <div className="grid max-h-[70vh] grid-cols-3 gap-3 overflow-y-auto">
          {agents.map((agent) => {
            const health = contextHealth(
              agent.contextTokens,
              agent.contextLimit,
            );
            const departed = agent.status === "ended";
            return (
              <div
                key={agent.id}
                className={cn(
                  "relative rounded-lg border-2 bg-card p-3 text-left",
                  needsAttention(agent)
                    ? "animate-pulse border-primary"
                    : "border-border",
                  departed
                    ? "opacity-40"
                    : "hover:border-accent focus-within:border-accent",
                )}
              >
                {/* §5/§7a — every agent's inventory, two clicks from anywhere */}
                <button
                  type="button"
                  title={`${agent.label}'s inventory`}
                  onClick={() =>
                    setUi({ mode: "inventory", agentId: agent.id })
                  }
                  className="absolute right-2 bottom-2 text-sm opacity-60 hover:opacity-100"
                >
                  🎒
                </button>
                <button
                  type="button"
                  onClick={() => warpTo(agent)}
                  disabled={departed}
                  className="block w-full text-left"
                >
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-sm">{agent.label}</span>
                    <span
                      className={cn(
                        "text-[10px]",
                        TIER_CLASS[tierOf(agent.model)],
                      )}
                    >
                      {agent.model.replace("claude-", "")}
                    </span>
                  </div>
                  <p className="mb-1 text-xs text-muted">
                    {STATUS_TEXT[agent.status]}
                  </p>
                  <div className="mb-1 h-1.5 rounded bg-background">
                    <div
                      className={cn(
                        "h-1.5 rounded",
                        health > 0.5
                          ? "bg-accent"
                          : health > 0.25
                            ? "bg-primary"
                            : "bg-destructive",
                      )}
                      style={{ width: `${health * 100}%` }}
                    />
                  </div>
                  <p className="truncate text-[10px] text-muted">
                    {agent.thought || agent.task}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    {formatUsd(agent.costUsd)} spent
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
