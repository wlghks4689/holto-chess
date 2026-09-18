import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import type { MatchView } from "../shared/protocol";
import { CinematicGate, ShowdownCinematic } from "./ShowdownCinematic";
import { visibleFinalHand } from "./finalShowdownPresentation";

const deck = makeDeck();
const match: MatchView = {
  id: "final-preview", round: 5, matchNumber: 1, stage: "final",
  participantIds: ["p1", "p2", "p3", "p4"], winnerIds: ["p1"],
  boards: [], boardResults: [], boardWinnerIds: [], results: [],
  runoutCount: 0, suddenDeathCount: 0, rewards: [],
  revealedCards: Object.fromEntries([1, 2, 3, 4].map((id, index) => [`p${id}`, deck.slice(index * 7, index * 7 + 7)])),
};
const profiles = match.participantIds.map((playerId) => ({ playerId, name: playerId }));

describe("cinematic initial rendering", () => {
  it("evaluates only the R5 cards revealed at each step", () => {
    const cards: Card[] = [
      { id: "9h", rank: 9, suit: "h" }, { id: "9c", rank: 9, suit: "c" }, { id: "Kd", rank: 13, suit: "d" },
      { id: "5d", rank: 5, suit: "d" }, { id: "Kh", rank: 13, suit: "h" },
      { id: "Kc", rank: 13, suit: "c" }, { id: "5s", rank: 5, suit: "s" },
    ];
    expect(visibleFinalHand(cards, 3)?.category).toBe("PAIR");
    expect(visibleFinalHand(cards, 5)?.category).toBe("TWO_PAIR");
    expect(visibleFinalHand(cards, 7)?.category).toBe("FULL_HOUSE");
  });
  it("shows the Swiss matchday and pre-match record without leaking later points", () => {
    const swiss: MatchView = { ...match, round: 1, matchday: 2, participantIds: ["p1", "p2"],
      swissBefore: { p1: { wins: 1, draws: 0, losses: 0, score: 1 } },
      swissAfter: { p1: { wins: 2, draws: 0, losses: 0, score: 2 } },
      rewards: [{ playerId: "p1", beforeBB: 50, afterBB: 70, deltaBB: 20, beforePoints: 3, afterPoints: 6, deltaPoints: 3, outcome: "SURVIVED" }] };
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: swiss, profiles, viewerId: "p1", onComplete: () => {} }));
    expect(html).toContain("MATCH 2/3");
    expect(html).toContain("1W 0D 0L · POINT 3");
    expect(html).not.toContain("2W 0D 0L");
  });
  it("shows all four final players with 28 card backs, without leaking the result", () => {
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles, viewerId: "p1", onComplete: () => {} }));
    expect(html.match(/aria-label="비공개 카드"/g)).toHaveLength(28);
    expect(html.match(/class="cinema-seat /g)).toHaveLength(4);
    expect(html).not.toContain("cinema-winner");
    expect(html).not.toContain("cinema-board-cards");
    expect(html).not.toContain("cinema-reward");
    expect(html).not.toContain("cinema-made");
    expect(html).toContain("Skip Cinematic");
  });
  it("keeps scoreboard and logs out of the DOM until the result presentation is dismissed", () => {
    const html = renderToStaticMarkup(createElement(CinematicGate, {
      matches: [match], profiles, viewerId: "p1", children: createElement("div", null, "PRIVATE_RESULT_SENTINEL"),
    }));
    expect(html).not.toContain("PRIVATE_RESULT_SENTINEL");
    expect(html).toContain("FINAL SHOWDOWN");
  });
});
