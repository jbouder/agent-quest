import type { AreaId } from "@/game/areas";

/**
 * §19 — customization as data, not code injection. The world's customizable
 * surfaces read this document; the editor produces new versions of it. Every
 * apply pushes the previous version onto a history stack, which is what makes
 * "one-click revert" (and the rift's "seal" action) honest.
 */

export interface CustomQuest {
  icon: string;
  title: string;
  detail: string;
  task: string;
}

export interface WorldOverrides {
  version: 1;
  /** Cosmetic — recolor the village ground. */
  palette: { grass: string; path: string };
  /** Your own character: tunic color and walking pace. */
  player: { tunic: string; speed: number };
  /** Structural — the mana formula's visible half (§2 hearts). */
  hearts: { count: number };
  /** Structural — what a hook's ward looks like (§14). */
  wards: { watch: string; guard: string; fence: boolean };
  /** Cosmetic — rename buildings and areas. */
  names: {
    tavern: string;
    pool: string;
    guide: string;
    areas: Partial<Record<AreaId, string>>;
  };
  /** Structural — your own recurring notices on the quest board (§9a). */
  customQuests: CustomQuest[];
}

export const DEFAULT_OVERRIDES: WorldOverrides = {
  version: 1,
  palette: { grass: "#4a9648", path: "#cfa961" },
  player: { tunic: "#2e7d32", speed: 1 },
  hearts: { count: 10 },
  wards: { watch: "#6fb6d6", guard: "#d4a017", fence: true },
  names: { tavern: "tavern", pool: "scrying pool", guide: "guide", areas: {} },
  customQuests: [],
};

const HEX = /^#[0-9a-fA-F]{6}$/;
export const SPEED_RANGE = { min: 0.5, max: 3 };
export const HEARTS_RANGE = { min: 4, max: 20 };
export const MAX_CUSTOM_QUESTS = 5;
const MAX_NAME = 28;
const MAX_TEXT = 160;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function text(value: unknown, fallback: string, max = MAX_NAME): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Coerce anything into a valid overrides document. Unknown fields drop,
 * out-of-range values clamp, colors fall back — the world can always render
 * whatever this returns, which is half of what makes editing it safe.
 */
export function sanitizeOverrides(raw: unknown): WorldOverrides {
  const d = DEFAULT_OVERRIDES;
  const input = (raw ?? {}) as Record<string, Record<string, unknown>>;
  const areasIn = (input.names?.areas ?? {}) as Record<string, unknown>;
  const areas: Partial<Record<AreaId, string>> = {};
  for (const [key, value] of Object.entries(areasIn)) {
    if (typeof value === "string" && value.trim()) {
      areas[key as AreaId] = value.trim().slice(0, MAX_NAME);
    }
  }

  const questsIn = Array.isArray(input.customQuests)
    ? (input.customQuests as Record<string, unknown>[])
    : [];
  const customQuests: CustomQuest[] = questsIn
    .map((quest) => ({
      icon: text(quest.icon, "📜", 4),
      title: text(quest.title, "", 80),
      detail: text(quest.detail, "", MAX_TEXT),
      task: text(quest.task, "", 400),
    }))
    .filter((quest) => quest.title.length > 0 && quest.task.length > 0)
    .slice(0, MAX_CUSTOM_QUESTS);

  return {
    version: 1,
    palette: {
      grass: color(input.palette?.grass, d.palette.grass),
      path: color(input.palette?.path, d.palette.path),
    },
    player: {
      tunic: color(input.player?.tunic, d.player.tunic),
      speed:
        typeof input.player?.speed === "number" &&
        Number.isFinite(input.player.speed)
          ? clamp(input.player.speed, SPEED_RANGE.min, SPEED_RANGE.max)
          : d.player.speed,
    },
    hearts: {
      count:
        typeof input.hearts?.count === "number" &&
        Number.isFinite(input.hearts.count)
          ? Math.round(
              clamp(input.hearts.count, HEARTS_RANGE.min, HEARTS_RANGE.max),
            )
          : d.hearts.count,
    },
    wards: {
      watch: color(input.wards?.watch, d.wards.watch),
      guard: color(input.wards?.guard, d.wards.guard),
      fence:
        typeof input.wards?.fence === "boolean"
          ? input.wards.fence
          : d.wards.fence,
    },
    names: {
      tavern: text(input.names?.tavern, d.names.tavern),
      pool: text(input.names?.pool, d.names.pool),
      guide: text(input.names?.guide, d.names.guide),
      areas,
    },
    customQuests,
  };
}

/** "#rrggbb" → the 0xRRGGBB number Phaser wants. */
export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

// ---------------------------------------------------------------------------
// Persistence + the revert history (§19: reversible or it isn't safe).
// ---------------------------------------------------------------------------

const STORE_KEY = "aq-overrides-v1";
const HISTORY_CAP = 10;

interface StoredOverrides {
  current: WorldOverrides;
  history: WorldOverrides[];
}

export function loadOverrides(): StoredOverrides {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { current: DEFAULT_OVERRIDES, history: [] };
    const parsed = JSON.parse(raw) as {
      current?: unknown;
      history?: unknown[];
    };
    return {
      current: sanitizeOverrides(parsed.current),
      history: Array.isArray(parsed.history)
        ? parsed.history.slice(0, HISTORY_CAP).map(sanitizeOverrides)
        : [],
    };
  } catch {
    return { current: DEFAULT_OVERRIDES, history: [] };
  }
}

function persist(stored: StoredOverrides): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  } catch {
    // storage unavailable — the world still runs on the in-memory value
  }
}

/** Apply a new document: the old one becomes the top of the revert stack. */
export function applyOverrides(next: WorldOverrides): StoredOverrides {
  const { current, history } = loadOverrides();
  const stored: StoredOverrides = {
    current: sanitizeOverrides(next),
    history: [current, ...history].slice(0, HISTORY_CAP),
  };
  persist(stored);
  return stored;
}

/**
 * One-click revert: restore the previous version. Returns what the world
 * should now use (unchanged if there is nothing to revert to).
 */
export function revertOverrides(): StoredOverrides {
  const { current, history } = loadOverrides();
  const [previous, ...rest] = history;
  if (!previous) return { current, history };
  const stored: StoredOverrides = { current: previous, history: rest };
  persist(stored);
  return stored;
}

/** How many steps back the revert stack currently holds. */
export function revertDepth(): number {
  return loadOverrides().history.length;
}
