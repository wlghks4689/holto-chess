import { describe, expect, it } from "vitest";
import { makeDeck, type Card, type Rank, type Suit } from "./cards";
import { compareHands, evaluateFive, findBestFive, findBestOmaha } from "./evaluate";

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
