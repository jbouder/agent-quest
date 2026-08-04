import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { MODELS } from "@/lib/models";
import type { PermissionMode } from "@/lib/protocol";
import { sendCommand } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  defaultCwdAtom,
  savedSessionsAtom,
  summonPrefillAtom,
  uiModeAtom,
} from "@/store/gameAtoms";

export default function SummonDialog() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const defaultCwd = useAtomValue(defaultCwdAtom);
  const sessions = useAtomValue(savedSessionsAtom);
  const [prefill, setPrefill] = useAtom(summonPrefillAtom);
  const [tab, setTab] = useState<"new" | "resume">("new");
  const [task, setTask] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState("claude-sonnet-5");
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("default");
  const open = ui.mode === "summon";

  useEffect(() => {
    if (cwd === "" && defaultCwd !== "") setCwd(defaultCwd);
  }, [cwd, defaultCwd]);

  // §9a — a quest accepted at the board carries over to the scroll.
  useEffect(() => {
    if (open && prefill) {
      setTask(prefill);
      setTab("new");
      setPrefill("");
    }
  }, [open, prefill, setPrefill]);

  // §8a — fetch the list of revivable sessions when that tab opens.
  useEffect(() => {
    if (open && tab === "resume") sendCommand({ type: "listSessions" });
  }, [open, tab]);

  if (!open) return null;

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
  const revive = (sessionId: string, sessionCwd: string | null) => {
    sendCommand({
      type: "summon",
      task: "You have been revived in Agent Quest. Briefly summarize where this session left off, then await instructions.",
      cwd: sessionCwd ?? cwd,
      model,
      permissionMode,
      resume: sessionId,
    });
    close();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
      <div className="w-[520px] rounded-lg border-2 border-primary bg-card p-4 shadow-xl">
        <h2 className="mb-1 text-primary">✨ The Scroll of Summoning</h2>
        <div className="mb-3 flex gap-3 text-xs">
          <button
            type="button"
            onClick={() => setTab("new")}
            className={cn(
              tab === "new"
                ? "text-primary"
                : "text-muted hover:text-foreground",
            )}
          >
            New quest
          </button>
          <button
            type="button"
            onClick={() => setTab("resume")}
            className={cn(
              tab === "resume"
                ? "text-primary"
                : "text-muted hover:text-foreground",
            )}
          >
            Revive a past session
          </button>
        </div>

        {tab === "new" ? (
          <>
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
          </>
        ) : (
          <div className="mb-2 max-h-52 overflow-y-auto rounded border border-border bg-background">
            {sessions.length === 0 && (
              <p className="p-3 text-xs text-muted">
                Consulting the archives… (or there's nothing to revive)
              </p>
            )}
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => revive(session.sessionId, session.cwd)}
                className="block w-full border-b border-border p-2 text-left last:border-0 hover:bg-card"
              >
                <p className="truncate text-xs">{session.summary}</p>
                <p className="truncate text-[10px] text-muted">
                  {new Date(session.lastModified).toLocaleString()} ·{" "}
                  {session.cwd ?? "unknown realm"}
                </p>
              </button>
            ))}
          </div>
        )}

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
                  {m.name} — {m.gear}
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
              <option value="plan">Plan first (draft quest)</option>
              <option value="auto">Gatekeeper decides (auto)</option>
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
          {tab === "new" && (
            <button
              type="button"
              onClick={summon}
              disabled={!task.trim() || !cwd.trim()}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
            >
              Summon (⌘↵)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
