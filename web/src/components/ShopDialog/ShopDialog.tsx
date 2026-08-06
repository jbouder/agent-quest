import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useDialog } from "@/components/Dialog";
import type { ShopItem, ShopKind } from "@/lib/protocol";
import { loadSeen, markShelfSeen, newItems, saveSeen } from "@/lib/shopSeen";
import { sendCommand } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { shopsAtom, uiModeAtom } from "@/store/gameAtoms";

/** §5b — each specialty shop has its own keeper and manner of speaking. */
const SHOPS: Record<
  ShopKind,
  { title: string; keeper: string; greeting: string; empty: string }
> = {
  skills: {
    title: "🧪 The Skill Apothecary",
    keeper: "the apothecary",
    greeting:
      "Techniques, bottled and labeled. Everything here teaches your agents a craft — installing costs nothing but shelf space.",
    empty:
      "The shelves are bare — the supply wagon from anthropics/skills is late.",
  },
  plugins: {
    title: "⚒ The Plugin Smithy",
    keeper: "the smith",
    greeting:
      "Forged attachments from the official marketplace. Bolting one on flips it live for every agent in this realm.",
    empty: "The forge is cold — couldn't reach the official marketplace.",
  },
  mcp: {
    title: "🔮 The Connector Emporium",
    keeper: "the merchant of far places",
    greeting:
      "Portals to distant services, from the MCP registry. Buying one writes it into this realm's .mcp.json.",
    empty: "The portals are dark — the registry didn't answer.",
  },
};

function Shelf({
  heading,
  items,
  busyId,
  onAction,
}: {
  heading: string | null;
  items: ShopItem[];
  busyId: string | null;
  onAction: (item: ShopItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      {heading && (
        <p className="mt-2 mb-1 text-[10px] text-primary">{heading}</p>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 border-b border-border py-2 last:border-0"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {item.name}
              {item.installed && (
                <span className="ml-2 rounded bg-accent px-1 text-[9px] text-accent-foreground">
                  owned
                </span>
              )}
            </p>
            <p className="line-clamp-2 text-xs text-muted">
              {item.description}
            </p>
            {item.detail && (
              <p className="text-[10px] text-muted/70">{item.detail}</p>
            )}
          </div>
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => onAction(item)}
            className={cn(
              "shrink-0 rounded px-2 py-1 text-xs disabled:opacity-40",
              item.installed
                ? "border border-border text-muted hover:text-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {busyId === item.id
              ? "…"
              : item.installed
                ? "Sell back"
                : "Buy (install)"}
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * §5b — a real marketplace browser in shop clothes. Browsing is walking the
 * shelves; buying installs into this repo's configuration; selling back
 * removes it the same way. No mana: installing costs no tokens.
 */
export default function ShopDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const shops = useAtomValue(shopsAtom);
  const [busyId, setBusyId] = useState<string | null>(null);
  const open = ui.mode === "shop";
  const kind = open ? ui.shop : null;
  const dialog = useDialog({
    open,
    onClose: () => setUi({ mode: "roam" }),
    label: kind ? SHOPS[kind].title : "Shop",
  });

  const stock = kind ? shops[kind] : null;

  // §5b "just in" — new since your last visit; then the visit marks it seen.
  const justIn = useMemo(
    () => (kind && stock ? newItems(kind, stock, loadSeen()) : []),
    [kind, stock],
  );
  useEffect(() => {
    if (kind && stock && stock.items.length > 0) {
      saveSeen(markShelfSeen(kind, stock, loadSeen()));
    }
  }, [kind, stock]);

  // An action's result arrives via the next snapshot; unlock then. The
  // shelves themselves are the signal, hence the dependency.
  useEffect(() => {
    void shops;
    setBusyId(null);
  }, [shops]);

  if (!open || !kind || !stock) return null;
  const shop = SHOPS[kind];
  const justInIds = new Set(justIn.map((item) => item.id));
  const regular = stock.items.filter((item) => !justInIds.has(item.id));

  const act = (item: ShopItem) => {
    setBusyId(item.id);
    sendCommand({
      type: item.installed ? "shopRemove" : "shopInstall",
      kind,
      id: item.id,
    });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div
        {...dialog}
        className="w-[640px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-primary">{shop.title}</h2>
          <button
            type="button"
            onClick={() => setUi({ mode: "roam" })}
            className="text-xs text-muted hover:text-foreground"
          >
            leave the shop (Esc)
          </button>
        </div>
        <p className="mb-2 text-xs text-muted">
          “{shop.greeting}” — {shop.keeper}
        </p>

        {stock.error && (
          <p className="mb-2 rounded border border-destructive bg-background p-2 text-xs text-destructive">
            Last restock failed: {stock.error}
          </p>
        )}

        <div className="max-h-[60vh] overflow-y-auto rounded border border-border bg-background px-3 py-1">
          {stock.items.length === 0 && (
            <p className="py-3 text-xs text-muted">{shop.empty}</p>
          )}
          <Shelf
            heading={justIn.length > 0 ? "✨ just in" : null}
            items={justIn}
            busyId={busyId}
            onAction={act}
          />
          <Shelf
            heading={
              justIn.length > 0 && regular.length > 0 ? "the shelves" : null
            }
            items={regular}
            busyId={busyId}
            onAction={act}
          />
        </div>

        <p className="mt-2 text-[10px] text-muted">
          Buying installs into this repo (skills → .claude/skills, plugins →
          .claude/settings.json, connectors → .mcp.json). New agents pick
          changes up on their next summon.
        </p>
      </div>
    </div>
  );
}
