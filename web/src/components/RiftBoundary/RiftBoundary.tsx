import { useAtomValue } from "jotai";
import { Component, createRef, type ReactNode } from "react";
import { loadOverrides, revertDepth, revertOverrides } from "@/lib/overrides";
import { localToast } from "@/lib/socket";
import { gameStore, overridesAtom, riftTestAtom } from "@/store/gameAtoms";

interface Props {
  /** In-world name for what tore: "the world", "the HUD", "the Map"… */
  surface: string;
  children: ReactNode;
}

interface State {
  torn: boolean;
  detail: string;
}

/**
 * §19 — the real error boundary customization demands. Each customizable
 * surface gets its own, so a bad edit's blast radius is that surface and
 * nothing else: the agents keep running server-side, the other surfaces keep
 * rendering, and the message stays in-world with a genuine way out — sealing
 * the rift reverts the last change, patching it just remounts the surface.
 */
export default class RiftBoundary extends Component<Props, State> {
  state: State = { torn: false, detail: "" };
  private sealRef = createRef<HTMLButtonElement>();

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { torn: true, detail: String(error) };
  }

  componentDidCatch(): void {
    // A rift interrupts whatever the player was doing, and the element they
    // were on is likely gone with the surface — put the keyboard on the way
    // out. The crash itself is presented in-world below.
    this.sealRef.current?.focus();
  }

  /** Remount the surface without touching the overrides. */
  private patch = (): void => {
    gameStore.set(riftTestAtom, null);
    this.setState({ torn: false, detail: "" });
  };

  /** §19 one-click revert: undo the last change, then remount. */
  private seal = (): void => {
    gameStore.set(riftTestAtom, null);
    if (revertDepth() > 0) {
      const { current } = revertOverrides();
      gameStore.set(overridesAtom, current);
      localToast("info", "⟲ The last change is undone; the rift seals.");
    } else {
      // Nothing to revert — reload the persisted state and remount anyway.
      gameStore.set(overridesAtom, loadOverrides().current);
      localToast("info", "The rift seals. (No changes stood to revert.)");
    }
    this.setState({ torn: false, detail: "" });
  };

  render(): ReactNode {
    if (!this.state.torn) return this.props.children;
    return (
      <div className="pointer-events-auto absolute inset-x-0 top-1/3 z-40 flex justify-center px-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label={`A rift has torn open over ${this.props.surface}`}
          className="w-[520px] max-w-full rounded-lg border-2 border-destructive bg-card p-4 shadow-xl"
        >
          <h2 className="mb-1 text-destructive">
            ⚡ A rift has torn open over {this.props.surface}
          </h2>
          <p className="mb-1 text-xs text-muted">
            Something in {this.props.surface} broke while rendering. Your agents
            are unharmed — they run beneath the world, not inside it.
          </p>
          <p className="mb-3 truncate text-[10px] text-muted/70">
            {this.state.detail}
          </p>
          <div className="flex gap-2">
            <button
              ref={this.sealRef}
              type="button"
              onClick={this.seal}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              ⟲ Seal the rift (revert last change)
            </button>
            <button
              type="button"
              onClick={this.patch}
              className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Patch it (reload this surface)
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * §16 — `rift <surface>` summons a deliberate crash inside that surface's
 * boundary, so containment is demonstrable rather than theoretical.
 */
export function RiftTester({ surface }: { surface: string }) {
  const target = useAtomValue(riftTestAtom);
  if (target === surface) {
    throw new Error(`a summoned rift (cheat) tore open ${surface}`);
  }
  return null;
}
