import { render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { describe, expect, it } from "vitest";
import { playerAtom } from "@/store/gameAtoms";
import Hud from "./Hud";

function renderHud(player: {
  spentUsd: number;
  budgetUsd: number;
  tokensSpent: number;
  locked: boolean;
}) {
  const store = createStore();
  store.set(playerAtom, player);
  return render(
    <Provider store={store}>
      <Hud />
    </Provider>,
  );
}

describe("Hud", () => {
  it("shows spend against budget", () => {
    renderHud({
      spentUsd: 1.25,
      budgetUsd: 5,
      tokensSpent: 42_000,
      locked: false,
    });
    expect(screen.getByText(/\$1\.25 \/ \$5\.00/)).toBeInTheDocument();
    expect(screen.getByText(/42\.0k tokens/)).toBeInTheDocument();
  });

  it("offers a top-up when locked out", () => {
    renderHud({ spentUsd: 5, budgetUsd: 5, tokensSpent: 0, locked: true });
    expect(screen.getByText(/Out of budget/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Top up/ })).toBeInTheDocument();
  });
});
