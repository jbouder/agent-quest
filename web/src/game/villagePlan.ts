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
