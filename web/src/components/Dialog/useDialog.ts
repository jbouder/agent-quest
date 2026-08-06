import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import { focusableWithin } from "@/lib/focus";

/**
 * One overlay behaves like every other overlay. Every dialog in the village
 * spreads these props onto its panel and gets the same contract:
 *
 *  - Escape closes it, and only the top-most open dialog answers.
 *  - Tab and Shift+Tab cycle inside it instead of escaping to the world.
 *  - Focus lands in the panel on open and returns where it came from on close.
 *  - Screen readers see a labelled dialog, not an anonymous div.
 */

/** Open dialogs, oldest first. Only the last one answers Escape. */
const openDialogs: symbol[] = [];

export interface DialogOptions {
  open: boolean;
  onClose: () => void;
  /** Accessible name — every dialog has a visible heading; echo it here. */
  label: string;
  /**
   * Extra keys that also close, e.g. the Mirror's "m" toggle. Compared
   * lower-cased against `event.key`.
   */
  alsoCloseOn?: string[];
  /**
   * Side panels (the Chronicle, the debug console) sit alongside the world
   * rather than over it: they still close on Escape and restore focus, but
   * they don't trap Tab or claim `aria-modal`.
   */
  modal?: boolean;
}

export interface DialogProps {
  ref: RefObject<HTMLDivElement | null>;
  role: "dialog";
  tabIndex: -1;
  "aria-modal"?: true;
  "aria-label": string;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function useDialog({
  open,
  onClose,
  label,
  alsoCloseOn,
  modal = true,
}: DialogOptions): DialogProps {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol>(undefined as unknown as symbol);
  if (idRef.current === undefined) idRef.current = Symbol("dialog");

  // Note the opener during the render that opens the dialog, not in the
  // effect afterwards: React applies `autoFocus` at commit, so by effect time
  // the dialog's own field already holds focus and the trail is cold.
  const openerRef = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) openerRef.current = document.activeElement;
  wasOpen.current = open;

  // Read through refs so the listener subscribes once per open, not per
  // render — dialogs re-render on every snapshot the server pushes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const extras = (alsoCloseOn ?? []).map((key) => key.toLowerCase());
  const extrasKey = extras.join(",");

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    openDialogs.push(id);
    const extraKeys = extrasKey ? extrasKey.split(",") : [];

    const onKey = (event: globalThis.KeyboardEvent) => {
      // A dialog opened on top of this one owns the keyboard until it closes.
      if (openDialogs[openDialogs.length - 1] !== id) return;
      const closes =
        event.key === "Escape" || extraKeys.includes(event.key.toLowerCase());
      if (!closes) return;
      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const index = openDialogs.lastIndexOf(id);
      if (index !== -1) openDialogs.splice(index, 1);
    };
  }, [open, extrasKey]);

  // Focus in on open, and back where it came from on close. A dialog opened
  // by clicking takes focus from `body`, so closing it hands the keyboard
  // straight back to the game; one opened by Tab+Enter returns to its button.
  // Side panels don't pull focus at all — the world stays walkable beside
  // them, which it wouldn't be if they held the keyboard.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const opener = openerRef.current;
    if (modal && panel && !panel.contains(document.activeElement)) {
      (focusableWithin(panel)[0] ?? panel).focus();
    }
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, modal]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!modal || event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = focusableWithin(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return {
    ref: panelRef,
    role: "dialog",
    tabIndex: -1,
    ...(modal ? ({ "aria-modal": true } as const) : {}),
    "aria-label": label,
    onKeyDown,
  };
}
