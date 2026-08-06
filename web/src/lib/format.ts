import type { Ward } from "@/lib/protocol";

export function formatUsd(value: number): string {
  return `$${value.toFixed(value < 10 ? 2 : 1)}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export const HEART_COUNT = 10;

/**
 * Player hearts (§2): budget remaining, quantized into hearts. The count is
 * §19-customizable — more hearts, finer mana granularity. Returns one fill
 * fraction (0..1) per heart, left to right.
 */
export function heartsFor(
  spentUsd: number,
  budgetUsd: number,
  count = HEART_COUNT,
): number[] {
  const remaining =
    budgetUsd <= 0 ? 0 : Math.min(1, Math.max(0, 1 - spentUsd / budgetUsd));
  return Array.from({ length: count }, (_, i) => {
    const fill = remaining * count - i;
    return Math.min(1, Math.max(0, fill));
  });
}

/**
 * §14 — read a ward aloud. Guarding wards can stop an action; watching wards
 * only observe one, and the wording has to make that difference obvious.
 */
export function describeWard(ward: Ward): string {
  const scope = ward.matcher ? ` on ${ward.matcher}` : "";
  const commands = ward.commands.join("; ");
  return ward.blocking
    ? `⭘ A guarding ward, set in ${ward.scope} settings. Nothing passes ${ward.event}${scope} without ${commands}.`
    : `⭘ A watching ward, set in ${ward.scope} settings. It marks every ${ward.event}${scope} and runs ${commands}.`;
}

/** NPC health (§2): context window headroom, 0..1. */
export function contextHealth(contextTokens: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - contextTokens / limit));
}
