import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import type { MatchView } from "../shared/protocol";
import { CinematicGate, ShowdownCinematic } from "./ShowdownCinematic";

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
