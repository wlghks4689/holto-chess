import { expect, it } from "vitest";
import { createGame, resolvePrimary } from "./engine";
import { createRoundSummary } from "./roundSummary";

it("summarizes all Swiss matches without exposing unrevealed cards or boards", () => {
  const game = createGame(42);
  for (const p of game.players) {
    const id = p.shopCardIds.shift()!;
    p.ownedCardIds.push(id);
    const entry = game.ownershipCardPool.find((e) => e.card.id === id)!;
    entry.state = "OWNED"; entry.ownerPlayerId = p.id; delete entry.reservedPlayerId;
  }
  game.phase = "SHOWDOWN_PRIMARY";
  const result = resolvePrimary(game);
  const rows = createRoundSummary(result);
  expect(rows).toHaveLength(8);
  for (const row of rows) {
    expect(row.wins + row.draws + row.losses).toBe(3);
    expect(row.points).toBe(row.wins * 3 + row.draws);
    expect(row.cards.map((c) => c.id)).toEqual(result.players.find((p) => p.id === row.playerId)!.ownedCardIds);
    expect(row).not.toHaveProperty("boards");
  }
  result.players[0]!.ownedCardIds = [];
  expect(createRoundSummary(result).find((row) => row.playerId === result.players[0]!.id)!.cards).toHaveLength(2);
  result.round = 2;
  expect(createRoundSummary(result)).toEqual([]);
});
