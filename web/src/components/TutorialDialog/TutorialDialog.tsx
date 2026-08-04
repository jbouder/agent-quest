import { useAtom } from "jotai";
import { useState } from "react";
import { uiModeAtom } from "@/store/gameAtoms";

export const TUTORIAL_DONE_KEY = "aq-tutorial-done";

/** §18 — the guide's walkthrough. Skippable, replayable, never forced. */
const STEPS: { title: string; body: string }[] = [
  {
    title: "Welcome, traveler",
    body: "Agent Quest is a control room for real Claude Code agents, wearing a game skin. Every NPC is a live session; everything you see maps to a real signal. This tour takes half a minute.",
  },
  {
    title: "Getting around",
    body: "Move with WASD or the arrow keys. The camera follows you around the village.",
  },
  {
    title: "Interacting",
    body: "Click or tap anything — an agent, the quest board, the tavern — from wherever you stand. Or walk up close: a small prompt appears when you're in range, and Space or Enter does the rest.",
  },
  {
    title: "Summoning an agent",
    body: "The ✨ button (top right) opens the Scroll of Summoning from anywhere. Describe a quest, pick a working directory and a model, and a real agent walks into the village and gets to work.",
  },
  {
    title: "The Mirror",
    body: "The 🪞 button shows every agent at once — status, health (context), spend. Agents that need you pulse. Click one to warp straight to it.",
  },
  {
    title: "The Chronicle & Help",
    body: "📜 opens the Chronicle: one feed of everything every agent has done, filterable by agent or event. ❓ opens the full reference. Talk to me by the fountain any time to replay this tour.",
  },
];

export default function TutorialDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const [step, setStep] = useState(0);
  const open = ui.mode === "tutorial";

  if (!open) return null;

  const close = () => {
    localStorage.setItem(TUTORIAL_DONE_KEY, "1");
    setStep(0);
    setUi({ mode: "roam" });
  };
  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
      <div className="w-[440px] max-w-[92vw] rounded-lg border-2 border-accent bg-card p-4 shadow-xl">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-accent">🧭 {current?.title}</h2>
          <span className="text-[10px] text-muted">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <p className="mb-4 text-sm leading-relaxed">{current?.body}</p>
        <div className="flex justify-between">
          <button
            type="button"
            onClick={close}
            className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : setStep(step + 1))}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
