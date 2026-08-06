import type { ShopItem, ShopKind, ShopStock } from "@/lib/protocol";

/**
 * §5b — the "just in" shelf. The server restocks from live registries; what
 * counts as *new* is per-player: anything on the shelf you haven't seen on a
 * previous visit. Your first-ever visit seeds the set instead of shouting
 * "everything is new!" about a catalog you've simply never looked at.
 */

const SEEN_KEY = "aq-shop-seen-v1";

export type SeenIds = Partial<Record<ShopKind, string[]>>;

export function loadSeen(): SeenIds {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenIds) : {};
  } catch {
    return {};
  }
}

export function saveSeen(seen: SeenIds): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // storage unavailable — novelty just won't persist
  }
}

/** The items on a shelf that a previous visit hasn't seen. */
export function newItems(
  kind: ShopKind,
  stock: ShopStock,
  seen: SeenIds,
): ShopItem[] {
  const prior = seen[kind];
  // Never visited (or shelf empty): nothing is "new", it's all just stock.
  if (!prior || stock.items.length === 0) return [];
  const known = new Set(prior);
  return stock.items.filter((item) => !known.has(item.id));
}

/** Record a visit: everything currently on the shelf has now been seen. */
export function markShelfSeen(
  kind: ShopKind,
  stock: ShopStock,
  seen: SeenIds,
): SeenIds {
  if (stock.items.length === 0) return seen;
  return { ...seen, [kind]: stock.items.map((item) => item.id) };
}

/** §20 — how many unseen items the whole district holds, for the Map pin. */
export function unseenStockCount(
  shops: Record<ShopKind, ShopStock>,
  seen: SeenIds,
): number {
  return (Object.keys(shops) as ShopKind[]).reduce(
    (total, kind) => total + newItems(kind, shops[kind], seen).length,
    0,
  );
}
