import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { combinationScore } from "./auctionCardValue";
import { createGame, startNextRound } from "./engine";
import { auctionSpendShare, chooseCardAuctionBotBid, tickAuctionBots, type CardAuctionBotInput } from "./finalAuctionBot";
import { auctionBudget, bidFinalAuction } from "./finalAuction";
import { assertPoolIntegrity } from "./cardPool";

it("processes repeated live auction ticks within an input responsiveness budget", () => {
  let game = createGame(42, "seeded", 2, false, false);
  game.round = 4; game.phase = "NEXT_ROUND";
  game.ownershipCardPool.forEach(e => { e.state = "AVAILABLE"; delete e.ownerPlayerId; delete e.reservedPlayerId; });
  game.players.forEach((p, i) => {
    p.eliminated = i >= 4; p.ownedCardIds = []; p.shopCardIds = []; p.lockedShopCardIds = []; p.stackBB = 100;
    if (i < 4) for (const entry of game.ownershipCardPool.slice(i * 5, i * 5 + 5)) {
      entry.state = "OWNED"; entry.ownerPlayerId = p.id; p.ownedCardIds.push(entry.card.id);
    }
  });
  game = startNextRound(game, 10_000);
  const cardId = game.finalAuction!.cardIds[0]!;
  game = bidFinalAuction(game, "p1", {cardId, expectedHighestAmount:null}, 11_000);
  const source = structuredClone(game);
  const start = performance.now();
  for (const now of [21_000, 26_000, 31_000]) game = tickAuctionBots(game, ["p1"], now);
  const elapsed = performance.now() - start;
  // Generous across test hosts, but catches the previous multi-second synchronous evaluator.
  expect(elapsed).toBeLessThan(500);
  expect(game.phase).toBe("FINAL_AUCTION");
  expect(assertPoolIntegrity(game)).toBe(true);
  expect(source.finalAuction!.bidSequence).toBe(1);
  for (const p of game.players) {
    const budget = auctionBudget(game, p.id);
    expect(budget.leadingCount).toBeLessThanOrEqual(2);
    expect(budget.availableBidBB).toBeGreaterThanOrEqual(0);
  }
});

describe("R3 card auction bot", () => {
  const deck = makeDeck();
  const c = (id: string) => deck.find((card) => card.id === id)!;
  const owned = ["As", "Qh", "8h"].map(c);
  const offerIds = ["Ah", "Qc", "8c", "Jh", "2d", "5s"];
  const values = Object.fromEntries(offerIds.map((id) => [id, combinationScore(owned, c(id)).value]));
  const input = (highest: Record<string, number>, leading?: string): CardAuctionBotInput => ({
    offers: offerIds.map((id) => ({ card: c(id), highestAmount: highest[id] ?? null, isMine: id === leading })),
    values, rivalValues: {}, availableBB: 120 - (leading ? highest[leading]! : 0), leadingCount: leading ? 1 : 0,
    maxWins: 1, minRaiseBB: 3, urgency: 0.5,
  });

  it("competes for its best card while the price is still worth it", () => {
    expect(chooseCardAuctionBotBid(input({ Ah: 40 }))).toMatchObject({ cardId: "Ah", expectedHighestAmount: 40, amount: 43 });
  });

  it("drops the best card once its price passes the ceiling and takes the next route", () => {
    // The user's example: 120BB stack, the ace already at 100BB.
    const choice = chooseCardAuctionBotBid(input({ Ah: 100 }))!;
    expect(choice.cardId).not.toBe("Ah");
    // Qc (QQ) and 5s (double suited with the nut spades) both score 9; the cheaper uncontested one wins.
    expect(values[choice.cardId]).toBeGreaterThanOrEqual(7);
    expect(choice.cardId).toBe("5s");
  });

  it("keeps a lead unless another card is clearly better, then moves its bid", () => {
    expect(chooseCardAuctionBotBid(input({ Qc: 9 }, "Qc"))).toMatchObject({ cardId: "Ah" });
    expect(chooseCardAuctionBotBid(input({ Ah: 20 }, "Ah"))).toBeNull();
  });

  it("spends more of its stack on higher scores, all of it only near 20", () => {
    expect(auctionSpendShare(4)).toBe(0);
    expect(auctionSpendShare(10)).toBeCloseTo(0.28, 1);
    expect(auctionSpendShare(14)).toBeCloseTo(0.54, 1);
    expect(auctionSpendShare(17)).toBeCloseTo(0.76, 1);
    expect(auctionSpendShare(20)).toBe(1);
  });
});
