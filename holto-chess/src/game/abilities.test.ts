import { describe, expect, it } from "vitest";
import { cardPrice } from "./config";
import { abilityLockCost, abilityPrice, abilityRerollCost, abilityRerollLimit, madeAbilityReward } from "./abilities";
import { createAbilityGame, finishAbilitySelection, openAbilitySelection, pickAbility } from "./engine";
import { makeDeck } from "../core/poker/cards";

describe("confirmed ability rules", () => {
  it("assigns eight unique choices and guarantees royal-blood a face start card", () => {
    let game = createAbilityGame(42);
    game = openAbilitySelection(game);
    const royalSlot = game.abilityDraft!.deck.indexOf("royal-blood");
    game = pickAbility(game, game.abilityDraft!.order[0]!, royalSlot);
    while (game.phase === "ABILITY_PICK") game = pickAbility(game, game.abilityDraft!.order[game.abilityDraft!.picks.length]!, game.abilityDraft!.deck.findIndex((_, slot) => !game.abilityDraft!.picks.some(pick => pick.slot === slot)));
    game = finishAbilitySelection(game);
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
    expect(madeAbilityReward({ abilityId: "target-sniper", firstCardId: "9c", ownedCardIds: ["9c"] }, hand, 1)).toEqual({ bb: 15, points: 0 });
    expect(madeAbilityReward({ abilityId: "target-sniper", firstCardId: "9c", ownedCardIds: ["9c"] }, { ...hand, bestFive: hand.bestFive.filter(card => card.id !== "9c") }, 1)).toEqual({ bb: 0, points: 0 });
    expect(madeAbilityReward({ abilityId: "underdog", ownedCardIds: [] }, { ...hand, bestFive: [{ ...deck[0]!, rank: 2 }, ...hand.bestFive.slice(1)] }, 5)).toEqual({ bb: 0, points: 20 });
    expect(madeAbilityReward({ abilityId: "architect", ownedCardIds: [] }, { ...hand, category: "QUADS", categoryRank: 7 }, 1)).toEqual({ bb: 0, points: 0 });
  });
});
