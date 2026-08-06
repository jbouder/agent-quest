import { useAtom, useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { agentsAtom, chronicleOpenAtom, uiModeAtom } from "@/store/gameAtoms";

/**
 * §7a — global overlays open from persistent on-screen buttons, not
 * memorized hotkeys. The keyboard accelerators (M, J, `) still work,
 * but nothing is *only* reachable by remembering a letter.
 */
export default function MenuBar() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const [chronicleOpen, setChronicleOpen] = useAtom(chronicleOpenAtom);
  const agents = useAtomValue(agentsAtom);
  const needsAttention = agents.some(
    (a) => a.status === "blocked_permission" || a.status === "error",
  );

  const buttons: {
    icon: string;
    label: string;
    active: boolean;
    pulse?: boolean;
    onClick: () => void;
  }[] = [
    {
      icon: "✨",
      label: "Summon", // §8 — usable from anywhere, no walk required
      active: ui.mode === "summon",
      onClick: () =>
        setUi(ui.mode === "summon" ? { mode: "roam" } : { mode: "summon" }),
    },
    {
      icon: "🪞",
      label: "Mirror (M)",
      active: ui.mode === "mirror",
      pulse: needsAttention,
      onClick: () =>
        setUi(ui.mode === "mirror" ? { mode: "roam" } : { mode: "mirror" }),
    },
    {
      icon: "🗺",
      label: "Map", // §20 — geography, discovery, fast travel
      active: ui.mode === "map",
      onClick: () =>
        setUi(ui.mode === "map" ? { mode: "roam" } : { mode: "map" }),
    },
    {
      icon: "📜",
      label: "Chronicle (J)",
      active: chronicleOpen,
      onClick: () => setChronicleOpen(!chronicleOpen),
    },
    {
      icon: "❓",
      label: "Help",
      active: ui.mode === "help",
      onClick: () =>
        setUi(ui.mode === "help" ? { mode: "roam" } : { mode: "help" }),
    },
  ];

  return (
    <div className="pointer-events-auto absolute top-3 right-3 z-10 flex gap-1">
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          title={button.label}
          aria-label={button.label}
          onClick={button.onClick}
          className={cn(
            "rounded border bg-card/85 px-2 py-1 text-sm hover:border-accent",
            button.active ? "border-accent" : "border-border",
            button.pulse && !button.active && "animate-pulse border-primary",
          )}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
}
