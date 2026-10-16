import { describe, expect, it } from "vitest";
import { cardPrice, purchaseLimitFor } from "./config";
import { abilityLockCost, abilityPrice, abilityPurchaseLimit, abilityRerollCost, abilityRerollLimit, abilitySellRefund, madeAbilityReward, predatorStreakReward, protectorLossReward, targetSniperWinReward } from "./abilities";
import { createAbilityGame, createGame, finishAbilityDeal, finishAbilitySelection } from "./engine";
import { ABILITY_IDS } from "./abilities";
import { rewardAbilities, rewardAbilityInterest } from "./abilityRewards";
import type { MatchResult } from "./types";
import { makeDeck } from "../core/poker/cards";

describe("confirmed ability rules", () => {
  it("deals eight different abilities at creation, the same for the same seed", () => {
    const game = createAbilityGame(42);
    expect(game.phase).toBe("ABILITY_DEAL");
    const dealt = game.players.map(player => player.abilityId);
    expect(dealt.every(id => id && ABILITY_IDS.includes(id))).toBe(true);
    expect(new Set(dealt).size).toBe(8);
    expect(createAbilityGame(42).players.map(player => player.abilityId)).toEqual(dealt);
    expect(game.ownershipCardPool.every(entry => entry.state === "AVAILABLE")).toBe(true);
    // The reveal grid lists every seat once.
    expect(game.abilityDraft!.picks.map(pick => pick.playerId)).toEqual(game.players.map(player => player.id));
  });

  it("deals the starting cards only after the reveal, and guarantees royal-blood a J, Q, K or A", () => {
    let game = createAbilityGame(42);
    if (!game.players.some(player => player.abilityId === "royal-blood")) game.players[0]!.abilityId = "royal-blood";
    game = finishAbilityDeal(game);
    expect(game.phase).toBe("ABILITY_REVEAL");
    expect(game.players.every(player => player.ownedCardIds.length === 0)).toBe(true);
    game = finishAbilitySelection(game);
    expect(game.phase).toBe("SHOP");
    expect(new Set(game.players.map(player => player.abilityId)).size).toBe(8);
    const royal = game.players.find(player => player.abilityId === "royal-blood")!;
    expect(game.ownershipCardPool.find(entry => entry.card.id === royal.firstCardId)!.card.rank).toBeGreaterThanOrEqual(11);
  });

  it("applies approved shop prices and trader fees", () => {
    // ABILITY-PATCH-002: Royal Blood buys J–A for nothing and sells them for nothing; 10 and lower are regular.
    for (const rank of [11, 12, 13, 14]) { expect(abilityPrice({ abilityId: "royal-blood" }, rank)).toBe(0); expect(abilitySellRefund({ abilityId: "royal-blood" }, rank)).toBe(0); }
    expect(abilityPrice({ abilityId: "royal-blood" }, 10)).toBe(cardPrice(10));
    expect(abilitySellRefund({ abilityId: "royal-blood" }, 10)).toBe(Math.floor(cardPrice(10) * 0.6));
    expect(abilitySellRefund({ abilityId: "golden-hand" }, 12)).toBe(cardPrice(12));
    expect(abilityPrice({ abilityId: "royal-blood" }, 9)).toBe(cardPrice(9));
    expect(abilityRerollCost({ abilityId: "trader" })).toBe(0);
    expect(abilityLockCost({ abilityId: "trader" })).toBe(0);
    expect(abilityRerollLimit({ abilityId: "trader" }, 1)).toBe(2);
    expect(abilityRerollLimit({ abilityId: "trader" }, 2)).toBe(0);
    // Trader buys one more card in every shop phase.
    for (const round of [1, 4, 5, 6] as const) expect(abilityPurchaseLimit({ abilityId: "trader" }, round, { rulesVersion: 2, sixRounds: true })).toBe(purchaseLimitFor(round, { rulesVersion: 2, sixRounds: true }) + 1);
    expect(abilityPurchaseLimit({ abilityId: "golden-hand" }, 4, { rulesVersion: 2, sixRounds: true })).toBe(purchaseLimitFor(4, { rulesVersion: 2, sixRounds: true }));
  });

  it("awards only the approved made-hand conditions", () => {
    const deck = makeDeck();
    const hand = { category: "STRAIGHT" as const, categoryRank: 4, displayName: "Straight", kickers: [9], bestFive: deck.filter(card => ["9c", "8d", "7h", "6s", "5c"].includes(card.id)) };
    // Target Sniper no longer pays for making a hand; it pays on wins (below).
    expect(madeAbilityReward({ abilityId: "target-sniper", firstCardId: "9c", ownedCardIds: ["9c"] }, hand, 1)).toEqual({ bb: 0, points: 0 });
    // Underdog: trips or better with one of the player's own deuces, in any round, win or lose.
    const deuce = deck.find(card => card.id === "2c")!;
    const tripDeuces = { category: "TRIPS" as const, categoryRank: 3, displayName: "Trips", kickers: [2], bestFive: deck.filter(card => ["2c", "2d", "2h", "Ks", "9d"].includes(card.id)) };
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: ["2c"] }, tripDeuces, 1)).toEqual({ bb: 0, points: 2 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: ["2c"] }, tripDeuces, 6, { sixRounds: true })).toEqual({ bb: 0, points: 2 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: ["Ks"] }, tripDeuces, 1)).toEqual({ bb: 0, points: 0 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: ["2c"] }, { ...tripDeuces, category: "TWO_PAIR", categoryRank: 2 }, 1)).toEqual({ bb: 0, points: 0 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: ["2c"] }, { ...hand, bestFive: [deuce, ...hand.bestFive.slice(1)] }, 5)).toEqual({ bb: 0, points: 2 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: ["9c"] }, hand, 5)).toEqual({ bb: 0, points: 0 });
    expect(madeAbilityReward({ abilityId: "architect", ownedCardIds: [] }, { ...hand, category: "QUADS", categoryRank: 7 }, 1)).toEqual({ bb: 0, points: 0 });
  });

  it("pays Target Sniper only while the owned starting card is in the BEST 5, at any hand strength", () => {
    const deck = makeDeck();
    const highCard = { category: "HIGH_CARD" as const, categoryRank: 1, displayName: "High card", kickers: [13], bestFive: deck.filter(card => ["Kc", "9c", "7d", "4h", "2s"].includes(card.id)) };
    const sniper = { abilityId: "target-sniper" as const, firstCardId: "9c", ownedCardIds: ["9c"] };
    expect(targetSniperWinReward(sniper, highCard)).toBe(15);
    expect(targetSniperWinReward({ ...sniper, ownedCardIds: [] }, highCard)).toBe(0);
    expect(targetSniperWinReward({ ...sniper, firstCardId: "Ah" }, highCard)).toBe(0);
    expect(targetSniperWinReward({ ...sniper, abilityId: "predator" }, highCard)).toBe(0);
  });

  it("scales Predator by the streak and tiers Protector by the pre-board win chance", () => {
    expect([1, 2, 3, 4, 5].map(predatorStreakReward)).toEqual([0, 10, 15, 20, 25]);
    expect([59.99, 60, 69.99, 70, 79.99, 80, 100].map(protectorLossReward)).toEqual([0, 20, 20, 30, 30, 50, 50]);
  });
});

describe("2026-10-01 rebalance through the match reward hook", () => {
  const deck = makeDeck();
  const hand = (ids: string[]) => ({ category: "HIGH_CARD" as const, categoryRank: 1, displayName: "High card", kickers: [14], bestFive: deck.filter(card => ids.includes(card.id)) });
  function duel(winners: string[], equity?: number) {
    const state = createGame(7);
    const [a, b] = state.players;
    a!.abilityId = "target-sniper"; a!.firstCardId = "9c"; a!.ownedCardIds = ["9c"];
    b!.abilityId = "zero-risk";
    const match = { id: "m1", boardResults: [[{ playerId: a!.id, hand: hand(["Ac", "9c", "7d", "4h", "2s"]) }, { playerId: b!.id, hand: hand(["Kd", "Qh", "8s", "5c", "3d"]) }]],
      boardWinnerIds: [winners], regulationWinnerIds: winners, equities: equity === undefined ? {} : { [b!.id]: { rawPercent: equity, insuranceEligible: equity >= 60 } } } as unknown as MatchResult;
    const before = [a!.stackBB, b!.stackBB];
    rewardAbilities(state, match);
    return [a!.stackBB - before[0]!, b!.stackBB - before[1]!];
  }
  it("pays Target Sniper on an outright win only, never on a split", () => {
    const state = createGame(7);
    expect(duel([state.players[0]!.id])[0]).toBe(15);
    expect(duel([state.players[0]!.id, state.players[1]!.id])[0]).toBe(0);
    expect(duel([state.players[1]!.id])[0]).toBe(0);
  });
  it("pays Protector by tier on an outright loss only", () => {
    const winner = createGame(7).players[0]!.id;
    expect([59, 65, 75, 85].map(equity => duel([winner], equity)[1])).toEqual([0, 20, 30, 50]);
    expect(duel([winner, createGame(7).players[1]!.id], 85)[1]).toBe(0);
  });
});

describe("ABILITY-PATCH-002 match and round rewards", () => {
  const deck = makeDeck();
  const quads = { category: "QUADS" as const, categoryRank: 7, displayName: "Quads", kickers: [9, 13], bestFive: deck.filter(card => ["9c", "9d", "9h", "9s", "Kd"].includes(card.id)) };
  function quadMatch(round: 1 | 4 | 6, points: number) {
    const state = createGame(7, "seeded", 2, false, true);
    state.round = round;
    const player = state.players[0]!; player.abilityId = "quad-core";
    const match = { id: "m1", stage: round === 6 ? "final" : "primary", boardResults: [[{ playerId: player.id, hand: quads }]],
      boardWinnerIds: [[player.id]], pointAwards: { [player.id]: points } } as unknown as MatchResult;
    const before = player.points;
    rewardAbilities(state, match);
    return player.points - before;
  }
  it("pays Quad Core the points the match already paid once more, and nothing for a match that paid none", () => {
    expect(quadMatch(1, 3)).toBe(3);
    expect(quadMatch(4, 5)).toBe(5);
    expect(quadMatch(4, 0)).toBe(0);
    // The final doubles its placement award separately (rewardQuadCorePlacement).
    expect(quadMatch(6, 30)).toBe(0);
  });
  it("pays Capitalism 25% interest, rounded down", () => {
    const state = createGame(7);
    state.phase = "ROUND_RESULT";
    const player = state.players[0]!; player.abilityId = "capitalism"; player.stackBB = 57;
    rewardAbilityInterest(state);
    expect(player.stackBB).toBe(71);
  });
});
