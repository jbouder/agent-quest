import { beforeEach, describe, expect, it } from "vitest";
import type { ShopItem, ShopKind, ShopStock } from "@/lib/protocol";
import {
  loadSeen,
  markShelfSeen,
  newItems,
  saveSeen,
  unseenStockCount,
} from "./shopSeen";

const item = (id: string, kind: ShopKind = "skills"): ShopItem => ({
  id,
  kind,
  name: id,
  description: "",
  detail: "",
  installed: false,
});

const stock = (ids: string[], kind: ShopKind = "skills"): ShopStock => ({
  items: ids.map((id) => item(id, kind)),
  fetchedTs: 1,
  error: null,
});

describe("newItems", () => {
  it("treats a first-ever visit as nothing new — it's just stock", () => {
    expect(newItems("skills", stock(["a", "b"]), {})).toEqual([]);
  });

  it("flags only items that arrived since the last visit", () => {
    const seen = { skills: ["a"] };
    expect(
      newItems("skills", stock(["a", "b"]), seen).map((i) => i.id),
    ).toEqual(["b"]);
  });

  it("keeps shops' seen sets separate", () => {
    const seen = { skills: ["a"] };
    // plugins was never visited, so its shelf is not "new"
    expect(newItems("plugins", stock(["a"], "plugins"), seen)).toEqual([]);
  });
});

describe("markShelfSeen", () => {
  it("records the current shelf and leaves other shops alone", () => {
    const seen = markShelfSeen("skills", stock(["a", "b"]), { mcp: ["x"] });
    expect(seen).toEqual({ mcp: ["x"], skills: ["a", "b"] });
  });

  it("does not seed from an empty shelf (a failed restock isn't a visit)", () => {
    expect(markShelfSeen("skills", stock([]), { skills: ["a"] })).toEqual({
      skills: ["a"],
    });
  });
});

describe("unseenStockCount", () => {
  it("totals novelty across the district", () => {
    const shops = {
      skills: stock(["a", "b"]),
      plugins: stock(["p"], "plugins"),
      mcp: stock(["m1", "m2"], "mcp"),
    };
    const seen = { skills: ["a"], mcp: ["m1", "m2"] };
    // skills has 1 new; plugins never visited (0); mcp fully seen (0)
    expect(unseenStockCount(shops, seen)).toBe(1);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage and survives junk", () => {
    saveSeen({ skills: ["a"] });
    expect(loadSeen()).toEqual({ skills: ["a"] });

    localStorage.setItem("aq-shop-seen-v1", "{broken");
    expect(loadSeen()).toEqual({});
  });
});
