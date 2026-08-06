import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import CheatConsole from "@/components/CheatConsole";
import Chronicle from "@/components/Chronicle";
import DebugOverlay from "@/components/DebugOverlay";
import EditorDialog from "@/components/EditorDialog";
import FishingDialog from "@/components/FishingDialog";
import HelpDialog from "@/components/HelpDialog";
import InventoryDialog from "@/components/InventoryDialog";
import MapDialog from "@/components/MapDialog";
import Mirror from "@/components/Mirror";
import QuestBoardDialog from "@/components/QuestBoardDialog";
import ScryDialog from "@/components/ScryDialog";
import ShopDialog from "@/components/ShopDialog";
import SummonDialog from "@/components/SummonDialog";
import TalkDialog from "@/components/TalkDialog";
import TavernDialog from "@/components/TavernDialog";
import TutorialDialog from "@/components/TutorialDialog";
import type { AgentSnapshot } from "@/lib/protocol";
import {
  agentsAtom,
  chronicleOpenAtom,
  debugOverlayAtom,
  LONG_WAIT_MS,
  type UiMode,
  uiModeAtom,
} from "@/store/gameAtoms";

const AGENT: AgentSnapshot = {
  id: "a1",
  label: "Agent 1",
  task: "t",
  cwd: "/",
  model: "claude-sonnet-5",
  status: "idle",
  thought: "",
  contextTokens: 0,
  contextLimit: 200_000,
  tokensSpent: 0,
  costUsd: 0,
  sessionId: null,
  pendingPermission: null,
  lastResult: null,
  compactions: 0,
  inventory: null,
  toolUses: {},
  quests: [],
  permissionMode: "default",
  planPending: false,
  tomePreview: null,
  tasks: [],
  commits: [],
  rewound: false,
  forkedFrom: null,
};

/**
 * The contract every overlay in the village signs. Adding a dialog without
 * `useDialog` should fail here, not in someone's hands.
 */
interface Case {
  name: string;
  element: ReactElement;
  /** Puts the store in the state that makes this dialog visible. */
  open: (store: ReturnType<typeof createStore>) => void;
  /** Side panels stay non-modal on purpose; they still close on Escape. */
  modal?: boolean;
  /** Escape steps back somewhere other than roaming. */
  closesTo?: UiMode;
}

const mode = (ui: UiMode) => (store: ReturnType<typeof createStore>) =>
  store.set(uiModeAtom, ui);

const CASES: Case[] = [
  {
    name: "SummonDialog",
    element: <SummonDialog />,
    open: mode({ mode: "summon" }),
  },
  {
    name: "TalkDialog",
    element: <TalkDialog />,
    open: (store) => {
      store.set(agentsAtom, [AGENT]);
      store.set(uiModeAtom, { mode: "talk", agentId: AGENT.id });
    },
  },
  {
    name: "InventoryDialog",
    element: <InventoryDialog />,
    open: (store) => {
      store.set(agentsAtom, [AGENT]);
      store.set(uiModeAtom, { mode: "inventory", agentId: AGENT.id });
    },
    closesTo: { mode: "talk", agentId: AGENT.id },
  },
  { name: "Mirror", element: <Mirror />, open: mode({ mode: "mirror" }) },
  { name: "MapDialog", element: <MapDialog />, open: mode({ mode: "map" }) },
  {
    name: "QuestBoardDialog",
    element: <QuestBoardDialog />,
    open: mode({ mode: "board" }),
  },
  {
    name: "TavernDialog",
    element: <TavernDialog />,
    open: mode({ mode: "tavern" }),
  },
  { name: "ScryDialog", element: <ScryDialog />, open: mode({ mode: "scry" }) },
  {
    name: "FishingDialog",
    // The dock only opens while something long is actually running, and
    // `longWaitAtom` derives that from the agents — so seed a slow task.
    element: <FishingDialog />,
    open: (store) => {
      store.set(agentsAtom, [
        {
          ...AGENT,
          tasks: [
            {
              id: "t1",
              kind: "background",
              status: "running",
              description: "a long build",
              startedTs: Date.now() - 10 * LONG_WAIT_MS,
            },
          ],
        },
      ]);
      store.set(uiModeAtom, { mode: "fishing" });
    },
  },
  {
    name: "ShopDialog",
    element: <ShopDialog />,
    open: mode({ mode: "shop", shop: "skills" }),
  },
  {
    name: "EditorDialog",
    element: <EditorDialog />,
    open: mode({ mode: "editor" }),
  },
  { name: "HelpDialog", element: <HelpDialog />, open: mode({ mode: "help" }) },
  {
    name: "TutorialDialog",
    element: <TutorialDialog />,
    open: mode({ mode: "tutorial" }),
  },
  {
    name: "CheatConsole",
    element: <CheatConsole />,
    open: mode({ mode: "cheat" }),
  },
  {
    name: "Chronicle",
    element: <Chronicle />,
    open: (store) => store.set(chronicleOpenAtom, true),
    modal: false,
  },
  {
    name: "DebugOverlay",
    element: <DebugOverlay />,
    open: (store) => store.set(debugOverlayAtom, true),
    modal: false,
  },
];

function open(testCase: Case) {
  const store = createStore();
  testCase.open(store);
  render(<Provider store={store}>{testCase.element}</Provider>);
  return store;
}

describe.each(CASES)("$name", (testCase) => {
  it("is a labelled dialog", () => {
    open(testCase);
    const panel = screen.getByRole("dialog");
    expect(panel.getAttribute("aria-label")).toBeTruthy();
    if (testCase.modal === false) {
      expect(panel).not.toHaveAttribute("aria-modal");
    } else {
      expect(panel).toHaveAttribute("aria-modal", "true");
    }
  });

  it("closes on Escape", () => {
    const store = open(testCase);
    const panel = screen.getByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    if (testCase.closesTo) {
      expect(store.get(uiModeAtom)).toEqual(testCase.closesTo);
    }
    expect(panel).not.toBeInTheDocument();
  });

  it("offers every one of its controls to the keyboard", () => {
    open(testCase);
    const panel = screen.getByRole("dialog");
    const clickable = panel.querySelectorAll("[onclick], button, a[href]");
    for (const el of Array.from(clickable)) {
      // A native button or link is reachable by Tab; a clickable div is not.
      expect(["BUTTON", "A"]).toContain(el.tagName);
      expect(el).not.toHaveAttribute("tabindex", "-1");
    }
  });
});
