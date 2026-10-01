import { describe, expect, it } from "vitest";
import type { Card } from "../core/poker/cards";
import { compactHandName, detailedHandLabel } from "./handLabel";

const card = (id: string, rank: Card["rank"]): Card => ({ id, rank, suit: "s" });

describe("detailed showdown labels", () => {
  it("shows one flush suit and all five ranks, including community cards", () => {
    const holes = [card("As", 14), { ...card("Kd", 13), suit: "d" as const }];
    const board = [card("Ts", 10), card("8s", 8), card("6s", 6), card("2s", 2)];
    const used = ["As", ...board.map(c => c.id)];
    expect(detailedHandLabel("FLUSH", [14, 10, 8, 6, 2], holes, used, undefined, board))
      .toEqual({ title: "A 하이 플러시", kicker: "♠ A 10 8 6 2" });
    expect(detailedHandLabel("FLUSH", [14, 10, 8, 6, 2], [], used, undefined, [holes[0]!, ...board]))
      .toEqual({ title: "A 하이 플러시", kicker: "♠ A 10 8 6 2" });
  });
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
      .toEqual({ title: "로열 플러시" });
  });

  it.each([
    // Ten reads as "10" everywhere a person sees it, matching the printed card face.
    ["h", "A♥ K♥ Q♥ J♥ 10♥"], ["s", "A♠ K♠ Q♠ J♠ 10♠"],
    ["d", "A♦ K♦ Q♦ J♦ 10♦"], ["c", "A♣ K♣ Q♣ J♣ 10♣"],
  ] as const)("shows the five-card %s royal flush under its hand name", (suit, expected) => {
    const cards = [14, 13, 12, 11, 10].map((rank) => ({ id: `${rank}${suit}`, rank: rank as Card["rank"], suit }));
    expect(detailedHandLabel("ROYAL_FLUSH", [14], cards, cards.map(({ id }) => id)))
      .toEqual({ title: "로열 플러시", kicker: expected });
  });

  it("includes the used community cards in a player's straight-flush detail", () => {
    const holes = [card("As", 14), card("Ks", 13)];
    const board = [card("Qs", 12), card("Js", 11), card("10s", 10)];
    expect(detailedHandLabel("ROYAL_FLUSH", [14], holes, [...holes, ...board].map(({ id }) => id), undefined, board))
      .toEqual({ title: "로열 플러시", kicker: "A♠ K♠ Q♠ J♠ 10♠" });
  });

  it.each([
    ["h", "A♥ 2♥ 3♥ 4♥ 5♥"], ["s", "A♠ 2♠ 3♠ 4♠ 5♠"],
    ["d", "A♦ 2♦ 3♦ 4♦ 5♦"], ["c", "A♣ 2♣ 3♣ 4♣ 5♣"],
  ] as const)("shows the five-card %s wheel straight flush under its hand name", (suit, expected) => {
    const cards = [14, 2, 3, 4, 5].map((rank) => ({ id: `${rank}${suit}`, rank: rank as Card["rank"], suit }));
    expect(detailedHandLabel("STRAIGHT_FLUSH", [5], cards, cards.map(({ id }) => id)))
      .toEqual({ title: "5 하이 스트레이트 플러시", kicker: expected });
  });

  it("shortens the legacy persisted royal-flush label", () => {
    expect(compactHandName("로열 스트레이트 플러시")).toBe("로열 플러시");
  });

  it("spells out all five ranks for a full house instead of leaving an empty kicker line", () => {
    expect(detailedHandLabel("FULL_HOUSE", [14, 2], [], []))
      .toEqual({ title: "A · 2 풀하우스", kicker: "A-A-A-2-2" });
  });
});
