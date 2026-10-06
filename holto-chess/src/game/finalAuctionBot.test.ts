import { expect, it } from "vitest";
import { createGame, startNextRound } from "./engine";
import { tickAuctionBots } from "./finalAuctionBot";
import { auctionBudget, bidFinalAuction } from "./finalAuction";
import { assertPoolIntegrity } from "./cardPool";

it("processes repeated live auction ticks within an input responsiveness budget", () => {
  let game = createGame(42);
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
