import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { findBestFive } from "../core/poker/evaluate";
import { madeTone } from "./madeTone";
import { cinemaSeatClass, MADE_TONE_SAMPLES, hasDedicatedFx } from "./madeFxClasses";

const classes = (value: string) => value.split(/\s+/).filter(Boolean).sort();

describe("cinema seat classes", () => {
  it("dims the trailing seat and lights the leading one", () => {
    expect(classes(cinemaSeatClass({ tone: "straight-flush", placement: "cinema-winner", made: true, leading: true })))
      .toEqual(classes("cinema-seat cinema-winner made-straight-flush cinema-made-fx cinema-leading"));
    expect(classes(cinemaSeatClass({ tone: "straight-flush", placement: "cinema-loser", made: true, leading: false })))
      .toEqual(classes("cinema-seat cinema-loser made-straight-flush cinema-made-fx cinema-trailing"));
  });

  it("marks nobody as trailing while the final table is still resolving", () => {
    const value = cinemaSeatClass({ tone: "royal", placement: "", made: true, leading: undefined });
    expect(value).toContain("cinema-made-fx");
    expect(value).not.toContain("cinema-leading");
    expect(value).not.toContain("cinema-trailing");
  });

  it("holds back the made FX until the glow step", () => {
    const value = cinemaSeatClass({ tone: "quads", placement: "", made: false, leading: true });
    expect(value).not.toContain("cinema-made-fx");
    expect(value).toContain("made-quads");
  });
});

describe("effect preview coverage", () => {
  // The preview must show every tone the palette distinguishes; a new made tone
  // that nobody can preview is how the straight-flush mismatch went unnoticed.
  it("samples every tone the game can produce", () => {
    const produced = new Set(MADE_TONE_SAMPLES.map(madeTone));
    expect(produced).toEqual(new Set(["default", "straight", "flush", "full-house", "quads", "straight-flush", "royal"]));
  });

  it("names the samples exactly as the evaluator does", () => {
    const deck = new Map(makeDeck().map((card) => [card.id, card]));
    const hands: Record<string, string[]> = {
      "스트레이트": ["9h", "8d", "7c", "6s", "5h"],
      "플러시": ["Ah", "Jh", "9h", "7h", "3h"],
      "풀하우스": ["Qh", "Qd", "Qc", "9s", "9h"],
      "포카드": ["Qh", "Qd", "Qc", "Qs", "9h"],
      "스트레이트 플러시": ["9h", "8h", "7h", "6h", "5h"],
      "로열 스트레이트 플러시": ["Ah", "Kh", "Qh", "Jh", "Th"],
    };
    for (const [expected, ids] of Object.entries(hands)) {
      const hand = findBestFive(ids.map((id) => deck.get(id)!));
      expect(hand.displayName).toBe(expected);
      expect(hasDedicatedFx(hand.displayName)).toBe(true);
    }
  });
});
