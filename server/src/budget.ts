// Player hearts (DESIGN.md §2): one cumulative budget across every agent.
// Agents chip this as they spend; at zero the player is locked out — no
// summons, running agents go to sleep — until a top-up.

export class BudgetTracker {
  spentUsd = 0;
  tokensSpent = 0;

  constructor(public budgetUsd: number) {}

  get locked(): boolean {
    return this.spentUsd >= this.budgetUsd;
  }

  add(deltaUsd: number, deltaTokens: number): void {
    this.spentUsd += Math.max(0, deltaUsd);
    this.tokensSpent += Math.max(0, deltaTokens);
  }

  topUp(amountUsd: number): void {
    this.budgetUsd += Math.max(0, amountUsd);
  }
}

/**
 * Tracks a counter that the SDK reports either cumulatively (session totals
 * on each result message) or per-turn, without us having to know which.
 * Feed it every reported value; it returns the delta to add.
 *
 * If the new value is >= the last one we treat the stream as cumulative and
 * return the difference. If it drops, the source is per-turn (or reset), so
 * the reported value itself is the delta.
 */
export class MonotonicCounter {
  private last = 0;

  feed(reported: number): number {
    if (!Number.isFinite(reported) || reported < 0) return 0;
    const delta = reported >= this.last ? reported - this.last : reported;
    this.last = reported;
    return delta;
  }
}
