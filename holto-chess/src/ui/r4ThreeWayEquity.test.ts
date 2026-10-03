import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { r4ThreeWayEquity } from "./showdownEquity";

const deck = makeDeck();
const hands = [deck.slice(0, 5), deck.slice(5, 10), deck.slice(10, 15)];

describe("R4 three-way display equity", () => {
  it("splits one common pot, not three independent heads-up comparisons", () => {
    const result = r4ThreeWayEquity(hands)!;
    expect(result).toHaveLength(3);
    for (const value of result) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(result.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(97);
    expect(result.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(100);
  });
  it("preserves values through seat/card reordering and protects its cache from caller mutation", () => {
    const result = r4ThreeWayEquity(hands)!;
    expect(r4ThreeWayEquity([hands[2]!, hands[0]!, hands[1]!].map(hand => [...hand].reverse())))
      .toEqual([result[2], result[0], result[1]]);
    const original = result[0];
    result[0] = -1;
    expect(r4ThreeWayEquity(hands)![0]).toBe(original);
  });
  it("does not estimate incomplete, duplicate or hidden hands", () => {
    expect(r4ThreeWayEquity(hands.slice(0, 2))).toBeNull();
    expect(r4ThreeWayEquity([hands[0]!.slice(0, 4), hands[1]!, hands[2]!])).toBeNull();
    expect(r4ThreeWayEquity([hands[0]!, hands[0]!, hands[2]!])).toBeNull();
    expect(r4ThreeWayEquity(hands.map((hand, index) => index === 0 ? hand.map(card => ({ ...card, hidden: true })) : hand))).toBeNull();
  });
});
