import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { compareHands, findBestFive } from "../core/poker/evaluate";
import { rawShowdownEquity, scoreSeven, showdownEquity } from "./showdownEquity";

const cards = Object.fromEntries(makeDeck().map((card) => [card.id, card]));
const hand = (...ids: string[]) => ids.map((id) => cards[id]!);

describe("heads-up matchup equity", () => {
  it("uses only the two shown hands and gives tied boards half a win each", () => {
    const left = hand("As", "Ah");
    const right = hand("2c", "7d");
    const result = showdownEquity(1, left, right)!;
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[0] + result[1]).toBeGreaterThanOrEqual(99);
    expect(result[0] + result[1]).toBeLessThanOrEqual(100);
    expect(showdownEquity(1, left, right)).toEqual(result);
  });

  it("never rounds a sub-60 raw estimate up to the zero-risk threshold", () => {
    const left = hand("As", "Ah"), right = hand("2c", "7d");
    const raw = rawShowdownEquity(1, left, right)!;
    expect(showdownEquity(1, left, right)![0]).toBe(Math.floor(raw));
    if (raw < 60) expect(showdownEquity(1, left, right)![0]).toBeLessThan(60);
  });

  it("keeps sampled equity stable when the same cards arrive in a different order", () => {
    const cases = [
      { round: 1 as const, left: hand("As", "Ah"), right: hand("2c", "7d") },
      { round: 2 as const, left: hand("As", "Ah"), right: hand("2c", "7d") },
      { round: 3 as const, left: hand("As", "Ks", "Qs", "Js"), right: hand("2c", "3d", "4h", "5c") },
      { round: 4 as const, left: hand("As", "Ah", "Kd", "Qc", "Js"), right: hand("2c", "3d", "4h", "5c", "6s") },
    ];

    for (const { round, left, right } of cases) {
      const equity = showdownEquity(round, left, right);
      expect(showdownEquity(round, [...left].reverse(), [...right].reverse())).toEqual(equity);
      expect(showdownEquity(round, right, left)).toEqual([equity![1], equity![0]]);
    }
  });

  it("excludes all known R2 hand cards from independent run-board samples", () => {
    const left = hand("As", "Ah"), right = hand("2c", "7d"), fullHands = hand("As", "Ah", "Qs", "2c", "7d", "Jd");
    const result = showdownEquity(2, left, right, fullHands)!;
    expect(result[0] + result[1]).toBeGreaterThanOrEqual(99);
    expect(result[0] + result[1]).toBeLessThanOrEqual(100);
    expect(showdownEquity(2, left, right, [fullHands[2]!, fullHands[2]!])).toBeNull();
  });

  it("scores the boardless final exactly and hides incomplete or duplicate hands", () => {
    expect(showdownEquity(5, hand("Ts", "Js", "Qs", "Ks", "As", "2c", "3d"),
      hand("2h", "3h", "4c", "5d", "6c", "7d", "8h"))).toEqual([100, 0]);
    expect(showdownEquity(3, hand("As"), hand("2c"))).toBeNull();
    expect(showdownEquity(1, hand("As", "Ah"), hand("As", "2c"))).toBeNull();
  });
});

describe("heads-up equity accuracy", () => {
  it("lands within 1.5%p of the exact R1 equity", () => {
    // Exact enumeration over all 1,712,304 boards: Ts6c vs Js7h = 36.08%.
    const result = showdownEquity(1, hand("Ts", "6c"), hand("Js", "7h"))!;
    expect(Math.abs(result[0] - 36.08)).toBeLessThanOrEqual(1.5);
  });

  it("returns an independent copy from the cache", () => {
    const first = showdownEquity(1, hand("Kd", "Kc"), hand("9s", "8s"))!;
    first[0] = -1;
    expect(showdownEquity(1, hand("Kd", "Kc"), hand("9s", "8s"))![0]).toBeGreaterThan(0);
  });
});

describe("fast seven-card scoring", () => {
  it("orders random seven-card hands exactly like findBestFive + compareHands", () => {
    let seed = 20260928;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const deck = makeDeck();
    for (let trial = 0; trial < 20_000; trial += 1) {
      const d = [...deck];
      for (let i = 0; i < 9; i += 1) { const j = i + Math.floor(random() * (d.length - i)); [d[i], d[j]] = [d[j]!, d[i]!]; }
      const board = d.slice(4, 9), a = [...d.slice(0, 2), ...board], b = [...d.slice(2, 4), ...board];
      const expected = Math.sign(compareHands(findBestFive(a), findBestFive(b)));
      expect(Math.sign(scoreSeven(a) - scoreSeven(b)), `${a.map((c) => c.id)} vs ${b.map((c) => c.id)}`).toBe(expected);
    }
  });

  it("handles the edge cases random sampling rarely reaches", () => {
    const cmp = (a: string[], b: string[]) => [Math.sign(scoreSeven(hand(...a)) - scoreSeven(hand(...b))),
      Math.sign(compareHands(findBestFive(hand(...a)), findBestFive(hand(...b))))];
    const cases: [string[], string[]][] = [
      [["Ah", "2h", "3h", "4h", "5h", "Kd", "Kc"], ["6s", "7s", "8s", "9s", "Ts", "2d", "3d"]], // wheel SF vs 10-high SF
      [["As", "Ks", "Qs", "Js", "Ts", "9s", "2d"], ["Kh", "Qh", "Jh", "Th", "9h", "8h", "2c"]], // royal vs SF
      [["Ah", "Ad", "Ac", "Kh", "Kd", "Kc", "2s"], ["Qh", "Qd", "Qc", "Js", "Jd", "Jc", "2c"]], // two trips -> full house
      [["9h", "9d", "8h", "8d", "7h", "7d", "Ac"], ["9s", "9c", "8s", "8c", "2h", "2d", "Kc"]], // three pairs kicker
      [["Ah", "Kh", "Qh", "Jh", "9h", "8h", "2c"], ["Ad", "Kd", "Qd", "Jd", "9d", "7d", "2s"]], // flush with six suited cards
      [["5c", "5d", "5h", "Ac", "Kd", "2h", "3s"], ["5s", "4c", "4d", "Ah", "Kc", "Qh", "3d"]], // trips vs pair
      [["Ah", "2d", "3c", "4s", "5h", "Kd", "Qc"], ["2h", "3d", "4c", "5s", "6h", "Kc", "Qd"]], // wheel vs 6-high straight
    ];
    for (const [a, b] of cases) { const [fast, slow] = cmp(a, b); expect(fast).toBe(slow); }
  });
});
