import { describe, expect, it } from "vitest";
import { BudgetTracker, MonotonicCounter } from "./budget";

describe("BudgetTracker", () => {
  it("locks when spend reaches the budget", () => {
    const budget = new BudgetTracker(1);
    expect(budget.locked).toBe(false);
    budget.add(0.6, 1000);
    expect(budget.locked).toBe(false);
    budget.add(0.4, 1000);
    expect(budget.locked).toBe(true);
  });

  it("unlocks after a top-up", () => {
    const budget = new BudgetTracker(1);
    budget.add(1.5, 0);
    expect(budget.locked).toBe(true);
    budget.topUp(2);
    expect(budget.locked).toBe(false);
  });

  it("ignores negative deltas", () => {
    const budget = new BudgetTracker(1);
    budget.add(-5, -100);
    expect(budget.spentUsd).toBe(0);
    expect(budget.tokensSpent).toBe(0);
  });
});

describe("MonotonicCounter", () => {
  it("returns diffs for cumulative sources", () => {
    const counter = new MonotonicCounter();
    expect(counter.feed(10)).toBe(10);
    expect(counter.feed(25)).toBe(15);
    expect(counter.feed(25)).toBe(0);
  });

  it("treats a drop as a per-turn value", () => {
    const counter = new MonotonicCounter();
    expect(counter.feed(100)).toBe(100);
    expect(counter.feed(30)).toBe(30);
    expect(counter.feed(40)).toBe(10);
  });

  it("ignores garbage", () => {
    const counter = new MonotonicCounter();
    expect(counter.feed(Number.NaN)).toBe(0);
    expect(counter.feed(-1)).toBe(0);
  });
});
