import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { cinematicTimeline } from "./cinematicTimeline";
import { equityBoardCount, matchStreetEquity, visibleStreetEquity } from "./streetEquity";
import { qaMatch } from "./responsiveFixtures";

const cards = (ids: string) => ids.split(" ").map(id => makeDeck().find(c => c.id === id)!);
describe("street equity disclosure", () => {
  it("waits until the last flop flip, turn flip and river flip plus 300ms", () => {
    const frames = cinematicTimeline(qaMatch(2, 3));
    for (const [phase, delay, previous, next] of [["FLOP_3",720,0,3],["TURN",720,3,4],["RIVER",900,4,5]] as const) {
      const at = frames.find(f => f.phase === phase)!.at + delay;
      expect(equityBoardCount(frames,0,at-1)).toBe(previous);
      expect(equityBoardCount(frames,0,at)).toBe(next);
    }
    const nextRun = frames.find(f => f.boardIndex === 1)!;
    expect(equityBoardCount(frames,1,nextRun.at)).toBe(0);
  });
  it("cannot use the future board or result when calculating the flop", () => {
    const match = qaMatch(2,3);
    match.revealedCards = { p1: cards("As Qs"), p2: cards("Kh Kc") };
    match.participantIds = ["p1","p2"]; delete match.runCards;
    match.boards = [cards("Ad 7c 4s Js 2h")];
    const before = matchStreetEquity(match,0,3);
    match.boards = [cards("Ad 7c 4s Kd Ks")]; match.winnerIds = ["p2"];
    expect(matchStreetEquity(match,0,3)).toEqual(before);
    match.boards[0]![0] = { ...match.boards[0]![0]!, hidden: true };
    expect(matchStreetEquity(match,0,3)).toBeNull();
  });
  it("reports exact river wins and tied shares", () => {
    const hands = [cards("2h 3h"), cards("4c 5c")];
    expect(visibleStreetEquity(hands,cards("As Ks Qs Js Ts"),false)).toEqual([50,50]);
    expect(visibleStreetEquity([cards("As Ah"),cards("Ks Kh")],cards("Ad 2c 3c 8d 9h"),false)).toEqual([100,0]);
  });
  it("uses Omaha two-hole-card rules and computes a multiway street", () => {
    const hands = [cards("As Ks 2h 3h"),cards("Qh Qc 4h 5h"),cards("Jh Jc 6h 7h")];
    const odds = visibleStreetEquity(hands,cards("Qs Ts 9s"),true)!;
    expect(odds).toHaveLength(3);
    expect(odds.reduce((a,b)=>a+b,0)).toBeGreaterThanOrEqual(99);
    expect(odds.reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(101);
  });
});
