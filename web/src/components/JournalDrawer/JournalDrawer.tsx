import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { agentsAtom, journalAtom, journalOpenAtom } from "@/store/gameAtoms";

/** §6 Journal — the toggleable scrollback combat log, across all agents. */
export default function JournalDrawer() {
  const open = useAtomValue(journalOpenAtom);
  const setOpen = useSetAtom(journalOpenAtom);
  const lines = useAtomValue(journalAtom);
  const agents = useAtomValue(agentsAtom);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [open, lines.length]);

  if (!open) return null;

  const labelOf = (agentId: string) =>
    agents.find((a) => a.id === agentId)?.label ?? agentId;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-10 flex w-96 max-w-[80vw] flex-col border-l-2 border-border bg-card/95">
      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm text-accent">📖 Journal</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          close (J)
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-[11px] leading-relaxed">
        {lines.length === 0 && (
          <p className="text-muted">Nothing has happened yet.</p>
        )}
        {lines.map((line) => (
          <p key={`${line.ts}-${line.agentId}-${line.text.slice(0, 20)}`}>
            <span className="text-muted">
              {new Date(line.ts).toLocaleTimeString([], {
                hour12: false,
              })}{" "}
              {labelOf(line.agentId)}
            </span>{" "}
            <span
              className={cn(
                line.kind === "error" && "text-destructive",
                line.kind === "permission" && "text-primary",
                line.kind === "result" && "text-accent",
                line.kind === "tool" && "text-foreground/80",
              )}
            >
              {line.text}
            </span>
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
