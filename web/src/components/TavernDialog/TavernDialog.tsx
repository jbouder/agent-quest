import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/Dialog";
import { cn } from "@/lib/utils";
import { agentsAtom, recentCommitsAtom, uiModeAtom } from "@/store/gameAtoms";

const GARDEN_KEY = "aq-garden-planted";
const STAGES = [
  { after: 0, art: "🌱", text: "A seedling. It asks nothing of you." },
  { after: 5 * 60_000, art: "🌿", text: "Growing steadily. Like the backlog." },
  { after: 30 * 60_000, art: "🌷", text: "In bloom. You did that, sort of." },
];

/** A tiny generative lo-fi loop — the bard needs no assets. */
function useBard() {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setPlaying(false);
  };

  const start = () => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    let beat = 0;
    const pluck = () => {
      const note = scale[(beat * 3 + (beat % 4)) % scale.length] ?? 220;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = beat % 4 === 0 ? note / 2 : note;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1);
      beat += 1;
    };
    pluck();
    timerRef.current = setInterval(pluck, 600);
    setPlaying(true);
  };

  // unmount-only cleanup via refs — `stop` gets a new identity every render
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      void ctxRef.current?.close();
    },
    [],
  );
  return { playing, toggle: () => (playing ? stop() : start()) };
}

/** §9d — player-chosen downtime; nothing in here pulls focus. */
export default function TavernDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const commits = useAtomValue(recentCommitsAtom);
  const agents = useAtomValue(agentsAtom);
  const bard = useBard();
  const [plantedAt, setPlantedAt] = useState<number | null>(() => {
    const raw = localStorage.getItem(GARDEN_KEY);
    return raw ? Number(raw) : null;
  });
  const open = ui.mode === "tavern";
  const dialog = useDialog({
    open,
    onClose: () => setUi({ mode: "roam" }),
    label: "The Tavern",
  });

  if (!open) return null;

  // §9d library — grounded in what's actually happening right now
  const busy = agents.find(
    (a) => a.status === "thinking" || a.status === "tool_running",
  );
  const topTool = agents
    .flatMap((a) => Object.entries(a.toolUses))
    .sort((a, b) => b[1].count - a[1].count)[0];

  const stage = plantedAt
    ? [...STAGES].reverse().find((s) => Date.now() - plantedAt >= s.after)
    : null;

  const plant = () => {
    const now = Date.now();
    localStorage.setItem(GARDEN_KEY, String(now));
    setPlantedAt(now);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div
        {...dialog}
        className="w-[600px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-primary">🍺 The Tavern</h2>
          <button
            type="button"
            onClick={() => setUi({ mode: "roam" })}
            className="text-xs text-muted hover:text-foreground"
          >
            leave (Esc)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-border bg-background p-3">
            <p className="mb-1 text-xs text-accent">🎻 The Bard's Corner</p>
            <p className="mb-2 text-[11px] text-muted">
              A gentle, procedural tune. No lyrics — the bard knows better than
              to sing.
            </p>
            <button
              type="button"
              onClick={bard.toggle}
              className={cn(
                "rounded border px-3 py-1 text-xs",
                bard.playing
                  ? "border-accent text-accent"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {bard.playing ? "⏸ rest" : "▶ play"}
            </button>
          </div>

          <div className="rounded border border-border bg-background p-3">
            <p className="mb-1 text-xs text-accent">📯 The Town Crier</p>
            {commits.length === 0 ? (
              <p className="text-[11px] text-muted">
                "No news," the crier admits.
              </p>
            ) : (
              <ul className="max-h-28 overflow-y-auto text-[10px] leading-relaxed text-muted">
                {commits.map((line) => (
                  <li key={line} className="truncate">
                    “{line}”
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded border border-border bg-background p-3">
            <p className="mb-1 text-xs text-accent">📚 The Library Corner</p>
            <p className="text-[11px] leading-relaxed text-muted">
              {busy
                ? `The librarian is drafting a primer on whatever ${busy.label} is doing: “${busy.thought.slice(0, 70)}”`
                : topTool
                  ? `The librarian notes today's most-swung tool: ${topTool[0]} (${topTool[1].count} uses). “A classic,” she says.`
                  : "The librarian dozes. Nothing is happening worth explaining."}
            </p>
          </div>

          <div className="rounded border border-border bg-background p-3">
            <p className="mb-1 text-xs text-accent">🌾 The Garden</p>
            {stage ? (
              <p className="text-[11px] text-muted">
                <span className="mr-1 text-lg">{stage.art}</span>
                {stage.text}
              </p>
            ) : (
              <p className="text-[11px] text-muted">An empty plot of soil.</p>
            )}
            <button
              type="button"
              onClick={plant}
              className="mt-2 rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground"
            >
              {plantedAt ? "replant" : "plant a seed"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
