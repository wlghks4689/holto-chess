import { describe, expect, it } from "vitest";
import { purchaseLimitFor, rerollLimitFor } from "./config";
import { beginSecondary, buyCard, chooseAugment, createGame, finalStandings, leaveRoundResult, prepareShowdown, resolvePrimary, resolveSecondary, startNextRound } from "./engine";
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

describe("persisted snapshot trimming", () => {
  const score = (game: ReturnType<typeof createGame>) =>
    finalStandings(game).map((row) => [row.playerId, row.placement, row.total, row.handScore, row.stackScore, row.rankPoints]);

  it("keeps the played round's cinematic data and drops it once the next round starts", () => {
    let game = createGame(4242);
    let sawSnapshots = false;
    for (let round = 1; round <= 5; round += 1) {
      game = prepareShowdown(game, []);
      game = resolvePrimary(game);
      if (game.phase === "GROUP_ASSIGNMENT") { game = beginSecondary(game); game = resolveSecondary(game); }
      // R5 has no community board, so it produces no street snapshots.
      if (game.round < 5) {
        expect(game.roundResults.every((match) => match.streetSnapshots)).toBe(true);
        sawSnapshots = true;
      }
      if (round === 5) break;
      game = leaveRoundResult(game);
      if (game.phase === "AUGMENT") game = chooseAugment(game, "p1", game.augmentChoices[0]!.id);
      game = startNextRound(game);
      expect(game.matches.some((match) => match.streetSnapshots)).toBe(false);
    }
    expect(sawSnapshots).toBe(true);
  });

  it("final standings ignore street snapshots entirely", () => {
    let game = createGame(9001);
    for (let round = 1; round <= 5; round += 1) {
      game = prepareShowdown(game, []);
      game = resolvePrimary(game);
      if (game.phase === "GROUP_ASSIGNMENT") { game = beginSecondary(game); game = resolveSecondary(game); }
      if (round === 5) break;
      game = leaveRoundResult(game);
      if (game.phase === "AUGMENT") game = chooseAugment(game, "p1", game.augmentChoices[0]!.id);
      game = startNextRound(game);
    }
    const withHistory = score(game);
    // Strip every snapshot, including the final round's, and rescore.
    const stripped = structuredClone(game);
    for (const match of [...stripped.matches, ...stripped.roundResults]) delete match.streetSnapshots;
    expect(score(stripped)).toEqual(withHistory);
  });
});
