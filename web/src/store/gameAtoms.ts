import { atom, createStore } from "jotai";
import { type AreaId, loadDiscovered } from "@/game/areas";
import {
  DEFAULT_OVERRIDES,
  loadOverrides,
  type WorldOverrides,
} from "@/lib/overrides";
import type {
  AgentSnapshot,
  JournalLine,
  PlayerState,
  Raid,
  SessionSummary,
  ShopKind,
  ShopStock,
  SideQuest,
  Ward,
} from "@/lib/protocol";

/** Shared store so the Phaser scene (outside React) can read/subscribe too. */
export const gameStore = createStore();

declare global {
  interface Window {
    __agentQuestDebug?: Record<string, unknown>;
  }
}

export const agentsAtom = atom<AgentSnapshot[]>([]);

export const playerAtom = atom<PlayerState>({
  spentUsd: 0,
  budgetUsd: 0,
  tokensSpent: 0,
  locked: false,
});

export const defaultCwdAtom = atom<string>("");

export const connectedAtom = atom<boolean>(false);

/** §9a — what's posted on the quest board. */
export const sideQuestsAtom = atom<SideQuest[]>([]);

/** §9d town crier — recent commits. */
export const recentCommitsAtom = atom<string[]>([]);

/** §14 — hooks configured for the repo, drawn as wards on the world. */
export const wardsAtom = atom<Ward[]>([]);

/** §9b — the party's shared boss fight, when one has formed. */
export const raidAtom = atom<Raid | null>(null);

/**
 * §19 — the live overrides document the customizable surfaces render from.
 * The editor previews by setting this without persisting; Apply persists and
 * pushes history; revert (editor or rift) pops it.
 */
export const overridesAtom = atom<WorldOverrides>(
  typeof localStorage !== "undefined"
    ? loadOverrides().current
    : DEFAULT_OVERRIDES,
);

/** §19/§16 — a rift summoned on purpose: which surface should crash. */
export const riftTestAtom = atom<string | null>(null);

/** §5b — the Shopping District's shelves, restocked by the server. */
export const shopsAtom = atom<Record<ShopKind, ShopStock>>({
  skills: { items: [], fetchedTs: 0, error: null },
  plugins: { items: [], fetchedTs: 0, error: null },
  mcp: { items: [], fetchedTs: 0, error: null },
});

// §20 — the Map
/** Areas you've physically walked to (persisted; the scene adds to it). */
export const discoveredAreasAtom = atom<Set<AreaId>>(
  typeof localStorage !== "undefined"
    ? loadDiscovered()
    : new Set<AreaId>(["square"]),
);
/** The area the player is currently standing in. */
export const playerAreaAtom = atom<AreaId>("square");
/** Player world position, for the Map's you-are-here dot (throttled). */
export const playerPosAtom = atom<{ x: number; y: number }>({ x: 0, y: 0 });
/** §20 fast travel: set to an area id; the scene teleports and clears it. */
export const mapTravelAtom = atom<AreaId | null>(null);

/**
 * §9b fishing — a long-running background task means a long wait. Derived
 * rather than stored, so the dock opens and closes with the real work.
 */
export const LONG_WAIT_MS = 2 * 60_000;

export const longWaitAtom = atom((get) => {
  const now = Date.now();
  for (const agent of get(agentsAtom)) {
    for (const task of agent.tasks) {
      if (task.kind !== "background" || task.status !== "running") continue;
      if (now - task.startedTs >= LONG_WAIT_MS) {
        return { agentLabel: agent.label, description: task.description };
      }
    }
  }
  return null;
});

/** §16 sandbox — the server is running fake agents on fake budget. */
export const demoModeAtom = atom<boolean>(false);

/** §8a — saved sessions offered for resume in the summon dialog. */
export const savedSessionsAtom = atom<SessionSummary[]>([]);

/** Prefills the summon dialog's quest box (used by the quest board's Accept). */
export const summonPrefillAtom = atom<string>("");

/** §15 rubber duck — your last steering instruction, repeated back. */
export const lastSteerAtom = atom<string>("");

// §16 cheats
export const noclipAtom = atom<boolean>(false);
export const speedBoostAtom = atom<boolean>(false);
export const debugOverlayAtom = atom<boolean>(false);
export const revealMapAtom = atom<boolean>(false);
/** Cheat "level select": a place name the scene should teleport to. */
export const cheatWarpAtom = atom<string | null>(null);
/** §15 old man's gift — cosmetic shield in the HUD. */
export const shieldAtom = atom<boolean>(
  typeof localStorage !== "undefined" &&
    localStorage.getItem("aq-shield") === "1",
);

const JOURNAL_CAP = 500;
export const journalAtom = atom<JournalLine[]>([]);
export const appendJournalAtom = atom(null, (get, set, line: JournalLine) => {
  const lines = [...get(journalAtom), line];
  set(
    journalAtom,
    lines.length > JOURNAL_CAP ? lines.slice(-JOURNAL_CAP) : lines,
  );
});

/** §6a — the Chronicle: the consolidated cross-agent journal drawer. */
export const chronicleOpenAtom = atom<boolean>(false);

/**
 * §7 talk — the dialog docks at the bottom by default and grows to fill the
 * screen when you want to actually read a long answer. Lives out here so the
 * choice survives closing the dialog and talking to someone else.
 */
export const talkExpandedAtom = atom<boolean>(false);

export interface Toast {
  id: number;
  level: "info" | "warn" | "error";
  text: string;
}
export const toastsAtom = atom<Toast[]>([]);

/** What the player is doing: roaming, or captured by a dialog/overlay. */
export type UiMode =
  | { mode: "roam" }
  | { mode: "summon" }
  | { mode: "talk"; agentId: string }
  | { mode: "mirror" }
  /**
   * §5/§7a — the inventory. `agentId: null` means "whoever you're carrying" —
   * opened from the icon row rather than from inside a conversation, so it
   * picks an agent itself. `origin` is where Escape goes back to.
   */
  | {
      mode: "inventory";
      agentId: string | null;
      origin: "talk" | "menu";
    }
  | { mode: "board" }
  | { mode: "tavern" }
  | { mode: "scry" }
  // §9b — the idle dock, open only while a long job is actually running
  | { mode: "fishing" }
  // §20 — the Map: geography, discovery, and fast travel
  | { mode: "map" }
  // §5b — one of the Shopping District's three specialty shops
  | { mode: "shop"; shop: ShopKind }
  // §19 — the World Codex: reshape the world, preview, apply, revert
  | { mode: "editor" }
  | { mode: "cheat" }
  // §18 — the guide's walkthrough and the searchable full reference
  | { mode: "tutorial" }
  | { mode: "help" };

export const uiModeAtom = atom<UiMode>({ mode: "roam" });

/** Set by the Phaser scene: what's in interaction range right now. */
export type Interactable =
  | { kind: "npc"; agentId: string }
  | { kind: "camp" }
  | { kind: "board" }
  | { kind: "tavern" }
  | { kind: "scry" }
  | { kind: "egg"; eggId: string }
  // §18 — the guide NPC by the fountain
  | { kind: "guide" }
  // §14 — a rune circle standing for a configured hook
  | { kind: "ward"; wardId: string }
  // §9 — the monument or chest a finished session left behind
  | { kind: "trophy"; agentId: string }
  // §9b — the pond's dock, fishable while a long job runs
  | { kind: "dock" }
  // §5b — a specialty shop's stall in the Shopping District
  | { kind: "shop"; shop: ShopKind }
  | null;

export const nearbyAtom = atom<Interactable>(null);

/** §4 Mirror warp: set to an agent id; the scene teleports and clears it. */
export const warpTargetAtom = atom<string | null>(null);

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__agentQuestDebug = {
    store: gameStore,
    atoms: {
      agentsAtom,
      playerAtom,
      connectedAtom,
      defaultCwdAtom,
      uiModeAtom,
      chronicleOpenAtom,
      warpTargetAtom,
      wardsAtom,
      raidAtom,
      longWaitAtom,
      cheatWarpAtom,
      mapTravelAtom,
      discoveredAreasAtom,
      playerAreaAtom,
      playerPosAtom,
    },
    get: () => ({
      agents: gameStore.get(agentsAtom),
      player: gameStore.get(playerAtom),
      connected: gameStore.get(connectedAtom),
      defaultCwd: gameStore.get(defaultCwdAtom),
    }),
  };
}
