import { describe, expect, it } from "vitest";
import type { AgentSnapshot, SideQuest } from "@/lib/protocol";
import { pinsFor } from "./MapDialog";

const quest = (kind: SideQuest["kind"]): SideQuest => ({
  id: kind,
  kind,
  icon: "x",
  title: kind,
  detail: "",
  suggestedTask: "",
});

const agent = (over: Partial<AgentSnapshot>): AgentSnapshot => ({
  id: "a",
  label: "Agent",
  task: "t",
  cwd: "/",
  model: "claude-sonnet-5",
  status: "thinking",
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
  ...over,
});

const empty = { sideQuests: [], agents: [], raid: null, longWait: null };

describe("pinsFor", () => {
  it("is quiet when nothing needs attention", () => {
    expect(pinsFor(empty)).toEqual([]);
  });

  it("pins the board count on the square", () => {
    const pins = pinsFor({
      ...empty,
      sideQuests: [quest("docs"), quest("weeds")],
    });
    expect(pins).toEqual([
      { area: "square", icon: "📋", label: "2 quests on the board" },
    ]);
  });

  it("points the merchant at the frontier and the debt at the ruins", () => {
    const pins = pinsFor({
      ...empty,
      sideQuests: [quest("merchant"), quest("ruins")],
    });
    expect(pins.map((pin) => pin.area)).toEqual([
      "square",
      "frontier",
      "ruins",
    ]);
  });

  it("pins the camp only past the village NPC cap", () => {
    const six = Array.from({ length: 6 }, (_, i) => agent({ id: `a${i}` }));
    expect(pinsFor({ ...empty, agents: six })).toEqual([]);

    const eight = Array.from({ length: 8 }, (_, i) => agent({ id: `a${i}` }));
    const pins = pinsFor({ ...empty, agents: eight });
    expect(pins).toEqual([
      { area: "square", icon: "⛺", label: "2 camped agents" },
    ]);
  });

  it("does not count ended or errored agents toward the camp", () => {
    const agents = [
      ...Array.from({ length: 6 }, (_, i) => agent({ id: `a${i}` })),
      agent({ id: "gone", status: "ended" }),
      agent({ id: "hurt", status: "error" }),
    ];
    expect(pinsFor({ ...empty, agents })).toEqual([]);
  });

  it("pins an active raid on the arena and a long wait on the docks", () => {
    const pins = pinsFor({
      ...empty,
      raid: { cwd: "/", agentIds: ["a", "b", "c"], progress: 0, startedTs: 0 },
      longWait: { agentLabel: "Builder", description: "the full CI suite" },
    });
    expect(pins.map((pin) => `${pin.area}:${pin.icon}`)).toEqual([
      "arena:⚔",
      "docks:🎣",
    ]);
  });
});
