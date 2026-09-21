import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import type { MatchView, PresentationView } from "../shared/protocol";
import { cinematicTimeline, frameAt, presentationDurationMs } from "../shared/presentationTimeline";
import { CinematicGate, ShowdownCinematic } from "./ShowdownCinematic";
import { visibleFinalHand } from "./finalShowdownPresentation";
import { showdownSeatOrder } from "./showdownSeatOrder";

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
  it("keeps the viewer in the left seat for every heads-up phase", () => {
    expect(showdownSeatOrder(["p2", "p1"], "p1")).toEqual(["p1", "p2"]);
    expect(showdownSeatOrder(["p1", "p2"], "p1")).toEqual(["p1", "p2"]);
    expect(showdownSeatOrder(["p2", "p1"], "p9")).toEqual(["p2", "p1"]);
    expect(showdownSeatOrder(["p1", "p2", "p3"], "p1")).toEqual(["p1", "p2", "p3"]);
  });
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
    expect(html).toContain('<p class="swiss-record">1W 0D 0L</p>');
    expect(html).toContain('<em class="cinema-current-points">POINT 3</em>');
    expect(html).not.toContain("2W 0D 0L");
  });
  it("shows all four final players with 28 card backs, without leaking the result", () => {
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles, viewerId: "p1", onComplete: () => {} }));
    expect(html.match(/aria-label="비공개 카드"/g)).toHaveLength(28);
    expect(html.match(/class="cinema-seat /g)).toHaveLength(4);
    // Card slots and hand panels exist from the first frame so reveals only change their state.
    expect(html.match(/class="cinema-flip-slot /g)).toHaveLength(28);
    // Front faces are mounted from frame zero and hidden by the persistent flip plane.
    expect(html.match(/cinema-flip-front/g)).toHaveLength(28);
    expect(html.match(/class="cinema-final-read is-pending"/g)).toHaveLength(4);
    expect(html).not.toContain("cinema-winner");
    expect(html).not.toContain("cinema-board-cards");
    expect(html).not.toContain("cinema-reward");
    expect(html).not.toContain("cinema-made");
    expect(html).not.toContain("Skip Cinematic");
    expect(html).not.toContain("Animation Speed");
  });
  it("renders cumulative point standings as explicit rank badges with shared places", () => {
    const ranked: MatchView = { ...match, standingsBefore: { p1: 12, p2: 8, p3: 8, p4: 3 } };
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: ranked, profiles, viewerId: "p1", onComplete: () => {} }));
    expect(html).toContain('aria-label="현재 승점 순위 1위, 12점"');
    expect(html.match(/aria-label="현재 승점 순위 공동 2위, 8점"/g)).toHaveLength(2);
    expect(html).toContain('class="cinema-rank-badge" data-rank="4" aria-label="현재 승점 순위 4위, 3점"');
    expect(html).not.toContain("TIE");
  });
  it("uses persistent two-faced slots for heads-up hole cards and boards", () => {
    const board = deck.slice(10, 15);
    const headsUp: MatchView = { ...match, id: "heads-up", round: 1, participantIds: ["p2", "p1"],
      winnerIds: ["p2"], boards: [board], boardResults: [[]], boardWinnerIds: [["p2"]], results: [], runoutCount: 1,
      revealedCards: { p1: deck.slice(0, 2), p2: deck.slice(2, 4) } };
    const timeline = cinematicTimeline(headsUp);
    const renderPhase = (phase: (typeof timeline)[number]["phase"]) => renderToStaticMarkup(createElement(ShowdownCinematic, {
      match: headsUp, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: timeline.find((entry) => entry.phase === phase)!.at,
    }));
    const introHtml = renderPhase("VS_INTRO");
    const tableHtml = renderPhase("TABLE_ENTER");
    for (const phase of ["VS_INTRO", "TABLE_ENTER", "BEST5_GLOW", "RESULT", "REWARD"] as const) {
      const html = renderPhase(phase);
      expect(html.indexOf('data-player-id="p1"')).toBeLessThan(html.indexOf('data-player-id="p2"'));
    }
    expect(introHtml.match(/cinema-flip-slot/g)).toHaveLength(4);
    expect(introHtml.match(/data-open="true"/g)).toHaveLength(4);
    expect(introHtml.indexOf("cinema-vs")).toBeLessThan(introHtml.indexOf('data-player-id="p1"'));
    expect(tableHtml.match(/cinema-flip-slot/g)).toHaveLength(9);
    expect(tableHtml.match(/cinema-flip-front/g)).toHaveLength(9);
    expect(tableHtml.match(/data-open="true"/g)).toHaveLength(4);
    expect(renderPhase("BEST5_GLOW")).not.toContain("WIN");
    for (const phase of ["RESULT", "REWARD", "COMPLETE"] as const) {
      expect(renderPhase(phase).match(/WIN/g)).toHaveLength(1);
      expect(renderPhase(phase).match(/class="cinema-victory"/g)).toHaveLength(2);
    }
    expect(renderPhase("COMPLETE")).not.toContain("보상 지급 완료");
  });
  it("pre-mounts RUN 2 face-down during the RUN 1 result beat", () => {
    const runTwice: MatchView = { ...match, id: "run-twice", round: 2, participantIds: ["p1", "p2"],
      boards: [deck.slice(10, 15), deck.slice(15, 20)], boardResults: [[], []], boardWinnerIds: [[], []], results: [], runoutCount: 2,
      revealedCards: { p1: deck.slice(0, 2), p2: deck.slice(2, 4) } };
    const resultAt = cinematicTimeline(runTwice).find((entry) => entry.phase === "RUN_RESULT" && entry.boardIndex === 0)!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: runTwice, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: resultAt }));
    expect(html).toContain("cinema-board active");
    expect(html).toContain("cinema-board pending");
    expect(html.match(/cinema-board-cards/g)).toHaveLength(2);
    expect(html.match(/cinema-flip-slot/g)).toHaveLength(14);
  });
  it("marks survival outcomes with stamps and keeps rewards to one concise line", () => {
    const survival: MatchView = { ...match, id: "survival", round: 4, group: "loser", participantIds: ["p1", "p2"],
      winnerIds: ["p1"], boards: [deck.slice(10, 15)], boardResults: [[]], boardWinnerIds: [["p1"]], results: [], runoutCount: 1,
      revealedCards: { p1: deck.slice(0, 5), p2: deck.slice(5, 10) },
      rewards: [
        { playerId: "p1", beforeBB: 20, afterBB: 40, deltaBB: 20, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "SURVIVED", detail: "생존 결정 · +0P · BB 20" },
        { playerId: "p2", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED", detail: "생존 결정 · +0P · BB 0" },
      ] };
    const rewardAt = cinematicTimeline(survival).find((entry) => entry.phase === "REWARD")!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: survival, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(html).toContain('cinema-status-stamp is-survived">생존');
    expect(html).toContain('cinema-status-stamp is-eliminated">탈락');
    expect(html).not.toContain("생존 결정");
    expect(html).toContain("+ 20BB");
    expect(html).toContain("+ 0P 획득");
    expect(html).not.toContain("+0P · BB 20");
    const regularMatch = { ...survival, id: "regular", group: undefined };
    const regularHtml = renderToStaticMarkup(createElement(ShowdownCinematic, { match: regularMatch, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(regularHtml).toContain('cinema-status-stamp is-eliminated">탈락');
    expect(regularHtml).not.toContain("is-survived");
    expect(regularHtml).toContain("WIN");
  });
  it("defers R3 elimination stamps until Omaha Game 2", () => {
    const omaha: MatchView = { ...match, id: "omaha", round: 3, gameNumber: 1, participantIds: ["p1", "p2"],
      winnerIds: ["p1"], boards: [deck.slice(10, 15)], boardResults: [[]], boardWinnerIds: [["p1"]], results: [], runoutCount: 1,
      revealedCards: { p1: deck.slice(0, 2), p2: deck.slice(2, 4) },
      rewards: [
        { playerId: "p1", beforeBB: 20, afterBB: 40, deltaBB: 20, beforePoints: 0, afterPoints: 3, deltaPoints: 3, outcome: "SURVIVED" },
        { playerId: "p2", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED" },
      ] };
    const rewardAt = cinematicTimeline(omaha).find((entry) => entry.phase === "REWARD")!.at;
    const game1Html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: omaha, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(game1Html).not.toContain("cinema-status-stamp");
    expect(game1Html).toContain("LOSS");

    const game2Html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: { ...omaha, gameNumber: 2 }, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(game2Html).toContain('cinema-status-stamp is-eliminated">탈락');
    for (const matchday of [1, 2, 3]) {
      const swiss = { wins: 1, draws: 1, losses: 1, score: 1.5 };
      const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: { ...omaha, gameNumber: undefined, matchday, swissAfter: { p1: swiss, p2: swiss } }, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
      expect(html).toContain("OMAHA SWISS");
      expect(html).toContain(`MATCH ${matchday}/3`);
      expect(html).toContain(matchday === 1 ? "SEED GROUP" : "SWISS PAIRING");
      expect(html).toContain("R3 +6P");
      expect(html.includes("cinema-status-stamp is-eliminated")).toBe(matchday === 3);
    }
  });
  it("shows one survivor and two elimination stamps in the R4 loser three-way", () => {
    const threeWay: MatchView = { ...match, id: "r4-loser-three-way", round: 4, group: "loser", participantIds: ["p1", "p2", "p3"],
      winnerIds: ["p1"], boards: [deck.slice(15, 20)], boardResults: [[]], boardWinnerIds: [["p1"]], results: [], runoutCount: 1,
      revealedCards: { p1: deck.slice(0, 5), p2: deck.slice(5, 10), p3: deck.slice(10, 15) },
      rewards: [
        { playerId: "p1", beforeBB: 20, afterBB: 40, deltaBB: 20, beforePoints: 0, afterPoints: 3, deltaPoints: 3, outcome: "SURVIVED" },
        { playerId: "p2", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED" },
        { playerId: "p3", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED" },
      ] };
    const rewardAt = cinematicTimeline(threeWay).find((entry) => entry.phase === "REWARD")!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: threeWay, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(html.match(/cinema-status-stamp is-survived/g)).toHaveLength(1);
    expect(html.match(/cinema-status-stamp is-eliminated/g)).toHaveLength(2);
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
