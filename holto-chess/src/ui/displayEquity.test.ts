import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as evaluations from "../game/showdownEquity";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { makeDeck } from "../core/poker/cards";
import { matchStreetEquity } from "./streetEquity";
import { qaMatch } from "./responsiveFixtures";
import { streetEquityJob, type EquityJob } from "./displayEquity";
import { calculateDisplayEquity } from "./displayEquityCalculation";
import { DISPLAY_EQUITY_TIMEOUT_MS, requestDisplayEquity, type EquityWorker } from "./displayEquityRequest";

const deck = makeDeck();
const jobs: EquityJob[] = [{ kind: "headsUp", round: 1, hands: [deck.slice(0, 2), deck.slice(7, 9)] }];
function fakeWorker() {
  return { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null } as EquityWorker;
}
function respond(worker: EquityWorker, key: string, values = [[37, 63]]) {
  worker.onmessage?.call(worker as Worker, { data: { key, values } } as MessageEvent);
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("display equity worker lifecycle", () => {
  it("publishes only the requested response and terminates the completed worker", () => {
    const worker = fakeWorker(), publish = vi.fn();
    const cancel = requestDisplayEquity(worker, "current", jobs, publish);
    respond(worker, "old"); expect(publish).not.toHaveBeenCalled();
    respond(worker, "current"); expect(publish).toHaveBeenCalledExactlyOnceWith([[37, 63]]);
    respond(worker, "current"); cancel(); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("stops obsolete computation and rejects late responses after RUN change/unmount", () => {
    const worker = fakeWorker(), publish = vi.fn();
    const cancel = requestDisplayEquity(worker, "run1", jobs, publish);
    cancel(); respond(worker, "run1"); expect(publish).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(["onerror", "onmessageerror"] as const)("worker %s leaves odds unknown without a main-thread fallback", event => {
    const worker = fakeWorker(), publish = vi.fn();
    requestDisplayEquity(worker, "current", jobs, publish);
    (worker[event] as (() => void))();
    expect(publish).toHaveBeenCalledExactlyOnceWith([null]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("bounds a stalled worker and handles postMessage failure", () => {
    vi.useFakeTimers();
    const worker = fakeWorker(), publish = vi.fn();
    requestDisplayEquity(worker, "current", jobs, publish);
    vi.advanceTimersByTime(DISPLAY_EQUITY_TIMEOUT_MS);
    expect(publish).toHaveBeenCalledExactlyOnceWith([null]);
    expect(worker.terminate).toHaveBeenCalledOnce();
    const broken = fakeWorker(); vi.mocked(broken.postMessage).mockImplementation(() => { throw new Error("clone failed"); });
    const failed = vi.fn(); requestDisplayEquity(broken, "current", jobs, failed);
    expect(failed).toHaveBeenCalledExactlyOnceWith([null]);
  });
});

describe("display worker parity and disclosure", () => {
  it("keeps three R6 BURN/equity slots while odds are pending, without running the evaluator in render", () => {
    const seats = [0, 1, 2].map(i => ({ playerId: `p${i + 1}`, name: `Player ${i}`, points: 30,
      cards: deck.slice(i * 5, i * 5 + 5), blockCards: deck.slice(30 + i * 2, 30 + i * 2 + i) }));
    const calculation = vi.spyOn(evaluations, "finalFourWayEquity").mockImplementation(() => { throw Error("Render must not calculate odds"); });
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round: 6, final: true, playerName: "p1", seconds: 3.5,
      matchup: { matchNumber: 1, viewer: seats[0]!, opponents: seats.slice(1) } }));
    expect(html.match(/class="final-block-cards"/g)).toHaveLength(3);
    expect(html.match(/class="prep-burn-empty"/g)).toHaveLength(1);
    expect(html.match(/class="showdown-prep-equity"/g)).toHaveLength(3);
    expect(html.match(/<strong>--<\/strong>/g)).toHaveLength(3);
    expect(calculation).not.toHaveBeenCalled();
  });
  it("renders the loading and cinematic screens without executing any expensive evaluator", () => {
    for (const name of ["showdownEquity", "r4ThreeWayEquity", "finalFourWayEquity"] as const) {
      vi.spyOn(evaluations, name).mockImplementation(() => { throw new Error("Main-thread equity regression"); });
    }
    for (const round of [1, 2, 3, 4] as const) {
      const match = qaMatch(round, round === 3 ? 4 : round === 4 ? 5 : round === 2 ? 3 : 2, round === 4);
      const seats = match.participantIds.map(playerId => ({ playerId, name: playerId, points: 0,
        cards: match.revealedCards[playerId]!, runCards: match.runCards?.[playerId] }));
      expect(() => renderToStaticMarkup(createElement(ShowdownPrepPanel, { round, final: false, playerName: "p1", seconds: 3,
        matchup: { matchNumber: 1, viewer: seats[0]!, opponents: seats.slice(1) } }))).not.toThrow();
      expect(() => renderToStaticMarkup(createElement(ShowdownCinematic, { match, profiles: seats, viewerId: "p1", onComplete: () => {}, elapsedMs: 0 }))).not.toThrow();
    }
    for (const name of ["showdownEquity", "r4ThreeWayEquity", "finalFourWayEquity"] as const) expect(evaluations[name]).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4] as const)("preserves the existing R%i preflop/flop/turn/river odds", round => {
    const match = qaMatch(round, round === 3 ? 4 : round === 4 ? 5 : round === 2 ? 3 : 2, round === 4);
    for (const count of [0, 3, 4, 5]) {
      expect(calculateDisplayEquity(streetEquityJob(match, 0, count))[0]).toEqual(matchStreetEquity(match, 0, count));
    }
  });
  it("never sends future board cards, rankings or winners to the worker", () => {
    const match = qaMatch(3, 4);
    const before = streetEquityJob(match, 0, 3);
    match.boards[0]![3] = deck[46]!; match.boards[0]![4] = deck[47]!;
    match.winnerIds = ["p2"]; match.results = [];
    expect(streetEquityJob(match, 0, 3)).toEqual(before);
    expect(JSON.stringify(before)).not.toContain("winner");
    match.revealedCards.p1![0] = { ...match.revealedCards.p1![0]!, hidden: true };
    expect(streetEquityJob(match, 0, 3)).toEqual([]);
  });
  it("rejects hidden hands even for prep jobs", () => {
    expect(calculateDisplayEquity([{ ...jobs[0]!, hands: [[{ ...deck[0]!, hidden: true }, deck[1]!], deck.slice(7, 9)] }])).toEqual([null]);
  });
  it("uses each RUN's own hand and public dead cards", () => {
    const match = qaMatch(2, 3);
    for (const run of [0, 1]) for (const count of [0, 3, 4, 5]) {
      expect(calculateDisplayEquity(streetEquityJob(match, run, count))[0]).toEqual(matchStreetEquity(match, run, count));
    }
    expect(streetEquityJob(match, 0, 0)).not.toEqual(streetEquityJob(match, 1, 0));
  });
  it("preserves R6 final preflop and exact street odds", () => {
    const match = { ...qaMatch(4, 5), round: 6 as const, final: true, stage: "final" as const,
      blockCards: { p1: deck.slice(44, 46), p2: deck.slice(46, 47) } };
    for (const count of [0, 3, 4, 5]) {
      expect(calculateDisplayEquity(streetEquityJob(match, 0, count))[0]).toEqual(matchStreetEquity(match, 0, count));
    }
  });
});
