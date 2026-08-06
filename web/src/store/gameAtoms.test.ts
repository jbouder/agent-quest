import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import type { AgentSnapshot, AgentTask } from "@/lib/protocol";
import { agentsAtom, LONG_WAIT_MS, longWaitAtom } from "./gameAtoms";

function agentWith(tasks: AgentTask[], label = "Agent 1"): AgentSnapshot {
  return {
    id: "a1",
    label,
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
    tasks,
    commits: [],
    rewound: false,
    forkedFrom: null,
  };
}

const task = (over: Partial<AgentTask>): AgentTask => ({
  id: "t1",
  description: "run the suite",
  kind: "background",
  status: "running",
  startedTs: Date.now(),
  ...over,
});

/** §9b — the dock opens only for a wait that is genuinely long. */
describe("longWaitAtom", () => {
  const read = (agents: AgentSnapshot[]) => {
    const store = createStore();
    store.set(agentsAtom, agents);
    return store.get(longWaitAtom);
  };

  it("reports a background task that has been running a while", () => {
    const started = Date.now() - LONG_WAIT_MS - 1000;
    expect(
      read([agentWith([task({ startedTs: started })], "Builder")]),
    ).toEqual({ agentLabel: "Builder", description: "run the suite" });
  });

  it("stays closed for a background task that just started", () => {
    expect(read([agentWith([task({ startedTs: Date.now() })])])).toBeNull();
  });

  it("ignores subagents — those are the party, not a wait", () => {
    const started = Date.now() - LONG_WAIT_MS - 1000;
    expect(
      read([agentWith([task({ kind: "subagent", startedTs: started })])]),
    ).toBeNull();
  });

  it("closes once the long task finishes", () => {
    const started = Date.now() - LONG_WAIT_MS - 1000;
    expect(
      read([agentWith([task({ status: "completed", startedTs: started })])]),
    ).toBeNull();
  });

  it("is null with no agents at all", () => {
    expect(read([])).toBeNull();
  });
});
