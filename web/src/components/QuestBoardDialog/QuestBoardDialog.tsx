import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useDialog } from "@/components/Dialog";
import type { SideQuest } from "@/lib/protocol";
import {
  overridesAtom,
  sideQuestsAtom,
  summonPrefillAtom,
  uiModeAtom,
} from "@/store/gameAtoms";

/** §9a — the board in the village square where side quests post themselves. */
export default function QuestBoardDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const scanned = useAtomValue(sideQuestsAtom);
  const overrides = useAtomValue(overridesAtom);
  const setPrefill = useSetAtom(summonPrefillAtom);
  const open = ui.mode === "board";

  // §19 — your own notices (a custom side-quest type) post above the
  // repo-scanned ones. They're yours, so they never get crowded out.
  const custom: SideQuest[] = overrides.customQuests.map((quest, index) => ({
    id: `custom:${index}`,
    kind: "custom",
    icon: quest.icon,
    title: quest.title,
    detail: quest.detail || "posted by you, via the World Codex",
    suggestedTask: quest.task,
  }));
  const quests = [...custom, ...scanned];

  const dialog = useDialog({
    open,
    onClose: () => setUi({ mode: "roam" }),
    label: "Quest Board",
  });

  if (!open) return null;

  const accept = (task: string) => {
    setPrefill(task);
    setUi({ mode: "summon" });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div
        {...dialog}
        className="w-[560px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-primary">📋 Quest Board</h2>
          <button
            type="button"
            onClick={() => setUi({ mode: "roam" })}
            className="text-xs text-muted hover:text-foreground"
          >
            walk away (Esc)
          </button>
        </div>
        {quests.length === 0 && (
          <p className="rounded border border-border bg-background p-4 text-sm text-muted">
            The board is bare. A tidy repo — or the scan hasn't finished.
          </p>
        )}
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {quests.map((quest) => (
            <div
              key={quest.id}
              className="flex items-center gap-3 rounded border border-border bg-background p-2"
            >
              <span className="text-lg">{quest.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{quest.title}</p>
                <p className="truncate text-xs text-muted">{quest.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => accept(quest.suggestedTask)}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
              >
                Accept
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted">
          Accepting a quest carries it to the Scroll of Summoning — an agent
          still has to be summoned (and paid for).
        </p>
      </div>
    </div>
  );
}
