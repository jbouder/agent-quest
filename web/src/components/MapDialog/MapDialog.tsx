import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import {
  AREAS,
  type AreaId,
  CELL_H,
  CELL_W,
  GRID,
  WORLD_H,
  WORLD_W,
} from "@/game/areas";
import { MAX_VILLAGE_NPCS } from "@/game/villagePlan";
import type { AgentSnapshot, Raid, SideQuest } from "@/lib/protocol";
import { loadSeen, unseenStockCount } from "@/lib/shopSeen";
import { cn } from "@/lib/utils";
import {
  agentsAtom,
  discoveredAreasAtom,
  longWaitAtom,
  mapTravelAtom,
  playerAreaAtom,
  playerPosAtom,
  raidAtom,
  shopsAtom,
  sideQuestsAtom,
  uiModeAtom,
} from "@/store/gameAtoms";

export interface MapPin {
  area: AreaId;
  icon: string;
  label: string;
}

/**
 * §20 — live pins for real signals, not just static geography. Pure so the
 * pin logic is testable: given the world's state, where does attention point?
 */
export function pinsFor(state: {
  sideQuests: SideQuest[];
  agents: AgentSnapshot[];
  raid: Raid | null;
  longWait: { agentLabel: string; description: string } | null;
  /** §5b — how many shelf items this player hasn't seen yet. */
  unseenStock?: number;
}): MapPin[] {
  const pins: MapPin[] = [];

  // §20 — shops with new stock get a pin on the district.
  if (state.unseenStock && state.unseenStock > 0) {
    pins.push({
      area: "shopping",
      icon: "🛍",
      label: `${state.unseenStock} new item${state.unseenStock === 1 ? "" : "s"} in the shops`,
    });
  }

  // Everything posted on the board is a reason to visit the square…
  const posted = state.sideQuests.length;
  if (posted > 0) {
    pins.push({
      area: "square",
      icon: "📋",
      label: `${posted} quest${posted === 1 ? "" : "s"} on the board`,
    });
  }
  // …and two quest kinds also point at their own ground.
  if (state.sideQuests.some((quest) => quest.kind === "merchant")) {
    pins.push({
      area: "frontier",
      icon: "🛒",
      label: "the traveling merchant has stock",
    });
  }
  if (state.sideQuests.some((quest) => quest.kind === "ruins")) {
    pins.push({ area: "ruins", icon: "🏚", label: "the ruins grow wilder" });
  }

  // §12 — agents past the village cap cluster into the camp.
  const live = state.agents.filter(
    (agent) => agent.status !== "ended" && agent.status !== "error",
  ).length;
  if (live > MAX_VILLAGE_NPCS) {
    pins.push({
      area: "square",
      icon: "⛺",
      label: `${live - MAX_VILLAGE_NPCS} camped agent${live - MAX_VILLAGE_NPCS === 1 ? "" : "s"}`,
    });
  }

  if (state.raid) {
    pins.push({
      area: "arena",
      icon: "⚔",
      label: `raid: ${state.raid.agentIds.length} agents on one objective`,
    });
  }
  if (state.longWait) {
    pins.push({
      area: "docks",
      icon: "🎣",
      label: `${state.longWait.agentLabel} is on a long job — the dock is open`,
    });
  }
  return pins;
}

/**
 * §20 — the Map. The Mirror answers "what are my agents doing"; this answers
 * "where do I go". Discovery-gated, with fast travel to anywhere you've been.
 */
export default function MapDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const discovered = useAtomValue(discoveredAreasAtom);
  const playerArea = useAtomValue(playerAreaAtom);
  const playerPos = useAtomValue(playerPosAtom);
  const [, setTravel] = useAtom(mapTravelAtom);
  const sideQuests = useAtomValue(sideQuestsAtom);
  const agents = useAtomValue(agentsAtom);
  const raid = useAtomValue(raidAtom);
  const longWait = useAtomValue(longWaitAtom);
  const shops = useAtomValue(shopsAtom);
  const open = ui.mode === "map";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUi({ mode: "roam" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUi]);

  if (!open) return null;

  const pins = pinsFor({
    sideQuests,
    agents,
    raid,
    longWait,
    unseenStock: unseenStockCount(shops, loadSeen()),
  });
  const travel = (id: AreaId) => {
    setTravel(id);
    setUi({ mode: "roam" });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div className="w-[720px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-primary">🗺 The Map</h2>
          <button
            type="button"
            onClick={() => setUi({ mode: "roam" })}
            className="text-xs text-muted hover:text-foreground"
          >
            fold it away (Esc)
          </button>
        </div>

        <div
          className="relative grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${GRID}, 1fr)`,
            aspectRatio: `${WORLD_W} / ${WORLD_H}`,
          }}
        >
          {[...AREAS]
            .sort((a, b) => a.cy - b.cy || a.cx - b.cx)
            .map((area) => {
              const known = discovered.has(area.id);
              const here = playerArea === area.id;
              const areaPins = pins.filter((pin) => pin.area === area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  disabled={!known}
                  onClick={() => travel(area.id)}
                  title={
                    known
                      ? `Fast travel to ${area.name}`
                      : "Undiscovered — walk there first"
                  }
                  className={cn(
                    "flex flex-col items-start justify-between rounded border p-2 text-left",
                    known
                      ? "border-border bg-background hover:border-accent"
                      : "cursor-not-allowed border-border/40 bg-background/40",
                    here && "border-primary",
                  )}
                >
                  {known ? (
                    <>
                      <div>
                        <p className="text-xs text-foreground">
                          {area.name}
                          {here && (
                            <span className="ml-1 text-primary">◈ you</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[9px] leading-tight text-muted">
                          {area.blurb}
                        </p>
                      </div>
                      {areaPins.length > 0 && (
                        <p className="mt-1 text-[10px]">
                          {areaPins.map((pin) => (
                            <span
                              key={pin.icon + pin.area}
                              title={pin.label}
                              className="mr-1"
                            >
                              {pin.icon}
                            </span>
                          ))}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="m-auto text-sm text-muted/60">???</p>
                  )}
                </button>
              );
            })}

          {/* you-are-here, placed by real world position */}
          <span
            className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
            style={{
              left: `${(playerPos.x / (CELL_W * GRID)) * 100}%`,
              top: `${(playerPos.y / (CELL_H * GRID)) * 100}%`,
            }}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted">
          {pins.map((pin) => (
            <span key={pin.icon + pin.area}>
              {pin.icon} {pin.label}
            </span>
          ))}
          {pins.length === 0 && <span>No live pins — a quiet realm.</span>}
        </div>
        <p className="mt-1 text-[10px] text-muted">
          Click a discovered area to fast travel. Greyed areas reveal themselves
          when you walk there.
        </p>
      </div>
    </div>
  );
}
