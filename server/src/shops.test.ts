import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShopItem } from "../../shared/protocol";
import {
  installedMcpServers,
  installedPlugins,
  installedSkills,
  installMcp,
  installPlugin,
  type McpServerSpec,
  markInstalled,
  mcpServerConfig,
  parseMcpRegistry,
  parsePluginMarketplace,
  parseSkillFrontmatter,
  removeMcp,
  removePlugin,
} from "./shops";

describe("parseSkillFrontmatter", () => {
  it("reads name and description from real SKILL.md frontmatter", () => {
    const md = `---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files.
license: Proprietary
---

# PDF Processing Guide`;
    expect(parseSkillFrontmatter(md)).toEqual({
      name: "pdf",
      description:
        "Use this skill whenever the user wants to do anything with PDF files.",
    });
  });

  it("folds indented continuation lines into the value", () => {
    const md = `---
name: long
description: first line
  and the second line
---`;
    expect(parseSkillFrontmatter(md)?.description).toBe(
      "first line and the second line",
    );
  });

  it("returns null without frontmatter or required fields", () => {
    expect(parseSkillFrontmatter("# Just a heading")).toBeNull();
    expect(parseSkillFrontmatter("---\nname: x\n---")).toBeNull();
  });
});

describe("parsePluginMarketplace", () => {
  it("maps the official marketplace.json shape to shelf items", () => {
    const items = parsePluginMarketplace({
      name: "claude-code-plugins",
      plugins: [
        {
          name: "agent-sdk-dev",
          description: "Development kit for the Agent SDK",
          category: "development",
        },
        { description: "nameless — skipped" },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "agent-sdk-dev",
      kind: "plugins",
      detail: "development",
    });
  });

  it("is empty for junk", () => {
    expect(parsePluginMarketplace(null)).toEqual([]);
    expect(parsePluginMarketplace({ plugins: "nope" })).toEqual([]);
  });
});

describe("parseMcpRegistry", () => {
  const entry = (over: Record<string, unknown>) => ({
    server: {
      name: "com.example/thing",
      title: "Thing",
      description: "does things",
      version: "1.0.0",
      ...over,
    },
  });

  it("keeps servers with a remote or an npm package, dropping the rest", () => {
    const specs = parseMcpRegistry({
      servers: [
        entry({ remotes: [{ type: "streamable-http", url: "https://x/mcp" }] }),
        entry({
          name: "com.example/npm-only",
          packages: [{ registryType: "npm", identifier: "@x/server" }],
        }),
        entry({ name: "com.example/neither" }),
      ],
    });
    expect(specs.map((spec) => spec.name)).toEqual([
      "com.example/thing",
      "com.example/npm-only",
    ]);
  });

  it("dedupes by name, keeping the first (latest) entry", () => {
    const specs = parseMcpRegistry({
      servers: [
        entry({ version: "2.0.0", remotes: [{ url: "https://x" }] }),
        entry({ version: "1.0.0", remotes: [{ url: "https://x" }] }),
      ],
    });
    expect(specs).toHaveLength(1);
    expect(specs[0]?.version).toBe("2.0.0");
  });

  it("drops entries the registry marks as not active", () => {
    const specs = parseMcpRegistry({
      servers: [
        {
          ...entry({ remotes: [{ url: "https://x" }] }),
          _meta: {
            "io.modelcontextprotocol.registry/official": { status: "deleted" },
          },
        },
      ],
    });
    expect(specs).toEqual([]);
  });
});

describe("mcpServerConfig", () => {
  const base: McpServerSpec = {
    name: "n",
    title: "t",
    description: "",
    version: "1",
  };

  it("maps remotes to http/sse configs and packages to npx", () => {
    expect(
      mcpServerConfig({
        ...base,
        remote: { type: "streamable-http", url: "https://x" },
      }),
    ).toEqual({ type: "http", url: "https://x" });
    expect(
      mcpServerConfig({ ...base, remote: { type: "sse", url: "https://y" } }),
    ).toEqual({ type: "sse", url: "https://y" });
    expect(mcpServerConfig({ ...base, npmPackage: "@x/server" })).toEqual({
      command: "npx",
      args: ["-y", "@x/server"],
    });
    expect(mcpServerConfig(base)).toBeNull();
  });
});

describe("markInstalled", () => {
  it("stamps the installed flag from the id set", () => {
    const items: ShopItem[] = [
      {
        id: "a",
        kind: "skills",
        name: "a",
        description: "",
        detail: "",
        installed: false,
      },
      {
        id: "b",
        kind: "skills",
        name: "b",
        description: "",
        detail: "",
        installed: true,
      },
    ];
    const marked = markInstalled(items, new Set(["a"]));
    expect(marked.map((item) => item.installed)).toEqual([true, false]);
  });
});

describe("config install/remove round-trips on a scratch repo", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aq-shops-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("plugin install writes the documented settings keys, remove clears them", async () => {
    await installPlugin(root, "agent-sdk-dev");
    expect(installedPlugins(root).has("agent-sdk-dev")).toBe(true);

    const settings = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(join(root, ".claude", "settings.json"), "utf8"),
      ),
    );
    expect(settings.enabledPlugins["agent-sdk-dev@claude-code-plugins"]).toBe(
      true,
    );
    expect(
      settings.extraKnownMarketplaces["claude-code-plugins"].source,
    ).toEqual({ source: "github", repo: "anthropics/claude-code" });

    await removePlugin(root, "agent-sdk-dev");
    expect(installedPlugins(root).has("agent-sdk-dev")).toBe(false);
  });

  it("plugin install preserves unrelated settings", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(
      join(root, ".claude", "settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } }),
    );
    await installPlugin(root, "pr-review");
    const settings = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(join(root, ".claude", "settings.json"), "utf8"),
      ),
    );
    expect(settings.permissions).toEqual({ allow: ["Bash(ls:*)"] });
  });

  it("mcp install writes .mcp.json, remove deletes only that entry", async () => {
    await installMcp(root, {
      name: "com.example/thing",
      title: "Thing",
      description: "",
      version: "1",
      remote: { type: "streamable-http", url: "https://x/mcp" },
    });
    await installMcp(root, {
      name: "com.example/other",
      title: "Other",
      description: "",
      version: "1",
      npmPackage: "@x/other",
    });
    expect([...installedMcpServers(root)].sort()).toEqual([
      "com.example/other",
      "com.example/thing",
    ]);

    await removeMcp(root, "com.example/thing");
    expect([...installedMcpServers(root)]).toEqual(["com.example/other"]);
  });

  it("detects skills by directory presence", async () => {
    await mkdir(join(root, ".claude", "skills", "pdf"), { recursive: true });
    expect(installedSkills(root).has("pdf")).toBe(true);
    expect(installedSkills(root).has("docx")).toBe(false);
  });
});
