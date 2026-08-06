import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { uiModeAtom } from "@/store/gameAtoms";

interface Entry {
  section: string;
  name: string;
  detail: string;
}

/** §18 — the full, searchable reference: every action, key, and overlay. */
const ENTRIES: Entry[] = [
  {
    section: "Getting around",
    name: "Move",
    detail: "WASD or arrow keys. The camera follows you.",
  },
  {
    section: "Getting around",
    name: "Interact",
    detail:
      "Click/tap anything directly, or walk up and press Space or Enter when the prompt appears. (E also works.)",
  },
  {
    section: "Overlays",
    name: "Summon ✨",
    detail:
      "Start a new agent from anywhere, or revive a saved session. Icon row, top right.",
  },
  {
    section: "Overlays",
    name: "Mirror 🪞",
    detail:
      "Grid of every agent with live status; click one to warp to it. Accelerator: M.",
  },
  {
    section: "Overlays",
    name: "Chronicle 📜",
    detail:
      "One chronological feed of every agent's journal, filterable by agent and event type. Accelerator: J.",
  },
  {
    section: "Overlays",
    name: "Help ❓",
    detail: "This reference. Search anything.",
  },
  {
    section: "Overlays",
    name: "Cheat console",
    detail: "Backtick (`). noclip, speed, warp, reveal, debug, godmode.",
  },
  {
    section: "Agent actions",
    name: "Talk / steer (wand)",
    detail:
      "Talk to an agent to inject a new instruction mid-task. Works while it's running.",
  },
  {
    section: "Agent actions",
    name: "Interrupt (sword)",
    detail:
      "Halt the current turn without losing anything. The running tool call unwinds first.",
  },
  {
    section: "Agent actions",
    name: "Allow 🖐 / Deny 🛡",
    detail:
      "Answer a pending tool-permission request. Blocked agents show a ❗ and pulse in the Mirror.",
  },
  {
    section: "Agent actions",
    name: "Resume / Dismiss",
    detail:
      "Resume continues after a stop or block; Dismiss ends the session for good and leaves a chest behind.",
  },
  {
    section: "Agent actions",
    name: "Inventory & equipment",
    detail:
      "From the talk dialog: skills, plugins, MCP servers, and the model as an equipment slot — swap it mid-task for a visible re-equip.",
  },
  {
    section: "Places",
    name: "Quest board",
    detail:
      "Side quests scanned from the repo (stale branches, TODO bounties, missing docs). Accepting one prefills the summon scroll.",
  },
  {
    section: "Places",
    name: "The wider world",
    detail:
      "The square is the hub of a 3×3 world: Ruins, Watchtower, Frontier, Tavern, Arena, Docks, and the Shopping District. Areas reveal themselves when you first walk there.",
  },
  {
    section: "Places",
    name: "The Map",
    detail:
      "The 🗺 button. Shows discovered areas, your position, and live pins (board quests, camps, raids, the dock). Click a discovered area to fast travel.",
  },
  {
    section: "Places",
    name: "Tavern",
    detail:
      "Its own area west of the square. Player-chosen downtime: town crier (recent commits) and more. Nothing in here demands attention.",
  },
  {
    section: "Places",
    name: "Scrying pool",
    detail:
      "At the Watchtower, north of the square — ad hoc lookups while you wait.",
  },
  {
    section: "Places",
    name: "The Docks",
    detail:
      "Southwest. The dock lights up while a long background task runs — an idle line to cast that ends when the work does.",
  },
  {
    section: "Places",
    name: "Camp",
    detail:
      "Past ~6 agents, newcomers cluster into the camp (tent + count). Visit it — or use the Mirror — to promote one to a full sprite.",
  },
  {
    section: "Places",
    name: "The guide",
    detail:
      "The teal villager by the fountain. Talk to them to replay the tutorial any time.",
  },
  {
    section: "Resources",
    name: "Hearts (yours)",
    detail:
      "Your budget across all agents. Every agent's spend chips your hearts; at zero, agents sleep until you top up.",
  },
  {
    section: "Resources",
    name: "Health bars (theirs)",
    detail:
      "Each NPC's health is its context window headroom. Hitting the ceiling means faint → auto-compact → back up, not death.",
  },
];

export default function HelpDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const [search, setSearch] = useState("");
  const open = ui.mode === "help";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUi({ mode: "roam" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUi]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const matches = q
    ? ENTRIES.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.detail.toLowerCase().includes(q) ||
          e.section.toLowerCase().includes(q),
      )
    : ENTRIES;
  const sections = [...new Set(matches.map((e) => e.section))];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div className="flex max-h-[85vh] w-[560px] max-w-[95vw] flex-col rounded-lg border-2 border-accent bg-card p-4 shadow-xl">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-accent">❓ Reference</h2>
          <button
            type="button"
            onClick={() => setUi({ mode: "roam" })}
            className="text-xs text-muted hover:text-foreground"
          >
            close (Esc)
          </button>
        </div>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions, keys, places…"
          className="mb-3 w-full rounded border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <div className="flex-1 overflow-y-auto pr-1">
          {matches.length === 0 && (
            <p className="text-sm text-muted">Nothing matches “{search}”.</p>
          )}
          {sections.map((section) => (
            <div key={section} className="mb-3">
              <h3 className="mb-1 text-xs text-primary">{section}</h3>
              {matches
                .filter((e) => e.section === section)
                .map((e) => (
                  <p key={e.name} className="mb-1 text-xs leading-relaxed">
                    <span className="text-foreground">{e.name}</span>{" "}
                    <span className="text-muted">— {e.detail}</span>
                  </p>
                ))}
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setUi({ mode: "tutorial" })}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            🧭 Replay the tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
