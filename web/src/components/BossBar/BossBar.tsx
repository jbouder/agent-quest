import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { agentsAtom, raidAtom } from "@/store/gameAtoms";

/** mm:ss for however long the party has been at this. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * §9b raid boss — several agents on one objective read as a boss fight, not
 * as several unrelated side quests. The bar tracks the party's combined quest
 * logs; the Arena it belongs in arrives with the world expansion (§1a).
 */
export default function BossBar() {
  const raid = useAtomValue(raidAtom);
  const agents = useAtomValue(agentsAtom);
  const [now, setNow] = useState(() => Date.now());

  // The clock only needs to tick while a fight is actually on.
  useEffect(() => {
    if (!raid) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [raid]);

  if (!raid) return null;

  const party = agents.filter((agent) => raid.agentIds.includes(agent.id));
  const pct = Math.round(raid.progress * 100);

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 w-[420px] max-w-[70vw] -translate-x-1/2">
      <div className="rounded border-2 border-destructive bg-card/95 px-3 py-2">
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-destructive">
            ⚔ Raid · {party.length} agents on one objective
          </span>
          <span className="text-muted">
            {formatElapsed(now - raid.startedTs)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-sm bg-background">
          <div
            className="h-full bg-destructive transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 truncate text-[10px] text-muted">
          {pct}% of the party's quest logs complete ·{" "}
          {party.map((agent) => agent.label).join(", ")}
        </p>
      </div>
    </div>
  );
}
