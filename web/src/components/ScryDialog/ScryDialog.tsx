import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { sendCommand } from "@/lib/socket";
import { defaultCwdAtom, uiModeAtom } from "@/store/gameAtoms";

/** §9e — gaze into the pool yourself: an ad hoc lookup while you wait.
 * Honest about the mechanics: it summons a real (cheap) agent to search. */
export default function ScryDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const cwd = useAtomValue(defaultCwdAtom);
  const [query, setQuery] = useState("");
  const open = ui.mode === "scry";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUi({ mode: "roam" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUi]);

  if (!open) return null;

  const gaze = () => {
    if (!query.trim()) return;
    sendCommand({
      type: "summon",
      task: `Gaze outward: search the web for "${query.trim()}" and report back a short, sourced summary. Then stop.`,
      cwd,
      model: "claude-haiku-4-5",
      permissionMode: "default",
    });
    setQuery("");
    setUi({ mode: "roam" });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div className="w-[480px] max-w-[95vw] rounded-lg border-2 border-accent bg-card p-4">
        <h2 className="mb-1 text-accent">🔮 The Scrying Pool</h2>
        <p className="mb-3 text-xs text-muted">
          Ask, and a scout steps through the portal to search the wider world.
          (A real Haiku agent — it costs a few coins of budget.)
        </p>
        <div className="flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") gaze();
            }}
            placeholder="What do you wish to see?"
            className="flex-1 rounded border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={gaze}
            disabled={!query.trim()}
            className="rounded bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-40"
          >
            Gaze
          </button>
        </div>
      </div>
    </div>
  );
}
