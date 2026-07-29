import { useAtom, useAtomValue } from "jotai";
import { agentsAtom, debugOverlayAtom, playerAtom } from "@/store/gameAtoms";

/** §16 — raw telemetry across every NPC at once, bypassing the Mirror. */
export default function DebugOverlay() {
  const [open, setOpen] = useAtom(debugOverlayAtom);
  const agents = useAtomValue(agentsAtom);
  const player = useAtomValue(playerAtom);

  if (!open) return null;

  return (
    <div className="absolute top-3 right-3 bottom-3 z-30 w-[420px] max-w-[85vw] overflow-y-auto rounded border border-accent bg-background/95 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-accent">debug console</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          close
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-all text-[10px] leading-snug text-foreground/80">
        {JSON.stringify({ player, agents }, null, 1)}
      </pre>
    </div>
  );
}
