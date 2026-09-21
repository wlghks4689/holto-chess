import { describe, expect, it } from "vitest";
import { assertPoolIntegrity, ownershipCounts, releasePlayerCards } from "./cardPool";
import { createGame, resolvePrimary, resolveSecondary } from "./engine";

function fixture(seed: number) {
  const game = createGame(seed);
  game.round = 4;
  game.phase = "SHOWDOWN_SECONDARY";
  for (const player of game.players) releasePlayerCards(game, player);
  game.players.forEach((player, index) => {
    player.eliminated = index >= 6;
    player.winStreak = index % 2 ? 0 : 2;
    player.loseStreak = index % 2 ? 2 : 0;
    if (player.eliminated) return;
    for (const entry of game.ownershipCardPool.slice(index * 5, index * 5 + 5)) {
      entry.state = "OWNED";
      entry.ownerPlayerId = player.id;
      player.ownedCardIds.push(entry.card.id);
    }
  });
  game.winnerGroup = ["p1", "p2", "p3"];
  game.loserGroup = ["p4", "p5", "p6"];
  return game;
}

describe("R4 rewards", () => {
  it.each([1, 17, 303, 707, 9001])("awards placement points independently of streak BB (seed %i)", (seed) => {
    const before = fixture(seed);
    const after = resolveSecondary(before);
    const winner = after.roundResults.find((match) => match.group === "winner")!;
    for (const result of winner.results) {
      const player = before.players.find((p) => p.id === result.playerId)!;
      const won = winner.winnerIds.includes(player.id);
      const points = ({ 1: 10, 2: 5, 3: 3 } as Record<number, number>)[result.place];
      const bb = won ? 20 + player.winStreak * 5 : player.loseStreak * 10;
      expect(winner.pointAwards![player.id]).toBe(points);
      expect(winner.rewards!.find((r) => r.playerId === player.id)).toMatchObject({ deltaPoints: points, deltaBB: bb });
      expect(after.players.find((p) => p.id === player.id)!.points - player.points).toBe(points);
    }
    const loser = after.roundResults.find((match) => match.group === "loser")!;
    expect(loser.rewards!.every((r) => r.deltaBB === 0 && r.deltaPoints === 0)).toBe(true);
    expect(after.players.filter((p) => !p.eliminated)).toHaveLength(4);
    expect(assertPoolIntegrity(after)).toBe(true);
  });

  it("awards 6P for primary wins, preserving 5P splits", () => {
    const before = fixture(17);
    before.phase = "SHOWDOWN_PRIMARY";
    const after = resolvePrimary(before);
    for (const match of after.roundResults) {
      const awardIds = match.regulationWinnerIds ?? match.winnerIds;
      for (const id of match.playerIds) {
        expect(match.pointAwards![id]).toBe(awardIds.includes(id) ? match.regulationWinnerIds ? 5 : 6 : 0);
      }
    }
  });
});

describe("ownership meter", () => {
  it.each([1, 2, 3, 4, 5] as const)("includes shop reservations in remaining cards in R%i", (round) => {
    const game = fixture(1);
    game.round = round;
    const entry = game.ownershipCardPool.find((card) => card.state === "AVAILABLE")!;
    entry.state = "RESERVED_IN_SHOP";
    entry.reservedPlayerId = "p1";
    game.players[0].shopCardIds.push(entry.card.id);
    expect(assertPoolIntegrity(game)).toBe(true);
    expect(ownershipCounts(game)).toEqual({ remaining: 22, owned: 30 });
    releasePlayerCards(game, game.players[0]);
    const counts = ownershipCounts(game);
    expect(counts.remaining + counts.owned).toBe(52);
    expect(counts.owned).toBe(25);
  });
});
