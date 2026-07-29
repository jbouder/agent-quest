import { useAtomValue } from "jotai";
import { formatTokens, formatUsd, heartsFor } from "@/lib/format";
import { sendCommand } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  connectedAtom,
  demoModeAtom,
  playerAtom,
  shieldAtom,
} from "@/store/gameAtoms";

function Heart({ fill }: { fill: number }) {
  return (
    <span className="relative inline-block text-lg leading-none">
      <span className="text-card">♥</span>
      <span
        className="absolute inset-0 overflow-hidden text-heart"
        style={{ width: `${fill * 100}%` }}
      >
        ♥
      </span>
    </span>
  );
}

export default function Hud() {
  const player = useAtomValue(playerAtom);
  const connected = useAtomValue(connectedAtom);
  const demoMode = useAtomValue(demoModeAtom);
  const shield = useAtomValue(shieldAtom);
  const hearts = heartsFor(player.spentUsd, player.budgetUsd);

  return (
    <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1">
      <div className="flex items-center gap-0.5 rounded border border-border bg-card/85 px-2 py-1">
        {hearts.map((fill, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length row
          <Heart key={i} fill={fill} />
        ))}
        {shield && <span className="ml-1 text-sm">🛡</span>}
        {demoMode && (
          <span className="ml-2 rounded bg-primary px-1.5 text-[10px] text-primary-foreground">
            DEMO
          </span>
        )}
      </div>
      <div className="rounded border border-border bg-card/85 px-2 py-1 text-xs text-muted">
        {formatUsd(player.spentUsd)} / {formatUsd(player.budgetUsd)} ·{" "}
        {formatTokens(player.tokensSpent)} tokens
        <span
          className={cn("ml-2", connected ? "text-accent" : "text-destructive")}
        >
          {connected ? "● linked" : "○ severed"}
        </span>
      </div>
      {player.locked && (
        <div className="pointer-events-auto flex items-center gap-2 rounded border border-destructive bg-card/95 px-2 py-1 text-xs text-destructive">
          Out of budget — agents are asleep.
          <button
            type="button"
            className="rounded bg-primary px-2 py-0.5 text-primary-foreground hover:opacity-90"
            onClick={() => sendCommand({ type: "topUp", amountUsd: 5 })}
          >
            Top up $5
          </button>
        </div>
      )}
    </div>
  );
}
