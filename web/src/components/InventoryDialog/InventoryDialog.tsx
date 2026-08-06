import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useDialog } from "@/components/Dialog";
import { MODELS } from "@/lib/models";
import type { AgentSnapshot, ShopKind, ToolUseStat } from "@/lib/protocol";
import { sendCommand } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { agentsAtom, shopsAtom, uiModeAtom } from "@/store/gameAtoms";

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

const SHOP_LABEL: Record<ShopKind, { icon: string; name: string }> = {
  skills: { icon: "📜", name: "Skills" },
  plugins: { icon: "🔧", name: "Plugins" },
  mcp: { icon: "🔌", name: "MCP servers" },
};

/**
 * §5b/§7a — what the village itself is carrying: everything installed in the
 * repo's own configuration. This is the answer when the icon row asks for the
 * inventory and no agent has been summoned yet, so the button is never dead.
 */
function VillageLoadout() {
  const shops = useAtomValue(shopsAtom);
  const kinds = Object.keys(SHOP_LABEL) as ShopKind[];
  const total = kinds.reduce(
    (sum, kind) => sum + shops[kind].items.filter((i) => i.installed).length,
    0,
  );

  return (
    <div className="rounded border border-border bg-background p-2">
      <p className="mb-2 text-xs text-muted">
        Nobody is summoned yet, so there's no session loadout to show. This is
        what the village keeps in store — installed in this repo's own
        configuration, and handed to the next agent you summon.
      </p>
      {kinds.map((kind) => {
        const installed = shops[kind].items.filter((item) => item.installed);
        return (
          <div key={kind} className="mb-2">
            <p className="mb-1 text-[11px] text-primary">
              {SHOP_LABEL[kind].icon} {SHOP_LABEL[kind].name}
            </p>
            {installed.length === 0 ? (
              <p className="text-[11px] text-muted">
                none — the {SHOP_LABEL[kind].name.toLowerCase()} shelf is
                untouched
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {installed.map((item) => (
                  <span
                    key={item.id}
                    title={item.description}
                    className="rounded border border-primary px-1.5 py-0.5 text-[11px] text-primary"
                  >
                    {SHOP_LABEL[kind].icon} {item.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-muted">
        {total} installed · buy more in the Shopping District, southeast
      </p>
    </div>
  );
}

export default function InventoryDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const agents = useAtomValue(agentsAtom);
  const [selected, setSelected] = useState<string | null>(null);
  const open = ui.mode === "inventory";
  const origin = open ? ui.origin : "talk";
  // Opened from the icon row there's no agent in hand yet (nor one still
  // around, if it departed): show whoever is first, and let the row of names
  // switch between them.
  const agent = open
    ? (agents.find((a) => a.id === ui.agentId) ??
      (ui.origin === "menu" ? agents[0] : undefined))
    : undefined;

  // Escape steps back where it came from: to the agent's talk dialog when
  // the inventory was opened from inside it, out to the world when it was
  // opened from the icon row.
  const dialog = useDialog({
    open,
    onClose: () =>
      setUi(
        origin === "talk" && agent
          ? { mode: "talk", agentId: agent.id }
          : { mode: "roam" },
      ),
    label: "Inventory",
  });

  if (ui.mode !== "inventory") return null;
  // From a conversation the agent has to exist; from the icon row it may not.
  if (!agent && origin === "talk") return null;

  const items = agent ? itemsFor(agent) : [];
  const selectedItem = items.find((i) => i.key === selected) ?? null;
  const selectedStat =
    agent && selectedItem
      ? (agent.toolUses[selectedItem.label] ?? agent.toolUses[selectedItem.key])
      : undefined;
  const back = () =>
    setUi(
      origin === "talk" && agent
        ? { mode: "talk", agentId: agent.id }
        : { mode: "roam" },
    );

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div
        {...dialog}
        className="flex max-h-[90vh] w-[680px] max-w-[95vw] flex-col rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-primary">
            🎒 {agent ? `${agent.label} — Inventory` : "Inventory"}
          </h2>
          <button
            type="button"
            onClick={back}
            className="text-xs text-muted hover:text-foreground"
          >
            {origin === "talk" ? "back" : "close"} (Esc)
          </button>
        </div>

        {/* §7a — reached from the icon row, the dialog has to say whose pack
            this is and let you look in someone else's. */}
        {origin === "menu" && agents.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {agents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelected(null);
                  setUi({ mode: "inventory", agentId: a.id, origin: "menu" });
                }}
                className={cn(
                  "rounded border px-2 py-0.5 text-[11px]",
                  a.id === agent?.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted hover:border-accent hover:text-foreground",
                )}
              >
                {a.label}
                {a.status === "ended" && " (departed)"}
              </button>
            ))}
          </div>
        )}

        {!agent ? (
          <VillageLoadout />
        ) : (
          <>
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
                      <span className="block text-[10px] opacity-75">
                        {m.gear}
                      </span>
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
            <div className="mb-2 min-h-0 flex-1 overflow-y-auto rounded border border-border bg-background p-2">
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

            {/* §14 — the memory tome the NPC carries between summons */}
            {agent.tomePreview && (
              <div className="mt-2 rounded border border-border bg-background p-2">
                <p className="mb-1 text-xs text-primary">
                  📕 Memory tome (CLAUDE.md)
                </p>
                <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[10px] leading-snug text-muted">
                  {agent.tomePreview}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
