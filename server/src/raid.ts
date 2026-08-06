import type { AgentSnapshot, Raid } from "../../shared/protocol";

/**
 * §9b — a raid boss is what "several agents on one big cross-cutting feature"
 * actually looks like: the §13 party mechanic forming up for one shared
 * objective. Below this many agents in one place it's just ordinary village
 * life, and dressing it up as a boss fight would cheapen the signal.
 */
export const RAID_MIN_AGENTS = 3;

/** Agents that are actually in the fight right now. */
function fighting(agents: AgentSnapshot[]): AgentSnapshot[] {
  return agents.filter(
    (agent) => agent.status !== "ended" && agent.status !== "error",
  );
}

/**
 * Find the party, if there is one: the largest group of live agents sharing a
 * working directory. Ties go to whichever cwd appears first, so the raid
 * doesn't flap between two equally-sized groups on every snapshot.
 */
export function detectRaid(
  agents: AgentSnapshot[],
  startedTs: number,
): Raid | null {
  const byCwd = new Map<string, AgentSnapshot[]>();
  for (const agent of fighting(agents)) {
    const party = byCwd.get(agent.cwd);
    if (party) party.push(agent);
    else byCwd.set(agent.cwd, [agent]);
  }

  let best: { cwd: string; party: AgentSnapshot[] } | null = null;
  for (const [cwd, party] of byCwd) {
    if (party.length < RAID_MIN_AGENTS) continue;
    if (!best || party.length > best.party.length) best = { cwd, party };
  }
  if (!best) return null;

  return {
    cwd: best.cwd,
    agentIds: best.party.map((agent) => agent.id),
    progress: raidProgress(best.party),
    startedTs,
  };
}

/**
 * The boss bar tracks the party's combined quest logs — the closest thing to
 * real progress on a shared objective. With no quest logs yet, it reads zero
 * rather than inventing a number.
 */
export function raidProgress(party: AgentSnapshot[]): number {
  let total = 0;
  let done = 0;
  for (const agent of party) {
    for (const quest of agent.quests) {
      total += 1;
      if (quest.status === "completed") done += 1;
    }
  }
  return total === 0 ? 0 : done / total;
}

/** Has the party changed enough that the fight counts as a new one? */
export function isSameRaid(a: Raid | null, b: Raid | null): boolean {
  if (!a || !b) return a === b;
  return a.cwd === b.cwd;
}
