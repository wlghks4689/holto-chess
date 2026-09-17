import { describe, expect, it } from "vitest";
import type { Card } from "../core/poker/cards";
import { detailedHandLabel } from "./handLabel";

const card = (id: string, rank: Card["rank"]): Card => ({ id, rank, suit: "s" });

describe("detailed showdown labels", () => {
  it("names a straight by its high card", () => {
    expect(detailedHandLabel("STRAIGHT", [13], [card("Qs", 12)], ["Qs"]))
      .toEqual({ title: "K 하이 스트레이트" });
  });

  it("places the player's pair kickers on the second line", () => {
    expect(detailedHandLabel("PAIR", [12, 14, 13, 9], [card("Ks", 13), card("9h", 9)], ["Ks", "9h"]))
      .toEqual({ title: "Q 원페어", kicker: "KICKER K, 9" });
  });

  it("names a royal flush explicitly instead of A-high straight flush", () => {
    expect(detailedHandLabel("ROYAL_FLUSH", [14], [], []))
      .toEqual({ title: "로열 스트레이트 플러시" });
  });

  it("spells out all five ranks for a full house instead of leaving an empty kicker line", () => {
    expect(detailedHandLabel("FULL_HOUSE", [14, 2], [], []))
      .toEqual({ title: "A · 2 풀하우스", kicker: "A-A-A-2-2" });
  });
});
