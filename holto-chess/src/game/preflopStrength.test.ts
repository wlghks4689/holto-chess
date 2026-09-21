import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import { scoreBotPlan } from "./botStrategy";
import {
  HOLDEM_PREFLOP_MATRIX, futureAssetValue, holdemPreflopStrength,
  omahaPreflopStrength, poolDenialValue, strategicCardValue,
} from "./preflopStrength";

const deck = makeDeck();
const cards = (...ids: string[]): Card[] => ids.map((id) => deck.find((card) => card.id === id)!);

describe("Hold'em preflop strength", () => {
  it("contains all 169 pair, suited and offsuit starting-hand keys", () => {
    expect(Object.keys(HOLDEM_PREFLOP_MATRIX)).toHaveLength(169);
    expect(new Set(Object.keys(HOLDEM_PREFLOP_MATRIX)).size).toBe(169);
    expect(Object.keys(HOLDEM_PREFLOP_MATRIX).filter((key) => key.length === 2)).toHaveLength(13);
    expect(Object.keys(HOLDEM_PREFLOP_MATRIX).filter((key) => key.endsWith("s"))).toHaveLength(78);
    expect(Object.keys(HOLDEM_PREFLOP_MATRIX).filter((key) => key.endsWith("o"))).toHaveLength(78);
    expect(Object.values(HOLDEM_PREFLOP_MATRIX).every((score) => score >= 0 && score <= 100)).toBe(true);
  });

  it("distinguishes pair, suited and offsuit strength and applies exact tiers", () => {
    const aa = holdemPreflopStrength(cards("As", "Ah"));
    const kk = holdemPreflopStrength(cards("Ks", "Kh"));
    const aks = holdemPreflopStrength(cards("As", "Ks"));
    const ako = holdemPreflopStrength(cards("As", "Kh"));
    const jts = holdemPreflopStrength(cards("Js", "Ts"));
    const jto = holdemPreflopStrength(cards("Js", "Th"));
    expect(aa.score).toBeGreaterThan(kk.score);
    expect(aks.score).toBeGreaterThan(ako.score);
    expect(jts.score).toBeGreaterThan(jto.score);
    expect(aa.features).toContain("pocket-pair:A");
    expect(aks.features).toContain("suited");
    expect(ako.features).toContain("offsuit");
    expect(aa.tier).toBe("S");
  });
});

describe("Omaha structural preflop strength", () => {
  const value = (...ids: string[]) => omahaPreflopStrength(cards(...ids));

  it("ranks premium and connected structures in the requested order", () => {
    const aajtDs = value("As", "Ah", "Js", "Th");
    const aa72r = value("As", "Ah", "7d", "2c");
    const aakkDs = value("As", "Ah", "Ks", "Kh");
    const jt98Ds = value("Js", "Th", "9s", "8h");
    const kkqjDs = value("Ks", "Kh", "Qs", "Jh");
    expect(aajtDs.score).toBeGreaterThan(aa72r.score);
    expect(aakkDs.tier).toBe("S");
    expect(jt98Ds.score).toBeGreaterThanOrEqual(72);
    expect(kkqjDs.score).toBeGreaterThanOrEqual(72);
    expect(aajtDs.features).toEqual(expect.arrayContaining(["double-suited", "nut-suit", "aa-connectivity"]));
    expect(aa72r.score).toBeGreaterThanOrEqual(44);
  });

  it("penalizes blocked hole trips/quads without erasing present or future value", () => {
    const aa72 = value("As", "Ah", "7d", "2c");
    const aaa7 = value("As", "Ah", "Ad", "7c");
    const aaaa = value("As", "Ah", "Ad", "Ac");
    expect(aaa7.score).toBeLessThan(aa72.score);
    expect(aaa7.features).toContain("trips-in-hole:A");
    expect(aaaa.features).toContain("quads-in-hole:A");
    expect(aaaa.score).toBeGreaterThanOrEqual(44);
    expect(futureAssetValue(cards("As", "Ah", "Ad", "Ac"))).toBe(100);
    expect(poolDenialValue(cards("As", "Ah", "Ad", "Ac"))).toBe(100);
    expect(futureAssetValue(cards("As", "Ah", "Ad", "7c"))).toBeGreaterThan(futureAssetValue(cards("As", "Kh", "7d", "2c")));
  });

  it("reports the full requested feature vocabulary when structures are present", () => {
    expect(value("As", "Ah", "Ks", "Kh").features).toEqual(expect.arrayContaining([
      "pocket-pair:A", "two-pair-structure", "double-suited", "nut-suit",
    ]));
    expect(value("As", "Kh", "9d", "2c").features).toContain("dangler");
    expect(value("6s", "6h", "Kd", "2c").features).toContain("low-disconnected-pair");
    expect(value("Js", "Th", "8d", "3c").features).toEqual(expect.arrayContaining(["connected", "one-gap", "two-gap", "broadway:2"]));
  });
});

describe("multi-round strategic value", () => {
  it("keeps current preflop, future asset, and shared-pool denial as separate signals", () => {
    const value = strategicCardValue(3, cards("As", "Ah", "Ad", "Ac"));
    expect(value.currentRoundStrength?.score).toBeGreaterThanOrEqual(44);
    expect(value.futureAssetValue).toBe(100);
    expect(value.poolDenialValue).toBe(100);
    expect(strategicCardValue(2, cards("As", "Ah", "Ad")).currentRoundStrength).toBeUndefined();
  });

  it("integrates bounded strategic features while preserving Monte Carlo equity as the primary term", () => {
    const plan = scoreBotPlan(3, cards("As", "Ah", "Js", "Th"), 50, "preflop-feature");
    expect(plan.currentRoundStrength).toEqual(omahaPreflopStrength(cards("As", "Ah", "Js", "Th")));
    expect(plan.futureAssetValue).toBeGreaterThan(0);
    expect(plan.poolDenialValue).toBeGreaterThan(0);
    const featureContribution = plan.currentRoundStrength!.score * 0.02 + plan.futureAssetValue * 0.015 + plan.poolDenialValue * 0.01;
    expect(featureContribution).toBeLessThanOrEqual(4.5);
    expect(plan.equity * 100).toBeGreaterThan(featureContribution);
  });
});
