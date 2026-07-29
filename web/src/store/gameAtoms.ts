import { atom, createStore } from "jotai";
import type {
  AgentSnapshot,
  JournalLine,
  PlayerState,
  SessionSummary,
  SideQuest,
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

/** §1/§12 — the repo's top-level directories, one house each. */
export const districtsAtom = atom<string[]>([]);

/** §9a — what's posted on the quest board. */
export const sideQuestsAtom = atom<SideQuest[]>([]);

/** §9d town crier — recent commits. */
export const recentCommitsAtom = atom<string[]>([]);

/** §16 sandbox — the server is running fake agents on fake budget. */
export const demoModeAtom = atom<boolean>(false);

/** §8a — saved sessions offered for resume at the portal. */
export const savedSessionsAtom = atom<SessionSummary[]>([]);

/** Prefills the portal's quest box (used by the quest board's Accept). */
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

export const journalOpenAtom = atom<boolean>(false);

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
  | { mode: "inventory"; agentId: string }
  | { mode: "board" }
  | { mode: "tavern" }
  | { mode: "scry" }
  | { mode: "cheat" };

export const uiModeAtom = atom<UiMode>({ mode: "roam" });

/** Set by the Phaser scene: what's in interaction range right now. */
export type Interactable =
  | { kind: "portal" }
  | { kind: "npc"; agentId: string }
  | { kind: "camp" }
  | { kind: "board" }
  | { kind: "tavern" }
  | { kind: "scry" }
  | { kind: "egg"; eggId: string }
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
      journalOpenAtom,
      warpTargetAtom,
    },
    get: () => ({
      agents: gameStore.get(agentsAtom),
      player: gameStore.get(playerAtom),
      connected: gameStore.get(connectedAtom),
      defaultCwd: gameStore.get(defaultCwdAtom),
    }),
  };
}
