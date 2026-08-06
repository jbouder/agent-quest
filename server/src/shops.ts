import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ShopItem, ShopKind, ShopStock } from "../../shared/protocol";

/**
 * §5b — the shops are a real marketplace browser: shelves are stocked from
 * live registries, and buying/selling are genuine configuration changes on
 * the repo. Nothing here spends tokens, so no mana is involved (§5b).
 */

const SKILLS_REPO = "anthropics/skills";
const PLUGIN_MARKETPLACE_REPO = "anthropics/claude-code";
const PLUGIN_MARKETPLACE_NAME = "claude-code-plugins";
const MCP_REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
/** How many MCP servers make a browsable shelf rather than a phone book. */
const MCP_SHELF_SIZE = 40;

// ---------------------------------------------------------------------------
// Pure parsers — testable without the network.
// ---------------------------------------------------------------------------

/** Pull name/description out of a SKILL.md frontmatter block. */
export function parseSkillFrontmatter(
  md: string,
): { name: string; description: string } | null {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;
  const fields = new Map<string, string>();
  let current: string | null = null;
  for (const line of match[1].split(/\r?\n/)) {
    const key = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (key?.[1]) {
      current = key[1];
      fields.set(current, (key[2] ?? "").trim());
    } else if (current && /^\s+\S/.test(line)) {
      // folded multi-line value
      fields.set(current, `${fields.get(current)} ${line.trim()}`.trim());
    }
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (!name || !description) return null;
  return { name, description };
}

/** §5b plugins shop — the official marketplace.json, one item per plugin. */
export function parsePluginMarketplace(json: unknown): ShopItem[] {
  const plugins = (json as { plugins?: unknown[] })?.plugins;
  if (!Array.isArray(plugins)) return [];
  const items: ShopItem[] = [];
  for (const entry of plugins) {
    const plugin = entry as {
      name?: string;
      description?: string;
      category?: string;
      version?: string;
    };
    if (!plugin.name) continue;
    items.push({
      id: plugin.name,
      kind: "plugins",
      name: plugin.name,
      description: plugin.description ?? "",
      detail: [plugin.category, plugin.version].filter(Boolean).join(" · "),
      installed: false,
    });
  }
  return items;
}

/** What an MCP registry entry needs to be installable by us. */
export interface McpServerSpec {
  name: string;
  title: string;
  description: string;
  version: string;
  /** Either a remote endpoint… */
  remote?: { type: string; url: string };
  /** …or an npm package runnable via npx. */
  npmPackage?: string;
}

/** §5b MCP shop — flatten the registry's response to installable specs. */
export function parseMcpRegistry(json: unknown): McpServerSpec[] {
  const entries = (json as { servers?: unknown[] })?.servers;
  if (!Array.isArray(entries)) return [];
  const specs: McpServerSpec[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const wrapped = entry as {
      server?: {
        name?: string;
        title?: string;
        description?: string;
        version?: string;
        remotes?: { type?: string; url?: string }[];
        packages?: {
          registryType?: string;
          registry_type?: string;
          identifier?: string;
        }[];
      };
      _meta?: Record<string, { status?: string; isLatest?: boolean }>;
    };
    const server = wrapped.server;
    if (!server?.name || seen.has(server.name)) continue;

    const official =
      wrapped._meta?.["io.modelcontextprotocol.registry/official"];
    if (official && official.status !== "active") continue;

    const remote = server.remotes?.find((r) => r.url);
    const npm = server.packages?.find(
      (p) => (p.registryType ?? p.registry_type) === "npm" && p.identifier,
    );
    // Only stock what we can actually install: a remote URL or an npm package.
    if (!remote?.url && !npm?.identifier) continue;

    seen.add(server.name);
    specs.push({
      name: server.name,
      title: server.title ?? server.name,
      description: server.description ?? "",
      version: server.version ?? "",
      remote: remote?.url
        ? { type: remote.type ?? "http", url: remote.url }
        : undefined,
      npmPackage: npm?.identifier,
    });
  }
  return specs;
}

/** Map registry remote types onto .mcp.json server config. */
export function mcpServerConfig(
  spec: McpServerSpec,
): Record<string, unknown> | null {
  if (spec.remote) {
    const type = spec.remote.type.includes("sse") ? "sse" : "http";
    return { type, url: spec.remote.url };
  }
  if (spec.npmPackage) {
    return { command: "npx", args: ["-y", spec.npmPackage] };
  }
  return null;
}

/** Stamp the installed flag onto a shelf. */
export function markInstalled(
  items: ShopItem[],
  installedIds: Set<string>,
): ShopItem[] {
  return items.map((item) => ({
    ...item,
    installed: installedIds.has(item.id),
  }));
}

// ---------------------------------------------------------------------------
// Installed-state detection — reads the repo's real configuration.
// ---------------------------------------------------------------------------

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function installedSkills(repoRoot: string): Set<string> {
  try {
    return new Set(
      readdirSync(join(repoRoot, ".claude", "skills"), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
  } catch {
    return new Set();
  }
}

export function installedPlugins(repoRoot: string): Set<string> {
  const settings = readJson(join(repoRoot, ".claude", "settings.json"));
  const enabled = (settings?.enabledPlugins ?? {}) as Record<string, unknown>;
  const ids = new Set<string>();
  for (const [key, value] of Object.entries(enabled)) {
    if (value === false) continue;
    const [name, marketplace] = key.split("@");
    if (name && marketplace === PLUGIN_MARKETPLACE_NAME) ids.add(name);
  }
  return ids;
}

export function installedMcpServers(repoRoot: string): Set<string> {
  const config = readJson(join(repoRoot, ".mcp.json"));
  return new Set(
    Object.keys((config?.mcpServers ?? {}) as Record<string, unknown>),
  );
}

// ---------------------------------------------------------------------------
// Install / uninstall — the real configuration changes (§5b).
// ---------------------------------------------------------------------------

/** Reject ids that could escape their directory when used in a path. */
function safeId(id: string): boolean {
  return /^[\w.-]+$/.test(id) && !id.includes("..");
}

async function writeJsonPretty(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * §5b skills — install by copying the skill's folder out of the official
 * repo into `.claude/skills/<id>/`, exactly where Claude Code looks.
 */
export async function installSkill(
  repoRoot: string,
  id: string,
): Promise<void> {
  if (!safeId(id)) throw new Error(`unsafe skill id: ${id}`);
  const tree = (await fetchJson(
    `https://api.github.com/repos/${SKILLS_REPO}/git/trees/main?recursive=1`,
  )) as { tree?: { path?: string; type?: string }[] };
  const prefix = `skills/${id}/`;
  const files = (tree.tree ?? []).filter(
    (entry) => entry.type === "blob" && entry.path?.startsWith(prefix),
  );
  if (files.length === 0) throw new Error(`no such skill: ${id}`);

  const targetRoot = resolve(repoRoot, ".claude", "skills", id);
  for (const file of files) {
    const relative = (file.path as string).slice(prefix.length);
    const target = resolve(targetRoot, relative);
    // Belt and braces: never write outside the skill's own directory.
    if (!target.startsWith(targetRoot + sep) && target !== targetRoot) {
      throw new Error(`refusing to write outside the skill dir: ${relative}`);
    }
    const response = await fetch(
      `https://raw.githubusercontent.com/${SKILLS_REPO}/main/${file.path}`,
    );
    if (!response.ok) throw new Error(`fetch failed for ${file.path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
}

/** §5b selling back — remove the skill folder we manage, nothing else. */
export async function removeSkill(repoRoot: string, id: string): Promise<void> {
  if (!safeId(id)) throw new Error(`unsafe skill id: ${id}`);
  const target = resolve(repoRoot, ".claude", "skills", id);
  const parent = resolve(repoRoot, ".claude", "skills");
  if (!target.startsWith(parent + sep)) {
    throw new Error(`refusing to remove outside the skills dir: ${id}`);
  }
  await rm(target, { recursive: true, force: true });
}

/**
 * §5b plugins — enable via the documented repo-settings mechanism: register
 * the official marketplace in extraKnownMarketplaces and flip the plugin on
 * in enabledPlugins ("name@marketplace": true).
 */
export async function installPlugin(
  repoRoot: string,
  id: string,
): Promise<void> {
  if (!safeId(id)) throw new Error(`unsafe plugin id: ${id}`);
  const path = join(repoRoot, ".claude", "settings.json");
  const settings = readJson(path) ?? {};
  const marketplaces = (settings.extraKnownMarketplaces ?? {}) as Record<
    string,
    unknown
  >;
  marketplaces[PLUGIN_MARKETPLACE_NAME] ??= {
    source: { source: "github", repo: PLUGIN_MARKETPLACE_REPO },
  };
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>;
  enabled[`${id}@${PLUGIN_MARKETPLACE_NAME}`] = true;
  await writeJsonPretty(path, {
    ...settings,
    extraKnownMarketplaces: marketplaces,
    enabledPlugins: enabled,
  });
}

export async function removePlugin(
  repoRoot: string,
  id: string,
): Promise<void> {
  if (!safeId(id)) throw new Error(`unsafe plugin id: ${id}`);
  const path = join(repoRoot, ".claude", "settings.json");
  const settings = readJson(path);
  if (!settings) return;
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>;
  delete enabled[`${id}@${PLUGIN_MARKETPLACE_NAME}`];
  await writeJsonPretty(path, { ...settings, enabledPlugins: enabled });
}

/** §5b MCP — add the server to the repo's .mcp.json (project scope). */
export async function installMcp(
  repoRoot: string,
  spec: McpServerSpec,
): Promise<void> {
  const config = mcpServerConfig(spec);
  if (!config) throw new Error(`no installable form for ${spec.name}`);
  const path = join(repoRoot, ".mcp.json");
  const current = readJson(path) ?? {};
  const servers = (current.mcpServers ?? {}) as Record<string, unknown>;
  servers[spec.name] = config;
  await writeJsonPretty(path, { ...current, mcpServers: servers });
}

export async function removeMcp(repoRoot: string, id: string): Promise<void> {
  const path = join(repoRoot, ".mcp.json");
  const current = readJson(path);
  if (!current) return;
  const servers = (current.mcpServers ?? {}) as Record<string, unknown>;
  delete servers[id];
  await writeJsonPretty(path, { ...current, mcpServers: servers });
}

// ---------------------------------------------------------------------------
// Stock fetching + the ShopManager.
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "user-agent": "agent-quest" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

async function fetchSkillsShelf(): Promise<ShopItem[]> {
  const listing = (await fetchJson(
    `https://api.github.com/repos/${SKILLS_REPO}/contents/skills`,
  )) as { name?: string; type?: string }[];
  const dirs = listing
    .filter((entry) => entry.type === "dir" && entry.name)
    .map((entry) => entry.name as string);

  const items = await Promise.all(
    dirs.map(async (dir): Promise<ShopItem | null> => {
      try {
        const response = await fetch(
          `https://raw.githubusercontent.com/${SKILLS_REPO}/main/skills/${dir}/SKILL.md`,
          { signal: AbortSignal.timeout(15_000) },
        );
        if (!response.ok) return null;
        const meta = parseSkillFrontmatter(await response.text());
        if (!meta) return null;
        return {
          id: dir,
          kind: "skills",
          name: meta.name,
          description: meta.description,
          detail: `anthropics/skills · ${dir}`,
          installed: false,
        };
      } catch {
        return null;
      }
    }),
  );
  return items.filter((item): item is ShopItem => item !== null);
}

async function fetchPluginsShelf(): Promise<ShopItem[]> {
  const json = await fetchJson(
    `https://raw.githubusercontent.com/${PLUGIN_MARKETPLACE_REPO}/main/.claude-plugin/marketplace.json`,
  );
  return parsePluginMarketplace(json);
}

async function fetchMcpShelf(): Promise<{
  items: ShopItem[];
  specs: Map<string, McpServerSpec>;
}> {
  const json = await fetchJson(`${MCP_REGISTRY}?limit=100&version=latest`);
  const specs = parseMcpRegistry(json).slice(0, MCP_SHELF_SIZE);
  const byId = new Map(specs.map((spec) => [spec.name, spec]));
  return {
    items: specs.map((spec) => ({
      id: spec.name,
      kind: "mcp" as const,
      name: spec.title,
      description: spec.description,
      detail: [spec.version, spec.remote ? "remote" : `npm: ${spec.npmPackage}`]
        .filter(Boolean)
        .join(" · "),
      installed: false,
    })),
    specs: byId,
  };
}

const RESTOCK_MS = 30 * 60 * 1000;

export class ShopManager {
  private stock: Record<ShopKind, ShopStock> = {
    skills: { items: [], fetchedTs: 0, error: null },
    plugins: { items: [], fetchedTs: 0, error: null },
    mcp: { items: [], fetchedTs: 0, error: null },
  };
  private mcpSpecs = new Map<string, McpServerSpec>();

  constructor(
    private repoRoot: string,
    private onChange: () => void,
  ) {
    void this.restock();
    setInterval(() => void this.restock(), RESTOCK_MS).unref();
  }

  /** §5b — the shopkeepers visibly restock from the live registries. */
  async restock(): Promise<void> {
    await Promise.all([
      this.restockOne("skills", fetchSkillsShelf),
      this.restockOne("plugins", fetchPluginsShelf),
      this.restockOne("mcp", async () => {
        const { items, specs } = await fetchMcpShelf();
        this.mcpSpecs = specs;
        return items;
      }),
    ]);
    this.onChange();
  }

  private async restockOne(
    kind: ShopKind,
    fetcher: () => Promise<ShopItem[]>,
  ): Promise<void> {
    try {
      this.stock[kind] = {
        items: await fetcher(),
        fetchedTs: Date.now(),
        error: null,
      };
    } catch (error) {
      // Keep the last good shelf; just note that the wagon is late.
      this.stock[kind] = { ...this.stock[kind], error: String(error) };
    }
  }

  /** The shelves with live installed-state, for the snapshot. */
  snapshot(): Record<ShopKind, ShopStock> {
    const installed: Record<ShopKind, Set<string>> = {
      skills: installedSkills(this.repoRoot),
      plugins: installedPlugins(this.repoRoot),
      mcp: installedMcpServers(this.repoRoot),
    };
    return {
      skills: {
        ...this.stock.skills,
        items: markInstalled(this.stock.skills.items, installed.skills),
      },
      plugins: {
        ...this.stock.plugins,
        items: markInstalled(this.stock.plugins.items, installed.plugins),
      },
      mcp: {
        ...this.stock.mcp,
        items: markInstalled(this.stock.mcp.items, installed.mcp),
      },
    };
  }

  itemName(kind: ShopKind, id: string): string {
    return this.stock[kind].items.find((item) => item.id === id)?.name ?? id;
  }

  async install(kind: ShopKind, id: string): Promise<void> {
    switch (kind) {
      case "skills":
        await installSkill(this.repoRoot, id);
        break;
      case "plugins":
        await installPlugin(this.repoRoot, id);
        break;
      case "mcp": {
        const spec = this.mcpSpecs.get(id);
        if (!spec) throw new Error(`not on the shelf: ${id}`);
        await installMcp(this.repoRoot, spec);
        break;
      }
    }
  }

  async remove(kind: ShopKind, id: string): Promise<void> {
    switch (kind) {
      case "skills":
        await removeSkill(this.repoRoot, id);
        break;
      case "plugins":
        await removePlugin(this.repoRoot, id);
        break;
      case "mcp":
        await removeMcp(this.repoRoot, id);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// §16 demo mode — fake shelves, fake installs, nothing touches disk.
// ---------------------------------------------------------------------------

const DEMO_ITEMS: Record<ShopKind, [string, string][]> = {
  skills: [
    ["potion-brewing", "Brew concoctions from spreadsheet cells."],
    ["cartography", "Draw maps of code nobody remembers writing."],
    ["bardcraft", "Compose ballads about your merge conflicts."],
  ],
  plugins: [
    ["sword-sharpener", "Keeps your linter honed to a killing edge."],
    ["shield-polish", "Buffs your test coverage until it gleams."],
  ],
  mcp: [
    ["crystal-ball", "Scry distant APIs through a cloudy orb."],
    ["carrier-pigeon", "Reliable message delivery, eventually."],
  ],
};

export class DemoShopManager {
  private installed = new Set<string>();

  snapshot(): Record<ShopKind, ShopStock> {
    const shelf = (kind: ShopKind): ShopStock => ({
      items: DEMO_ITEMS[kind].map(([id, description]) => ({
        id,
        kind,
        name: id,
        description,
        detail: "demo stock — nothing is real",
        installed: this.installed.has(`${kind}:${id}`),
      })),
      fetchedTs: Date.now(),
      error: null,
    });
    return {
      skills: shelf("skills"),
      plugins: shelf("plugins"),
      mcp: shelf("mcp"),
    };
  }

  itemName(_kind: ShopKind, id: string): string {
    return id;
  }

  async install(kind: ShopKind, id: string): Promise<void> {
    this.installed.add(`${kind}:${id}`);
  }

  async remove(kind: ShopKind, id: string): Promise<void> {
    this.installed.delete(`${kind}:${id}`);
  }

  async restock(): Promise<void> {}
}

/** Everything the SessionManager needs from either shop backend. */
export type Shops = ShopManager | DemoShopManager;

/** True if a skill dir exists — used by tests, exported for reuse. */
export function skillDirExists(repoRoot: string, id: string): boolean {
  return safeId(id) && existsSync(join(repoRoot, ".claude", "skills", id));
}
