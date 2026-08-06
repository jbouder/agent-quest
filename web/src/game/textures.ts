import type Phaser from "phaser";

export type ModelTier = "haiku" | "sonnet" | "opus" | "legendary";

export function modelTier(model: string): ModelTier {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("opus")) return "opus";
  if (m.includes("fable") || m.includes("mythos")) return "legendary";
  return "sonnet";
}

export const TIER_COLORS: Record<ModelTier, number> = {
  haiku: 0x67c46b,
  sonnet: 0x5a8fe0,
  opus: 0x9a6fd6,
  legendary: 0xd4a017,
};

// A Link to the Past-ish palette: saturated ground colors, dark outlines,
// every material shaded in 2-3 tones. Ground colors are §19-customizable;
// the light/dark tones derive from whatever base the overrides provide.
const OUTLINE = 0x1d2418;
const WOOD = { light: 0x9a6a40, base: 0x7a5230, dark: 0x54381f };
const STONE = { light: 0x9aa3b8, base: 0x707a92, dark: 0x4a5266 };
const WATER = { deep: 0x2456a8, base: 0x3a74cc, light: 0x7fb2ec };

/** Mix a 0xRRGGBB color toward white. */
function lighten(color: number, factor: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    return Math.min(255, Math.round(value + (255 - value) * factor));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The three tones every ground material renders in, from one base. */
function tones(base: number): { base: number; light: number; dark: number } {
  return { base, light: lighten(base, 0.16), dark: shade(base, 0.8) };
}

/** §19 — the knobs generateTextures accepts from the overrides document. */
export interface TexturePalette {
  grass: number;
  path: number;
  playerTunic: number;
  wardWatch: number;
  wardGuard: number;
}

export const DEFAULT_TEXTURE_PALETTE: TexturePalette = {
  grass: 0x4a9648,
  path: 0xcfa961,
  playerTunic: 0x2e7d32,
  wardWatch: 0x6fb6d6,
  wardGuard: 0xd4a017,
};

function character(
  scene: Phaser.Scene,
  key: string,
  tunic: number,
  hair: number,
): void {
  const g = scene.add.graphics();
  // outline silhouette behind everything
  g.fillStyle(OUTLINE);
  g.fillRect(5, 0, 14, 5);
  g.fillRect(5, 2, 14, 12);
  g.fillRect(3, 11, 18, 13);
  g.fillRect(1, 12, 22, 9);
  g.fillRect(5, 21, 6, 8);
  g.fillRect(13, 21, 6, 8);
  // legs
  g.fillStyle(0x3a3128);
  g.fillRect(6, 22, 4, 6);
  g.fillRect(14, 22, 4, 6);
  // tunic with a darker hem for shading
  g.fillStyle(tunic);
  g.fillRect(4, 12, 16, 11);
  g.fillStyle(shade(tunic, 0.72));
  g.fillRect(4, 20, 16, 3);
  // arms
  g.fillStyle(0xe0b892);
  g.fillRect(2, 13, 3, 7);
  g.fillRect(19, 13, 3, 7);
  // head
  g.fillStyle(0xe8c39e);
  g.fillRect(6, 3, 12, 10);
  // hair
  g.fillStyle(hair);
  g.fillRect(5, 1, 14, 4);
  g.fillRect(5, 1, 2, 7);
  g.fillRect(17, 1, 2, 7);
  // eyes
  g.fillStyle(0x1d1d24);
  g.fillRect(9, 7, 2, 2);
  g.fillRect(14, 7, 2, 2);
  g.generateTexture(key, 24, 29);
  g.destroy();
}

/** Multiply a 0xRRGGBB color toward black. */
export function shade(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const gr = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (gr << 8) | b;
}

/** ALttP-style dithered ground tile: base color + checker speckle clusters. */
function groundTile(
  g: Phaser.GameObjects.Graphics,
  key: string,
  base: number,
  light: number,
  dark: number,
  spots: { x: number; y: number; c: "light" | "dark" }[],
): void {
  g.fillStyle(base);
  g.fillRect(0, 0, 32, 32);
  for (const s of spots) {
    g.fillStyle(s.c === "light" ? light : dark);
    // 2x2 checker cluster reads as dithering at village zoom
    g.fillRect(s.x, s.y, 2, 2);
    g.fillRect(s.x + 2, s.y + 2, 2, 2);
  }
  g.generateTexture(key, 32, 32);
  g.clear();
}

export function generateTextures(
  scene: Phaser.Scene,
  palette: TexturePalette = DEFAULT_TEXTURE_PALETTE,
): void {
  const GRASS = tones(palette.grass);
  const PATH = tones(palette.path);
  const g = scene.add.graphics();

  // three grass variants so the ground never tiles visibly
  groundTile(g, "grass", GRASS.base, GRASS.light, GRASS.dark, [
    { x: 4, y: 6, c: "light" },
    { x: 20, y: 10, c: "light" },
    { x: 12, y: 22, c: "dark" },
    { x: 26, y: 26, c: "light" },
  ]);
  groundTile(g, "grass-1", GRASS.base, GRASS.light, GRASS.dark, [
    { x: 8, y: 2, c: "dark" },
    { x: 24, y: 6, c: "light" },
    { x: 2, y: 18, c: "light" },
    { x: 16, y: 14, c: "dark" },
    { x: 22, y: 24, c: "light" },
  ]);
  groundTile(g, "grass-2", GRASS.base, GRASS.light, GRASS.dark, [
    { x: 14, y: 4, c: "light" },
    { x: 4, y: 12, c: "dark" },
    { x: 26, y: 16, c: "dark" },
    { x: 10, y: 26, c: "light" },
  ]);

  groundTile(g, "path", PATH.base, PATH.light, PATH.dark, [
    { x: 6, y: 8, c: "dark" },
    { x: 22, y: 4, c: "light" },
    { x: 12, y: 18, c: "dark" },
    { x: 24, y: 24, c: "dark" },
    { x: 4, y: 26, c: "light" },
  ]);

  // soft drop shadow, reused under every prop and character
  g.fillStyle(0x14200f, 0.35);
  g.fillEllipse(24, 8, 48, 16);
  g.generateTexture("shadow", 48, 16);
  g.clear();

  // grass tuft, flowers, bush — scatter decorations
  g.fillStyle(GRASS.dark);
  g.fillTriangle(2, 14, 5, 3, 8, 14);
  g.fillTriangle(8, 14, 11, 5, 14, 14);
  g.fillStyle(GRASS.light);
  g.fillTriangle(5, 14, 8, 1, 11, 14);
  g.generateTexture("tuft", 16, 15);
  g.clear();

  g.fillStyle(GRASS.dark);
  g.fillRect(7, 8, 2, 6);
  g.fillStyle(0xf0f0e0);
  g.fillCircle(8, 5, 3);
  g.fillCircle(5, 8, 3);
  g.fillCircle(11, 8, 3);
  g.fillStyle(0xd4a017);
  g.fillCircle(8, 7, 2);
  g.generateTexture("flower", 16, 15);
  g.clear();

  g.fillStyle(OUTLINE);
  g.fillEllipse(13, 15, 26, 18);
  g.fillStyle(0x2f7a3f);
  g.fillEllipse(13, 15, 24, 16);
  g.fillStyle(0x4a9c52);
  g.fillEllipse(10, 12, 12, 8);
  g.generateTexture("bush", 26, 24);
  g.clear();

  // the iconic round ALttP tree: dark under-canopy, lit crown, stubby trunk
  g.fillStyle(WOOD.dark);
  g.fillRect(19, 40, 10, 14);
  g.fillStyle(WOOD.base);
  g.fillRect(21, 40, 6, 14);
  g.fillStyle(OUTLINE);
  g.fillEllipse(24, 24, 46, 44);
  g.fillStyle(0x1e5c2e);
  g.fillEllipse(24, 25, 42, 40);
  g.fillStyle(0x2f7a3f);
  g.fillEllipse(24, 21, 38, 32);
  g.fillStyle(0x4a9c52);
  g.fillEllipse(18, 15, 16, 12);
  g.fillEllipse(31, 20, 10, 8);
  g.generateTexture("tree", 48, 56);
  g.clear();

  // fountain: stone rim in three tones + sparkling water
  g.fillStyle(OUTLINE);
  g.fillCircle(24, 24, 24);
  g.fillStyle(STONE.base);
  g.fillCircle(24, 24, 22);
  g.fillStyle(STONE.light);
  g.fillCircle(22, 22, 19);
  g.fillStyle(STONE.dark);
  g.fillCircle(24, 24, 17);
  g.fillStyle(WATER.base);
  g.fillCircle(24, 24, 15);
  g.fillStyle(WATER.light);
  g.fillCircle(21, 21, 6);
  g.fillStyle(0xd8ecff);
  g.fillCircle(24, 24, 3);
  g.generateTexture("fountain", 48, 48);
  g.clear();

  // camp tent (§12: agents past the village cap cluster here)
  g.fillStyle(OUTLINE);
  g.fillTriangle(-2, 42, 28, 2, 58, 42);
  g.fillStyle(0x8a6d3b);
  g.fillTriangle(0, 40, 28, 4, 56, 40);
  g.fillStyle(0xa5854c);
  g.fillTriangle(6, 36, 28, 6, 30, 10); // lit panel
  g.fillStyle(0x6d5530);
  g.fillTriangle(28, 12, 48, 40, 8, 40);
  g.fillStyle(0x2c2016);
  g.fillTriangle(20, 40, 28, 22, 36, 40);
  g.generateTexture("tent", 58, 42);
  g.clear();

  // treasure chest marker (a finished quest leaves a trace, §9)
  g.fillStyle(OUTLINE);
  g.fillRect(0, 1, 20, 15);
  g.fillStyle(WOOD.base);
  g.fillRect(1, 7, 18, 8);
  g.fillStyle(WOOD.light);
  g.fillRect(1, 2, 18, 5);
  g.fillStyle(0xd4a017);
  g.fillRect(8, 6, 4, 5);
  g.fillRect(1, 7, 18, 1);
  g.generateTexture("chest", 20, 16);
  g.clear();

  // §9 monument — what a session that actually landed something leaves
  // behind. Deliberately unlike the §15 easter-egg statues: a plinth, an
  // obelisk, and a gold plaque you can read.
  g.fillStyle(OUTLINE);
  g.fillRect(1, 26, 22, 10);
  g.fillStyle(STONE.base);
  g.fillRect(2, 27, 20, 8);
  g.fillStyle(STONE.light);
  g.fillRect(2, 27, 20, 3);
  g.fillStyle(OUTLINE);
  g.fillRect(6, 2, 12, 25);
  g.fillTriangle(5, 4, 12, -3, 19, 4);
  g.fillStyle(0x8a93a8);
  g.fillRect(7, 3, 10, 24);
  g.fillTriangle(6, 4, 12, -1, 18, 4);
  g.fillStyle(STONE.light);
  g.fillRect(7, 3, 4, 24);
  g.fillStyle(0xd4a017);
  g.fillRect(8, 14, 8, 5);
  g.fillStyle(0xa87c10);
  g.fillRect(8, 18, 8, 1);
  g.generateTexture("monument", 24, 37);
  g.clear();

  // §13 — the scratch a returning subagent leaves where it worked
  g.fillStyle(0x6b5a3a, 0.85);
  g.fillRect(1, 3, 7, 2);
  g.fillRect(4, 6, 6, 2);
  g.fillStyle(0x4e4128, 0.85);
  g.fillRect(2, 5, 4, 1);
  g.generateTexture("scratch", 12, 10);
  g.destroy();

  const g2 = scene.add.graphics();

  // quest board (§9a)
  g2.fillStyle(OUTLINE);
  g2.fillRect(5, 7, 46, 32);
  g2.fillRect(11, 38, 7, 15);
  g2.fillRect(38, 38, 7, 15);
  g2.fillStyle(0x6d5530);
  g2.fillRect(6, 8, 44, 30);
  g2.fillStyle(0x54402c);
  g2.fillRect(12, 38, 5, 14);
  g2.fillRect(39, 38, 5, 14);
  g2.fillStyle(0xd8cba8);
  g2.fillRect(10, 12, 36, 22);
  g2.fillStyle(0xbfb090);
  g2.fillRect(10, 32, 36, 2);
  g2.fillStyle(0x8a6f4d);
  g2.fillRect(14, 16, 28, 2);
  g2.fillRect(14, 21, 22, 2);
  g2.fillRect(14, 26, 25, 2);
  g2.generateTexture("board", 56, 53);
  g2.clear();

  // watchtower with scrying pool (§9e)
  g2.fillStyle(OUTLINE);
  g2.fillRect(9, 9, 30, 54);
  g2.fillRect(5, 3, 38, 12);
  g2.fillStyle(STONE.base);
  g2.fillRect(10, 10, 28, 52);
  g2.fillStyle(STONE.light);
  g2.fillRect(10, 10, 8, 52);
  g2.fillStyle(STONE.dark);
  g2.fillRect(32, 10, 6, 52);
  g2.fillStyle(0x7d87a0);
  g2.fillRect(6, 4, 36, 10);
  g2.fillStyle(STONE.light);
  g2.fillRect(6, 4, 36, 3);
  // crenellations
  g2.fillStyle(OUTLINE);
  g2.fillRect(6, 0, 7, 5);
  g2.fillRect(20, 0, 8, 5);
  g2.fillRect(35, 0, 7, 5);
  g2.fillStyle(0x7d87a0);
  g2.fillRect(7, 1, 5, 4);
  g2.fillRect(21, 1, 6, 4);
  g2.fillRect(36, 1, 5, 4);
  g2.fillStyle(0x2c3446);
  g2.fillRect(20, 40, 10, 22);
  g2.fillStyle(OUTLINE);
  g2.fillEllipse(24, 70, 38, 15);
  g2.fillStyle(0x2d8a80);
  g2.fillEllipse(24, 70, 34, 12);
  g2.fillStyle(0x46b8ae);
  g2.fillEllipse(24, 69, 26, 8);
  g2.fillStyle(0x9be8e0);
  g2.fillEllipse(22, 68, 12, 4);
  g2.generateTexture("tower", 48, 78);
  g2.clear();

  // tavern (§9d) — a wider, warmer house
  g2.fillStyle(OUTLINE);
  g2.fillRect(3, 29, 114, 56);
  g2.fillStyle(0x7a5a3a);
  g2.fillRect(4, 30, 112, 54);
  g2.fillStyle(0x684a2e);
  g2.fillRect(4, 30, 112, 8);
  g2.fillStyle(0x8d6b46);
  g2.fillRect(4, 78, 112, 6);
  // half-timber beams
  g2.fillStyle(0x54381f);
  g2.fillRect(10, 38, 4, 46);
  g2.fillRect(106, 38, 4, 46);
  g2.fillRect(4, 62, 112, 3);
  g2.fillStyle(OUTLINE);
  g2.fillTriangle(-2, 34, 60, -2, 122, 34);
  g2.fillStyle(0x5c3f2a);
  g2.fillTriangle(0, 32, 60, 0, 120, 32);
  g2.fillStyle(0x745338);
  g2.fillTriangle(12, 28, 60, 2, 66, 8);
  g2.fillStyle(0x452f1f);
  g2.fillTriangle(60, 24, 120, 32, 50, 32);
  // door + windows, framed
  g2.fillStyle(OUTLINE);
  g2.fillRect(50, 54, 22, 30);
  g2.fillStyle(0x3a2c1e);
  g2.fillRect(52, 56, 18, 28);
  g2.fillStyle(0xd4a017);
  g2.fillRect(66, 70, 2, 4);
  g2.fillStyle(OUTLINE);
  g2.fillRect(14, 44, 18, 18);
  g2.fillRect(88, 44, 18, 18);
  g2.fillStyle(0xf2b16b);
  g2.fillRect(16, 46, 14, 14);
  g2.fillRect(90, 46, 14, 14);
  g2.fillStyle(0xc98d4e);
  g2.fillRect(16, 52, 14, 2);
  g2.fillRect(90, 52, 14, 2);
  // hanging sign
  g2.fillStyle(OUTLINE);
  g2.fillRect(45, 35, 30, 10);
  g2.fillStyle(0xd4a017);
  g2.fillRect(46, 36, 28, 8);
  g2.fillStyle(0xa87c10);
  g2.fillRect(46, 42, 28, 2);
  g2.generateTexture("tavern", 120, 85);
  g2.clear();

  // pond + duck (§15) — banked edge, deep-to-light water
  g2.fillStyle(0x8a7a52);
  g2.fillEllipse(40, 25, 80, 46);
  g2.fillStyle(OUTLINE);
  g2.fillEllipse(40, 24, 76, 43);
  g2.fillStyle(WATER.deep);
  g2.fillEllipse(40, 24, 72, 40);
  g2.fillStyle(WATER.base);
  g2.fillEllipse(40, 23, 58, 30);
  g2.fillStyle(WATER.light);
  g2.fillEllipse(34, 18, 20, 8);
  g2.generateTexture("pond", 80, 50);
  g2.clear();
  g2.fillStyle(OUTLINE);
  g2.fillEllipse(9, 10, 16, 12);
  g2.fillCircle(15, 5, 6);
  g2.fillStyle(0xf2d16b);
  g2.fillEllipse(8, 10, 14, 10);
  g2.fillCircle(15, 5, 5);
  g2.fillStyle(0xfaeaa8);
  g2.fillEllipse(6, 8, 6, 4);
  g2.fillStyle(0xd4791a);
  g2.fillRect(19, 4, 5, 3);
  g2.fillStyle(0x1d1d24);
  g2.fillRect(15, 3, 2, 2);
  g2.generateTexture("duck", 26, 18);
  g2.clear();

  // §9b the dock — a short jetty out over the pond, planks and two posts
  g2.fillStyle(OUTLINE);
  g2.fillRect(0, 3, 34, 13);
  g2.fillStyle(WOOD.base);
  g2.fillRect(1, 4, 32, 11);
  g2.fillStyle(WOOD.light);
  for (let plank = 2; plank < 33; plank += 6) {
    g2.fillRect(plank, 5, 4, 9);
  }
  g2.fillStyle(WOOD.dark);
  g2.fillRect(1, 13, 32, 2);
  g2.fillStyle(OUTLINE);
  g2.fillRect(3, 0, 4, 6);
  g2.fillRect(27, 0, 4, 6);
  g2.fillStyle(WOOD.dark);
  g2.fillRect(4, 1, 2, 5);
  g2.fillRect(28, 1, 2, 5);
  g2.generateTexture("dock", 34, 16);
  g2.clear();

  // water sparkle for animated shimmer
  g2.fillStyle(0xd8ecff);
  g2.fillRect(0, 2, 6, 2);
  g2.fillRect(2, 0, 2, 6);
  g2.generateTexture("sparkle", 6, 6);
  g2.clear();

  // dusty statue on a pedestal (§15)
  g2.fillStyle(OUTLINE);
  g2.fillRect(3, 35, 26, 12);
  g2.fillStyle(STONE.base);
  g2.fillRect(4, 36, 24, 10);
  g2.fillStyle(STONE.light);
  g2.fillRect(4, 36, 24, 3);
  g2.fillStyle(OUTLINE);
  g2.fillRect(9, 9, 14, 28);
  g2.fillCircle(16, 8, 7);
  g2.fillStyle(0x8a93a8);
  g2.fillRect(10, 10, 12, 26);
  g2.fillCircle(16, 8, 6);
  g2.fillStyle(STONE.light);
  g2.fillRect(10, 10, 4, 26);
  g2.generateTexture("statue", 32, 47);
  g2.clear();

  // cracked rock (§15 secret) and bones (§15 skeleton)
  g2.fillStyle(OUTLINE);
  g2.fillCircle(16, 18, 15);
  g2.fillStyle(0x7d8499);
  g2.fillCircle(16, 18, 14);
  g2.fillStyle(0x99a0b4);
  g2.fillCircle(12, 14, 7);
  g2.fillStyle(0x5c6377);
  g2.fillRect(14, 6, 3, 16);
  g2.fillRect(17, 14, 6, 3);
  g2.generateTexture("rock", 32, 33);
  g2.clear();
  g2.fillStyle(0xe8e3d0);
  g2.fillCircle(8, 6, 5);
  g2.fillRect(4, 12, 16, 3);
  g2.fillRect(6, 17, 12, 3);
  g2.fillStyle(0xb8b3a0);
  g2.fillRect(4, 14, 16, 1);
  g2.generateTexture("bones", 24, 22);
  g2.clear();

  // §1a — a signpost naming each area, planted at its landing spot
  g2.fillStyle(OUTLINE);
  g2.fillRect(10, 2, 6, 30);
  g2.fillRect(1, 4, 24, 10);
  g2.fillStyle(WOOD.dark);
  g2.fillRect(11, 3, 4, 28);
  g2.fillStyle(WOOD.base);
  g2.fillRect(2, 5, 22, 8);
  g2.fillStyle(WOOD.light);
  g2.fillRect(2, 5, 22, 2);
  g2.generateTexture("signpost", 26, 32);
  g2.clear();

  // §1a Shopping District — a market stall, shuttered until Phase 6
  g2.fillStyle(OUTLINE);
  g2.fillRect(0, 14, 56, 26);
  g2.fillStyle(WOOD.base);
  g2.fillRect(1, 15, 54, 24);
  g2.fillStyle(WOOD.dark);
  g2.fillRect(1, 33, 54, 6);
  g2.fillStyle(OUTLINE);
  g2.fillTriangle(-2, 18, 28, -2, 58, 18);
  // striped awning
  g2.fillStyle(0xc74a4a);
  g2.fillTriangle(0, 16, 28, 0, 56, 16);
  g2.fillStyle(0xe8e3d0);
  g2.fillTriangle(14, 8, 28, 0, 42, 8);
  g2.fillStyle(WOOD.dark);
  g2.fillRect(6, 20, 44, 10); // shuttered counter
  g2.fillStyle(WOOD.light);
  g2.fillRect(6, 20, 44, 2);
  g2.generateTexture("stall", 56, 40);
  g2.clear();

  // §1a/§9b Frontier — the traveling merchant's covered wagon
  g2.fillStyle(OUTLINE);
  g2.fillEllipse(30, 16, 52, 30);
  g2.fillStyle(0xd8cba8);
  g2.fillEllipse(30, 16, 48, 26);
  g2.fillStyle(0xbfb090);
  g2.fillEllipse(30, 12, 40, 14);
  g2.fillStyle(OUTLINE);
  g2.fillRect(2, 26, 56, 8);
  g2.fillStyle(WOOD.base);
  g2.fillRect(3, 27, 54, 6);
  // wheels
  g2.fillStyle(OUTLINE);
  g2.fillCircle(14, 36, 8);
  g2.fillCircle(46, 36, 8);
  g2.fillStyle(WOOD.dark);
  g2.fillCircle(14, 36, 6);
  g2.fillCircle(46, 36, 6);
  g2.fillStyle(WOOD.light);
  g2.fillCircle(14, 36, 2);
  g2.fillCircle(46, 36, 2);
  g2.generateTexture("wagon", 60, 46);
  g2.clear();

  // §1a Ruins — a crumbled wall segment, vines creeping over it
  g2.fillStyle(OUTLINE);
  g2.fillRect(0, 8, 64, 22);
  g2.fillRect(6, 2, 14, 8);
  g2.fillRect(40, 4, 12, 6);
  g2.fillStyle(STONE.base);
  g2.fillRect(1, 9, 62, 20);
  g2.fillRect(7, 3, 12, 8);
  g2.fillRect(41, 5, 10, 6);
  g2.fillStyle(STONE.dark);
  g2.fillRect(1, 24, 62, 5);
  g2.fillRect(20, 9, 2, 15); // cracks
  g2.fillRect(44, 12, 2, 12);
  g2.fillStyle(STONE.light);
  g2.fillRect(7, 3, 12, 2);
  g2.fillRect(1, 9, 30, 2);
  // vines
  g2.fillStyle(0x2f7a3f);
  g2.fillRect(10, 6, 3, 20);
  g2.fillRect(13, 14, 4, 3);
  g2.fillRect(50, 8, 3, 16);
  g2.fillRect(47, 18, 4, 3);
  g2.generateTexture("ruinwall", 64, 30);
  g2.clear();

  // §14 wards — a hook is a rune circle etched into the ground. Watching
  // wards glow cool blue; blocking wards burn amber, the color of a gate.
  for (const [key, color] of [
    ["rune-watch", palette.wardWatch],
    ["rune-guard", palette.wardGuard],
  ] as const) {
    g2.lineStyle(2, color, 0.9);
    g2.strokeEllipse(26, 16, 46, 26);
    g2.lineStyle(1, color, 0.5);
    g2.strokeEllipse(26, 16, 34, 18);
    g2.fillStyle(color, 0.85);
    // four glyph ticks at the cardinal points of the ring
    g2.fillRect(25, 1, 2, 5);
    g2.fillRect(25, 26, 2, 5);
    g2.fillRect(1, 15, 5, 2);
    g2.fillRect(46, 15, 5, 2);
    g2.generateTexture(key, 52, 32);
    g2.clear();
  }

  // §14 — a boundary ward post, for the fence blocking hooks draw around
  // the village. Stone stake, carved band, lit tip.
  g2.fillStyle(OUTLINE);
  g2.fillRect(2, 4, 10, 26);
  g2.fillStyle(STONE.base);
  g2.fillRect(3, 5, 8, 24);
  g2.fillStyle(STONE.light);
  g2.fillRect(3, 5, 3, 24);
  g2.fillStyle(0xd4a017);
  g2.fillRect(3, 12, 8, 3);
  g2.fillStyle(0xf2e0a0);
  g2.fillCircle(7, 3, 3);
  g2.generateTexture("ward-post", 14, 32);
  g2.destroy();

  // player + one NPC skin per model tier, plus villagers
  character(scene, "player", palette.playerTunic, 0x6b4a2f);
  character(scene, "oldman", 0x8a8a9a, 0xe8e3d0);
  character(scene, "gatekeeper", 0x8f2f2f, 0x2c2c34);
  character(scene, "guide", 0x2d8a80, 0xe8e3d0); // §18 tutorial guide
  // §5b — one keeper per specialty shop
  character(scene, "keeper-skills", 0x7a4f9e, 0xe8e3d0); // apothecary
  character(scene, "keeper-plugins", 0x8f5b2f, 0x2c2c34); // smith
  character(scene, "keeper-mcp", 0x2f6b8f, 0xd4a017); // far-places merchant
  for (const [tier, color] of Object.entries(TIER_COLORS)) {
    character(scene, `npc-${tier}`, color, 0x2c2c34);
  }
}
