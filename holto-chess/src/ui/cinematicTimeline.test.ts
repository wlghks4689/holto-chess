import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { cinematicTimeline, displayedStreetIndex, frameAt, revealFlags } from "./cinematicTimeline";

const deck = makeDeck();
describe("showdown reveal timing", () => {
  it("holds the face-up intro reveal and updates each made hand 200ms after the street settles", () => {
    const timeline = cinematicTimeline({ boards: [deck.slice(0, 5)], revealedCards: { p1: deck.slice(5, 7) } });
    const time = (phase: string) => timeline.find((frame) => frame.phase === phase)!.at;
    expect(frameAt(timeline, 1399).phase).toBe("VS_INTRO");
    expect(frameAt(timeline, 1200).revealed).toBe(0);
    expect(time("FLOP_2") - time("FLOP_1")).toBe(400);
    expect(time("FLOP_3") - time("FLOP_2")).toBe(400);
    expect(time("FLOP_HAND") - time("FLOP_SETTLE")).toBe(200);
    expect(time("TURN_HAND") - time("TURN_SETTLE")).toBe(200);
    expect(time("BEST5_GLOW") - time("RIVER_SETTLE")).toBe(200);
    expect(time("BEST5_GLOW") - time("RIVER")).toBe(600 + 200);
    expect(displayedStreetIndex("FLOP_SETTLE")).toBe(0);
    expect(displayedStreetIndex("FLOP_HAND")).toBe(1);
    expect(displayedStreetIndex("TURN_SETTLE")).toBe(1);
    expect(displayedStreetIndex("TURN_HAND")).toBe(2);
    expect(displayedStreetIndex("RIVER_SETTLE")).toBe(2);
    expect(displayedStreetIndex("RIVER_HAND")).toBe(3);
    for (const frame of timeline.filter((f) => f.at < time("BEST5_GLOW"))) {
      expect(revealFlags(frame.phase)).toMatchObject({ glow: false, profile: false, made: false, result: false, reward: false });
    }
    expect(revealFlags("BEST5_GLOW")).toMatchObject({ glow: true, made: true });
    expect(timeline.some((frame) => frame.phase === "MADE_HAND" || frame.phase === "RUN_RESULT")).toBe(false);
    expect(time("RESULT") - time("BEST5_GLOW")).toBe(650);
    expect(time("REWARD") - time("RESULT")).toBe(650);
    expect(time("COMPLETE") - time("REWARD")).toBe(1100);
    expect(time("RESULT")).toBeLessThan(time("REWARD"));
  });
  it("runs two boards and tiebreak as one continuous timeline with only one table entry", () => {
    const timeline = cinematicTimeline({ boards: [deck.slice(0, 5), deck.slice(5, 10), deck.slice(10, 15)], revealedCards: {} });
    expect(timeline.filter((f) => f.phase === "VS_INTRO")).toHaveLength(1);
    expect(timeline.filter((f) => f.phase === "RUN_RESULT").map((f) => f.boardIndex)).toEqual([0, 1]);
    expect(timeline.filter((f) => f.phase === "TABLE_ENTER")).toHaveLength(1);
    expect(timeline.filter((f) => f.phase === "REWARD")).toHaveLength(1);
  });
  it("holds the RUN 1 result for 0.5 seconds longer before switching to RUN 2", () => {
    const timeline = cinematicTimeline({
      boards: [deck.slice(0, 5), deck.slice(5, 10)],
      revealedCards: { p1: deck.slice(10, 12), p2: deck.slice(12, 14) },
      runCards: { p1: [deck.slice(10, 12), deck.slice(10, 11).concat(deck.slice(14, 15))] },
    });
    const runOneResult = timeline.find((frame) => frame.phase === "RUN_RESULT" && frame.boardIndex === 0)!;
    const switchOut = timeline.find((frame) => frame.phase === "CARD_SWITCH_OUT")!;
    expect(switchOut.at - runOneResult.at).toBe(1300);
  });
  it("reveals R5 as 3, then 5, then 7 cards before BEST5 and resolves lower places before the winner", () => {
    const timeline = cinematicTimeline({ round: 5, boards: [], revealedCards: Object.fromEntries([0, 1, 2, 3].map((i) => [`p${i}`, deck.slice(i * 7, i * 7 + 7)])),
      results: [{ place: 1 }, { place: 2 }, { place: 3 }, { place: 4 }] });
    const reveals = timeline.filter((f) => ["FINAL_FIRST_REVEAL", "FINAL_SECOND_REVEAL", "FINAL_LAST_REVEAL"].includes(f.phase));
    expect(reveals.map((f) => f.finalCards)).toEqual([3, 5, 7]);
    expect(timeline.some((f) => f.phase === "FLOP_1" || f.phase === "RIVER")).toBe(false);
    expect(timeline.filter((f) => f.phase === "FINAL_PLACE").map((f) => f.finalPlace)).toEqual([4, 3, 2]);
    expect(timeline.findIndex((f) => f.phase === "BEST5_GLOW")).toBeLessThan(timeline.findIndex((f) => f.phase === "FINAL_PLACE"));
    expect(timeline.findIndex((f) => f.phase === "FINAL_WINNER")).toBeLessThan(timeline.findIndex((f) => f.phase === "REWARD"));
    for (const frame of timeline.filter((f) => f.at < timeline.find((item) => item.phase === "BEST5_GLOW")!.at)) {
      expect(revealFlags(frame.phase).glow).toBe(false);
    }
  });
});
