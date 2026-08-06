import { beforeEach, describe, expect, it } from "vitest";
import {
  AREAS,
  areaAt,
  CELL_H,
  CELL_W,
  cellOrigin,
  GRID,
  inArea,
  LANDINGS,
  loadDiscovered,
  saveDiscovered,
  WORLD_H,
  WORLD_W,
} from "./areas";

describe("the area grid", () => {
  it("covers every cell of the 3×3 world exactly once", () => {
    const cells = new Set(AREAS.map((area) => `${area.cx},${area.cy}`));
    expect(cells.size).toBe(GRID * GRID);
    expect(AREAS).toHaveLength(GRID * GRID);
  });

  it("has the eight §1a areas plus the connective south road", () => {
    const ids = AREAS.map((area) => area.id).sort();
    expect(ids).toEqual(
      [
        "square",
        "ruins",
        "watchtower",
        "frontier",
        "tavern",
        "arena",
        "docks",
        "road",
        "shopping",
      ].sort(),
    );
  });

  it("keeps the village square at the center, per §1a (the hub)", () => {
    expect(cellOrigin("square")).toEqual({ x: CELL_W, y: CELL_H });
  });

  it("only the square is known before you walk anywhere", () => {
    expect(AREAS.filter((area) => area.known).map((a) => a.id)).toEqual([
      "square",
    ]);
  });
});

describe("areaAt", () => {
  it("maps a world point to its area", () => {
    expect(areaAt(CELL_W + 10, CELL_H + 10)).toBe("square");
    expect(areaAt(5, 5)).toBe("ruins");
    expect(areaAt(WORLD_W - 5, WORLD_H - 5)).toBe("shopping");
    expect(areaAt(CELL_W / 2, CELL_H * 2.5)).toBe("docks");
  });

  it("clamps points on or past the world rim instead of failing", () => {
    expect(areaAt(-20, -20)).toBe("ruins");
    expect(areaAt(WORLD_W + 50, WORLD_H + 50)).toBe("shopping");
  });

  it("agrees with inArea for every area's center", () => {
    for (const area of AREAS) {
      const center = inArea(area.id, CELL_W / 2, CELL_H / 2);
      expect(areaAt(center.x, center.y)).toBe(area.id);
    }
  });
});

describe("fast-travel landings", () => {
  it("puts every landing inside its own area", () => {
    for (const area of AREAS) {
      const landing = LANDINGS[area.id];
      expect(areaAt(landing.x, landing.y)).toBe(area.id);
    }
  });
});

describe("discovery persistence", () => {
  beforeEach(() => localStorage.clear());

  it("starts with just the square", () => {
    expect([...loadDiscovered()]).toEqual(["square"]);
  });

  it("round-trips through storage", () => {
    saveDiscovered(new Set(["square", "ruins", "docks"]));
    const loaded = loadDiscovered();
    expect(loaded.has("ruins")).toBe(true);
    expect(loaded.has("docks")).toBe(true);
    expect(loaded.has("arena")).toBe(false);
  });

  it("always includes the square, even if storage omits it", () => {
    localStorage.setItem("aq-discovered-v1", JSON.stringify(["tavern"]));
    expect(loadDiscovered().has("square")).toBe(true);
  });

  it("drops junk ids and survives corrupted storage", () => {
    localStorage.setItem(
      "aq-discovered-v1",
      JSON.stringify(["not-a-place", "arena"]),
    );
    const loaded = loadDiscovered();
    expect(loaded.has("arena")).toBe(true);
    expect(loaded.size).toBe(2); // square + arena

    localStorage.setItem("aq-discovered-v1", "{corrupt");
    expect([...loadDiscovered()]).toEqual(["square"]);
  });
});
