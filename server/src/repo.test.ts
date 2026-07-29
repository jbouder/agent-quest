import { describe, expect, it } from "vitest";
import { districtOf, findRepoRoot, listDistricts } from "./repo";

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
