import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { SideQuest } from "../../shared/protocol";

const run = promisify(execFile);

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  "venv",
  "__pycache__",
]);

/** Walk up from `start` to the enclosing git repo root; fall back to start. */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** §1/§12 — one house per top-level directory, capped to stay readable. */
export function listDistricts(root: string, cap = 8): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !IGNORED_DIRS.has(entry.name),
      )
      .map((entry) => entry.name)
      .sort()
      .slice(0, cap);
  } catch {
    return [];
  }
}

/** §14 memory tome — the CLAUDE.md nearest to the agent's cwd, if any. */
export function readTome(cwd: string): string | null {
  for (const dir of [cwd, findRepoRoot(cwd)]) {
    try {
      const text = readFileSync(join(dir, "CLAUDE.md"), "utf8").trim();
      if (text.length > 0) return text.slice(0, 1500);
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * §1 — map a tool-call file path to its district (top-level directory).
 * Returns null for paths outside the repo or files at the root.
 */
export function districtOf(
  filePath: string,
  root: string,
  districts: string[],
): string | null {
  if (!filePath.startsWith(`${root}/`)) return null;
  const relative = filePath.slice(root.length + 1);
  const top = relative.split("/")[0];
  return top && districts.includes(top) ? top : null;
}

const STALE_BRANCH_DAYS = 14;

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: root, timeout: 10_000 });
  return stdout;
}

/** §9a/§9b — scan the repo for side quests to post on the board. */
export async function scanQuestBoard(root: string): Promise<{
  sideQuests: SideQuest[];
  recentCommits: string[];
}> {
  const sideQuests: SideQuest[] = [];
  let recentCommits: string[] = [];

  // §9b weeds on the path = stale branches
  try {
    const out = await git(root, [
      "for-each-ref",
      "--format=%(refname:short)\t%(committerdate:unix)",
      "refs/heads",
    ]);
    const now = Date.now() / 1000;
    for (const line of out.trim().split("\n")) {
      const [branch, unix] = line.split("\t");
      if (!branch || !unix || branch === "main" || branch === "master")
        continue;
      const ageDays = (now - Number(unix)) / 86_400;
      if (ageDays > STALE_BRANCH_DAYS) {
        sideQuests.push({
          id: `weeds:${branch}`,
          kind: "weeds",
          icon: "🌿",
          title: `Weeds on the path: ${branch}`,
          detail: `Branch untouched for ${Math.round(ageDays)} days.`,
          suggestedTask: `Look at the git branch '${branch}' — summarize what it contains and whether it can be merged, rebased, or deleted. Don't delete anything without asking.`,
        });
      }
    }
  } catch {
    // not a git repo, or git unavailable
  }

  // §9b bounty board = TODO/FIXME findings, grouped by district
  try {
    const out = await git(root, [
      "grep",
      "-c",
      "-E",
      "TODO|FIXME",
      "--",
      ":!*.lock",
      ":!package-lock.json",
    ]);
    const perDistrict = new Map<string, number>();
    for (const line of out.trim().split("\n")) {
      const [file, count] = line.split(":");
      if (!file || !count) continue;
      const top = file.includes("/") ? (file.split("/")[0] ?? file) : "(root)";
      perDistrict.set(top, (perDistrict.get(top) ?? 0) + Number(count));
    }
    const ranked = [...perDistrict.entries()].sort((a, b) => b[1] - a[1]);
    for (const [district, count] of ranked.slice(0, 3)) {
      sideQuests.push({
        id: `bounty:${district}`,
        kind: "bounty",
        icon: "🪙",
        title: `Bounty: ${count} TODO/FIXME in ${district}`,
        detail: "Small reward for clearing lingering markers.",
        suggestedTask: `Find the TODO and FIXME comments under ${district === "(root)" ? "the repo root" : `the ${district}/ directory`} and fix the easy ones. List any that need a human decision instead of guessing.`,
      });
    }
  } catch {
    // git grep exits non-zero when nothing matches — that's fine
  }

  // §9b villager with a question mark = documentation gaps
  for (const district of listDistricts(root)) {
    const hasDocs = ["README.md", "README.rst", "readme.md"].some((name) =>
      existsSync(join(root, district, name)),
    );
    if (!hasDocs) {
      sideQuests.push({
        id: `docs:${district}`,
        kind: "docs",
        icon: "❓",
        title: `A villager is confused about ${district}/`,
        detail: "No README in this district.",
        suggestedTask: `Write a concise README.md for the ${district}/ directory explaining what it contains and how it fits into the project.`,
      });
    }
  }

  // §9d town crier — recent commits as the current-events digest
  try {
    const out = await git(root, ["log", "--oneline", "-6"]);
    recentCommits = out.trim().split("\n").filter(Boolean);
  } catch {
    recentCommits = [];
  }

  return { sideQuests: sideQuests.slice(0, 8), recentCommits };
}
