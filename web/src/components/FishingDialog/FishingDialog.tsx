import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/Dialog";
import { longWaitAtom, uiModeAtom } from "@/store/gameAtoms";

/** Pure so the catch table can be tested without waiting on a timer. */
export const CATCHES = [
  "🐟 a perfectly ordinary fish",
  "🥾 an old boot. Classic.",
  "🐠 something iridescent. It winks.",
  "🗞 a soggy changelog for a version that never shipped",
  "🦀 a crab. It refuses to let go of the line.",
  "🔧 a wrench. Someone lost this in a merge.",
  "🐡 a pufferfish. It is very cross about the noise.",
  "💾 a floppy disk labelled 'FINAL_final_v3'",
];

export function catchAt(index: number): string {
  return CATCHES[index % CATCHES.length] ?? CATCHES[0] ?? "";
}

const CAST_MS = 4000;

/**
 * §9b fishing/idle timer — something to do with your hands while a long job
 * finishes. It deliberately competes for nothing: no score, no reward, and it
 * closes itself the moment the real work ends.
 */
export default function FishingDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const wait = useAtomValue(longWaitAtom);
  const [log, setLog] = useState<string[]>([]);
  const [casting, setCasting] = useState(false);
  const castSeq = useRef(0);
  const open = ui.mode === "fishing";
  const dialog = useDialog({
    open,
    onClose: () => setUi({ mode: "roam" }),
    label: "The Dock",
  });

  // §9b — "naturally ends when the build does".
  useEffect(() => {
    if (open && !wait) setUi({ mode: "roam" });
  }, [open, wait, setUi]);

  if (!open) return null;

  const cast = () => {
    if (casting) return;
    setCasting(true);
    setTimeout(() => {
      castSeq.current += 1;
      setLog((previous) => [catchAt(castSeq.current), ...previous].slice(0, 6));
      setCasting(false);
    }, CAST_MS);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div
        {...dialog}
        className="w-[480px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-primary">🎣 The Dock</h2>
          <button
            type="button"
            onClick={() => setUi({ mode: "roam" })}
            className="text-xs text-muted hover:text-foreground"
          >
            walk away (Esc)
          </button>
        </div>

        <p className="mb-3 rounded border border-border bg-background p-2 text-xs text-muted">
          {wait
            ? `${wait.agentLabel} is still at it: ${wait.description}. Nothing to decide until it's done.`
            : "The water is still."}
        </p>

        <button
          type="button"
          onClick={cast}
          disabled={casting}
          className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {casting ? "…the float bobs…" : "Cast a line"}
        </button>

        <div className="mt-3 flex flex-col gap-1">
          {log.map((entry, i) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: a scrolling log, newest first
              key={`${entry}-${i}`}
              className="truncate text-xs text-foreground"
            >
              {entry}
            </p>
          ))}
          {log.length === 0 && (
            <p className="text-xs text-muted">
              You haven't caught anything. That's rather the point.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
