import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";
import type { Ward } from "../../shared/protocol";

/**
 * §14 — hooks become wards on the world. Hooks are deterministic rules that
 * apply regardless of what any given agent wants to do, so they govern the
 * village rather than living in a per-agent inventory screen (§5).
 */

/**
 * Events whose hooks can actually stop something from happening. These are the
 * ones drawn as a boundary ward-line rather than a free-standing rune circle —
 * the "invisible fence" of §14.
 */
const BLOCKING_EVENTS = new Set([
  "PreToolUse",
  "UserPromptSubmit",
  "Stop",
  "StopFailure",
  "SubagentStop",
  "PermissionRequest",
]);

/** The shape `resolveSettings` reports per source; narrowed to what we read. */
export interface SettingsSource {
  source: string;
  settings: {
    hooks?: Record<
      string,
      {
        matcher?: string;
        hooks: { type?: string; command?: string }[];
      }[]
    >;
  };
}

/**
 * Flatten the settings cascade into wards. Later sources win in Claude Code's
 * merge, but hooks *accumulate* across tiers rather than replacing each other,
 * so every tier's hooks are real wards — we keep them all and label the scope.
 */
export function wardsFromSources(sources: SettingsSource[]): Ward[] {
  const wards: Ward[] = [];
  const seen = new Set<string>();

  for (const { source, settings } of sources) {
    for (const [event, matchers] of Object.entries(settings.hooks ?? {})) {
      for (const entry of matchers ?? []) {
        const commands = (entry.hooks ?? [])
          .map((hook) => hook.command)
          .filter((command): command is string => Boolean(command));
        if (commands.length === 0) continue;

        const matcher = entry.matcher?.trim() ? entry.matcher.trim() : null;
        // Same hook configured in two tiers is one ward, attributed to the
        // first (lowest-precedence) tier that declared it.
        const id = `ward:${event}:${matcher ?? "*"}:${commands.join("|")}`;
        if (seen.has(id)) continue;
        seen.add(id);

        wards.push({
          id,
          event,
          matcher,
          commands,
          scope: source,
          blocking: BLOCKING_EVENTS.has(event),
        });
      }
    }
  }
  return wards;
}

/** A one-line description of what a ward actually enforces. */
export function describeWard(ward: Ward): string {
  const scope = ward.matcher ? ` on ${ward.matcher}` : "";
  const verb = ward.blocking ? "guards" : "watches";
  return `${verb} ${ward.event}${scope} — ${ward.commands.join("; ")}`;
}

/** Read the merged Claude Code settings for a repo and map hooks to wards. */
export async function readWards(cwd: string): Promise<Ward[]> {
  try {
    const resolved = await resolveSettings({ cwd });
    return wardsFromSources(resolved.sources as unknown as SettingsSource[]);
  } catch {
    // No settings, or an SDK that can't resolve them — the world simply has
    // no wards. Never fatal.
    return [];
  }
}
