import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiftBoundary from "./RiftBoundary";

function Bomb(): never {
  throw new Error("kaboom");
}

describe("RiftBoundary (§19)", () => {
  beforeEach(() => {
    // React logs caught render errors loudly; keep test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders children when nothing is wrong", () => {
    render(
      <RiftBoundary surface="the world">
        <p>all quiet</p>
      </RiftBoundary>,
    );
    expect(screen.getByText("all quiet")).toBeInTheDocument();
  });

  it("contains a crash: in-world message, no stack trace escape", () => {
    render(
      <RiftBoundary surface="the Tavern">
        <Bomb />
      </RiftBoundary>,
    );
    expect(
      screen.getByText(/A rift has torn open over the Tavern/),
    ).toBeInTheDocument();
    // the genuine way out (§19): revert or remount
    expect(
      screen.getByRole("button", { name: /Seal the rift/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Patch it/ }),
    ).toBeInTheDocument();
    // agents explicitly declared safe, in-world
    expect(screen.getByText(/Your agents are unharmed/)).toBeInTheDocument();
  });

  it("keeps the blast radius scoped: a sibling boundary is untouched", () => {
    render(
      <>
        <RiftBoundary surface="the Tavern">
          <Bomb />
        </RiftBoundary>
        <RiftBoundary surface="the Mirror">
          <p>the mirror still shows your agents</p>
        </RiftBoundary>
      </>,
    );
    expect(
      screen.getByRole("heading", {
        name: /A rift has torn open over the Tavern/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("the mirror still shows your agents"),
    ).toBeInTheDocument();
  });
});
