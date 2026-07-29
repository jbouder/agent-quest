import { describe, expect, it } from "vitest";
import { contextHealth, formatTokens, HEART_COUNT, heartsFor } from "./format";

describe("heartsFor", () => {
  it("is all full hearts with nothing spent", () => {
    const hearts = heartsFor(0, 5);
    expect(hearts).toHaveLength(HEART_COUNT);
    expect(hearts.every((h) => h === 1)).toBe(true);
  });

  it("is all empty at or past the budget", () => {
    expect(heartsFor(5, 5).every((h) => h === 0)).toBe(true);
    expect(heartsFor(9, 5).every((h) => h === 0)).toBe(true);
  });

  it("drains from the right with partial hearts", () => {
    const hearts = heartsFor(2.75, 10); // 72.5% remaining = 7.25 hearts
    expect(hearts[6]).toBe(1);
    expect(hearts[7]).toBeCloseTo(0.25);
    expect(hearts[8]).toBe(0);
  });

  it("treats a zero budget as empty", () => {
    expect(heartsFor(0, 0).every((h) => h === 0)).toBe(true);
  });
});

describe("contextHealth", () => {
  it("starts full and drains toward the window", () => {
    expect(contextHealth(0, 200_000)).toBe(1);
    expect(contextHealth(150_000, 200_000)).toBeCloseTo(0.25);
    expect(contextHealth(250_000, 200_000)).toBe(0);
  });
});

describe("formatTokens", () => {
  it("abbreviates", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_500)).toBe("12.5k");
    expect(formatTokens(2_400_000)).toBe("2.4M");
  });
});
