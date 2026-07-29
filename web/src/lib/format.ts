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
 * Player hearts (§2): budget remaining, quantized into HEART_COUNT hearts.
 * Returns one fill fraction (0..1) per heart, left to right.
 */
export function heartsFor(spentUsd: number, budgetUsd: number): number[] {
  const remaining =
    budgetUsd <= 0 ? 0 : Math.min(1, Math.max(0, 1 - spentUsd / budgetUsd));
  return Array.from({ length: HEART_COUNT }, (_, i) => {
    const fill = remaining * HEART_COUNT - i;
    return Math.min(1, Math.max(0, fill));
  });
}

/** NPC health (§2): context window headroom, 0..1. */
export function contextHealth(contextTokens: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - contextTokens / limit));
}
