import { describe, expect, it } from "vitest";
import { createMatchView } from "../game/matchView";
import { autoStep, practiceState } from "./practiceState";
import { decisiveComparison, explainResult, explainStreet, type Street } from "./showdownExplainer";
import type { MatchView, RevealedHand } from "../shared/protocol";
import type { PorenaGameState } from "../game/types";

const STREETS: Street[] = ["PRE_FLOP", "FLOP", "TURN", "RIVER"];
const VISIBLE = { PRE_FLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 } as const;

/** A real R1 showdown: cards, boards and results all come from the engine. */
function playedRound(round: 1 | 3 | 5): { state: PorenaGameState; matches: MatchView[] } {
  let state = practiceState(2628, round);
  while (!state.roundResults.length) state = autoStep(state);
  const mine = state.roundResults.filter((match) => match.playerIds.includes("p1"));
  return { state, matches: mine.map((match) => createMatchView(state, match)) };
}

const hand = (over: Partial<RevealedHand>): RevealedHand => ({
  playerId: "p1", place: 1, category: "PAIR", kickers: [10, 9, 7, 4], displayName: "원페어", usedCardIds: [], ...over,
});

describe("showdown explanations", () => {
  it("only ever highlights cards that are already face up", () => {
    const { matches } = playedRound(1);
    for (const match of matches) {
      for (let boardIndex = 0; boardIndex < match.boards.length; boardIndex += 1) {
        for (const street of STREETS) {
          const explanation = explainStreet(match, "p1", boardIndex, street);
          if (!explanation) continue;
          const visible = new Set([
            ...(match.revealedCards.p1 ?? []).map((card) => card.id),
            ...match.boards[boardIndex]!.slice(0, VISIBLE[street]).map((card) => card.id),
          ]);
          for (const id of explanation.highlightCardIds) expect(visible.has(id)).toBe(true);
        }
      }
    }
  });

  it("never announces a result before the board is finished", () => {
    const { matches } = playedRound(1);
    const early = explainStreet(matches[0]!, "p1", 0, "FLOP");
    expect(early?.outcome).toBeUndefined();
    expect(early?.comparison).toBeUndefined();
  });

  it("states the outcome the engine actually recorded", () => {
    const { matches } = playedRound(1);
    for (const match of matches) {
      const explanation = explainResult(match, "p1", 0)!;
      const winners = match.boardWinnerIds[0] ?? match.winnerIds;
      const expected = winners.length > 1 && winners.includes("p1") ? "무승부"
        : winners.includes("p1") ? "내가 가져갔어요" : "상대가 가져갔어요";
      expect(explanation.outcome).toContain(expected);
      // The highlighted five are exactly the cards the evaluator used.
      const result = (match.boardResults[0] ?? match.results).find((entry) => entry.playerId === "p1")!;
      expect(explanation.highlightCardIds).toEqual(result.usedCardIds);
    }
  });

  it("R5 explains seven cards with no board", () => {
    const { matches } = playedRound(5);
    const match = matches[0]!;
    expect(match.boards.length).toBe(0);
    const explanation = explainResult(match, "p1", 0)!;
    expect(explanation.headline.length).toBeGreaterThan(0);
    expect(explanation.detail.some((line) => line.includes("보드"))).toBe(false);
    expect(explanation.unused).toBeDefined();
  });

  it("R3 uses exactly two of my four cards and three from the board", () => {
    const { matches } = playedRound(3);
    const match = matches[0]!;
    const result = (match.boardResults[0] ?? match.results).find((entry) => entry.playerId === "p1")!;
    const hole = (match.revealedCards.p1 ?? []).filter((card) => result.usedCardIds.includes(card.id));
    const board = match.boards[0]!.filter((card) => result.usedCardIds.includes(card.id));
    expect(hole.length).toBe(2);
    expect(board.length).toBe(3);
    expect(explainResult(match, "p1", 0)!.detail[0]).toContain("내 카드 2장 + 보드 3장");
  });

  it("names the first real difference between two hands, with readable Korean markers", () => {
    expect(decisiveComparison(hand({ kickers: [10, 9, 7, 4] }), hand({ kickers: [8, 13, 7, 4] }), "상대")).toContain("페어의 숫자");
    const kickerCall = decisiveComparison(hand({ kickers: [10, 13, 7, 4] }), hand({ kickers: [10, 9, 7, 4] }), "상대");
    expect(kickerCall).toContain("남은 카드를 높은 쪽부터");
    expect(kickerCall).toContain("K 대 9");
    expect(decisiveComparison(hand({}), hand({ category: "TRIPS", displayName: "트립스", kickers: [5, 9, 7] }), "상대")).toContain("트립스가 더 높습니다");
    expect(decisiveComparison(hand({}), hand({}), "상대")).toContain("무승부");
  });
});
