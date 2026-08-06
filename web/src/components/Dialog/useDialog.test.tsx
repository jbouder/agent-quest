import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDialog } from "./useDialog";

interface DialogHarnessProps {
  open: boolean;
  onClose: () => void;
  label?: string;
  alsoCloseOn?: string[];
  modal?: boolean;
}

function Panel({
  open,
  onClose,
  label = "Test dialog",
  alsoCloseOn,
  modal,
}: DialogHarnessProps) {
  const dialog = useDialog({ open, onClose, label, alsoCloseOn, modal });
  if (!open) return null;
  return (
    <div {...dialog}>
      <button type="button">first</button>
      <input aria-label="field" />
      <button type="button">last</button>
    </div>
  );
}

describe("useDialog", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Panel open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the extra accelerator keys, case-insensitively", () => {
    const onClose = vi.fn();
    render(<Panel open onClose={onClose} alsoCloseOn={["m"]} />);
    fireEvent.keyDown(window, { key: "M" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores keys once it is closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Panel open onClose={onClose} />);
    rerender(<Panel open={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("only the top-most dialog answers Escape", () => {
    const closeUnder = vi.fn();
    const closeOver = vi.fn();
    render(
      <>
        <Panel open onClose={closeUnder} label="under" />
        <Panel open onClose={closeOver} label="over" />
      </>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeOver).toHaveBeenCalledTimes(1);
    expect(closeUnder).not.toHaveBeenCalled();
  });

  it("is an accessible, labelled modal dialog", () => {
    render(<Panel open onClose={vi.fn()} label="The Mirror" />);
    const panel = screen.getByRole("dialog", { name: "The Mirror" });
    expect(panel).toHaveAttribute("aria-modal", "true");
  });

  it("focuses its first control on open", () => {
    render(<Panel open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("wraps Tab from the last control back to the first", () => {
    render(<Panel open onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("wraps Shift+Tab from the first control round to the last", () => {
    render(<Panel open onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("returns focus to whatever opened it", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            opener
          </button>
          <Panel open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(opener).toHaveFocus();
  });

  it("returns focus to the opener even when the dialog autoFocuses a field", () => {
    // React applies autoFocus at commit — before effects run — so a dialog
    // that grabs its own field would otherwise lose track of its opener.
    function AutoFocusPanel({ open, onClose }: DialogHarnessProps) {
      const dialog = useDialog({ open, onClose, label: "Autofocus" });
      if (!open) return null;
      return (
        <div {...dialog}>
          <input aria-label="field" autoFocus />
        </div>
      );
    }
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            opener
          </button>
          <AutoFocusPanel open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("textbox", { name: "field" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(opener).toHaveFocus();
  });

  describe("side panels (modal: false)", () => {
    it("still closes on Escape", () => {
      const onClose = vi.fn();
      render(<Panel open onClose={onClose} modal={false} />);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("leaves focus with the world instead of claiming it", () => {
      render(<Panel open onClose={vi.fn()} modal={false} />);
      expect(screen.getByRole("button", { name: "first" })).not.toHaveFocus();
    });

    it("lets Tab leave the panel", () => {
      render(<Panel open onClose={vi.fn()} modal={false} />);
      const last = screen.getByRole("button", { name: "last" });
      last.focus();
      const handled = fireEvent.keyDown(last, { key: "Tab" });
      // Not preventDefault()ed — the browser's own tab order takes over.
      expect(handled).toBe(true);
      expect(last).toHaveFocus();
    });
  });
});
