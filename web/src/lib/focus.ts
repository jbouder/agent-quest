/**
 * Keyboard-focus helpers shared by every overlay and by the game's input
 * gate. One definition of "a thing the user can Tab to" keeps the dialog
 * focus traps and the Phaser keyboard hand-off from drifting apart.
 */

/** Everything the browser hands keyboard focus to via Tab. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
]
  .map((tag) => `${tag}:not([disabled]):not([tabindex="-1"]):not([hidden])`)
  .join(",");

/** Tab-order list of the focusable controls inside `root`. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Text entry — where every keystroke belongs to the field, not the game. */
export function isTextEntry(node: unknown): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * True while a real DOM control holds focus. The game reads this to stand
 * down: without it Phaser's global capture calls `preventDefault()` on Enter
 * and Space, so a Tab-focused button never receives its activation click —
 * the world would interact instead of the button.
 */
export function domControlFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active === document.body || active.tagName === "CANVAS") return false;
  return active.matches(FOCUSABLE_SELECTOR) || active.isContentEditable;
}

/**
 * Hand the keyboard back to the world. Closing a dialog correctly returns
 * focus to whatever opened it — but a parked toolbar button holds the keys
 * that WASD needs, so the player needs a way to let go: clicking the world,
 * or pressing Escape when there's no dialog left to close.
 */
export function releaseToWorld(): void {
  if (domControlFocused()) (document.activeElement as HTMLElement).blur();
}
