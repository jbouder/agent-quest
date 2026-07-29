import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { MODELS } from "@/lib/models";
import type { AgentSnapshot, ToolUseStat } from "@/lib/protocol";
import { sendCommand } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { agentsAtom, uiModeAtom } from "@/store/gameAtoms";

interface Item {
  key: string;
  label: string;
  icon: string;
  source: string;
}

/** Flatten the init-message inventory into displayable items, grouping MCP
 * tools under the server they come from. */
export function itemsFor(agent: AgentSnapshot): Item[] {
  const inv = agent.inventory;
  if (!inv) return [];
  const items: Item[] = [];
  for (const tool of inv.tools) {
    const mcp = tool.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
    items.push(
      mcp
        ? {
            key: tool,
            label: mcp[2] ?? tool,
            icon: "🔌",
            source: `MCP server: ${mcp[1]}`,
          }
        : { key: tool, label: tool, icon: "⚒", source: "built-in tool" },
    );
  }
  for (const skill of inv.skills) {
    items.push({
      key: `skill:${skill}`,
      label: skill,
      icon: "📜",
      source: "skill",
    });
  }
  return items;
}

function lastUsedText(stat: ToolUseStat | undefined): string {
  if (!stat) return "never used this session";
  const seconds = Math.round((Date.now() - stat.lastTs) / 1000);
  const when =
    seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
  return `used ${stat.count}× · last ${when}`;
}

export default function InventoryDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const agents = useAtomValue(agentsAtom);
  const [selected, setSelected] = useState<string | null>(null);
  const open = ui.mode === "inventory";
  const agentId = open ? ui.agentId : null;

  useEffect(() => {
    if (!open || !agentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUi({ mode: "talk", agentId });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, agentId, setUi]);

  if (ui.mode !== "inventory") return null;
  const agent = agents.find((a) => a.id === ui.agentId);
  if (!agent) return null;

  const items = itemsFor(agent);
  const selectedItem = items.find((i) => i.key === selected) ?? null;
  const selectedStat = selectedItem
    ? (agent.toolUses[selectedItem.label] ?? agent.toolUses[selectedItem.key])
    : undefined;
  const back = () => setUi({ mode: "talk", agentId: agent.id });

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div className="w-[680px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-primary">🎒 {agent.label} — Inventory</h2>
          <button
            type="button"
            onClick={back}
            className="text-xs text-muted hover:text-foreground"
          >
            back (Esc)
          </button>
        </div>

        {/* §5a: the model is an equipment slot, not just another item */}
        <div className="mb-3 rounded border border-border bg-background p-2">
          <p className="mb-2 text-xs text-muted">Equipment — model</p>
          <div className="flex gap-2">
            {MODELS.map((m) => {
              const equipped = agent.model === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.detail}
                  disabled={equipped || agent.status === "ended"}
                  onClick={() =>
                    sendCommand({
                      type: "equipModel",
                      agentId: agent.id,
                      model: m.id,
                    })
                  }
                  className={cn(
                    "flex-1 rounded border px-2 py-1.5 text-xs",
                    equipped
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted hover:border-accent hover:text-foreground",
                  )}
                >
                  {m.name}
                  <span className="block text-[10px] opacity-75">{m.gear}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Heavier gear drains your hearts faster — real per-token cost.
            Re-equipping mid-quest is safe; the change shows on the NPC.
          </p>
        </div>

        {/* §5: one icon per skill/tool/plugin; used-this-session glows */}
        <div className="mb-2 max-h-64 overflow-y-auto rounded border border-border bg-background p-2">
          {!agent.inventory && (
            <p className="text-xs text-muted">
              Still unpacking — the session hasn't announced its tools yet.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => {
              const used =
                agent.toolUses[item.label] ?? agent.toolUses[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    setSelected(selected === item.key ? null : item.key)
                  }
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px]",
                    used
                      ? "border-primary text-primary shadow-[0_0_6px] shadow-primary/40"
                      : "border-border text-muted",
                    selected === item.key && "bg-border/40 text-foreground",
                  )}
                >
                  {item.icon} {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="min-h-4 text-xs text-muted">
          {selectedItem
            ? `${selectedItem.icon} ${selectedItem.label} — ${selectedItem.source} · ${lastUsedText(selectedStat)}`
            : `${items.length} items · glowing = used this session · ${
                agent.inventory?.mcpServers.length ?? 0
              } MCP server(s) connected`}
        </p>
      </div>
    </div>
  );
}
