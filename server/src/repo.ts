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

/** Top-level directories, for journal text and quest scans (§12). */
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
 * §12 — map a tool-call file path to its top-level directory, so module
 * context can surface as journal text (the geographic mapping was dropped).
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

/** Current HEAD sha, or null outside a git repo. */
export async function headSha(root: string): Promise<string | null> {
  try {
    return (await git(root, ["rev-parse", "HEAD"])).trim() || null;
  } catch {
    return null;
  }
}

/**
 * §9c — pull the shas that recent commits undo. `git revert` records the
 * original in the body as "This reverts commit <sha>.", which is the only
 * machine-readable link between a revert and what it reverted.
 */
export function parseRevertedShas(log: string): string[] {
  const shas: string[] = [];
  const pattern = /This reverts commit ([0-9a-f]{7,40})/gi;
  for (const match of log.matchAll(pattern)) {
    const sha = match[1]?.toLowerCase();
    if (sha && !shas.includes(sha)) shas.push(sha);
  }
  return shas;
}

/** §9c — scan recent history for reverts. */
export async function findRevertedShas(
  root: string,
  limit = 60,
): Promise<string[]> {
  try {
    return parseRevertedShas(
      await git(root, ["log", `-${limit}`, "--format=%B"]),
    );
  } catch {
    return [];
  }
}

const STALE_BRANCH_DAYS = 14;
/** §9b ruins — code untouched this long reads as overgrown. */
const UNTOUCHED_DAYS = 180;
/** Below this share of the tree, the debt isn't worth a standing ruin. */
const RUINS_MIN_SHARE = 0.25;
/** §9b escort — how recently a first commit counts as "just arrived". */
const NEW_CONTRIBUTOR_DAYS = 30;
const NEW_CONTRIBUTOR_MAX_COMMITS = 5;

/**
 * §9b overgrown ruins — tech debt as "code nobody has touched in months".
 * Everything tracked, minus everything a recent commit touched.
 */
export function untouchedFiles(
  allFiles: string[],
  recentlyTouched: string[],
): string[] {
  const recent = new Set(recentlyTouched);
  return allFiles.filter((file) => file.length > 0 && !recent.has(file));
}

/** §9b escort — authors who have only just started committing here. */
export function newContributors(
  log: string,
  nowMs = Date.now(),
): { name: string; commits: number; firstUnix: number }[] {
  const byAuthor = new Map<string, { commits: number; firstUnix: number }>();
  for (const line of log.trim().split("\n")) {
    if (!line) continue;
    const separator = line.lastIndexOf("\t");
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim();
    const unix = Number(line.slice(separator + 1));
    if (!name || !Number.isFinite(unix)) continue;
    const entry = byAuthor.get(name);
    if (entry) {
      entry.commits += 1;
      entry.firstUnix = Math.min(entry.firstUnix, unix);
    } else {
      byAuthor.set(name, { commits: 1, firstUnix: unix });
    }
  }

  const cutoff = nowMs / 1000 - NEW_CONTRIBUTOR_DAYS * 86_400;
  return [...byAuthor.entries()]
    .filter(
      ([, e]) =>
        e.firstUnix >= cutoff && e.commits <= NEW_CONTRIBUTOR_MAX_COMMITS,
    )
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => b.firstUnix - a.firstUnix);
}

/**
 * §9a — the board holds a fixed number of notices, and one prolific scanner
 * shouldn't take every slot: a repo with eight undocumented directories would
 * otherwise never show the merchant or the ruins. Round-robin across kinds so
 * the board stays a survey of the repo rather than a list of one complaint.
 */
export function balanceBoard(quests: SideQuest[], cap: number): SideQuest[] {
  const byKind = new Map<SideQuest["kind"], SideQuest[]>();
  for (const quest of quests) {
    const bucket = byKind.get(quest.kind);
    if (bucket) bucket.push(quest);
    else byKind.set(quest.kind, [quest]);
  }

  const picked: SideQuest[] = [];
  // Buckets keep insertion order, so a kind's own ranking is preserved.
  const buckets = [...byKind.values()];
  for (let round = 0; picked.length < cap; round++) {
    const before = picked.length;
    for (const bucket of buckets) {
      if (picked.length >= cap) break;
      const quest = bucket[round];
      if (quest) picked.push(quest);
    }
    if (picked.length === before) break; // every bucket exhausted
  }
  return picked;
}

/**
 * §9b traveling merchant — `npm outdated` exits non-zero precisely when it
 * has something to say, so a rejection here is the interesting case.
 */
export function parseOutdated(
  json: string,
): { name: string; current: string; latest: string }[] {
  try {
    const parsed = JSON.parse(json) as Record<
      string,
      { current?: string; latest?: string; wanted?: string }
    >;
    return Object.entries(parsed)
      .filter(([, info]) => info.latest && info.current !== info.latest)
      .map(([name, info]) => ({
        name,
        current: info.current ?? info.wanted ?? "?",
        latest: info.latest ?? "?",
      }));
  } catch {
    return [];
  }
}

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
        detail: "No README in this directory.",
        suggestedTask: `Write a concise README.md for the ${district}/ directory explaining what it contains and how it fits into the project.`,
      });
    }
  }

  // §9b overgrown ruins = tech debt, measured as code nobody has touched
  try {
    const [tracked, touched] = await Promise.all([
      git(root, ["ls-files"]),
      git(root, [
        "log",
        `--since=${UNTOUCHED_DAYS}.days`,
        "--name-only",
        "--format=",
      ]),
    ]);
    const allFiles = tracked.trim().split("\n").filter(Boolean);
    const untouched = untouchedFiles(
      allFiles,
      touched.trim().split("\n").filter(Boolean),
    );
    const share = allFiles.length > 0 ? untouched.length / allFiles.length : 0;
    if (share >= RUINS_MIN_SHARE && untouched.length >= 5) {
      // Name the worst district so the ruin points somewhere, not everywhere.
      const perDistrict = new Map<string, number>();
      for (const file of untouched) {
        const top = file.includes("/")
          ? (file.split("/")[0] ?? file)
          : "(root)";
        perDistrict.set(top, (perDistrict.get(top) ?? 0) + 1);
      }
      const worst = [...perDistrict.entries()].sort((a, b) => b[1] - a[1])[0];
      sideQuests.push({
        id: "ruins:untouched",
        kind: "ruins",
        icon: "🏚",
        title: `Overgrown ruins: ${untouched.length} files untouched for ${UNTOUCHED_DAYS}+ days`,
        detail: `${Math.round(share * 100)}% of the tree, worst in ${worst?.[0] ?? "the repo"}.`,
        suggestedTask: `Look at ${worst ? `the ${worst[0]} area` : "this repo"} for code that hasn't been touched in over ${UNTOUCHED_DAYS} days. Report which of it is dead and safe to delete, which is stable and fine to leave, and which is quietly rotting. Don't change anything yet.`,
      });
    }
  } catch {
    // not a git repo
  }

  // §9b trickster enemy = flaky tests: the ones already skipped or retried
  try {
    // Scoped to test files: otherwise any file that merely *describes* a
    // skip pattern — including this scanner — reports itself as flaky.
    const out = await git(root, [
      "grep",
      "-l",
      "-E",
      String.raw`(it|test|describe)\.(skip|todo|failing)|\bxit\(|\bxdescribe\(|@flaky|retries?\s*[:(]`,
      "--",
      "*test*",
      "*spec*",
      "*Test*",
      "*Spec*",
    ]);
    const files = out.trim().split("\n").filter(Boolean);
    if (files.length > 0) {
      sideQuests.push({
        id: "trickster:flaky",
        kind: "trickster",
        icon: "🃏",
        title: `A trickster haunts ${files.length} test file${files.length === 1 ? "" : "s"}`,
        detail: "Skipped, todo, or retried tests — it only shows up sometimes.",
        suggestedTask: `Find the skipped, todo, and retried tests in this repo (starting with ${files.slice(0, 3).join(", ")}) and report why each was disabled. Fix the ones that are safe to re-enable; leave the rest with a note on what would need to change.`,
      });
    }
  } catch {
    // git grep exits non-zero when nothing matches
  }

  // §9b escort quest = onboarding a contributor who has just arrived
  try {
    const out = await git(root, ["log", "--format=%an\t%at", "-500"]);
    const arrivals = newContributors(out);
    for (const person of arrivals.slice(0, 1)) {
      sideQuests.push({
        id: `escort:${person.name}`,
        kind: "escort",
        icon: "🧭",
        title: `A traveler has arrived: ${person.name}`,
        detail: `${person.commits} commit${person.commits === 1 ? "" : "s"}, first one ${Math.max(0, Math.round((Date.now() / 1000 - person.firstUnix) / 86_400))} days ago.`,
        suggestedTask: `A new contributor (${person.name}) has just started committing here. Check that the setup path actually works for someone new: read the README and any CONTRIBUTING docs, try to follow them, and report the first place a newcomer would get stuck.`,
      });
    }
  } catch {
    // no git history to read
  }

  // §9b traveling merchant = dependency updates
  const merchant = await scanOutdatedDeps(root);
  if (merchant) sideQuests.push(merchant);

  // §9d town crier — recent commits as the current-events digest
  try {
    const out = await git(root, ["log", "--oneline", "-6"]);
    recentCommits = out.trim().split("\n").filter(Boolean);
  } catch {
    recentCommits = [];
  }

  return { sideQuests: balanceBoard(sideQuests, 8), recentCommits };
}

/**
 * §9b — the merchant only visits repos with a package.json. `npm outdated`
 * exits 1 when it finds updates, so its stdout matters more than its status.
 */
async function scanOutdatedDeps(root: string): Promise<SideQuest | null> {
  if (!existsSync(join(root, "package.json"))) return null;
  let stdout = "";
  try {
    ({ stdout } = await run("npm", ["outdated", "--json"], {
      cwd: root,
      timeout: 20_000,
    }));
  } catch (error) {
    // Non-zero exit still carries the report; a timeout or missing npm doesn't.
    stdout = (error as { stdout?: string }).stdout ?? "";
  }
  const outdated = parseOutdated(stdout);
  if (outdated.length === 0) return null;

  const sample = outdated
    .slice(0, 3)
    .map((dep) => `${dep.name} ${dep.current}→${dep.latest}`)
    .join(", ");
  return {
    id: "merchant:deps",
    kind: "merchant",
    icon: "🛒",
    title: `A traveling merchant has ${outdated.length} update${outdated.length === 1 ? "" : "s"}`,
    detail: `${sample}${outdated.length > 3 ? ", and more" : ""}.`,
    suggestedTask: `Review the outdated dependencies in this repo (${sample}). For each, check the changelog for breaking changes and report which are safe to bump now. Bump only the safe ones, and run the tests afterwards.`,
  };
}
