import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/Dialog";
import { AREAS } from "@/game/areas";
import {
  applyOverrides,
  DEFAULT_OVERRIDES,
  HEARTS_RANGE,
  loadOverrides,
  MAX_CUSTOM_QUESTS,
  revertDepth,
  revertOverrides,
  SPEED_RANGE,
  sanitizeOverrides,
  type WorldOverrides,
} from "@/lib/overrides";
import { localToast } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { overridesAtom, uiModeAtom } from "@/store/gameAtoms";

/**
 * §19 — the World Codex: reshape the world from inside it. Everything here
 * edits a draft; Preview renders the draft live without persisting, Apply
 * persists it (pushing the old version onto the revert stack), and Revert
 * undoes the last applied change in one click.
 */
export default function EditorDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const [live, setLive] = useAtom(overridesAtom);
  const [draft, setDraft] = useState<WorldOverrides>(live);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const open = ui.mode === "editor";

  // Opening the codex starts the draft from whatever the world is showing;
  // live changes while it's already open (previews) don't clobber the draft.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(live);
    wasOpen.current = open;
  }, [open, live]);

  /** Leaving without applying restores the last persisted world. */
  const close = () => {
    const persisted = loadOverrides().current;
    if (JSON.stringify(live) !== JSON.stringify(persisted)) {
      setLive(persisted);
    }
    setUi({ mode: "roam" });
  };

  const dialog = useDialog({ open, onClose: close, label: "The World Codex" });

  if (!open) return null;

  const preview = (next: WorldOverrides = draft) => {
    const clean = sanitizeOverrides(next);
    setDraft(clean);
    setLive(clean); // render it — not persisted until Apply
  };

  const apply = () => {
    const clean = sanitizeOverrides(draft);
    applyOverrides(clean);
    setLive(clean);
    setDraft(clean);
    localToast("info", "✎ The world takes its new shape. (Revert undoes it.)");
    setUi({ mode: "roam" });
  };

  const revert = () => {
    const { current } = revertOverrides();
    setLive(current);
    setDraft(current);
    localToast("info", "⟲ The previous shape of the world returns.");
  };

  const reset = () => setDraft(DEFAULT_OVERRIDES);

  const enterJsonMode = () => {
    setJsonText(JSON.stringify(draft, null, 2));
    setJsonError(null);
    setJsonMode(true);
  };
  const leaveJsonMode = () => {
    try {
      setDraft(sanitizeOverrides(JSON.parse(jsonText)));
      setJsonError(null);
      setJsonMode(false);
    } catch (error) {
      setJsonError(String(error));
    }
  };

  const patch = (change: Partial<WorldOverrides>) =>
    setDraft({ ...draft, ...change });

  const field =
    "w-full rounded border border-border bg-background p-1.5 text-sm text-foreground outline-none focus:border-accent";
  const label = "block text-xs text-muted";

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85">
      <div
        {...dialog}
        className="flex max-h-[90vh] w-[680px] max-w-[95vw] flex-col rounded-lg border-2 border-primary bg-card p-4"
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-primary">✎ The World Codex</h2>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={jsonMode ? leaveJsonMode : enterJsonMode}
              className="text-muted hover:text-foreground"
            >
              {jsonMode ? "form view" : "raw codex (JSON)"}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-muted hover:text-foreground"
            >
              close (Esc)
            </button>
          </div>
        </div>
        <p className="mb-2 text-[10px] text-muted">
          Reshape the world. Preview renders your draft without keeping it;
          Apply makes it real and remembers the old shape, so Revert is always
          one click. A broken shape tears a rift — sealing it also reverts.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto rounded border border-border bg-background p-3">
          {jsonMode ? (
            <>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full rounded border border-border bg-card p-2 font-mono text-xs text-foreground outline-none focus:border-accent"
              />
              {jsonError && (
                <p className="mt-1 text-xs text-destructive">{jsonError}</p>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <section className="grid grid-cols-2 gap-3">
                <label className={label}>
                  grass color
                  <input
                    type="color"
                    value={draft.palette.grass}
                    onChange={(e) =>
                      patch({
                        palette: { ...draft.palette, grass: e.target.value },
                      })
                    }
                    className="mt-1 block h-8 w-full"
                  />
                </label>
                <label className={label}>
                  path color
                  <input
                    type="color"
                    value={draft.palette.path}
                    onChange={(e) =>
                      patch({
                        palette: { ...draft.palette, path: e.target.value },
                      })
                    }
                    className="mt-1 block h-8 w-full"
                  />
                </label>
                <label className={label}>
                  your tunic
                  <input
                    type="color"
                    value={draft.player.tunic}
                    onChange={(e) =>
                      patch({
                        player: { ...draft.player, tunic: e.target.value },
                      })
                    }
                    className="mt-1 block h-8 w-full"
                  />
                </label>
                <label className={label}>
                  walking pace ×{draft.player.speed.toFixed(1)}
                  <input
                    type="range"
                    min={SPEED_RANGE.min}
                    max={SPEED_RANGE.max}
                    step={0.1}
                    value={draft.player.speed}
                    onChange={(e) =>
                      patch({
                        player: {
                          ...draft.player,
                          speed: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-2 block w-full"
                  />
                </label>
              </section>

              <section className="grid grid-cols-3 gap-3">
                <label className={label}>
                  hearts (mana granularity)
                  <input
                    type="number"
                    min={HEARTS_RANGE.min}
                    max={HEARTS_RANGE.max}
                    value={draft.hearts.count}
                    onChange={(e) =>
                      patch({ hearts: { count: Number(e.target.value) } })
                    }
                    className={cn(field, "mt-1")}
                  />
                </label>
                <label className={label}>
                  watching-ward color
                  <input
                    type="color"
                    value={draft.wards.watch}
                    onChange={(e) =>
                      patch({
                        wards: { ...draft.wards, watch: e.target.value },
                      })
                    }
                    className="mt-1 block h-8 w-full"
                  />
                </label>
                <label className={label}>
                  guarding-ward color
                  <input
                    type="color"
                    value={draft.wards.guard}
                    onChange={(e) =>
                      patch({
                        wards: { ...draft.wards, guard: e.target.value },
                      })
                    }
                    className="mt-1 block h-8 w-full"
                  />
                </label>
                <label
                  className={cn(label, "col-span-3 flex items-center gap-2")}
                >
                  <input
                    type="checkbox"
                    checked={draft.wards.fence}
                    onChange={(e) =>
                      patch({
                        wards: { ...draft.wards, fence: e.target.checked },
                      })
                    }
                  />
                  draw the boundary ward-fence when a hook can block (§14)
                </label>
              </section>

              <section>
                <p className="mb-1 text-xs text-primary">renames</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["tavern", "pool", "guide"] as const).map((key) => (
                    <label key={key} className={label}>
                      {key}
                      <input
                        value={draft.names[key]}
                        onChange={(e) =>
                          patch({
                            names: { ...draft.names, [key]: e.target.value },
                          })
                        }
                        className={cn(field, "mt-1")}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {AREAS.map((area) => (
                    <label key={area.id} className={label}>
                      {area.name}
                      <input
                        placeholder={area.name}
                        value={draft.names.areas[area.id] ?? ""}
                        onChange={(e) =>
                          patch({
                            names: {
                              ...draft.names,
                              areas: {
                                ...draft.names.areas,
                                [area.id]: e.target.value,
                              },
                            },
                          })
                        }
                        className={cn(field, "mt-1")}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-1 text-xs text-primary">
                  your own board notices ({draft.customQuests.length}/
                  {MAX_CUSTOM_QUESTS}) — a new side-quest type, posted by you
                </p>
                {draft.customQuests.map((quest, index) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional editor rows
                    key={index}
                    className="mb-2 grid grid-cols-[3rem_1fr_1fr_auto] gap-2"
                  >
                    <input
                      value={quest.icon}
                      onChange={(e) => {
                        const next = [...draft.customQuests];
                        next[index] = { ...quest, icon: e.target.value };
                        patch({ customQuests: next });
                      }}
                      className={field}
                    />
                    <input
                      placeholder="title"
                      value={quest.title}
                      onChange={(e) => {
                        const next = [...draft.customQuests];
                        next[index] = { ...quest, title: e.target.value };
                        patch({ customQuests: next });
                      }}
                      className={field}
                    />
                    <input
                      placeholder="task it prefills"
                      value={quest.task}
                      onChange={(e) => {
                        const next = [...draft.customQuests];
                        next[index] = { ...quest, task: e.target.value };
                        patch({ customQuests: next });
                      }}
                      className={field}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          customQuests: draft.customQuests.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                      className="text-xs text-muted hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {draft.customQuests.length < MAX_CUSTOM_QUESTS && (
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        customQuests: [
                          ...draft.customQuests,
                          { icon: "📜", title: "", detail: "", task: "" },
                        ],
                      })
                    }
                    className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
                  >
                    + post a notice
                  </button>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted hover:text-foreground"
          >
            reset draft to defaults
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={revert}
              disabled={revertDepth() === 0}
              title="Undo the last applied change"
              className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40"
            >
              ⟲ Revert last ({revertDepth()})
            </button>
            <button
              type="button"
              onClick={() => preview()}
              className="rounded border border-accent px-3 py-1.5 text-sm text-accent hover:opacity-90"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
