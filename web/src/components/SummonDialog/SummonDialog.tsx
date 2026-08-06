import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useDialog } from "@/components/Dialog";
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
  const dialog = useDialog({
    open,
    onClose: () => setUi({ mode: "roam" }),
    label: "The Scroll of Summoning",
  });

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
  // §8a/§11 — a live session can't be taken over, so we fork it and drive the
  // branch. The original keeps going; the prompt tells the twin as much.
  const attach = (sessionId: string, sessionCwd: string | null) => {
    sendCommand({
      type: "summon",
      task: "You are a fork of a session still running elsewhere in Agent Quest. Briefly summarize what that session was doing, then await instructions. Be careful: the original is still working in this directory, so check the current state of any file before changing it.",
      cwd: sessionCwd ?? cwd,
      model,
      permissionMode,
      attach: sessionId,
    });
    close();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
      <div
        {...dialog}
        className="w-[520px] max-w-[95vw] rounded-lg border-2 border-primary bg-card p-4 shadow-xl"
      >
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
            Revive or attach
          </button>
        </div>
        {tab === "resume" && (
          <p className="mb-2 text-[10px] text-muted">
            A ● live session is still being driven elsewhere. Attaching forks it
            into a twin you control — the original keeps running.
          </p>
        )}

        {tab === "new" ? (
          <>
            <label className="mb-2 block text-xs">
              Quest
              <textarea
                autoFocus
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
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
              <div
                key={session.sessionId}
                className="flex items-center gap-2 border-b border-border p-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    {session.live && (
                      <span className="mr-1 text-accent">● live</span>
                    )}
                    {session.summary}
                  </p>
                  <p className="truncate text-[10px] text-muted">
                    {new Date(session.lastModified).toLocaleString()} ·{" "}
                    {session.cwd ?? "unknown realm"}
                  </p>
                </div>
                {/* §8a — a live session gets forked, not revived: reviving one
                    would put two writers on the same transcript. */}
                <button
                  type="button"
                  onClick={() =>
                    session.live
                      ? attach(session.sessionId, session.cwd)
                      : revive(session.sessionId, session.cwd)
                  }
                  title={
                    session.live
                      ? "Fork this running session into a twin you control. The original keeps running."
                      : "Revive this finished session."
                  }
                  className="shrink-0 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:opacity-90"
                >
                  {session.live ? "Attach (fork)" : "Revive"}
                </button>
              </div>
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
