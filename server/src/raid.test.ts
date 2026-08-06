import { describe, expect, it } from "vitest";
import type { AgentSnapshot, Quest } from "../../shared/protocol";
import { detectRaid, isSameRaid, raidProgress } from "./raid";

const TS = 1_700_000_000_000;

function agent(over: Partial<AgentSnapshot>): AgentSnapshot {
  return {
    id: "a",
    label: "Agent",
    task: "t",
    cwd: "/repo",
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
  };
}

const party = (n: number, cwd = "/repo") =>
  Array.from({ length: n }, (_, i) => agent({ id: `a${i}`, cwd }));

describe("detectRaid", () => {
  it("forms once enough agents share a working directory", () => {
    const raid = detectRaid(party(3), TS);
    expect(raid).toMatchObject({ cwd: "/repo", startedTs: TS });
    expect(raid?.agentIds).toEqual(["a0", "a1", "a2"]);
  });

  it("stays quiet below the threshold — two agents is just a busy village", () => {
    expect(detectRaid(party(2), TS)).toBeNull();
  });

  it("does not count agents spread across different repos", () => {
    const agents = [
      agent({ id: "a", cwd: "/one" }),
      agent({ id: "b", cwd: "/two" }),
      agent({ id: "c", cwd: "/three" }),
    ];
    expect(detectRaid(agents, TS)).toBeNull();
  });

  it("ignores agents that have ended or errored", () => {
    const agents = [
      ...party(2),
      agent({ id: "gone", status: "ended" }),
      agent({ id: "broken", status: "error" }),
    ];
    expect(detectRaid(agents, TS)).toBeNull();
  });

  it("picks the largest party when two repos are both busy", () => {
    const agents = [...party(3, "/small"), ...party(4, "/big")];
    expect(detectRaid(agents, TS)?.cwd).toBe("/big");
  });

  it("counts a sleeping party member — the fight is paused, not over", () => {
    const agents = [...party(2), agent({ id: "z", status: "sleeping" })];
    expect(detectRaid(agents, TS)?.agentIds).toHaveLength(3);
  });
});

describe("raidProgress", () => {
  const quest = (status: Quest["status"]): Quest => ({ title: "q", status });

  it("is the completed share of the party's combined quest logs", () => {
    const agents = [
      agent({ quests: [quest("completed"), quest("pending")] }),
      agent({ quests: [quest("completed"), quest("in_progress")] }),
    ];
    expect(raidProgress(agents)).toBe(0.5);
  });

  it("reads zero rather than inventing a number with no quest logs", () => {
    expect(raidProgress(party(3))).toBe(0);
  });

  it("is 1 when the party has finished everything", () => {
    expect(raidProgress([agent({ quests: [quest("completed")] })])).toBe(1);
  });
});

describe("isSameRaid", () => {
  it("treats a party gaining a member as the same fight", () => {
    const before = detectRaid(party(3), TS);
    const after = detectRaid(party(4), TS);
    expect(isSameRaid(before, after)).toBe(true);
  });

  it("treats a different repo as a new fight", () => {
    expect(
      isSameRaid(
        detectRaid(party(3, "/one"), TS),
        detectRaid(party(3, "/two"), TS),
      ),
    ).toBe(false);
  });

  it("handles the null cases", () => {
    expect(isSameRaid(null, null)).toBe(true);
    expect(isSameRaid(detectRaid(party(3), TS), null)).toBe(false);
  });
});
