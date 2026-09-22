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
  it("keeps category scores fixed and reports augment bonuses separately", () => {
    const after = resolvePrimary(finalFixture([
      ["As", "Ah", "Kd", "Qc", "Jd", "9c", "8h"],
      ["Ks", "Kh", "Ad", "Qd", "Jc", "8c", "7h"],
      ["2s", "2h", "2d", "Kc", "Qh", "9d", "8d"],
      ["3s", "4h", "5d", "6c", "7s", "Th", "Tc"],
    ]));
    after.players[0].augments.push({ id: "pair_points", name: "페어 수집가", description: "", category: "PAIR" });
    after.players[2].augments.push({ id: "r5_hand_bonus", name: "마지막 패", description: "" });
    const byId = Object.fromEntries(finalStandings(after).map((row) => [row.playerId, row]));
    expect(byId.p1).toMatchObject({ handScore: 1, augmentScore: 3 });
    expect(byId.p2).toMatchObject({ handScore: 1, augmentScore: 0 });
    expect(byId.p3).toMatchObject({ handScore: 5, augmentScore: 4 });
    expect(byId.p4).toMatchObject({ handScore: 8, augmentScore: 0 });
    for (const row of Object.values(byId)) expect(row.total).toBe(row.points + row.handScore + row.augmentScore + row.stackScore);
  });

  it("publishes seven cards, highlights five, ICM-chops a tied first and keeps the ledger", () => {
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
      const expected = result.place === 1 ? 16 : FINAL_ROUND_PLACEMENT_POINTS[result.place];
      expect(after.players.find((p) => p.id === result.playerId)!.points).toBe(expected);
      expect(match.rewards!.find((r) => r.playerId === result.playerId)!.deltaBB).toBe(0);
    }
    expect(match.pointAwardDetails?.p1).toContain("ICM");
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

  it("includes eliminated players by their elimination snapshot and assigns the 8-place rank ladder", () => {
    const after = resolvePrimary(finalFixture([
      ["As", "Ks", "Qs", "Js", "Ts", "2c", "3c"],
      ["Ah", "Ac", "Ad", "Kh", "Kc", "4c", "5c"],
      ["2s", "2h", "2d", "9s", "8s", "7h", "6h"],
      ["3s", "5s", "7d", "9d", "Jc", "Kd", "Qd"],
    ]));
    const eliminated = after.players[4]!;
    eliminated.eliminatedRound = 2;
    eliminated.eliminationSnapshot = {
      round: 2,
      points: 100,
      stackBB: 90,
      hand: after.roundResults[0]!.results[0]!.hand,
    };
    const standings = finalStandings(after);
    expect(standings).toHaveLength(8);
    expect(standings[0]).toMatchObject({ playerId: eliminated.id, points: 100, stackScore: 9, placement: 1, rankPoints: 8 });
    expect(standings.map(({ rankPoints }) => rankPoints)).toEqual([8, 4, 2, 0, -1, -2, -4, -8]);
  });
});

describe("R5 placement pool conservation", () => {
  const LADDER = Object.values(FINAL_ROUND_PLACEMENT_POINTS).reduce((sum, prize) => sum + prize, 0);
  const ROYAL = ["As", "Ks", "Qs", "Js", "Ts", "2c", "3c"];
  const ACES_FULL = ["Ah", "Ac", "Ad", "Kh", "Kc", "4c", "5c"];
  const NINE_STRAIGHT_A = ["9d", "8d", "7h", "6h", "5h", "2d", "3d"];
  const NINE_STRAIGHT_B = ["9s", "8h", "7s", "6c", "5d", "2h", "3h"];
  const TRIP_FOURS = ["4s", "4d", "4h", "Td", "Qc", "Jc", "8s"];
  const KING_HIGH = ["3s", "5s", "7d", "9d", "Jc", "Kd", "Qd"];
  const TRIP_DEUCES = ["2s", "2h", "2d", "9s", "8s", "7h", "6h"];

  // Competition ranking ties at any place, not only first. Each shape must still
  // pay out exactly the ladder total.
  // A tie for first is already covered by the ICM case in the suite above.
  const shapes: [string, string[][], number[]][] = [
    ["no tie", [ROYAL, ACES_FULL, TRIP_DEUCES, KING_HIGH], [1, 2, 3, 4]],
    ["tie for second", [ROYAL, NINE_STRAIGHT_A, NINE_STRAIGHT_B, TRIP_FOURS], [1, 2, 2, 4]],
    ["tie for third", [ROYAL, ACES_FULL, NINE_STRAIGHT_A, NINE_STRAIGHT_B], [1, 2, 3, 3]],
  ];

  for (const [label, hands, places] of shapes) {
    it(`pays exactly ${LADDER}P on ${label}`, () => {
      const after = resolvePrimary(finalFixture(hands));
      const match = after.roundResults[0];
      expect(match.results.map((r) => r.place).sort((a, b) => a - b)).toEqual(places);
      const paid = Object.values(match.pointAwards!).reduce((sum, award) => sum + award, 0);
      expect(paid).toBeCloseTo(LADDER, 8);
      const banked = after.players.filter((p) => !p.eliminated).reduce((sum, p) => sum + p.points, 0);
      expect(banked).toBeCloseTo(LADDER, 8);
    });
  }

  it("ICM-chops a tie for second over the 2nd and 3rd slots only", () => {
    const after = resolvePrimary(finalFixture([ROYAL, NINE_STRAIGHT_A, NINE_STRAIGHT_B, TRIP_FOURS]));
    const match = after.roundResults[0];
    const second = match.results.filter((r) => r.place === 2);
    expect(second).toHaveLength(2);
    const pool = FINAL_ROUND_PLACEMENT_POINTS[2]! + FINAL_ROUND_PLACEMENT_POINTS[3]!;
    expect(second.reduce((sum, r) => sum + match.pointAwards![r.playerId]!, 0)).toBeCloseTo(pool, 8);
    for (const entry of second) expect(match.pointAwardDetails![entry.playerId]).toContain("공동 2위");
    expect(match.pointAwards![match.results.find((r) => r.place === 4)!.playerId]).toBe(FINAL_ROUND_PLACEMENT_POINTS[4]);
  });
});
