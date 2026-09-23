import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import type { MatchView, PresentationView } from "../shared/protocol";
import { MATCH_PREP_MS, cinematicTimeline, frameAt, presentationDurationMs } from "../shared/presentationTimeline";
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
  it.each([1, 2, 5] as const)("renders R%i zero-card forfeits through every cinematic frame without a fake hand", (round) => {
    const forfeited = { playerId: "p1", place: 2, category: "HIGH_CARD" as const, kickers: [], displayName: "몰수패", usedCardIds: [] };
    const view: MatchView = { ...match, round, participantIds: ["p1", "p2"], winnerIds: ["p2"],
      revealedCards: { p1: [], p2: deck.slice(0, round === 5 ? 7 : 2) }, results: [forfeited],
      boards: round === 5 ? [] : [deck.slice(10, 15)], boardResults: [[forfeited]], boardWinnerIds: [["p2"]], runoutCount: round === 5 ? 0 : 1 };
    let completed = "";
    for (const frame of cinematicTimeline(view)) {
      completed = renderToStaticMarkup(createElement(ShowdownCinematic, { match: view, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: frame.at }));
      expect(completed).not.toContain("0 하이");
    }
    expect(completed).toContain("몰수패");
    expect(completed).toContain("보유 카드 부족");
  });
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
  it.each([1, 3] as const)("shows R%i Swiss matchday and pre-match record without leaking later points", (round) => {
    const swiss: MatchView = { ...match, round, matchday: 2, participantIds: ["p1", "p2"],
      swissBefore: { p1: { wins: 1, draws: 0, losses: 0, score: 1 } },
      swissAfter: { p1: { wins: 2, draws: 0, losses: 0, score: 2 } }, standingsBefore: { p1: 3, p2: 0 }, standingsAfterRuns: [{ p1: 6, p2: 0 }],
      rewards: [{ playerId: "p1", beforeBB: 50, afterBB: 70, deltaBB: 20, beforePoints: 3, afterPoints: 6, deltaPoints: 3, outcome: "SURVIVED" }] };
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: swiss, profiles, viewerId: "p1", onComplete: () => {} }));
    expect(html).toContain("MATCH 2/3");
    expect(html).toContain('<p class="swiss-record">1W 0D 0L</p>');
    expect(html).toContain('<em class="cinema-current-points">POINT 3</em>');
    expect(html).not.toContain("2W 0D 0L");
    const resultAt = cinematicTimeline(swiss).find((entry) => entry.phase === "RESULT")!.at;
    const resultHtml = renderToStaticMarkup(createElement(ShowdownCinematic, { match: swiss, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: resultAt }));
    expect(resultHtml).toContain('<p class="swiss-record">2W 0D 0L</p>');
    expect(resultHtml).toContain('<em class="cinema-current-points">POINT 6</em>');
    const viewerSeat = resultHtml.slice(resultHtml.indexOf('data-player-id="p1"'), resultHtml.indexOf('data-player-id="p2"'));
    expect(viewerSeat.indexOf("cinema-profile-identity")).toBeLessThan(viewerSeat.indexOf("cinema-standing-line"));
    expect(viewerSeat.indexOf("cinema-standing-line")).toBeLessThan(viewerSeat.indexOf("cinema-profile-outcome"));
    expect(viewerSeat).toContain('class="cinema-current-points"');
    expect(viewerSeat).toContain(">WIN</span>");
    expect(resultHtml).not.toContain("SWISS PAIRING");
    expect(resultHtml).not.toContain("R3 +");
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
    expect(html).toContain('aria-label="현재 1위"');
    expect(html.match(/aria-label="현재 공동 2위"/g)).toHaveLength(2);
    expect(html).toContain('class="cinema-rank-badge" data-rank="4" aria-label="현재 4위"');
    expect(html).toContain("<small>현재</small><b>1위</b>");
    expect(html).not.toContain("현재 순위");
    expect(html).not.toContain("TIE");
  });
  it("keeps eliminated survival-tiebreak players in the visible risk ranking", () => {
    const riskProfiles = Array.from({ length: 8 }, (_, index) => ({
      playerId: `p${index + 1}`, name: `p${index + 1}`, points: 8 - index, alive: index < 6,
    }));
    const tiebreak: MatchView = { ...match, id: "survival-tiebreak", round: 3, stage: "secondary", group: "loser",
      participantIds: ["p7", "p8"], tiebreakKind: "SURVIVAL_TIEBREAK", revealedCards: { p7: [], p8: [] } };
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: tiebreak, profiles: riskProfiles, viewerId: "p7", onComplete: () => {} }));
    expect(html).toContain('data-rank="7" aria-label="현재 7위"');
    expect(html).toContain('data-rank="8" aria-label="현재 8위"');
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
    const tableHtml = renderPhase("TABLE_ENTER");
    expect(timeline.some((entry) => entry.phase === "VS_INTRO" || entry.phase === "PREFLOP_HAND")).toBe(false);
    for (const phase of ["TABLE_ENTER", "BEST5_GLOW", "RESULT", "REWARD"] as const) {
      const html = renderPhase(phase);
      expect(html.indexOf('data-player-id="p1"')).toBeLessThan(html.indexOf('data-player-id="p2"'));
    }
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
  it("dims the losing hole cards in each completed Run It Twice matchup", () => {
    const runTwice: MatchView = { ...match, id: "run-twice-results", round: 2, participantIds: ["p2", "p1"],
      boards: [deck.slice(10, 15), deck.slice(15, 20)], boardResults: [[], []], boardWinnerIds: [["p1"], ["p2"]], results: [], runoutCount: 2,
      revealedCards: { p1: deck.slice(0, 2), p2: deck.slice(2, 4) },
      runCards: { p1: [deck.slice(0, 2), deck.slice(0, 1).concat(deck.slice(4, 5))], p2: [deck.slice(2, 4), deck.slice(2, 3).concat(deck.slice(5, 6))] } };
    const completeAt = cinematicTimeline(runTwice).find((entry) => entry.phase === "COMPLETE")!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: runTwice, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: completeAt }));
    const beforeResultAt = cinematicTimeline(runTwice).find((entry) => entry.phase === "RIVER" && entry.boardIndex === 0)!.at;
    const beforeResultHtml = renderToStaticMarkup(createElement(ShowdownCinematic, { match: runTwice, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: beforeResultAt }));
    const runOneResultAt = cinematicTimeline(runTwice).find((entry) => entry.phase === "RUN_RESULT" && entry.boardIndex === 0)!.at;
    const runOneResultHtml = renderToStaticMarkup(createElement(ShowdownCinematic, { match: runTwice, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: runOneResultAt }));
    expect(beforeResultHtml).not.toContain("cinema-board-matchup");
    expect(runOneResultHtml.match(/cinema-board-matchup/g)).toHaveLength(1);
    expect(runOneResultHtml).toMatch(/cinema-run-player[^"]*is-loser[\s\S]*?playing-card[^"]*dimmed/);
    expect(runOneResultHtml).toMatch(/cinema-run-player[^"]*is-winner[\s\S]*?playing-card[^"]*glow/);
    expect(html.match(/cinema-board-matchup/g)).toHaveLength(1);
    expect(html).toContain("cinema-board complete is-collapsed");
    expect(html).not.toContain("완료");
    expect(html).not.toContain("p1 승리");
    expect(html).toMatch(/cinema-run-player[^"]*is-winner[\s\S]*?playing-card[^"]*glow/);
    expect(html).not.toMatch(/cinema-board complete is-collapsed[\s\S]*?cinema-run-player[^"]*is-loser/);
    expect(html.match(/cinema-board-cards/g)).toHaveLength(1);
    expect(html).toContain("RUN 2");
    expect(html).toContain("cinema-seats");
    expect(html).toContain('aria-label="Run It Twice 스코어"');
    expect(html).toContain('<div class="cinema-run-score"><span>p1</span><strong>1 : 1</strong><span>p2</span></div>');
    expect(html).not.toContain("cinema-run-row");
    expect(html).not.toContain("BEST 5 확인");
  });
  it("marks survival outcomes with stamps and keeps rewards to one concise line", () => {
    const survival: MatchView = { ...match, id: "survival", round: 4, group: "loser", participantIds: ["p1", "p2"],
      winnerIds: ["p1"], boards: [deck.slice(10, 15)], boardResults: [[]], boardWinnerIds: [["p1"]], results: [], runoutCount: 1,
      revealedCards: { p1: deck.slice(0, 5), p2: deck.slice(5, 10) },
      rewards: [
        { playerId: "p1", beforeBB: 20, afterBB: 40, deltaBB: 20, beforePoints: 0, afterPoints: 2, deltaPoints: 2, outcome: "SURVIVED", detail: "생존 결정 · +2P · BB 20" },
        { playerId: "p2", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED", detail: "생존 결정 · +0P · BB 0" },
      ] };
    const rewardAt = cinematicTimeline(survival).find((entry) => entry.phase === "REWARD")!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: survival, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(html).toContain('cinema-status-stamp is-survived">생존');
    expect(html).toContain('cinema-status-stamp is-eliminated">탈락');
    expect(html).toContain("LOSS");
    expect(html.match(/class="cinema-victory"/g)).toHaveLength(2);
    expect(html).not.toContain("생존 결정");
    expect(html).toContain("+ 20BB");
    expect(html).toContain("+ 2P 획득");
    expect(html.match(/class="cinema-reward"/g)).toHaveLength(1);
    expect(html).not.toContain("+ 0P 획득");
    const regularMatch = { ...survival, id: "regular", group: undefined };
    const regularHtml = renderToStaticMarkup(createElement(ShowdownCinematic, { match: regularMatch, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(regularHtml).toContain('cinema-status-stamp is-eliminated">탈락');
    expect(regularHtml).not.toContain("is-survived");
    expect(regularHtml).toContain("WIN");
    expect(regularHtml).toContain("LOSS");
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
    expect(game2Html).toContain("LOSS");
    for (const matchday of [1, 2, 3]) {
      const swiss = { wins: 1, draws: 1, losses: 1, score: 1.5 };
      const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: { ...omaha, gameNumber: undefined, matchday, swissAfter: { p1: swiss, p2: swiss } }, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
      expect(html).toContain("OMAHA SWISS");
      expect(html).toContain(`MATCH ${matchday}/3`);
      expect(html).toContain('<p class="swiss-record">1W 1D 1L</p>');
      expect(html).not.toContain("SEED GROUP");
      expect(html).not.toContain("SWISS PAIRING");
      expect(html).not.toContain("R3 +6P");
      expect(html.includes("cinema-status-stamp is-eliminated")).toBe(matchday === 3);
    }
  });
  it("shows one survivor and two elimination stamps in the R4 loser three-way", () => {
    const threeWay: MatchView = { ...match, id: "r4-loser-three-way", round: 4, group: "loser", participantIds: ["p1", "p2", "p3"],
      winnerIds: ["p1"], boards: [deck.slice(15, 20)], boardResults: [[]], boardWinnerIds: [["p1"]], results: [], runoutCount: 1,
      revealedCards: { p1: deck.slice(0, 5), p2: deck.slice(5, 10), p3: deck.slice(10, 15) },
      rewards: [
        { playerId: "p1", beforeBB: 20, afterBB: 40, deltaBB: 20, beforePoints: 0, afterPoints: 2, deltaPoints: 2, outcome: "SURVIVED" },
        { playerId: "p2", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED" },
        { playerId: "p3", beforeBB: 20, afterBB: 20, deltaBB: 0, beforePoints: 0, afterPoints: 0, deltaPoints: 0, outcome: "ELIMINATED" },
      ] };
    const rewardAt = cinematicTimeline(threeWay).find((entry) => entry.phase === "REWARD")!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match: threeWay, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(html.match(/cinema-status-stamp is-survived/g)).toHaveLength(1);
    expect(html.match(/cinema-status-stamp is-eliminated/g)).toHaveLength(2);
    expect(html.match(/class="cinema-reward"/g)).toHaveLength(1);
    expect(html).toContain("+ 20BB");
    expect(html).toContain("+ 2P 획득");
    expect(html).not.toContain("+ 0P 획득");
  });
  it("offers speed and skip only when the local simulation opts in", () => {
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles, viewerId: "p1", onComplete: () => {}, controls: true }));
    expect(html).toContain("Skip Cinematic");
    expect(html).toContain("Animation Speed");
  });
  it("removes the redundant settlement status line from the final reward", () => {
    const rewardAt = cinematicTimeline(match).find((entry) => entry.phase === "REWARD")!.at;
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles, viewerId: "p1", onComplete: () => {}, elapsedMs: rewardAt }));
    expect(html).not.toContain("승점 정산 완료");
    expect(html).not.toContain("POINT SETTLEMENT");
    expect(html).not.toContain("FINAL BEST 5");
    expect(html).toContain("SHOWDOWN RESULTS");
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
  const second: MatchView = { ...match, id: "second-match", round: 1, matchday: 2, participantIds: ["p1", "p2"],
    boards: [deck.slice(10, 15)], boardResults: [[]], boardWinnerIds: [["p1"]], runoutCount: 1,
    revealedCards: { p1: deck.slice(0, 2), p2: deck.slice(2, 4) } };
  const duration = presentationDurationMs(match);
  const secondDuration = presentationDurationMs(second) + MATCH_PREP_MS;
  const presentation: PresentationView = { version: 1, startsAt: 100_000, endsAt: 100_000 + duration + secondDuration + duration,
    matches: [{ matchId: match.id, offsetMs: 0, durationMs: duration }, { matchId: second.id, offsetMs: duration, durationMs: secondDuration, prepMs: MATCH_PREP_MS }] };
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
    expect(at(presentation.startsAt + duration)).toContain('aria-label="매칭 로딩창"');
  });
  it("shows a separate matchup preview before the next match", () => {
    const html = at(presentation.startsAt + duration + 500);
    expect(html).toContain('aria-label="매칭 로딩창"');
    expect(html).toContain('<main class="game-arena">');
    expect(html).toContain('class="brand"');
    expect(html).toContain("SURVIVORS");
    expect(html).toContain("MATCH 2");
    expect(html).not.toContain('data-match-id="second-match"');
    expect(phaseOf(at(presentation.startsAt + duration + MATCH_PREP_MS))).toBe("TABLE_ENTER");
  });

  it("uses the same loading composition for later two- and three-player matches through R4", () => {
    const beforeSecond = presentation.startsAt + duration + 500;
    const splitRuns: MatchView = { ...second, round: 2, runCards: {
      p1: [deck.slice(0, 2), [deck[0]!, deck[4]!]],
      p2: [deck.slice(2, 4), [deck[2]!, deck[5]!]],
    } };
    const twoWay = at(beforeSecond, [match, splitRuns]);
    expect(twoWay).toContain("ROUND 02 · MATCH 2");
    expect(twoWay.match(/class="playing-card[^"]*compact/g)).toHaveLength(6);

    const multiway: MatchView = { ...second, round: 4, stage: "secondary",
      participantIds: match.participantIds.slice(0, 3), revealedCards: match.revealedCards };
    const html = at(beforeSecond, [match, multiway]);
    expect(html).toContain("is-3-way");
    expect(html.match(/class="showdown-prep-player /g)).toHaveLength(3);
    expect(html).toContain("SHOWDOWN");
  });

  it("skips the added matchup screen for an R5 final", () => {
    const final: MatchView = { ...second, round: 5, stage: "final" };
    const html = at(presentation.startsAt + duration + 500, [match, final]);
    expect(html).not.toContain('aria-label="매칭 로딩창"');
    expect(html).toContain('data-match-id="second-match"');
  });

  it("tells a seat whose matches are done to wait, without showing any other table", () => {
    const waiting = at(presentation.startsAt + duration + secondDuration + 10);
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
