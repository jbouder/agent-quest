/** §5a — the model catalog as equipment tiers. */
export interface ModelGear {
  id: string;
  name: string;
  gear: string;
  detail: string;
}

export const MODELS: ModelGear[] = [
  {
    id: "claude-haiku-4-5",
    name: "Haiku",
    gear: "light gear",
    detail: "Quick and cheap — the rogue/scout loadout for fast, simple tasks.",
  },
  {
    id: "claude-sonnet-5",
    name: "Sonnet",
    gear: "knight gear",
    detail: "Balanced, general-purpose — the loadout most agents wear.",
  },
  {
    id: "claude-opus-5",
    name: "Opus",
    gear: "heavy armor",
    detail: "Slower but hits much harder; higher mana cost to equip.",
  },
  {
    id: "claude-fable-5",
    name: "Fable",
    gear: "legendary (warded)",
    detail:
      "Legendary tier — Fable and Mythos share the same underlying model; Fable carries extra safety wards. Equip only when the quest calls for it.",
  },
];
