// §1a/§20 — the bigger world. The village square stays the hub; everything
// else gets its own named area on a 3×3 grid of village-sized cells. Pure
// geometry lives here so the Map screen and the scene share one truth, and
// so it can all be tested without Phaser.

export const CELL_W = 1280;
export const CELL_H = 960;
export const GRID = 3;
export const WORLD_W = CELL_W * GRID; // 3840
export const WORLD_H = CELL_H * GRID; // 2880

export type AreaId =
  | "square"
  | "ruins"
  | "watchtower"
  | "frontier"
  | "tavern"
  | "arena"
  | "docks"
  | "road"
  | "shopping";

export interface Area {
  id: AreaId;
  name: string;
  /** Cell coordinates on the 3×3 grid, (0,0) top-left. */
  cx: number;
  cy: number;
  /** One-line flavor for the Map screen. */
  blurb: string;
  /** Discovered before you ever open the map (you start here). */
  known?: boolean;
}

/**
 * The §1a layout. The south road is connective geography, not a destination —
 * it's where summoned NPCs walk in from, and it stays a road on the map.
 */
export const AREAS: Area[] = [
  {
    id: "ruins",
    name: "The Ruins",
    cx: 0,
    cy: 0,
    blurb: "overgrown tech debt at the world's edge",
  },
  {
    id: "watchtower",
    name: "The Watchtower",
    cx: 1,
    cy: 0,
    blurb: "the scrying pool, set apart and elevated",
  },
  {
    id: "frontier",
    name: "The Frontier",
    cx: 2,
    cy: 0,
    blurb: "merchants, travelers, and open space",
  },
  {
    id: "tavern",
    name: "The Tavern",
    cx: 0,
    cy: 1,
    blurb: "downtime, deliberately removed from the hustle",
  },
  {
    id: "square",
    name: "Village Square",
    cx: 1,
    cy: 1,
    blurb: "the hub — quest board, fountain, your agents",
    known: true,
  },
  {
    id: "arena",
    name: "The Arena",
    cx: 2,
    cy: 1,
    blurb: "where raids play out at a respectful distance",
  },
  {
    id: "docks",
    name: "The Docks",
    cx: 0,
    cy: 2,
    blurb: "a quiet spot to wait out a long build",
  },
  {
    id: "road",
    name: "South Road",
    cx: 1,
    cy: 2,
    blurb: "the way into the village",
  },
  {
    id: "shopping",
    name: "Shopping District",
    cx: 2,
    cy: 2,
    blurb: "stalls going up — the market arrives with Phase 6",
  },
];

const byId = new Map(AREAS.map((area) => [area.id, area]));

export function areaById(id: AreaId): Area {
  const area = byId.get(id);
  if (!area) throw new Error(`unknown area: ${id}`);
  return area;
}

/** Top-left corner of an area's cell in world coordinates. */
export function cellOrigin(id: AreaId): { x: number; y: number } {
  const area = areaById(id);
  return { x: area.cx * CELL_W, y: area.cy * CELL_H };
}

/** Convert an area-local point to world coordinates. */
export function inArea(
  id: AreaId,
  x: number,
  y: number,
): { x: number; y: number } {
  const origin = cellOrigin(id);
  return { x: origin.x + x, y: origin.y + y };
}

/** Which named area a world point falls in. Clamps points on the rim. */
export function areaAt(x: number, y: number): AreaId {
  const cx = Math.min(GRID - 1, Math.max(0, Math.floor(x / CELL_W)));
  const cy = Math.min(GRID - 1, Math.max(0, Math.floor(y / CELL_H)));
  const found = AREAS.find((area) => area.cx === cx && area.cy === cy);
  // The grid is fully covered, but the type system can't know that.
  return found?.id ?? "square";
}

/**
 * §20 fast travel — where you land when the Map warps you somewhere. Chosen
 * per area so you arrive near its landmark facing something, not in a corner.
 */
export const LANDINGS: Record<AreaId, { x: number; y: number }> = {
  square: inArea("square", 640, 560),
  ruins: inArea("ruins", 640, 560),
  watchtower: inArea("watchtower", 640, 620),
  frontier: inArea("frontier", 640, 560),
  tavern: inArea("tavern", 640, 560),
  arena: inArea("arena", 640, 620),
  docks: inArea("docks", 640, 500),
  road: inArea("road", 640, 300),
  shopping: inArea("shopping", 640, 560),
};

const DISCOVERY_KEY = "aq-discovered-v1";

/** §20 — areas you've physically walked to, remembered across sessions. */
export function loadDiscovered(): Set<AreaId> {
  const known = new Set<AreaId>(
    AREAS.filter((area) => area.known).map((area) => area.id),
  );
  try {
    const raw = localStorage.getItem(DISCOVERY_KEY);
    if (raw) {
      for (const id of JSON.parse(raw) as string[]) {
        if (byId.has(id as AreaId)) known.add(id as AreaId);
      }
    }
  } catch {
    // corrupted storage — fall back to the starting area
  }
  return known;
}

export function saveDiscovered(discovered: Set<AreaId>): void {
  try {
    localStorage.setItem(DISCOVERY_KEY, JSON.stringify([...discovered]));
  } catch {
    // storage full or unavailable — discovery just won't persist
  }
}
