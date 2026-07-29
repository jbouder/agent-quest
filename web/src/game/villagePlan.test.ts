import { describe, expect, it } from "vitest";
import { pickEviction, SlotAllocator } from "./villagePlan";

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
