// §12: a readable village tops out around 6 individually-rendered NPCs.
// Past that, agents live in a camp (tent + count) and only get a full
// sprite when promoted — by walking up or selecting them in the Mirror.

export const MAX_VILLAGE_NPCS = 6;

/**
 * Free-slot allocation: stable positions for pinned agents. Pure so it can
 * be tested without Phaser.
 */
export class SlotAllocator {
  private owners: (string | null)[];

  constructor(public readonly size: number = MAX_VILLAGE_NPCS) {
    this.owners = Array(size).fill(null);
  }

  /** Slot index this id already owns, or null. */
  slotOf(id: string): number | null {
    const index = this.owners.indexOf(id);
    return index === -1 ? null : index;
  }

  get full(): boolean {
    return !this.owners.includes(null);
  }

  /** Claim the lowest free slot; null when the village is full. */
  take(id: string): number | null {
    if (this.owners.includes(id)) return this.slotOf(id);
    const index = this.owners.indexOf(null);
    if (index === -1) return null;
    this.owners[index] = id;
    return index;
  }

  release(id: string): void {
    const index = this.owners.indexOf(id);
    if (index !== -1) this.owners[index] = null;
  }
}

/**
 * Pick which pinned agent to send to camp when promoting a camped one:
 * the least-recently-promoted (front of the pin order).
 */
export function pickEviction(pinOrder: string[]): string | null {
  return pinOrder[0] ?? null;
}

/** §9 — how much a finished session left behind. */
export type TrophyKind = "monument" | "chest";

/** Below this, a session was a quick errand rather than a body of work. */
const MONUMENT_TOOL_USES = 15;

/**
 * §9 — a finished session leaves a marker. Landing a commit, or a long haul
 * of tool calls, earns a monument; anything smaller leaves a chest. Keeping
 * this a pure function of the snapshot means the village's history reads the
 * same on a reload as it did live.
 */
export function trophyKindFor(agent: {
  commits: string[];
  toolUses: Record<string, { count: number }>;
}): TrophyKind {
  if (agent.commits.length > 0) return "monument";
  const calls = Object.values(agent.toolUses).reduce(
    (total, stat) => total + stat.count,
    0,
  );
  return calls >= MONUMENT_TOOL_USES ? "monument" : "chest";
}

/**
 * §13 — a finished subagent leaves a scratch mark, but a fan-out of a hundred
 * must not bury the village. Past this many, the party badge is the record.
 */
export const MAX_SUBAGENT_MARKS = 6;

/** How far apart two trophies must sit to both stay readable. */
export const TROPHY_GAP = 26;

/**
 * §9 — trophies accumulate, so two sessions that finished in the same place
 * can't be allowed to stack: the later one would silently bury the earlier,
 * and a history that overwrites itself isn't a history. Fan out along rings
 * until the spot is clear, squashed vertically to match the top-down view.
 */
export function freeTrophySpot(
  desired: { x: number; y: number },
  taken: { x: number; y: number }[],
  gap = TROPHY_GAP,
): { x: number; y: number } {
  const clear = (spot: { x: number; y: number }) =>
    taken.every((t) => Math.hypot(t.x - spot.x, t.y - spot.y) >= gap);
  if (clear(desired)) return desired;

  const PER_RING = 8;
  for (let ring = 1; ring <= 4; ring++) {
    for (let step = 0; step < PER_RING; step++) {
      const angle = (step / PER_RING) * Math.PI * 2;
      const spot = {
        x: desired.x + Math.cos(angle) * gap * ring,
        y: desired.y + Math.sin(angle) * gap * ring * 0.6,
      };
      if (clear(spot)) return spot;
    }
  }
  // Village that crowded, the overlap is the lesser problem.
  return desired;
}
