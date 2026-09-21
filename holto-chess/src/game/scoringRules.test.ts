import { describe, expect, it } from "vitest";
import { BALANCE, FINAL_ROUND_PLACEMENT_POINTS, ROUND_POINTS } from "./config";
import { calculateIcm } from "./icm";
import { assertPoolIntegrity } from "./cardPool";
import { createGame, finalStandings, resolvePrimary } from "./engine";

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);

describe("central round point rules", () => {
  it("1. R1 win is +3", () => expect(ROUND_POINTS.r1.win).toBe(3));
  it("2. R1 split is +1 each", () => expect(ROUND_POINTS.r1.split).toBe(1));
  it("3. R2 primary winner is +6", () => expect(ROUND_POINTS.r2Primary.win).toBe(6));
  it("4. R2 sudden death carries no extra award", () => expect(ROUND_POINTS.r2Primary.suddenDeathBonus).toBe(0));
  it("5. R2 winner bracket is +3", () => expect(ROUND_POINTS.r2WinnerBracket.win).toBe(3));
  it("6. R2 loser bracket survivor is +2", () => expect(ROUND_POINTS.r2LoserBracket.survive).toBe(2));
  it("7. each R3 Omaha Swiss win is +4", () => expect(ROUND_POINTS.r3.gameWin).toBe(4));
  it("8. each R3 Omaha game split is +2 each", () => expect(ROUND_POINTS.r3.gameSplit).toBe(2));
  it("9. R4 primary win is +10", () => expect(ROUND_POINTS.r4Primary.win).toBe(10));
  it("10. R4 primary split is +5 and has no decider award key", () => {
    expect(ROUND_POINTS.r4Primary.split).toBe(5);
    expect(ROUND_POINTS.r4Primary.groupDeciderBonus).toBe(0);
  });
  it("11. R4 winner-group sole first is +5", () => expect(ROUND_POINTS.r4WinnerGroup.first).toBe(5));
  it("12. winner tiebreak has no independent point award", () => expect(ROUND_POINTS.r4WinnerGroup.tiebreakBonus).toBe(0));
  it("13. R4 loser-group survival is +2", () => expect(ROUND_POINTS.r4LoserGroup.survive).toBe(2));
  it("14. survival tiebreak has no independent point award", () => expect(ROUND_POINTS.r4LoserGroup.tiebreakBonus).toBe(0));
  it("15. R5 placement ladder is 20 / 12 / 5 / 3", () => expect(FINAL_ROUND_PLACEMENT_POINTS).toEqual({ 1: 20, 2: 12, 3: 5, 4: 3 }));
});

describe("R5 recursive ICM", () => {
  it("16. two tied leaders divide only the 45-point first/second pool", () => {
    const result = calculateIcm([{ playerId: "a", stackBB: 50 }, { playerId: "b", stackBB: 50 }], [30, 15]);
    expect(result).toEqual({ a: 22.5, b: 22.5 });
  });
  it("17. reproduces the 80BB/20BB example as 27/18", () => {
    expect(calculateIcm([{ playerId: "a", stackBB: 80 }, { playerId: "b", stackBB: 20 }], [30, 15])).toEqual({ a: 27, b: 18 });
  });
  it("18. recursively evaluates a three-way tie over 30/15/5", () => {
    const result = calculateIcm([{ playerId: "a", stackBB: 60 }, { playerId: "b", stackBB: 30 }, { playerId: "c", stackBB: 10 }], [30, 15, 5]);
    expect(result.a).toBeGreaterThan(result.b); expect(result.b).toBeGreaterThan(result.c);
    expect(sum(result)).toBeCloseTo(50, 10);
  });
  it("19. recursively evaluates a four-way tie over the full ladder", () => {
    const result = calculateIcm(["a", "b", "c", "d"].map((playerId) => ({ playerId, stackBB: 25 })), [30, 15, 5, 0]);
    Object.values(result).forEach((value) => expect(value).toBeCloseTo(12.5, 10));
  });
  it("20. conserves every occupied placement pool within floating tolerance", () => {
    const result = calculateIcm([{ playerId: "a", stackBB: 77 }, { playerId: "b", stackBB: 17 }, { playerId: "c", stackBB: 6 }], [30, 15, 5]);
    expect(sum(result)).toBeCloseTo(50, 12);
  });
});

describe("final scoring", () => {
  it("21. uses the complete revised hand-score table", () => {
    expect(BALANCE.handScores).toEqual({ HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 5, STRAIGHT: 8, FLUSH: 12, FULL_HOUSE: 15, QUADS: 20, STRAIGHT_FLUSH: 30, ROYAL_FLUSH: 40 });
  });
  it("22. totals round points + hand score + floor(BB / 10) with unrounded points", () => {
    const game = createGame(7); game.round = 5; game.phase = "SHOWDOWN_PRIMARY";
    for (const entry of game.ownershipCardPool) { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; }
    const hands = [
      ["As", "Ks", "Qs", "Js", "Ts", "2c", "3c"], ["Ah", "Kh", "Qh", "Jh", "9h", "4c", "5c"],
      ["Ad", "Ac", "Kd", "Kc", "9s", "8s", "7h"], ["2s", "2h", "6s", "4s", "3h", "7d", "8d"],
    ];
    game.players.forEach((player, index) => {
      player.eliminated = index >= 4; player.shopCardIds = []; player.ownedCardIds = hands[index] ?? [];
      player.points = index === 0 ? 0.125 : 0; player.stackBB = index === 0 ? 29 : 50;
      for (const id of player.ownedCardIds) { const entry = game.ownershipCardPool.find((candidate) => candidate.card.id === id)!; entry.state = "OWNED"; entry.ownerPlayerId = player.id; }
    });
    assertPoolIntegrity(game);
    const after = resolvePrimary(game); const row = finalStandings(after).find(({ playerId }) => playerId === "p1")!;
    expect(row.total).toBe(row.points + row.handScore + Math.floor(29 / 10));
    expect(row.points % 1).not.toBe(0);
  });
});
