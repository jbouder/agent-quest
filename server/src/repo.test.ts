import { describe, expect, it } from "vitest";
import type { SideQuest } from "../../shared/protocol";
import {
  balanceBoard,
  districtOf,
  findRepoRoot,
  listDistricts,
  newContributors,
  parseOutdated,
  parseRevertedShas,
  untouchedFiles,
} from "./repo";

const ROOT = "/home/dev/project";
const DISTRICTS = ["server", "web", "shared"];

describe("districtOf", () => {
  it("maps a file to its top-level directory", () => {
    expect(districtOf(`${ROOT}/server/src/index.ts`, ROOT, DISTRICTS)).toBe(
      "server",
    );
    expect(districtOf(`${ROOT}/web/vite.config.ts`, ROOT, DISTRICTS)).toBe(
      "web",
    );
  });

  it("returns null for root files, unknown dirs, and outside paths", () => {
    expect(districtOf(`${ROOT}/README.md`, ROOT, DISTRICTS)).toBeNull();
    expect(districtOf(`${ROOT}/scripts/x.sh`, ROOT, DISTRICTS)).toBeNull();
    expect(districtOf("/tmp/other/file.ts", ROOT, DISTRICTS)).toBeNull();
  });
});

describe("parseRevertedShas", () => {
  it("pulls the original sha out of a git revert body", () => {
    const log = `Revert "Add the thing"

This reverts commit 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b.
`;
    expect(parseRevertedShas(log)).toEqual([
      "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    ]);
  });

  it("handles several reverts in one log and dedupes", () => {
    const log = `This reverts commit aaaaaaa.
This reverts commit bbbbbbb.
This reverts commit AAAAAAA.
`;
    expect(parseRevertedShas(log)).toEqual(["aaaaaaa", "bbbbbbb"]);
  });

  it("ignores commits that merely talk about reverting", () => {
    const log = `Consider whether we should revert commit foo later
Reverting is not the same as this reverts commit-ish text
`;
    expect(parseRevertedShas(log)).toEqual([]);
  });

  it("is empty for ordinary history", () => {
    expect(parseRevertedShas("Add a feature\n\nFix a bug\n")).toEqual([]);
  });
});

describe("untouchedFiles", () => {
  it("is everything tracked that no recent commit touched", () => {
    expect(untouchedFiles(["a.ts", "b.ts", "c.ts"], ["b.ts"])).toEqual([
      "a.ts",
      "c.ts",
    ]);
  });

  it("is empty when everything was touched", () => {
    expect(untouchedFiles(["a.ts"], ["a.ts", "gone.ts"])).toEqual([]);
  });

  it("drops blank lines from git output", () => {
    expect(untouchedFiles(["a.ts", ""], [])).toEqual(["a.ts"]);
  });
});

describe("newContributors", () => {
  const DAY = 86_400;
  const now = 1_700_000_000_000; // fixed clock; the helper takes nowMs
  const nowUnix = now / 1000;

  it("finds someone who just arrived with a couple of commits", () => {
    const log = [
      `Newcomer\t${nowUnix - 3 * DAY}`,
      `Newcomer\t${nowUnix - 1 * DAY}`,
      `Veteran\t${nowUnix - 900 * DAY}`,
      `Veteran\t${nowUnix - 1 * DAY}`,
    ].join("\n");

    expect(newContributors(log, now)).toEqual([
      { name: "Newcomer", commits: 2, firstUnix: nowUnix - 3 * DAY },
    ]);
  });

  it("ignores a long-timer even if they committed today", () => {
    const log = `Veteran\t${nowUnix - 900 * DAY}\nVeteran\t${nowUnix}`;
    expect(newContributors(log, now)).toEqual([]);
  });

  it("ignores a newcomer who is already prolific", () => {
    const log = Array.from(
      { length: 9 },
      (_, i) => `Busy\t${nowUnix - i * DAY}`,
    ).join("\n");
    expect(newContributors(log, now)).toEqual([]);
  });

  it("keeps names containing tabs' worth of spaces intact", () => {
    const log = `Ada B. Lovelace\t${nowUnix - DAY}`;
    expect(newContributors(log, now)[0]?.name).toBe("Ada B. Lovelace");
  });

  it("tolerates empty or malformed logs", () => {
    expect(newContributors("", now)).toEqual([]);
    expect(newContributors("garbage\n", now)).toEqual([]);
  });
});

describe("parseOutdated", () => {
  it("reports packages whose latest differs from current", () => {
    const json = JSON.stringify({
      left: { current: "1.0.0", wanted: "1.0.0", latest: "2.0.0" },
      right: { current: "3.1.0", wanted: "3.1.0", latest: "3.1.0" },
    });
    expect(parseOutdated(json)).toEqual([
      { name: "left", current: "1.0.0", latest: "2.0.0" },
    ]);
  });

  it("falls back to the wanted version when current is absent", () => {
    const json = JSON.stringify({ p: { wanted: "1.0.0", latest: "2.0.0" } });
    expect(parseOutdated(json)[0]?.current).toBe("1.0.0");
  });

  it("is empty for no output or junk, since npm may print neither", () => {
    expect(parseOutdated("")).toEqual([]);
    expect(parseOutdated("not json")).toEqual([]);
    expect(parseOutdated("{}")).toEqual([]);
  });
});

describe("balanceBoard", () => {
  const quest = (kind: SideQuest["kind"], n: number): SideQuest => ({
    id: `${kind}${n}`,
    kind,
    icon: "x",
    title: `${kind} ${n}`,
    detail: "",
    suggestedTask: "",
  });

  it("stops one prolific kind from taking every slot", () => {
    const quests = [
      ...Array.from({ length: 8 }, (_, i) => quest("docs", i)),
      quest("merchant", 0),
    ];
    const board = balanceBoard(quests, 8);
    expect(board.map((q) => q.kind)).toContain("merchant");
    expect(board.filter((q) => q.kind === "docs")).toHaveLength(7);
  });

  it("preserves each kind's own ranking", () => {
    const quests = [quest("bounty", 0), quest("bounty", 1), quest("docs", 0)];
    const board = balanceBoard(quests, 3);
    const bounties = board.filter((q) => q.kind === "bounty");
    expect(bounties.map((q) => q.id)).toEqual(["bounty0", "bounty1"]);
  });

  it("returns everything when the board isn't full", () => {
    const quests = [quest("docs", 0), quest("weeds", 0)];
    expect(balanceBoard(quests, 8)).toHaveLength(2);
  });

  it("terminates on an empty list rather than spinning", () => {
    expect(balanceBoard([], 8)).toEqual([]);
  });
});

describe("repo scanning on this actual repo", () => {
  it("finds the repo root from a nested cwd", () => {
    const root = findRepoRoot(process.cwd());
    expect(root.endsWith("agent-quest")).toBe(true);
  });

  it("lists top-level districts, skipping dotdirs and node_modules", () => {
    const districts = listDistricts(findRepoRoot(process.cwd()));
    expect(districts).toContain("server");
    expect(districts).toContain("web");
    expect(districts).not.toContain("node_modules");
    expect(districts).not.toContain(".git");
  });
});
