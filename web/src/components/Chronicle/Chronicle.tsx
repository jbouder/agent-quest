import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/Dialog";
import type { JournalKind } from "@/lib/protocol";
import { cn } from "@/lib/utils";
import { agentsAtom, chronicleOpenAtom, journalAtom } from "@/store/gameAtoms";

const KIND_FILTERS: { value: JournalKind | "all"; label: string }[] = [
  { value: "all", label: "everything" },
  { value: "tool", label: "tool calls" },
  { value: "permission", label: "permissions" },
  { value: "error", label: "errors" },
  { value: "result", label: "completions" },
  { value: "text", label: "words" },
  { value: "status", label: "status" },
];

/**
 * §6a The Chronicle — every agent's journal merged into one chronological
 * stream, filterable by agent and event type. The answer to "what happened
 * while I was away," reachable from the icon row rather than any location.
 */
export default function Chronicle() {
  const [open, setOpen] = useAtom(chronicleOpenAtom);
  const lines = useAtomValue(journalAtom);
  const agents = useAtomValue(agentsAtom);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<JournalKind | "all">("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  // A side panel, not a modal: it sits beside the world rather than over it,
  // so Tab is free to leave it. Escape and J both close it.
  const dialog = useDialog({
    open,
    onClose: () => setOpen(false),
    label: "Chronicle",
    alsoCloseOn: ["j"],
    modal: false,
  });

  const shown = lines.filter(
    (line) =>
      (agentFilter === "all" || line.agentId === agentFilter) &&
      (kindFilter === "all" || line.kind === kindFilter),
  );

  const shownCount = shown.length;
  useEffect(() => {
    // follow the feed: re-scroll whenever a visible line arrives
    if (open && shownCount >= 0)
      bottomRef.current?.scrollIntoView({ block: "end" });
  }, [open, shownCount]);

  if (!open) return null;

  const labelOf = (agentId: string) =>
    agents.find((a) => a.id === agentId)?.label ?? agentId;

  return (
    <div
      {...dialog}
      className="absolute top-0 right-0 bottom-0 z-10 flex w-96 max-w-[80vw] flex-col border-l-2 border-border bg-card/95"
    >
      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm text-accent">📜 Chronicle</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          close (Esc/J)
        </button>
      </div>
      <div className="flex gap-2 border-b border-border px-3 py-1.5">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="flex-1 rounded border border-border bg-background p-1 text-[11px] text-foreground"
        >
          <option value="all">all agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
            </option>
          ))}
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as JournalKind | "all")}
          className="flex-1 rounded border border-border bg-background p-1 text-[11px] text-foreground"
        >
          {KIND_FILTERS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-[11px] leading-relaxed">
        {shown.length === 0 && (
          <p className="text-muted">
            {lines.length === 0
              ? "Nothing has happened yet."
              : "Nothing matches these filters."}
          </p>
        )}
        {/* The journal keeps whole messages so the talk dialog can be expanded
            to read them. Here the point is the sweep of events, so a long line
            is clamped instead of flooding the feed. */}
        {shown.map((line) => (
          <p
            key={`${line.ts}-${line.agentId}-${line.text.slice(0, 20)}`}
            className="mb-1 line-clamp-3 whitespace-pre-wrap break-words"
          >
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
