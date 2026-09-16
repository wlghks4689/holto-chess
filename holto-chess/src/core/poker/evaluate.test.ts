import { describe, expect, it } from "vitest";
import { makeDeck, type Card, type Rank, type Suit } from "./cards";
import { compareHands, evaluateFive, findBestFive, findBestOmaha, placeInRanking, rankPlayers } from "./evaluate";

const c = (rank: Rank, suit: Suit): Card => ({ id: `${rank}${suit}`, rank, suit });

describe("poker core", () => {
  it("creates 52 unique cards", () => expect(new Set(makeDeck().map((card) => card.id)).size).toBe(52));

  it("recognizes a wheel and royal flush", () => {
    expect(evaluateFive([c(14, "s"), c(2, "h"), c(3, "c"), c(4, "d"), c(5, "s")]).kickers).toEqual([5]);
    expect(evaluateFive([c(10, "h"), c(11, "h"), c(12, "h"), c(13, "h"), c(14, "h")]).displayName).toBe("로열 플러시");
  });

  it("uses kickers to break equal categories", () => {
    const aces = evaluateFive([c(14, "s"), c(14, "h"), c(13, "c"), c(9, "d"), c(2, "s")]);
    const kings = evaluateFive([c(13, "s"), c(13, "h"), c(14, "c"), c(12, "d"), c(2, "h")]);
    expect(compareHands(aces, kings)).toBeGreaterThan(0);
  });

  it("generalizes BEST 5 to ten candidates", () => {
    const result = findBestFive([c(14, "s"), c(14, "h"), c(14, "d"), c(14, "c"), c(13, "s"), c(2, "h"), c(3, "d"), c(4, "c"), c(7, "s"), c(9, "h")]);
    expect(result.category).toBe("QUADS"); expect(result.bestFive).toHaveLength(5);
  });

  it("enforces Omaha's exact two plus three rule", () => {
    const holes = [c(14, "s"), c(2, "s"), c(9, "d"), c(9, "c")];
    const board = [c(13, "s"), c(12, "s"), c(11, "s"), c(10, "s"), c(2, "d")];
    expect(findBestFive([...holes, ...board]).category).toBe("STRAIGHT_FLUSH");
    expect(findBestOmaha(holes, board).category).not.toBe("STRAIGHT_FLUSH");
  });
});

describe("suit-neutral showdown comparison", () => {
  it("splits royal flushes with identical ranks in different suits", () => {
    const spades = evaluateFive([c(14, "s"), c(13, "s"), c(12, "s"), c(11, "s"), c(10, "s")]);
    const hearts = evaluateFive([c(14, "h"), c(13, "h"), c(12, "h"), c(11, "h"), c(10, "h")]);
    expect(compareHands(spades, hearts)).toBe(0);
  });

  it("splits equal straight flushes and compares only their high rank", () => {
    const nineHighSpades = evaluateFive([c(9, "s"), c(8, "s"), c(7, "s"), c(6, "s"), c(5, "s")]);
    const nineHighDiamonds = evaluateFive([c(9, "d"), c(8, "d"), c(7, "d"), c(6, "d"), c(5, "d")]);
    const tenHighClubs = evaluateFive([c(10, "c"), c(9, "c"), c(8, "c"), c(7, "c"), c(6, "c")]);
    expect(compareHands(nineHighSpades, nineHighDiamonds)).toBe(0);
    expect(compareHands(tenHighClubs, nineHighSpades)).toBeGreaterThan(0);
  });

  it("compares all five flush ranks and splits fully equal flushes", () => {
    const aceKingJackNineEight = evaluateFive([c(14, "s"), c(13, "s"), c(11, "s"), c(9, "s"), c(8, "s")]);
    const aceKingJackTenEight = evaluateFive([c(14, "d"), c(13, "d"), c(11, "d"), c(10, "d"), c(8, "d")]);
    const equalHearts = evaluateFive([c(14, "h"), c(13, "h"), c(11, "h"), c(9, "h"), c(8, "h")]);
    expect(aceKingJackNineEight.kickers).toEqual([14, 13, 11, 9, 8]);
    expect(compareHands(aceKingJackTenEight, aceKingJackNineEight)).toBeGreaterThan(0);
    expect(compareHands(aceKingJackNineEight, equalHearts)).toBe(0);
  });

  it("uses every one-pair kicker", () => {
    const jackKicker = evaluateFive([c(14, "s"), c(14, "h"), c(13, "c"), c(12, "d"), c(11, "s")]);
    const tenKicker = evaluateFive([c(14, "d"), c(14, "c"), c(13, "s"), c(12, "h"), c(10, "d")]);
    expect(jackKicker.kickers).toEqual([14, 13, 12, 11]);
    expect(compareHands(jackKicker, tenKicker)).toBeGreaterThan(0);
  });

  it("uses the two-pair kicker", () => {
    const queen = evaluateFive([c(14, "s"), c(14, "h"), c(13, "c"), c(13, "d"), c(12, "s")]);
    const jack = evaluateFive([c(14, "d"), c(14, "c"), c(13, "s"), c(13, "h"), c(11, "d")]);
    expect(queen.kickers).toEqual([14, 13, 12]);
    expect(compareHands(queen, jack)).toBeGreaterThan(0);
  });

  it("uses both three-of-a-kind kickers", () => {
    const queen = evaluateFive([c(14, "s"), c(14, "h"), c(14, "d"), c(13, "c"), c(12, "s")]);
    const jack = evaluateFive([c(14, "c"), c(14, "d"), c(14, "h"), c(13, "s"), c(11, "d")]);
    expect(queen.kickers).toEqual([14, 13, 12]);
    expect(compareHands(queen, jack)).toBeGreaterThan(0);
  });

  it("uses the four-of-a-kind kicker", () => {
    const king = evaluateFive([c(14, "s"), c(14, "h"), c(14, "d"), c(14, "c"), c(13, "s")]);
    const queen = evaluateFive([c(14, "s"), c(14, "h"), c(14, "d"), c(14, "c"), c(12, "h")]);
    expect(king.kickers).toEqual([14, 13]);
    expect(compareHands(king, queen)).toBeGreaterThan(0);
  });

  it("compares full houses by trips rank and then pair rank", () => {
    const acesOverTwos = evaluateFive([c(14, "s"), c(14, "h"), c(14, "d"), c(2, "c"), c(2, "s")]);
    const kingsOverAces = evaluateFive([c(13, "s"), c(13, "h"), c(13, "d"), c(14, "c"), c(14, "s")]);
    const acesOverThrees = evaluateFive([c(14, "c"), c(14, "d"), c(14, "h"), c(3, "s"), c(3, "h")]);
    expect(compareHands(acesOverTwos, kingsOverAces)).toBeGreaterThan(0);
    expect(compareHands(acesOverThrees, acesOverTwos)).toBeGreaterThan(0);
  });

  it("compares all five high-card ranks", () => {
    const aceKingJackTenSeven = evaluateFive([c(14, "s"), c(13, "h"), c(11, "c"), c(10, "d"), c(7, "s")]);
    const aceKingJackNineEight = evaluateFive([c(14, "h"), c(13, "c"), c(11, "d"), c(9, "s"), c(8, "h")]);
    expect(aceKingJackTenSeven.kickers).toEqual([14, 13, 11, 10, 7]);
    expect(compareHands(aceKingJackTenSeven, aceKingJackNineEight)).toBeGreaterThan(0);
  });

  it("keeps exact ties as shared first place in a multiway ranking", () => {
    const spadeFlush = evaluateFive([c(14, "s"), c(13, "s"), c(11, "s"), c(9, "s"), c(8, "s")]);
    const heartFlush = evaluateFive([c(14, "h"), c(13, "h"), c(11, "h"), c(9, "h"), c(8, "h")]);
    const lowerFlush = evaluateFive([c(14, "d"), c(13, "d"), c(11, "d"), c(9, "d"), c(7, "d")]);
    const ranking = rankPlayers([
      { playerId: "a", hand: spadeFlush }, { playerId: "b", hand: heartFlush }, { playerId: "c", hand: lowerFlush },
    ]);
    expect(ranking).toEqual([["a", "b"], ["c"]]);
    expect(["a", "b", "c"].map((playerId) => placeInRanking(ranking, playerId))).toEqual([1, 1, 3]);
  });
});
