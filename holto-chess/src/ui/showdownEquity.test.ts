import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { showdownEquity } from "./showdownEquity";

const cards = Object.fromEntries(makeDeck().map((card) => [card.id, card]));
const hand = (...ids: string[]) => ids.map((id) => cards[id]!);

describe("heads-up matchup equity", () => {
  it("uses only the two shown hands and gives tied boards half a win each", () => {
    const left = hand("As", "Ah");
    const right = hand("2c", "7d");
    const result = showdownEquity(1, left, right)!;
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[0] + result[1]).toBe(100);
    expect(showdownEquity(1, left, right)).toEqual(result);
  });

  it("keeps sampled equity stable when the same cards arrive in a different order", () => {
    const cases = [
      { round: 1 as const, left: hand("As", "Ah"), right: hand("2c", "7d") },
      { round: 2 as const, left: hand("As", "Ah"), right: hand("2c", "7d") },
      { round: 3 as const, left: hand("As", "Ks", "Qs", "Js"), right: hand("2c", "3d", "4h", "5c") },
      { round: 4 as const, left: hand("As", "Ah", "Kd", "Qc", "Js"), right: hand("2c", "3d", "4h", "5c", "6s") },
    ];

    for (const { round, left, right } of cases) {
      const equity = showdownEquity(round, left, right);
      expect(showdownEquity(round, [...left].reverse(), [...right].reverse())).toEqual(equity);
      expect(showdownEquity(round, right, left)).toEqual([equity![1], equity![0]]);
    }
  });

  it("excludes all known R2 hand cards from independent run-board samples", () => {
    const left = hand("As", "Ah"), right = hand("2c", "7d"), fullHands = hand("As", "Ah", "Qs", "2c", "7d", "Jd");
    const result = showdownEquity(2, left, right, fullHands)!;
    expect(result[0] + result[1]).toBe(100);
    expect(showdownEquity(2, left, right, [fullHands[2]!, fullHands[2]!])).toBeNull();
  });

  it("scores the boardless final exactly and hides incomplete or duplicate hands", () => {
    expect(showdownEquity(5, hand("Ts", "Js", "Qs", "Ks", "As", "2c", "3d"),
      hand("2h", "3h", "4c", "5d", "6c", "7d", "8h"))).toEqual([100, 0]);
    expect(showdownEquity(3, hand("As"), hand("2c"))).toBeNull();
    expect(showdownEquity(1, hand("As", "Ah"), hand("As", "2c"))).toBeNull();
  });
});
