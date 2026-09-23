import { describe, expect, it } from "vitest";
import { assertPoolIntegrity, releasePlayerCards } from "./cardPool";
import { BALANCE } from "./config";
import { autoPickDraft, beginSecondary, createGame, finalStandings, lockRunLoadouts, openDraft, prepareShowdown, resolvePrimary, resolveSecondary, resolveSurvival } from "./engine";
import { createMatchView } from "./matchView";
import type { PorenaGameState, Round } from "./types";

function fixture(round: Round, count: number, everyone = false): PorenaGameState {
  const game = createGame(20260922);
  game.round = round; game.phase = "SHOP";
  const alive = round === 5 ? 4 : round === 4 ? 6 : 8;
  for (const player of game.players) releasePlayerCards(game, player);
  game.players.forEach((player, index) => {
    player.eliminated = index >= alive;
    player.stackBB = 0;
    if (player.eliminated) return;
    const cards = index === 0 || everyone ? count : BALANCE.handLimits[round];
    for (const entry of game.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE").slice(0, cards)) {
      entry.state = "OWNED"; entry.ownerPlayerId = player.id; player.ownedCardIds.push(entry.card.id);
    }
  });
  expect(assertPoolIntegrity(game)).toBe(true);
  return game;
}

function primary(game: PorenaGameState) {
  if (game.round === 2) { game.phase = "RUN_LOADOUT"; return resolvePrimary(lockRunLoadouts(game, [])); }
  return resolvePrimary(prepareShowdown(game, []));
}

describe("insufficient-card showdown forfeits", () => {
  for (const round of [1, 2, 3, 4, 5] as const) {
    it.each([0, BALANCE.handLimits[round] - 1])(`R${round}: %i owned cards lose without fabricated cards or rewards`, (count) => {
      const before = fixture(round, count);
      const held = [...before.players[0]!.ownedCardIds];
      const after = primary(before);
      for (const match of after.roundResults.filter((match) => match.playerIds.includes("p1"))) {
        expect(match.winnerIds).not.toContain("p1");
        expect(match.revealedCardIds.p1).toEqual(held);
        expect(match.results.find((result) => result.playerId === "p1")!.hand).toMatchObject({ displayName: "몰수패", categoryRank: 0, bestFive: [] });
        expect(match.rewards!.find((reward) => reward.playerId === "p1")).toMatchObject({ deltaBB: 0, deltaPoints: 0 });
        expect(() => createMatchView(after, match)).not.toThrow();
      }
      expect(after.players[0]!.points).toBe(0);
      expect(after.players[0]!.stackBB).toBe(0);
      if (!after.players[0]!.eliminated) expect(after.players[0]!.ownedCardIds).toEqual(held);
      expect(assertPoolIntegrity(after)).toBe(true);
    });
  }
  it("still rejects an incomplete human hand submitted before the shop timeout", () => {
    expect(() => prepareShowdown(fixture(1, 1), ["p1"])).toThrow(/2장/);
  });
  it("both R1 players forfeit rather than splitting points or collecting loss BB", () => {
    const game = primary(fixture(1, 0, true));
    expect(game.phase).toBe("ROUND_RESULT");
    for (const match of game.roundResults) {
      expect(match.winnerIds).toEqual([]);
      expect(Object.values(match.swissAfter!).every((record) => record.draws === 0 && record.wins === 0)).toBe(true);
      expect(match.rewards!.every((reward) => reward.deltaPoints === 0 && reward.deltaBB === 0)).toBe(true);
    }
  });
  it("R3 all-forfeit survival uses the bounded draw, returns exactly six survivors, and no rewards", () => {
    let game = primary(fixture(3, 0, true));
    expect(game.survival).toBeDefined();
    game.phase = "SURVIVAL_READY";
    game = resolveSurvival(game);
    expect(game.players.filter((player) => !player.eliminated)).toHaveLength(6);
    expect(game.players.every((player) => player.points === 0 && player.stackBB === 0)).toBe(true);
    expect(game.roundResults[0]!.highCardDraw).toBeDefined();
    expect(assertPoolIntegrity(game)).toBe(true);
  });
  it("R4 all-forfeit brackets draw advancement only and finish with four survivors", () => {
    const first = primary(fixture(4, 0, true));
    expect(first.winnerGroup).toHaveLength(3); expect(first.loserGroup).toHaveLength(3);
    for (const match of first.roundResults) {
      expect(match.highCardDraw).toBeDefined();
      expect(Object.values(match.pointAwards!)).toEqual([0, 0]);
      expect(match.suddenDeathCount).toBe(0);
    }
    const game = resolveSecondary(beginSecondary(first));
    expect(game.players.filter((player) => !player.eliminated)).toHaveLength(4);
    expect(game.players.every((player) => player.points === 0 && player.stackBB === 0)).toBe(true);
    expect(game.roundResults.every((match) => !!match.highCardDraw)).toBe(true);
    expect(assertPoolIntegrity(game)).toBe(true);
  });
  it("R5 forfeit does not collect placement or hand score", () => {
    const game = fixture(5, 6);
    const after = primary(game);
    expect(after.phase).toBe("GAME_RESULT");
    expect(finalStandings(after).find((row) => row.playerId === "p1")).toMatchObject({ points: 0, handScore: 0, total: 0 });
    expect(Object.values(after.roundResults[0]!.pointAwards!).reduce((a, b) => a + b, 0)).toBe(37);
  });
  it("R5 all-forfeit result is still finite and settles zero rewards", () => {
    const game = primary(fixture(5, 0, true));
    expect(game.phase).toBe("GAME_RESULT");
    expect(game.roundResults[0]!.winnerIds).toEqual([]);
    expect(finalStandings(game).every((row) => Number.isFinite(row.total) && row.total === 0)).toBe(true);
  });
  it.each([2, 4] as const)("R%i draft advances an unaffordable pick without ownership or BB changes", (round) => {
    const game = fixture(round, 0, true);
    game.phase = "DRAFT_ORDER";
    game.draft = { cardIds: game.ownershipCardPool.slice(0, round === 2 ? 8 : 16).map((entry) => entry.card.id),
      order: game.players.filter((p) => !p.eliminated).map((p) => ({ playerId: p.id, points: 0, stackBB: 0 })), picks: [] };
    let after = openDraft(game);
    while (after.phase === "OPEN_DRAFT") after = autoPickDraft(after);
    expect(after.draft!.picks.every((pick) => pick.cardId === null && pick.price === 0)).toBe(true);
    expect(after.players.every((p) => p.stackBB === 0 && p.ownedCardIds.length === 0)).toBe(true);
    expect(primary(after).phase).toBe(round === 2 ? "ROUND_RESULT" : "GROUP_ASSIGNMENT");
    expect(assertPoolIntegrity(after)).toBe(true);
  });
});
