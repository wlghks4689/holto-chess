import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import { bestBotSelection, bestRunLoadout, pickBotAugment, rankBotPurchases, scoreBotPlan } from "./botStrategy";
import type { Augment, PlayerState } from "./types";

const deck = makeDeck();
const card = (id: string): Card => deck.find((item) => item.id === id)!;
const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: "p2", name: "리버 폭스", stackBB: 50, ownedCardIds: [], shopCardIds: [], selectedCardIds: [], shopSize: 3,
  purchasesThisRound: 0, rerollsUsed: 0, shopLocked: false, augments: [], points: 0, winStreak: 0, loseStreak: 0, eliminated: false,
  ...overrides,
});

describe("strategic bot planner", () => {
  it("prefers a made premium pair over buying an isolated ace", () => {
    const bot = player({ ownedCardIds: ["Kh"] });
    const ranked = rankBotPurchases(1, bot, [card("Kh")], [
      { card: card("Kc"), price: 18 },
      { card: card("As"), price: 20 },
    ]);
    expect(ranked[0]!.card.id).toBe("Kc");
    expect(ranked[0]!.plan.equity).toBeGreaterThan(ranked[1]!.plan.equity);
  });

  it("selects the strongest non-overlapping cards for R2 and partitions all four cards for R3", () => {
    expect(new Set(bestBotSelection(2, [card("As"), card("Ah"), card("2c")]))).toEqual(new Set(["As", "Ah"]));
    const split = bestBotSelection(3, [card("As"), card("Kh"), card("Qh"), card("Js")]);
    expect(split).toHaveLength(4);
    expect(new Set(split).size).toBe(4);
  });

  it("values completed R5 made hands and chooses the direct final scoring augment", () => {
    const made = scoreBotPlan(5, ["As", "Ah", "Ad", "Ks", "Kh", "2c", "3d"].map(card), 50, "made");
    const weak = scoreBotPlan(5, ["As", "Kh", "Qd", "9c", "7s", "4h", "2c"].map(card), 50, "weak");
    expect(made.utility).toBeGreaterThan(weak.utility);
    const choices: Augment[] = [
      { id: "shop_plus_one", name: "shop", description: "" },
      { id: "r5_hand_bonus", name: "final", description: "" },
      { id: "sell_bonus", name: "sell", description: "" },
    ];
    expect(pickBotAugment(player(), choices, 4, [card("As")]).id).toBe("r5_hand_bonus");
  });
});

// 7d6d wants the diamonds that extend it, not the ace that costs three times as much.
const SUITED_POOL: Record<string, number> = { "8d": 8, "5d": 5, "9d": 9, "8s": 8, As: 20, Kh: 18 };
const priced = (ids: string[]) => ids.map((id) => ({ card: card(id), price: SUITED_POOL[id]! }));

describe("draft synergy", () => {
  it("drafts the card that extends the hand over the bigger unrelated rank", () => {
    // R4 fields all five owned cards, so 7d6d5d + 8d is a live straight flush.
    const bot = player({ ownedCardIds: ["7d", "6d", "5d", "2c"] });
    const ranked = rankBotPurchases(4, bot, ["7d", "6d", "5d", "2c"].map(card),
      priced(["8d", "As", "Kh"]), { rulesVersion: 2 });
    expect(ranked[0]!.card.id).toBe("8d");
    expect(ranked[0]!.plan.potential).toBeGreaterThan(ranked[1]!.plan.potential);
  });

  it("scores reachable hands, not just the ranks already held", () => {
    const held = ["7d", "6d", "5d", "2c"].map(card);
    const extended = scoreBotPlan(4, [...held, card("8d")], 42, "synergy", { rulesVersion: 2 });
    const isolated = scoreBotPlan(4, [...held, card("As")], 30, "synergy", { rulesVersion: 2 });
    expect(extended.potential).toBeGreaterThan(isolated.potential);
    expect(extended.utility).toBeGreaterThan(isolated.utility);
  });

  it("separates identical ranks by the suit that keeps a draw alive", () => {
    const bot = player({ ownedCardIds: ["7d", "6d"] });
    const ranked = rankBotPurchases(2, bot, [card("7d"), card("6d")], priced(["8d", "8s"]), { rulesVersion: 2 });
    expect(ranked[0]!.card.id).toBe("8d");
  });

  it("still takes the premium pair when no draw is live", () => {
    const bot = player({ ownedCardIds: ["Ah", "2c"] });
    const ranked = rankBotPurchases(2, bot, [card("Ah"), card("2c")], priced(["As", "Kh"]), { rulesVersion: 2 });
    expect(ranked[0]!.card.id).toBe("As");
  });

  it("compares candidates on shared boards, so one card never wins on shuffle luck", () => {
    const bot = player({ ownedCardIds: ["7d", "6d"] });
    const options = priced(["8d", "5d", "9d", "As", "Kh"]);
    expect(rankBotPurchases(2, bot, [card("7d"), card("6d")], options, { rulesVersion: 2 }).map((e) => e.card.id))
      .toEqual(rankBotPurchases(2, bot, [card("7d"), card("6d")], [...options].reverse(), { rulesVersion: 2 }).map((e) => e.card.id));
  });
});

describe("R2 run loadout", () => {
  it("never anchors the dead card, which would play in both runs", () => {
    // 8d and 7d are close enough to trade places; the deuce is not.
    const loadout = bestRunLoadout(player({ ownedCardIds: ["8d", "7d", "2c"] }), ["8d", "7d", "2c"].map(card));
    expect(loadout[0]).not.toBe("2c");
    expect(new Set(loadout)).toEqual(new Set(["8d", "7d", "2c"]));
  });

  it("anchors the ace when the other two cards are dead weight", () => {
    const loadout = bestRunLoadout(player({ ownedCardIds: ["3c", "As", "8h"] }), ["3c", "As", "8h"].map(card));
    expect(loadout[0]).toBe("As");
  });

  it("is deterministic for the same player state", () => {
    const cards = ["Kd", "Qd", "4s"].map(card);
    const bot = player({ ownedCardIds: ["Kd", "Qd", "4s"] });
    expect(bestRunLoadout(bot, cards)).toEqual(bestRunLoadout(bot, cards));
  });
});
