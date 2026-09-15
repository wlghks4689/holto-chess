import { describe, expect, it } from "vitest";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE } from "./config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, createGame, finalStandings,
  leaveRoundResult, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  sellCard, startNextRound, toggleSelectedCard,
} from "./engine";
import type { HoltoChessGameState } from "./types";

function fillHuman(state: HoltoChessGameState): HoltoChessGameState {
  const target = BALANCE.handLimits[state.round];
  while (state.players[0]!.ownedCardIds.length < target) {
    const id = state.players[0]!.shopCardIds[0];
    if (!id) throw new Error("test shop unexpectedly empty");
    state = buyCard(state, "p1", id);
  }
  return state;
}

function playRound(state: HoltoChessGameState): HoltoChessGameState {
  state = fillHuman(state); state = prepareShowdown(state);
  if (state.phase === "DECK_SELECT") {
    for (const id of state.players[0]!.ownedCardIds.slice(0, 2)) state = toggleSelectedCard(state, "p1", id);
    state = confirmSelection(state);
  }
  state = resolvePrimary(state);
  if (state.phase === "GROUP_ASSIGNMENT") { state = beginSecondary(state); state = resolveSecondary(state); }
  return state;
}

describe("Holto Chess engine", () => {
  it("reserves shops globally without duplicate cards", () => {
    const state = createGame(101);
    const ids = state.players.flatMap((player) => player.shopCardIds);
    expect(ids).toHaveLength(24); expect(new Set(ids).size).toBe(24); expect(assertPoolIntegrity(state)).toBe(true);
  });

  it("returns rerolled and sold cards to legal pool states", () => {
    let state = createGame(202);
    state = rerollShop(state, "p1");
    expect(state.players[0]!.shopCardIds).toHaveLength(3);
    expect(new Set(state.players.flatMap((player) => player.shopCardIds)).size).toBe(24);
    const bought = state.players[0]!.shopCardIds[0]!; state = buyCard(state, "p1", bought); state = sellCard(state, "p1", bought);
    expect(state.ownershipCardPool.find((entry) => entry.card.id === bought)?.state).toBe("AVAILABLE"); expect(assertPoolIntegrity(state)).toBe(true);
  });

  it("completes the specified 8 → 8 → 6 → 6 → 4 → 4 flow", () => {
    let state = createGame(303); const expectedAlive = [8, 6, 6, 4, 4];
    for (let round = 1; round <= 5; round += 1) {
      state = playRound(state);
      expect(state.players.filter((player) => !player.eliminated)).toHaveLength(expectedAlive[round - 1]);
      expect(assertPoolIntegrity(state)).toBe(true);
      if (round === 5) break;
      state = leaveRoundResult(state);
      if (state.phase === "AUGMENT") state = chooseAugment(state, "p1", state.augmentChoices[0]!.id);
      state = startNextRound(state);
    }
    expect(state.phase).toBe("GAME_RESULT"); expect(finalStandings(state)).toHaveLength(4);
  });

  it("never reuses primary boards in R2 or R4 secondary showdowns", () => {
    let state = playRound(createGame(404)); state = startNextRound(leaveRoundResult(state));
    state = fillHuman(state); state = prepareShowdown(state);
    for (const id of state.players[0]!.ownedCardIds.slice(0, 2)) state = toggleSelectedCard(state, "p1", id);
    state = confirmSelection(state); state = resolvePrimary(state);
    const primarySignatures = new Set(state.communityBoards.map((board) => board.map((card) => card.id).join("-")));
    state = resolveSecondary(beginSecondary(state));
    const allSignatures = state.communityBoards.map((board) => board.map((card) => card.id).join("-"));
    expect(new Set(allSignatures).size).toBe(allSignatures.length);
    expect(allSignatures.slice(primarySignatures.size).every((signature) => !primarySignatures.has(signature))).toBe(true);
  });
});
