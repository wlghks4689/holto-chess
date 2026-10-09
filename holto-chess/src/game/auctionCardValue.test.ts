import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import { combinationScore } from "./auctionCardValue";

const deck = makeDeck();
const c = (id: string): Card => deck.find((card) => card.id === id)!;
const hand = (...ids: string[]) => ids.map(c);
const value = (owned: Card[], id: string) => combinationScore(owned, c(id)).value;

describe("R3 auction combination score", () => {
  it("gives an unrelated card the bottom score", () => {
    expect(value(hand("5h", "5c", "6c"), "Qs")).toBe(1);
  });

  it("ranks the user's AsQh8h example: the paired nut-flush ace first, then the alternatives", () => {
    const owned = hand("As", "Qh", "8h");
    const ace = value(owned, "Ah");
    expect(ace).toBeGreaterThanOrEqual(12);
    for (const id of ["8c", "Qc", "Jh"]) expect(value(owned, id)).toBeLessThan(ace);
    expect(value(owned, "Qc")).toBeGreaterThan(value(owned, "Jh"));
  });

  it("scores premium Omaha structures high", () => {
    expect(value(hand("As", "Ad", "Ks"), "Kd")).toBeGreaterThanOrEqual(17);
    expect(value(hand("As", "Ks", "Qd"), "Jd")).toBeGreaterThanOrEqual(14);
  });

  it("penalises trips and a third card of one suit", () => {
    expect(value(hand("9s", "9d", "4c"), "9h")).toBeLessThan(value(hand("9s", "9d", "4c"), "4h"));
    expect(combinationScore(hand("Kh", "7h", "2c"), c("5h")).penalty).toBeLessThan(0);
  });

  it("keeps 19-20 rare across random hands and cards", () => {
    let seed = 7, top = 0, total = 0;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let trial = 0; trial < 4000; trial += 1) {
      const shuffled = [...deck].sort(() => random() - 0.5);
      if (value(shuffled.slice(0, 3), shuffled[3]!.id) >= 19) top += 1;
      total += 1;
    }
    expect(top / total).toBeLessThan(0.005);
  });
});
