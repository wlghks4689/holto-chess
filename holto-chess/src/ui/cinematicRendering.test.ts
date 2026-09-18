import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import type { MatchView, PresentationView } from "../shared/protocol";
import { cinematicTimeline, frameAt, presentationDurationMs } from "../shared/presentationTimeline";
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
    // Card slots and hand panels exist from the first frame so reveals only change their state.
    expect(html.match(/class="cinema-flip-slot /g)).toHaveLength(28);
    expect(html.match(/class="cinema-final-read is-pending"/g)).toHaveLength(4);
    expect(html).not.toContain("cinema-winner");
    expect(html).not.toContain("cinema-board-cards");
    expect(html).not.toContain("cinema-reward");
    expect(html).not.toContain("cinema-made");
    expect(html).not.toContain("Skip Cinematic");
    expect(html).not.toContain("Animation Speed");
  });
  it("offers speed and skip only when the local simulation opts in", () => {
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles, viewerId: "p1", onComplete: () => {}, controls: true }));
    expect(html).toContain("Skip Cinematic");
    expect(html).toContain("Animation Speed");
  });
  it("keeps scoreboard and logs out of the DOM until the result presentation is dismissed", () => {
    const html = renderToStaticMarkup(createElement(CinematicGate, {
      matches: [match], profiles, viewerId: "p1", children: createElement("div", null, "PRIVATE_RESULT_SENTINEL"),
    }));
    expect(html).not.toContain("PRIVATE_RESULT_SENTINEL");
    expect(html).toContain("FINAL SHOWDOWN");
  });
});

describe("server-synced cinematic gate", () => {
  const second: MatchView = { ...match, id: "second-match" };
  const duration = presentationDurationMs(match);
  const presentation: PresentationView = { version: 1, startsAt: 100_000, endsAt: 100_000 + duration * 3,
    matches: [{ matchId: match.id, offsetMs: 0, durationMs: duration }, { matchId: second.id, offsetMs: duration, durationMs: duration }] };
  const at = (serverTime: number, matches = [match, second]) => renderToStaticMarkup(createElement(CinematicGate, {
    matches, profiles, viewerId: "p1", presentation, clock: { observe: () => {}, offset: () => 0, now: () => serverTime },
    children: createElement("div", null, "PRIVATE_RESULT_SENTINEL") }));
  const phaseOf = (html: string) => /data-phase="([A-Z0-9_]+)"/.exec(html)?.[1];

  it("derives the frame from the shared server time, so every seat shows the same beat", () => {
    const serverTime = presentation.startsAt + 5_000;
    const timeline = cinematicTimeline(match);
    expect(phaseOf(at(serverTime))).toBe(frameAt(timeline, 5_000).phase);
    // A seat that connects late or returns from a hidden tab lands on the same frame, not frame 0.
    expect(phaseOf(at(serverTime))).not.toBe(timeline[0]!.phase);
  });

  it("holds each finished match without a confirm click, then moves on to the next on schedule", () => {
    const holding = at(presentation.startsAt + duration - 1);
    expect(phaseOf(holding)).toBe("COMPLETE");
    expect(holding).not.toContain("결과 확인");
    expect(holding).toContain('data-match-id="final-preview"');
    expect(at(presentation.startsAt + duration)).toContain('data-match-id="second-match"');
  });

  it("tells a seat whose matches are done to wait, without showing any other table", () => {
    const waiting = at(presentation.startsAt + duration * 2 + 10);
    expect(waiting).toContain("다른 매치 결과를 기다리는 중입니다.");
    expect(waiting).not.toContain("cinema-seat");
    expect(waiting).not.toContain("PRIVATE_RESULT_SENTINEL");
  });

  it("releases the results for everyone at the shared end, and never offers speed or skip", () => {
    expect(at(presentation.endsAt)).toContain("PRIVATE_RESULT_SENTINEL");
    const playing = at(presentation.startsAt + 500);
    expect(playing).not.toContain("Skip Cinematic");
    expect(playing).not.toContain("Animation Speed");
  });
});
