import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { cinematicTimeline, frameAt, revealFlags } from "./cinematicTimeline";

const deck = makeDeck();
describe("showdown reveal timing", () => {
  it("keeps cards hidden for intro, staggers flop and waits after the river flip", () => {
    const timeline = cinematicTimeline({ boards: [deck.slice(0, 5)], revealedCards: { p1: deck.slice(5, 7) } });
    const time = (phase: string) => timeline.find((frame) => frame.phase === phase)!.at;
    expect(frameAt(timeline, 1199).phase).toBe("VS_INTRO");
    expect(frameAt(timeline, 1200).revealed).toBe(0);
    expect(time("FLOP_2") - time("FLOP_1")).toBe(400);
    expect(time("FLOP_3") - time("FLOP_2")).toBe(400);
    expect(time("TURN") - time("FLOP_PAUSE")).toBe(1000);
    expect(time("RIVER_SUSPENSE") - time("TURN_PAUSE")).toBe(1000);
    expect(time("BEST5_GLOW") - time("RIVER")).toBe(600 + 800);
    for (const frame of timeline.filter((f) => f.at < time("BEST5_GLOW"))) {
      expect(revealFlags(frame.phase)).toMatchObject({ glow: false, profile: false, made: false, result: false, reward: false });
    }
    expect(time("BEST5_GLOW")).toBeLessThan(time("HOLE_DIM"));
    expect(time("HOLE_DIM")).toBeLessThan(time("BOARD_DIM"));
    expect(time("BOARD_DIM")).toBeLessThan(time("PROFILE"));
    expect(time("PROFILE")).toBeLessThan(time("MADE_HAND"));
    expect(time("RESULT")).toBeLessThan(time("REWARD"));
  });
  it("runs two boards and sudden death sequentially, with only one intro", () => {
    const timeline = cinematicTimeline({ boards: [deck.slice(0, 5), deck.slice(5, 10), deck.slice(10, 15)], revealedCards: {} });
    expect(timeline.filter((f) => f.phase === "VS_INTRO")).toHaveLength(1);
    expect(timeline.filter((f) => f.phase === "RUN_RESULT").map((f) => f.boardIndex)).toEqual([0, 1, 2]);
    for (const start of timeline.filter((f) => f.phase === "TABLE_ENTER")) expect(start.revealed).toBe(0);
    expect(timeline.filter((f) => f.phase === "REWARD")).toHaveLength(1);
  });
  it("reveals the four final hands in parallel at 110ms and never creates a board", () => {
    const timeline = cinematicTimeline({ boards: [], revealedCards: Object.fromEntries([0, 1, 2, 3].map((i) => [`p${i}`, deck.slice(i * 7, i * 7 + 7)])) });
    const reveals = timeline.filter((f) => f.phase === "FINAL_CARDS");
    expect(reveals.map((f) => f.finalCards)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(reveals[1].at - reveals[0].at).toBe(110);
    expect(timeline.some((f) => f.phase === "FLOP_1" || f.phase === "RIVER")).toBe(false);
    expect(timeline.find((f) => f.phase === "BEST5_GLOW")!.at - timeline.find((f) => f.phase === "BEST5_WAIT")!.at).toBe(800);
  });
});
