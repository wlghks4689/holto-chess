import { describe, expect, it } from "vitest";
import { autoStep } from "../tutorial/practiceState";
import { ABILITY_IDS, type AbilityId } from "./abilities";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE, cardPrice, regularShopSizeFor } from "./config";
import { rankBotPairs, rankBotPurchases } from "./botStrategy";
import { createAbilityGame, createGame, finishAbilityDeal, finishAbilitySelection, prepareShowdown, startNextRound } from "./engine";
import type { MatchResult, PorenaGameState } from "./types";

/** Deals R1 with chosen abilities on the first seats; the rest keep their drafted ones. */
function dealt(seed: number, first: AbilityId[]): PorenaGameState {
  const game = finishAbilityDeal(createAbilityGame(seed));
  const rest = ABILITY_IDS.filter((id) => !first.includes(id));
  game.players.forEach((player, i) => { player.abilityId = first[i] ?? rest[i - first.length]!; });
  return finishAbilitySelection(game);
}

function playUntil(state: PorenaGameState, done: (state: PorenaGameState) => boolean): PorenaGameState {
  for (let step = 0; step < 200 && !done(state); step += 1) state = autoStep(state);
  return state;
}

/** BB each loss should pay: base + step × losses already taken this round; wins and splits pay 0. */
function expectLossOnlyBB(matches: MatchResult[], round: 1 | 3) {
  const streak: Record<string, number> = {};
  const rule = BALANCE.matchLossBB[round];
  let paidLoss = false;
  for (const match of [...matches].sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0))) for (const reward of match.rewards!) {
    const won = match.winnerIds.includes(reward.playerId);
    const lost = !won && match.results.find((r) => r.playerId === reward.playerId)!.hand.categoryRank > 0;
    expect(reward.deltaBB).toBe(lost ? rule.base + rule.step * (streak[reward.playerId] ?? 0) : 0);
    if (lost) paidLoss = true;
    streak[reward.playerId] = won ? 0 : (streak[reward.playerId] ?? 0) + 1;
  }
  expect(paidLoss).toBe(true);
}

describe("R1 start: no free card except Royal Blood and Target Sniper", () => {
  it("deals nothing to ordinary seats, a 10+ card to Royal Blood and a random reference card to Target Sniper", () => {
    for (const seed of [1, 7, 42, 303]) {
      const game = dealt(seed, ["royal-blood", "target-sniper", "golden-hand"]);
      const [royal, sniper, golden, ...others] = game.players;
      expect(royal!.ownedCardIds).toHaveLength(1);
      expect(game.ownershipCardPool.find((e) => e.card.id === royal!.ownedCardIds[0])!.card.rank).toBeGreaterThanOrEqual(10);
      expect(sniper!.ownedCardIds).toHaveLength(1);
      expect(sniper!.firstCardId).toBe(sniper!.ownedCardIds[0]);
      for (const player of [golden!, ...others]) { expect(player.ownedCardIds).toEqual([]); expect(player.firstCardId).toBeUndefined(); }
      expect(game.players.every((p) => p.stackBB === BALANCE.startStackBB)).toBe(true);
      // Four shop cards each, five for Golden Hand.
      expect(golden!.shopCardIds).toHaveLength(regularShopSizeFor(1) + 1);
      for (const player of [royal!, sniper!, ...others]) expect(player.shopCardIds).toHaveLength(regularShopSizeFor(1));
      expect(assertPoolIntegrity(game)).toBe(true);
    }
  });

  it("deals nothing in a game without abilities (practice)", () => {
    const game = createGame(11);
    expect(game.players.every((p) => p.ownedCardIds.length === 0 && p.shopCardIds.length === BALANCE.r1ShopSize)).toBe(true);
  });

  it("lets every bot build a full R1 hand within the limits; Royal Blood and Target Sniper buy just one", () => {
    const start = dealt(5, ["royal-blood", "target-sniper"]);
    expect(start.players.map((player) => player.ownedCardIds.length)).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    const game = prepareShowdown(start, []);
    for (const player of game.players) {
      expect(player.ownedCardIds).toHaveLength(BALANCE.handLimits[1]);
      expect(player.purchasesThisRound).toBeLessThanOrEqual(BALANCE.purchaseLimits[1]);
      expect(player.stackBB).toBeGreaterThanOrEqual(0);
    }
    // The free card stays; one purchase fills the hand (a bot may still swap that card for a better one).
    for (const seat of [0, 1]) expect(game.players[seat]!.ownedCardIds).toContain(start.players[seat]!.firstCardId);
    expect(assertPoolIntegrity(game)).toBe(true);
  });

  it("has bots score two cards together, so a pocket pair beats a lone high card", () => {
    const game = createGame(3); const bot = game.players[1]!;
    const options = ["Qs", "8c", "8d", "2h"].map((id) => ({ card: game.ownershipCardPool.find((e) => e.card.id === id)!.card, price: cardPrice(game.ownershipCardPool.find((e) => e.card.id === id)!.card.rank) }));
    // One card at a time picks the Queen first; scoring the two-card hand finds the pair.
    expect(rankBotPurchases(1, bot, [], options)[0]!.card.id).toBe("Qs");
    expect(rankBotPairs(1, bot, [], options)[0]!.cards.map((c) => c.card.id).sort()).toEqual(["8c", "8d"]);
  });
});

describe("match BB goes to losers only", () => {
  it("R1 pays 0 for a win or split and 10/15/20 for consecutive losses", () => {
    const state = playUntil(createGame(21), (s) => s.phase === "ROUND_RESULT");
    expectLossOnlyBB(state.roundResults, 1);
  });

  it("R2 pays a flat 10BB per lost RUN and nothing for a won or split RUN", () => {
    const state = playUntil(createGame(22), (s) => s.round === 2 && s.phase === "ROUND_RESULT");
    for (const match of state.roundResults) {
      const runs = match.runRewards!;
      runs.forEach((rewards, run) => {
        const winners = match.boardWinnerIds[run]!;
        for (const reward of rewards) expect(reward.deltaBB).toBe(winners.length > 1 || winners.includes(reward.playerId) ? 0 : BALANCE.matchLossBB[2].base);
      });
      for (const total of match.rewards!) expect([0, 10, 20]).toContain(total.deltaBB);
    }
  });

  it("R3 restarts the loss streak, so R1/R2 losses never inflate the first R3 loss", () => {
    let state = playUntil(createGame(23), (s) => s.round === 2 && s.phase === "NEXT_ROUND");
    state.players.forEach((p) => { p.loseStreak = 2; });
    state = startNextRound(state);
    expect(state.players.every((p) => p.loseStreak === 0)).toBe(true);
    state = playUntil(state, (s) => s.round === 3 && (s.phase === "ROUND_RESULT" || s.phase === "SURVIVAL_READY"));
    expectLossOnlyBB(state.roundResults, 3);
  });

  it("keeps the base economy: start stack, round income, prices, reroll, lock, sell rate and BB score unit", () => {
    expect(BALANCE).toMatchObject({ startStackBB: 50, roundIncomeBB: 30, rerollCostBB: 5, cardLockCostBB: 3, sellRate: 0.6, stackScoreUnitBB: 10 });
    expect(BALANCE.rankPrices[14]).toBe(20);
    expect(BALANCE.purchaseLimits[1]).toBe(2);
    expect(BALANCE.handLimits[1]).toBe(2);
  });
});
