import { describe, expect, it } from "vitest";
import {
  freeTrophySpot,
  pickEviction,
  SlotAllocator,
  TROPHY_GAP,
  trophyKindFor,
} from "./villagePlan";

describe("SlotAllocator", () => {
  it("hands out lowest free slots and reports fullness", () => {
    const slots = new SlotAllocator(3);
    expect(slots.take("a")).toBe(0);
    expect(slots.take("b")).toBe(1);
    expect(slots.take("c")).toBe(2);
    expect(slots.full).toBe(true);
    expect(slots.take("d")).toBeNull();
  });

  it("is idempotent for an existing owner", () => {
    const slots = new SlotAllocator(3);
    slots.take("a");
    expect(slots.take("a")).toBe(0);
  });

  it("reuses released slots", () => {
    const slots = new SlotAllocator(3);
    slots.take("a");
    slots.take("b");
    slots.release("a");
    expect(slots.slotOf("a")).toBeNull();
    expect(slots.take("c")).toBe(0);
  });
});

describe("pickEviction", () => {
  it("evicts the least-recently-promoted", () => {
    expect(pickEviction(["old", "newer", "newest"])).toBe("old");
    expect(pickEviction([])).toBeNull();
  });
});

describe("freeTrophySpot", () => {
  const gapTo = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number => Math.hypot(a.x - b.x, a.y - b.y);

  it("leaves an uncontested spot exactly where it was asked for", () => {
    const desired = { x: 500, y: 350 };
    expect(freeTrophySpot(desired, [])).toEqual(desired);
    expect(freeTrophySpot(desired, [{ x: 900, y: 350 }])).toEqual(desired);
  });

  it("nudges clear when a trophy already stands there", () => {
    const desired = { x: 500, y: 350 };
    const spot = freeTrophySpot(desired, [desired]);
    expect(spot).not.toEqual(desired);
    expect(gapTo(spot, desired)).toBeGreaterThanOrEqual(TROPHY_GAP);
  });

  it("keeps a whole run of trophies mutually clear", () => {
    const desired = { x: 500, y: 350 };
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) placed.push(freeTrophySpot(desired, placed));

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        if (!a || !b) throw new Error("missing spot");
        expect(gapTo(a, b)).toBeGreaterThanOrEqual(TROPHY_GAP - 0.001);
      }
    }
  });

  it("gives up rather than looping once the ground is truly full", () => {
    // Every candidate ring blocked: it must still return, not hang.
    const desired = { x: 0, y: 0 };
    const blockers: { x: number; y: number }[] = [];
    for (let x = -200; x <= 200; x += 4) {
      for (let y = -200; y <= 200; y += 4) blockers.push({ x, y });
    }
    expect(freeTrophySpot(desired, blockers)).toEqual(desired);
  });
});

describe("trophyKindFor", () => {
  const uses = (count: number) => ({ Bash: { count } });

  it("raises a monument for a session that landed a commit", () => {
    expect(trophyKindFor({ commits: ["abc"], toolUses: {} })).toBe("monument");
  });

  it("raises a monument for a long haul even with nothing committed", () => {
    expect(trophyKindFor({ commits: [], toolUses: uses(15) })).toBe("monument");
  });

  it("leaves a chest for a quick errand", () => {
    expect(trophyKindFor({ commits: [], toolUses: uses(3) })).toBe("chest");
    expect(trophyKindFor({ commits: [], toolUses: {} })).toBe("chest");
  });

  it("totals tool calls across tools rather than taking the largest", () => {
    expect(
      trophyKindFor({
        commits: [],
        toolUses: { Read: { count: 8 }, Edit: { count: 7 } },
      }),
    ).toBe("monument");
  });
});
