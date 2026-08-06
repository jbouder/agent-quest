import { beforeEach, describe, expect, it } from "vitest";
import {
  applyOverrides,
  DEFAULT_OVERRIDES,
  hexToNumber,
  loadOverrides,
  revertDepth,
  revertOverrides,
  sanitizeOverrides,
} from "./overrides";

describe("sanitizeOverrides", () => {
  it("returns pure defaults for junk", () => {
    expect(sanitizeOverrides(null)).toEqual(DEFAULT_OVERRIDES);
    expect(sanitizeOverrides("nonsense")).toEqual(DEFAULT_OVERRIDES);
    expect(sanitizeOverrides(42)).toEqual(DEFAULT_OVERRIDES);
  });

  it("keeps valid values and falls back per-field, not wholesale", () => {
    const result = sanitizeOverrides({
      palette: { grass: "#112233", path: "not-a-color" },
      player: { speed: 2 },
    });
    expect(result.palette.grass).toBe("#112233");
    expect(result.palette.path).toBe(DEFAULT_OVERRIDES.palette.path);
    expect(result.player.speed).toBe(2);
    expect(result.hearts.count).toBe(10);
  });

  it("clamps numeric ranges and rounds heart count", () => {
    const result = sanitizeOverrides({
      player: { speed: 99 },
      hearts: { count: 2.4 },
    });
    expect(result.player.speed).toBe(3);
    expect(result.hearts.count).toBe(4);
    expect(sanitizeOverrides({ hearts: { count: 12.6 } }).hearts.count).toBe(
      13,
    );
  });

  it("rejects malformed colors and normalizes case", () => {
    expect(sanitizeOverrides({ wards: { watch: "#ABCDEF" } }).wards.watch).toBe(
      "#abcdef",
    );
    expect(sanitizeOverrides({ wards: { watch: "red" } }).wards.watch).toBe(
      DEFAULT_OVERRIDES.wards.watch,
    );
    expect(sanitizeOverrides({ wards: { watch: "#12345" } }).wards.watch).toBe(
      DEFAULT_OVERRIDES.wards.watch,
    );
  });

  it("caps and filters custom quests: title and task are required", () => {
    const result = sanitizeOverrides({
      customQuests: [
        { title: "Water the plants", task: "Remind me to water the plants" },
        { title: "No task — dropped" },
        ...Array.from({ length: 9 }, (_, i) => ({
          title: `q${i}`,
          task: "t",
        })),
      ],
    });
    // 5 max, and the taskless one is gone
    expect(result.customQuests).toHaveLength(5);
    expect(result.customQuests[0]?.title).toBe("Water the plants");
    expect(result.customQuests[0]?.icon).toBe("📜");
  });

  it("trims and caps names, dropping empty renames", () => {
    const result = sanitizeOverrides({
      names: {
        tavern: "  The Prancing Pony  ",
        areas: { ruins: "The Old Kingdom", tavern: "   " },
      },
    });
    expect(result.names.tavern).toBe("The Prancing Pony");
    expect(result.names.areas.ruins).toBe("The Old Kingdom");
    expect(result.names.areas.tavern).toBeUndefined();
  });
});

describe("hexToNumber", () => {
  it("parses into Phaser's color form", () => {
    expect(hexToNumber("#4a9648")).toBe(0x4a9648);
    expect(hexToNumber("#ffffff")).toBe(0xffffff);
  });
});

describe("persistence + revert history", () => {
  beforeEach(() => localStorage.clear());

  it("starts at defaults with an empty history", () => {
    const { current, history } = loadOverrides();
    expect(current).toEqual(DEFAULT_OVERRIDES);
    expect(history).toEqual([]);
  });

  it("apply pushes the old version; revert pops it back", () => {
    const edited = sanitizeOverrides({ palette: { grass: "#112233" } });
    applyOverrides(edited);
    expect(loadOverrides().current.palette.grass).toBe("#112233");
    expect(revertDepth()).toBe(1);

    const reverted = revertOverrides();
    expect(reverted.current.palette.grass).toBe(
      DEFAULT_OVERRIDES.palette.grass,
    );
    expect(revertDepth()).toBe(0);
  });

  it("revert with an empty history is a no-op, not a crash", () => {
    const { current } = revertOverrides();
    expect(current).toEqual(DEFAULT_OVERRIDES);
  });

  it("stacks several applies and unwinds them in order", () => {
    applyOverrides(sanitizeOverrides({ hearts: { count: 12 } }));
    applyOverrides(sanitizeOverrides({ hearts: { count: 14 } }));
    applyOverrides(sanitizeOverrides({ hearts: { count: 16 } }));
    expect(loadOverrides().current.hearts.count).toBe(16);

    expect(revertOverrides().current.hearts.count).toBe(14);
    expect(revertOverrides().current.hearts.count).toBe(12);
    expect(revertOverrides().current.hearts.count).toBe(10);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("aq-overrides-v1", "{broken");
    expect(loadOverrides().current).toEqual(DEFAULT_OVERRIDES);
  });
});
