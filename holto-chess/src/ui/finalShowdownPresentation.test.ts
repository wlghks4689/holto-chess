import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { cinematicTimeline } from "./cinematicTimeline";
import { FINAL_REVEAL_STAGGER_MS, finalHeadingCopy, finalNextBatch, finalReadStage, finalRevealSlot } from "./finalShowdownPresentation";

const deck = makeDeck();
const timeline = cinematicTimeline({ round: 5, boards: [], revealedCards: Object.fromEntries([0, 1, 2, 3].map((i) => [`p${i}`, deck.slice(i * 7, i * 7 + 7)])),
  results: [{ place: 1 }, { place: 2 }, { place: 3 }, { place: 4 }] });

describe("R5 final showdown presentation", () => {
  it("keeps FINAL SHOWDOWN for the whole reveal and switches to SHOWDOWN RESULTS once placements start", () => {
    const firstPlace = timeline.findIndex((frame) => frame.phase === "FINAL_PLACE");
    timeline.forEach((frame, index) => {
      const heading = finalHeadingCopy(frame);
      expect(heading.title).toBe(index < firstPlace ? "FINAL SHOWDOWN" : "SHOWDOWN RESULTS");
      expect(Object.keys(heading)).toEqual(["kicker", "title"]);
      expect(heading.kicker).not.toMatch(/CHAMPION|[+-]\d|POINT$/);
    });
  });

  it("keeps the hand panel's previous read while cards are still turning", () => {
    expect(finalReadStage("FINAL_FIRST_REVEAL")).toEqual({ kind: "pending" });
    expect(finalReadStage("FINAL_FIRST_HAND")).toEqual({ kind: "current", cards: 3 });
    expect(finalReadStage("FINAL_SECOND_REVEAL")).toEqual({ kind: "current", cards: 3 });
    expect(finalReadStage("FINAL_SECOND_HAND")).toEqual({ kind: "current", cards: 5 });
    expect(finalReadStage("FINAL_LAST_REVEAL")).toEqual({ kind: "current", cards: 5 });
    expect(finalReadStage("FINAL_SEVEN_SETTLE")).toEqual({ kind: "current", cards: 5 });
    for (const phase of ["BEST5_GLOW", "MADE_HAND", "FINAL_PLACE", "FINAL_WINNER", "REWARD", "COMPLETE"] as const) expect(finalReadStage(phase)).toEqual({ kind: "final" });
  });

  it("paces 3 / 2 / 2 reveals with a 1400ms read beat and a 500ms look before BEST 5", () => {
    const time = (phase: string) => timeline.find((frame) => frame.phase === phase)!.at;
    expect(time("FINAL_SECOND_REVEAL") - time("FINAL_FIRST_HAND")).toBe(1400);
    expect(time("FINAL_LAST_REVEAL") - time("FINAL_SECOND_HAND")).toBe(1400);
    expect(time("BEST5_GLOW") - time("FINAL_SEVEN_SETTLE")).toBe(500);
    expect(FINAL_REVEAL_STAGGER_MS).toEqual([310, 320, 380]);
    // Every staggered flip of a batch finishes inside its reveal phase at 1x (420ms flip, 600ms last pair).
    expect(time("FINAL_FIRST_HAND") - time("FINAL_FIRST_REVEAL")).toBeGreaterThanOrEqual(2 * FINAL_REVEAL_STAGGER_MS[0] + 420);
    expect(time("FINAL_SECOND_HAND") - time("FINAL_SECOND_REVEAL")).toBeGreaterThanOrEqual(FINAL_REVEAL_STAGGER_MS[1] + 420);
    expect(time("FINAL_SEVEN_SETTLE") - time("FINAL_LAST_REVEAL")).toBeGreaterThanOrEqual(FINAL_REVEAL_STAGGER_MS[2] + 600);
    expect([0, 1, 2, 3, 4, 5, 6].map(finalRevealSlot)).toEqual([
      { batch: 0, offset: 0 }, { batch: 0, offset: 1 }, { batch: 0, offset: 2 },
      { batch: 1, offset: 0 }, { batch: 1, offset: 1 }, { batch: 2, offset: 0 }, { batch: 2, offset: 1 }]);
  });

  it("charges up only the batch that opens next, during the read beat before it", () => {
    expect(finalNextBatch("FINAL_FIRST_HAND")).toBe(1);
    expect(finalNextBatch("FINAL_SECOND_HAND")).toBe(2);
    for (const phase of ["TABLE_ENTER", "FINAL_FIRST_REVEAL", "FINAL_SECOND_REVEAL", "FINAL_LAST_REVEAL", "FINAL_SEVEN_SETTLE"] as const) expect(finalNextBatch(phase)).toBeUndefined();
  });
});
