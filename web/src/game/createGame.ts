import Phaser from "phaser";
import { VillageScene } from "./VillageScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0b0e14",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: { default: "arcade" },
    scene: [VillageScene],
  });
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__agentQuestGame = game;
  }
  return game;
}
