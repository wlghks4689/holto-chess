import { describe, expect, it } from "vitest";
import { purchaseLimitFor, rerollLimitFor } from "./config";
import { buyCard, createGame } from "./engine";
import type { Round } from "./types";

function buyThree(round: Round) {
  let state = createGame(160 + round); state.round = round; state.players[0].stackBB = 100;
  for (let count = 0; count < 3; count += 1) state = buyCard(state, "p1", state.players[0].shopCardIds[0]!);
  return state;
}

describe("round-specific shop limits", () => {
  it("uses purchase limits 2/2/2/3/3", () => {
    expect(([1, 2, 3, 4, 5] as Round[]).map(purchaseLimitFor)).toEqual([2, 2, 2, 3, 3]);
  });

  it("allows three purchases in R4", () => {
    expect(buyThree(4).players[0].purchasesThisRound).toBe(3);
  });

  it("allows three purchases in R5", () => {
    expect(buyThree(5).players[0].purchasesThisRound).toBe(3);
  });

  it("keeps the purchase limit at two before R4", () => {
    const state = createGame(163); state.round = 3; state.players[0].purchasesThisRound = 2;
    expect(() => buyCard(state, "p1", state.players[0].shopCardIds[0]!)).toThrow(/구매 횟수/);
  });

  it("uses reroll limits 2/2/2/2/3", () => {
    expect(([1, 2, 3, 4, 5] as Round[]).map(rerollLimitFor)).toEqual([2, 2, 2, 2, 3]);
  });
});
