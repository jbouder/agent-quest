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

function character(
  scene: Phaser.Scene,
  key: string,
  tunic: number,
  hair: number,
): void {
  const g = scene.add.graphics();
  // legs
  g.fillStyle(0x3a3128);
  g.fillRect(6, 22, 4, 6);
  g.fillRect(14, 22, 4, 6);
  // tunic
  g.fillStyle(tunic);
  g.fillRect(4, 12, 16, 11);
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
  // eyes
  g.fillStyle(0x1d1d24);
  g.fillRect(9, 7, 2, 2);
  g.fillRect(14, 7, 2, 2);
  g.generateTexture(key, 24, 28);
  g.destroy();
}

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // grass base tile with speckles
  g.fillStyle(0x2f5d38);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x376b41);
  g.fillRect(4, 6, 2, 2);
  g.fillRect(20, 10, 2, 2);
  g.fillRect(12, 22, 2, 2);
  g.fillRect(26, 26, 2, 2);
  g.generateTexture("grass", 32, 32);
  g.clear();

  // dirt path tile
  g.fillStyle(0x8a6f4d);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x7b6244);
  g.fillRect(6, 8, 3, 2);
  g.fillRect(22, 18, 3, 2);
  g.fillRect(12, 26, 3, 2);
  g.generateTexture("path", 32, 32);
  g.clear();

  // house: wall + roof + door
  g.fillStyle(0x6b4f35);
  g.fillRect(4, 28, 88, 52);
  g.fillStyle(0x54402c);
  g.fillRect(4, 28, 88, 4);
  g.fillStyle(0x8f2f2f);
  g.fillTriangle(0, 30, 48, 0, 96, 30);
  g.fillStyle(0x3a2c1e);
  g.fillRect(40, 52, 16, 28);
  g.fillStyle(0xf2d16b);
  g.fillRect(14, 44, 12, 12);
  g.fillRect(70, 44, 12, 12);
  g.generateTexture("house", 96, 80);
  g.clear();

  // portal: stone ring + glow
  g.fillStyle(0x565f75);
  g.fillEllipse(24, 56, 44, 14);
  g.fillStyle(0x7b4fd6);
  g.fillEllipse(24, 30, 30, 48);
  g.fillStyle(0xb79af0);
  g.fillEllipse(24, 30, 18, 34);
  g.generateTexture("portal", 48, 64);
  g.clear();

  // fountain
  g.fillStyle(0x565f75);
  g.fillCircle(24, 24, 22);
  g.fillStyle(0x3f6fb8);
  g.fillCircle(24, 24, 16);
  g.fillStyle(0x9ec4f0);
  g.fillCircle(24, 24, 6);
  g.generateTexture("fountain", 48, 48);
  g.clear();

  // treasure chest marker (a finished quest leaves a trace, §9)
  g.fillStyle(0x7a5230);
  g.fillRect(0, 6, 20, 10);
  g.fillStyle(0x9a6a40);
  g.fillRect(0, 2, 20, 5);
  g.fillStyle(0xd4a017);
  g.fillRect(8, 6, 4, 5);
  g.generateTexture("chest", 20, 16);
  g.destroy();

  // player + one NPC skin per model tier
  character(scene, "player", 0x2e7d32, 0x6b4a2f);
  for (const [tier, color] of Object.entries(TIER_COLORS)) {
    character(scene, `npc-${tier}`, color, 0x2c2c34);
  }
}
