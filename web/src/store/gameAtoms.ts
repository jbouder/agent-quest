import { atom, createStore } from "jotai";
import type { AgentSnapshot, JournalLine, PlayerState } from "@/lib/protocol";

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

/** What the player is doing: roaming, or captured by a dialog. */
export type UiMode =
  | { mode: "roam" }
  | { mode: "summon" }
  | { mode: "talk"; agentId: string };

export const uiModeAtom = atom<UiMode>({ mode: "roam" });

/** Set by the Phaser scene: what's in interaction range right now. */
export type Interactable =
  | { kind: "portal" }
  | { kind: "npc"; agentId: string }
  | null;

export const nearbyAtom = atom<Interactable>(null);

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__agentQuestDebug = {
    store: gameStore,
    atoms: { agentsAtom, playerAtom, connectedAtom, defaultCwdAtom },
    get: () => ({
      agents: gameStore.get(agentsAtom),
      player: gameStore.get(playerAtom),
      connected: gameStore.get(connectedAtom),
      defaultCwd: gameStore.get(defaultCwdAtom),
    }),
  };
}
