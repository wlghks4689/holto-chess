import { describe, expect, it } from "vitest";
import { cardPrice } from "./config";
import { abilityLockCost, abilityPrice, abilityRerollCost, abilityRerollLimit, madeAbilityReward, predatorStreakReward, protectorLossReward, targetSniperWinReward } from "./abilities";
import { createAbilityGame, createGame, finishAbilityDeal, finishAbilitySelection } from "./engine";
import { ABILITY_IDS } from "./abilities";
import { rewardAbilities } from "./abilityRewards";
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

  it("deals the starting cards only after the reveal, and guarantees royal-blood a face card", () => {
    let game = createAbilityGame(42);
    if (!game.players.some(player => player.abilityId === "royal-blood")) game.players[0]!.abilityId = "royal-blood";
    game = finishAbilityDeal(game);
    expect(game.phase).toBe("ABILITY_REVEAL");
    expect(game.players.every(player => player.ownedCardIds.length === 0)).toBe(true);
    game = finishAbilitySelection(game);
    expect(game.phase).toBe("SHOP");
    expect(new Set(game.players.map(player => player.abilityId)).size).toBe(8);
    const royal = game.players.find(player => player.abilityId === "royal-blood")!;
    expect(game.ownershipCardPool.find(entry => entry.card.id === royal.firstCardId)!.card.rank).toBeGreaterThanOrEqual(10);
  });

  it("applies approved shop prices and trader fees", () => {
    expect(abilityPrice({ abilityId: "royal-blood" }, 12)).toBe(7);
    expect(abilityPrice({ abilityId: "royal-blood" }, 9)).toBe(cardPrice(9));
    expect(abilityRerollCost({ abilityId: "trader" })).toBe(0);
    expect(abilityLockCost({ abilityId: "trader" })).toBe(0);
    expect(abilityRerollLimit({ abilityId: "trader" }, 1)).toBe(2);
    expect(abilityRerollLimit({ abilityId: "trader" }, 2)).toBe(0);
  });

  it("awards only the approved made-hand conditions", () => {
    const deck = makeDeck();
    const hand = { category: "STRAIGHT" as const, categoryRank: 4, displayName: "Straight", kickers: [9], bestFive: deck.filter(card => ["9c", "8d", "7h", "6s", "5c"].includes(card.id)) };
    // Target Sniper no longer pays for making a hand; it pays on wins (below).
    expect(madeAbilityReward({ abilityId: "target-sniper", firstCardId: "9c", ownedCardIds: ["9c"] }, hand, 1)).toEqual({ bb: 0, points: 0 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: [] }, { ...hand, bestFive: [{ ...deck[0]!, rank: 2 }, ...hand.bestFive.slice(1)] }, 5)).toEqual({ bb: 0, points: 20 });
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
