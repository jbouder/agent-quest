import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import type { PermissionMode } from "@/lib/protocol";
import { sendCommand } from "@/lib/socket";
import { defaultCwdAtom, uiModeAtom } from "@/store/gameAtoms";

const MODELS = [
  { id: "claude-haiku-4-5", name: "Haiku — light gear (fast, cheap)" },
  { id: "claude-sonnet-5", name: "Sonnet — knight gear (balanced)" },
  { id: "claude-opus-5", name: "Opus — heavy armor (hits harder)" },
  { id: "claude-fable-5", name: "Fable — legendary (rare, warded)" },
];

export default function SummonDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const defaultCwd = useAtomValue(defaultCwdAtom);
  const [task, setTask] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState("claude-sonnet-5");
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("default");

  useEffect(() => {
    if (cwd === "" && defaultCwd !== "") setCwd(defaultCwd);
  }, [cwd, defaultCwd]);

  if (ui.mode !== "summon") return null;

  const close = () => setUi({ mode: "roam" });
  const summon = () => {
    if (!task.trim() || !cwd.trim()) return;
    sendCommand({
      type: "summon",
      task: task.trim(),
      cwd: cwd.trim(),
      model,
      permissionMode,
    });
    setTask("");
    close();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
      <div className="w-[480px] rounded-lg border-2 border-primary bg-card p-4 shadow-xl">
        <h2 className="mb-1 text-primary">⟡ The Portal hums…</h2>
        <p className="mb-3 text-xs text-muted">
          Describe the quest, and an agent will step through.
        </p>

        <label className="mb-2 block text-xs">
          Quest
          <textarea
            autoFocus
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) summon();
            }}
            rows={3}
            placeholder="e.g. Add a --verbose flag to the CLI and update the README"
            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>

        <label className="mb-2 block text-xs">
          Realm (working directory)
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>

        <div className="mb-4 flex gap-2">
          <label className="flex-1 text-xs">
            Equipment (model)
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background p-2 text-sm text-foreground"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs">
            Gate (permissions)
            <select
              value={permissionMode}
              onChange={(e) =>
                setPermissionMode(e.target.value as PermissionMode)
              }
              className="mt-1 w-full rounded border border-border bg-background p-2 text-sm text-foreground"
            >
              <option value="default">Ask me (default)</option>
              <option value="acceptEdits">Auto-accept edits</option>
              <option value="plan">Plan first</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Walk away (Esc)
          </button>
          <button
            type="button"
            onClick={summon}
            disabled={!task.trim() || !cwd.trim()}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          >
            Summon (⌘↵)
          </button>
        </div>
      </div>
    </div>
  );
}
