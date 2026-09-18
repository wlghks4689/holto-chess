import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import type { MatchView } from "../shared/protocol";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { showdownStage } from "./showdownStage";

const deck = makeDeck();
const headsUp = (round: MatchView["round"]): MatchView => ({ id: `r${round}`, round, matchNumber: 1, stage: "primary", participantIds: ["p1", "p2"], winnerIds: ["p1"],
  boards: [deck.slice(0, 5)], boardResults: [], boardWinnerIds: [], results: [], runoutCount: 1, suddenDeathCount: 0, rewards: [],
  revealedCards: { p1: deck.slice(5, 7), p2: deck.slice(7, 9) } });
const render = (match: MatchView) => renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles: [], viewerId: "p1", onComplete: () => {} }));

describe("round showdown stages", () => {
  it("alternates the two arena artworks by round and leaves R5 to the Final Arena", () => {
    expect([1, 2, 3, 4].map((round) => showdownStage(round as 1 | 2 | 3 | 4)!.image)).toEqual([
      "/assets/table/showdown-arena-1.webp", "/assets/table/showdown-arena-2.webp",
      "/assets/table/showdown-arena-1.webp", "/assets/table/showdown-arena-2.webp"]);
    expect([1, 2, 3, 4].map((round) => showdownStage(round as 1 | 2 | 3 | 4)!.level)).toEqual([1, 2, 3, 4]);
    expect(showdownStage(5)).toBeUndefined();
  });

  it("renders the round's stage behind the showdown, with an intensity class per round", () => {
    const r2 = render(headsUp(2));
    expect(r2).toContain("cinema-staged stage-r2");
    expect(r2).toContain('src="/assets/table/showdown-arena-2.webp"');
    expect(render(headsUp(3))).toContain('src="/assets/table/showdown-arena-1.webp"');
    const final = render({ ...headsUp(5), boards: [], runoutCount: 0 });
    expect(final).not.toContain("cinema-stage");
    expect(final).toContain("final-table.webp");
  });
});
