import { describe, expect, it } from "vitest";
import { buyCard, createGame, rerollShop, sellCard, toggleShopLock, resolvePrimary, resolveSurvival, startNextRound, pickDraftCard, openDraft } from "./engine";
import { BALANCE, cardPrice } from "./config";
import { recordAbilityBenefit, rewardAbilityInterest, rewardAbilities } from "./abilityRewards";
import { abilityBenefit, personalAbilityCues, visibleAbilityEvents } from "./abilityVisibility";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { discloseMatch } from "./disclosure";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { activeAbilityCues } from "../ui/abilityPresentation";
import { CAPITALISM_INTEREST_PERCENT, type AbilityId } from "./abilities";
import type { Round } from "./types";
import type { RoomSnapshot } from "./room";
import type { MatchResult } from "./types";
import { makeDeck } from "../core/poker/cards";

function fixture(round: Round, ability: AbilityId) {
  const s = createGame(123, "seeded", 2, false, false); s.round = round; s.phase = "SHOWDOWN_PRIMARY";
  for (const e of s.ownershipCardPool) { e.state = "AVAILABLE"; delete e.ownerPlayerId; delete e.reservedPlayerId; }
  const count = round === 5 ? 4 : 8;
  s.players.forEach((p, i) => {
    p.abilityId = ability; p.eliminated = i >= count; p.points = i; p.stackBB = 50; p.shopCardIds = [];
    p.ownedCardIds = i >= count ? [] : s.ownershipCardPool.slice(i * BALANCE.handLimits[round], (i + 1) * BALANCE.handLimits[round]).map(e => e.card.id);
    p.selectedCardIds = [...p.ownedCardIds]; p.firstCardId = p.ownedCardIds[0];
    for (const id of p.ownedCardIds) { const e = s.ownershipCardPool.find(e => e.card.id === id)!; e.state = "OWNED"; e.ownerPlayerId = p.id; }
  }); return s;
}

describe("actual economic benefits", () => {
  it("shows Target Sniper's initially dealt card only in its owner's private view", () => {
    const s = fixture(4, "target-sniper");
    const room: RoomSnapshot = { schema: 1, roomId: "QA", revision: 0, status: "PLAYING", game: s,
      sessions: [{ playerId: "p1", tokenHash: "qa", requests: [] }], readyIds: [], endedShopIds: [] };
    const view = createPlayerView(room, "p1");
    const expected = s.players[0]!.firstCardId!;
    expect(view.me.abilityStartingCard?.id).toBe(expected);
    expect(JSON.stringify(view.players)).not.toContain(expected);
    const nonSniper = structuredClone(s); nonSniper.players[0]!.abilityId = "architect";
    room.game = nonSniper;
    expect(createPlayerView(room, "p1").me.abilityStartingCard).toBeUndefined();
  });
  it("records exact purchase savings and sale premiums without paying them twice", () => {
    let s = createGame(32, "seeded", 2, false, false); const p = s.players[0]!; p.abilityId = "royal-blood";
    const card = s.ownershipCardPool.find(e => e.state === "AVAILABLE" && e.card.rank >= 10)!;
    const price = cardPrice(card.card.rank);
    card.state = "RESERVED_IN_SHOP"; card.reservedPlayerId = p.id; p.shopCardIds.push(card.card.id);
    const before = p.stackBB;
    s = buyCard(s, p.id, card.card.id);
    expect(s.players[0]!.stackBB).toBe(before - Math.floor(price / 2));
    expect(s.players[0]!.abilityTotals?.savedBB).toBe(price - Math.floor(price / 2));
    s.players[0]!.abilityId = "golden-hand";
    s.players[0]!.purchasesThisRound = 0; // R1 needs both buys, so free a purchase to make the sale legal
    const saleBefore = s.players[0]!.stackBB;
    s = sellCard(s, p.id, card.card.id);
    expect(s.players[0]!.stackBB).toBe(saleBefore + price);
    expect(s.abilityEvents!.at(-1)!.savedBB).toBe(price - Math.floor(price * BALANCE.sellRate));
  });
  it("counts actual free rerolls and only the first lock of a card in a shop round", () => {
    let s = createGame(2, "seeded", 2, false, false); const p = s.players[0]!; p.abilityId = "trader";
    const id = p.shopCardIds[0]!; const bb = p.stackBB;
    s = toggleShopLock(s, p.id, id); s = toggleShopLock(s, p.id, id); s = toggleShopLock(s, p.id, id);
    expect(s.players[0]!.abilityTotals?.savedBB).toBe(3);
    s = rerollShop(s, p.id);
    expect(s.players[0]!.abilityTotals?.savedBB).toBe(8);
    expect(s.players[0]!.stackBB).toBe(bb);
    expect(new Set(s.abilityEvents!.map(e => e.sequence)).size).toBe(2);
  });
  it("freezes First Class's natural position before granting first pick", () => {
    const s = fixture(1, "architect"); s.phase = "NEXT_ROUND";
    s.players[5]!.abilityId = "first-class";
    const next = startNextRound(s);
    expect(next.draft!.order[0]!.playerId).toBe(s.players[5]!.id);
    expect(abilityBenefit(next.abilityEvents!, s.players[5]!.id).draftPositions).toEqual([{ round: 2, originalPosition: 6 }]);
    expect(next.players[5]!.stackBB).toBe(80);
  });
  it("includes Royal Blood's public draft purchases", () => {
    const s = fixture(1, "architect"); s.phase = "NEXT_ROUND";
    let next = openDraft(startNextRound(s)); const id = next.draft!.order[0]!.playerId;
    const p = next.players.find(p => p.id === id)!; p.abilityId = "royal-blood";
    const card = next.ownershipCardPool.find(e => next.draft!.cardIds.includes(e.card.id) && e.card.rank >= 10)!;
    expect(card).toBeDefined(); const base = cardPrice(card.card.rank);
    next = pickDraftCard(next, id, card.card.id);
    expect(next.abilityEvents!.at(-1)).toMatchObject({ reason: "draft-discount", savedBB: base - Math.floor(base / 2) });
  });
});

describe("settlement and disclosure", () => {
  it.each(["WIN", "LOSS", "SPLIT"])("Architect rewards are independent of %s, while Sniper and Protector follow their own rules", outcome => {
    const state = createGame(12, "seeded", 2, false, false); const p = state.players[0]!;
    const cards = makeDeck().slice(0, 5); p.ownedCardIds = cards.map(c => c.id); p.firstCardId = cards[0]!.id;
    const winners = outcome === "WIN" ? [p.id] : outcome === "LOSS" ? ["p2"] : [p.id, "p2"];
    const match = { id: "test", boardResults: [[{ playerId: p.id, hand: { category: "FULL_HOUSE", categoryRank: 6, bestFive: cards } }]],
      boardWinnerIds: [winners], equities: { [p.id]: { rawPercent: 85, insuranceEligible: true } } } as unknown as MatchResult;
    for (const ability of ["architect", "target-sniper", "zero-risk"] as const) {
      const s = structuredClone(state); s.players[0]!.abilityId = ability;
      rewardAbilities(s, match);
      expect(abilityBenefit(s.abilityEvents ?? [], p.id).bb).toBe(ability === "architect" ? 30 : ability === "target-sniper" ? outcome === "WIN" ? 15 : 0 : outcome === "LOSS" ? 50 : 0);
    }
    const s = structuredClone(state); s.players[0]!.abilityId = "architect";
    match.boardResults[0]![0]!.hand.category = "QUADS";
    rewardAbilities(s, match); expect(s.abilityEvents ?? []).toEqual([]);
  });
  it("pays R2 interest once and R3 interest only after survival is resolved", () => {
    const base = resolvePrimary(fixture(2, "first-class"));
    const result = resolvePrimary(fixture(2, "capitalism"));
    for (const p of result.players) {
      const before = base.players.find(b => b.id === p.id)!;
      expect(p.stackBB).toBe(before.stackBB + Math.floor(before.stackBB * CAPITALISM_INTEREST_PERCENT / 100));
    }
    const count = result.abilityEvents!.length; rewardAbilityInterest(result); expect(result.abilityEvents).toHaveLength(count);
    const r3 = fixture(3, "capitalism"); r3.phase = "SURVIVAL_READY"; r3.survival = { playerIds: ["p1", "p2", "p3"], eliminateCount: 2 };
    rewardAbilityInterest(r3); expect(r3.abilityEvents).toBeUndefined();
    const after = resolveSurvival(r3);
    expect(after.abilityEvents).toHaveLength(6);
    expect(after.abilityEvents!.every(e => !after.players.find(p => p.id === e.playerId)!.eliminated)).toBe(true);
  });
  it("connects both R2 runs to the persisted match and releases cues one run at a time", () => {
    const s = resolvePrimary(fixture(2, "target-sniper"));
    // A match where the sniper's card won both runs, so each run carries one cue.
    const full = s.roundResults.map(match => createMatchView(s, match)).find(view => view.abilityCues?.length === 2)!;
    expect(full.abilityCues?.map(c => c.run)).toEqual([1, 2]);
    const frames = cinematicTimeline(full); const entry = { matchId: full.id, offsetMs: 0, durationMs: 50000 };
    const at = (phase: string) => frames.find(f => f.phase === phase)!.at;
    expect(discloseMatch(full, entry, 0, at("FLOP_1"))!.abilityCues).toEqual([]);
    const run1 = discloseMatch(full, entry, 0, at("RUN_RESULT"))!;
    expect(run1.abilityCues?.map(c => c.run)).toEqual([1]);
    expect(discloseMatch(full, entry, 0, at("RESULT"))!.abilityCues?.map(c => c.run)).toEqual([1, 2]);
    const ownId = full.abilityCues![0]!.playerId;
    const visible = visibleAbilityEvents(s.abilityEvents!, 2, false, new Set(s.roundResults.map(m => m.id)), [run1]);
    expect(abilityBenefit(visible, ownId).bb).toBe(15);
    expect(activeAbilityCues(run1, at("RUN_RESULT") + 500)[0]!.age).toBe(500);
    expect(activeAbilityCues(run1, at("RUN_RESULT") + 1200)).toEqual([]);
    expect(activeAbilityCues(structuredClone(run1), at("RUN_RESULT") + 1200)).toEqual([]);
  });
  it("never publishes opponents' amounts, private benefits or round rewards early", () => {
    const s = resolvePrimary(fixture(2, "target-sniper"));
    recordAbilityBenefit(s, s.players[0]!, { reason: "round-leader", bb: 0, points: 4, savedBB: 0 });
    const room: RoomSnapshot = { schema: 1, roomId: "QA", revision: 0, status: "PLAYING", game: s,
      sessions: [{ playerId: "p1", tokenHash: "qa", requests: [] }], readyIds: [], endedShopIds: [] };
    const full = createMatchView(s, s.roundResults[0]!); const frame = cinematicTimeline(full).find(f => f.phase === "RUN_RESULT")!;
    room.presentation = { key: "qa", version: 1, startsAt: 1000, endsAt: 100000, perPlayer: { p1: [{ matchId: full.id, offsetMs: 0, durationMs: 50000 }] } };
    const early = createPlayerView(room, "p1", [], 1000);
    expect(early.me.abilityBenefit?.bb).toBe(0); expect(early.roundAbilityCues).toBeUndefined();
    const during = createPlayerView(room, "p1", [], 1000 + frame.at);
    expect(during.me.abilityBenefit?.points).toBe(0);
    const late = createPlayerView(room, "p1", [], 100000);
    expect(late.roundAbilityCues).toHaveLength(1);
    for (const m of [...late.matches, ...(late.roundHistory ?? [])]) for (const cue of m.abilityCues ?? []) {
      if (cue.playerId !== "p1") { expect(cue.bb).toBeUndefined(); expect(cue.points).toBeUndefined(); }
    }
    expect(personalAbilityCues([{ id: "other", playerId: "p2", abilityId: "architect", bb: 30 }], "p1")[0]).not.toHaveProperty("bb");
    s.players[0]!.eliminated = true; s.players[0]!.eliminatedRound = 1;
    const spectating = createPlayerView(room, "p1", [], 100000);
    for (const perspective of spectating.spectatorViews ?? []) expect(perspective.me.abilityBenefit).toBeUndefined();
  });
  it("withholds R5 abilities until the final outcome, including all cards and places", () => {
    const s = resolvePrimary(fixture(5, "quad-core")); const match = s.roundResults[0]!;
    recordAbilityBenefit(s, s.players[0]!, { reason: "r5-quad-core", bb: 0, points: 20, savedBB: 0, matchId: match.id });
    const full = createMatchView(s, match); const frames = cinematicTimeline(full);
    const entry = { matchId: full.id, offsetMs: 0, durationMs: 50000 };
    for (const f of frames.filter(f => f.at < frames.find(f => f.phase === "FINAL_WINNER")!.at)) expect(discloseMatch(full, entry, 0, f.at)!.abilityCues).toEqual([]);
    expect(discloseMatch(full, entry, 0, frames.find(f => f.phase === "FINAL_WINNER")!.at)!.abilityCues!.length).toBeGreaterThan(0);
  });
});
