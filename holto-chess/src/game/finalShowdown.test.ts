import { describe, expect, it } from "vitest";
import { assertPoolIntegrity } from "./cardPool";
import { createGame, finalStandings, resolvePrimary } from "./engine";
import { FINAL_ROUND_PLACEMENT_POINTS } from "./config";
import { createMatchView } from "./matchView";

function finalFixture(hands: string[][]) {
  const game = createGame(88); game.round = 5; game.phase = "SHOWDOWN_PRIMARY";
  for (const entry of game.ownershipCardPool) { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; }
  game.players.forEach((player, index) => {
    player.eliminated = index >= 4; player.shopCardIds = []; player.selectedCardIds = [];
    player.ownedCardIds = hands[index] ?? []; player.points = 0; player.stackBB = 50;
    for (const id of player.ownedCardIds) {
      const entry = game.ownershipCardPool.find((e) => e.card.id === id)!;
      entry.state = "OWNED"; entry.ownerPlayerId = player.id;
    }
  });
  assertPoolIntegrity(game); return game;
}

describe("four-way last hand", () => {
  it("publishes seven cards, highlights five, pays configured shared placements and keeps the ledger", () => {
    const before = finalFixture([
      ["As", "Ks", "Qs", "Js", "Ts", "2c", "3c"],
      ["Ah", "Kh", "Qh", "Jh", "Th", "4c", "5c"],
      ["Ad", "Ac", "Kd", "Kc", "9s", "8s", "7h"],
      ["2s", "2h", "6s", "4s", "3h", "7d", "8d"],
    ]);
    const after = resolvePrimary(before); const match = after.roundResults[0];
    expect(match.playerIds).toHaveLength(4); expect(match.boards).toEqual([]);
    expect(match.winnerIds.sort()).toEqual(["p1", "p2"]);
    expect(match.results.find((r) => r.playerId === "p3")!.place).toBe(3);
    for (const result of match.results) {
      expect(result.usedCardIds).toHaveLength(5);
      expect(after.players.find((p) => p.id === result.playerId)!.points).toBe(FINAL_ROUND_PLACEMENT_POINTS[result.place]);
      expect(match.rewards!.find((r) => r.playerId === result.playerId)!.deltaBB).toBe(0);
    }
    for (const cards of Object.values(createMatchView(after, match).revealedCards)) expect(cards).toHaveLength(7);
    expect(after.ownershipCardPool).toEqual(before.ownershipCardPool);
    expect(() => resolvePrimary(after)).toThrow(); // no duplicate payout
  });
  it("uses all flush kickers, never suit, and explicitly breaks final-score ties by R5 place", () => {
    const after = resolvePrimary(finalFixture([
      ["As", "Ks", "Js", "9s", "8s", "2c", "3c"],
      ["Ah", "Kh", "Jh", "Th", "8h", "4c", "5c"],
      ["Ad", "Ac", "Kd", "Kc", "9d", "7s", "6h"],
      ["2s", "2h", "6s", "4s", "3h", "7d", "8d"],
    ]));
    expect(after.roundResults[0].winnerIds).toEqual(["p2"]);
    // Equal total, equal hand-category points; p2's R5 place must precede p1.
    after.players[0].points = 6; after.players[1].points = 6;
    const standings = finalStandings(after);
    expect(standings[0].total).toBe(standings[1].total);
    expect(standings.slice(0, 2).map((s) => [s.playerId, s.finalPlace])).toEqual([["p2", 1], ["p1", 2]]);
    for (const [bb, score] of [[9, 0], [10, 1], [29, 2], [50, 5]]) {
      after.players[0].stackBB = bb;
      expect(finalStandings(after).find((s) => s.playerId === "p1")!.stackScore).toBe(score);
    }
  });
});
