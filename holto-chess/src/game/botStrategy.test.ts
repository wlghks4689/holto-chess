import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import { bestBotSelection, pickBotAugment, rankBotPurchases, scoreBotPlan } from "./botStrategy";
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
