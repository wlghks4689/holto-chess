import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { parseClientMessage } from "../shared/protocol";
import { findBestFive } from "../core/poker/evaluate";
import { ABILITY_IDS, quadCorePlacementBonus } from "./abilities";
import { rewardQuadCorePlacement } from "./abilityRewards";
import { assertPoolIntegrity } from "./cardPool";
import { autoPickAbility, createAbilityGame, createGame, finalStandings, finishAbilitySelection, openAbilitySelection, pickAbility, resolvePrimary, rewardFinalPlacements } from "./engine";
import { createPlayerView } from "./playerView";
import { addSession, createRoom } from "./room";
import type { Round } from "./types";

const deck = makeDeck();
const quadsIds = ["Js", "Jh", "Jd", "Jc", "As", "2c", "3c"];
const quads = findBestFive(deck.filter(card => quadsIds.includes(card.id)));
const owner = { abilityId: "quad-core" as const, firstCardId: "Js", ownedCardIds: quadsIds };

function fourQuadsFixture() {
  const game = createGame(88);
  game.round = 5; game.phase = "SHOWDOWN_PRIMARY";
  const ranks = ["A", "K", "Q", "J"];
  const extras = deck.filter(card => card.rank < 11);
  for (const entry of game.ownershipCardPool) {
    entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId;
  }
  game.players.forEach((player, index) => {
    player.eliminated = index >= 4; player.shopCardIds = []; player.selectedCardIds = [];
    player.points = 77; player.stackBB = 50;
    player.ownedCardIds = index < 4 ? [...["s", "h", "d", "c"].map(suit => ranks[index] + suit), ...extras.slice(index * 3, index * 3 + 3).map(card => card.id)] : [];
    player.firstCardId = player.ownedCardIds[0];
    for (const id of player.ownedCardIds) {
      const entry = game.ownershipCardPool.find(item => item.card.id === id)!;
      entry.state = "OWNED"; entry.ownerPlayerId = player.id;
    }
  });
  assertPoolIntegrity(game);
  return game;
}

describe("QUAD CORE identity and hand conditions", () => {
  it.each([1, 2, 3, 4] as Round[])("never activates in R%s", round => {
    expect(quadCorePlacementBonus(owner, quads, round, 20)).toBe(0);
  });
  it("pays for any final Quads, whatever the starting card (2026-10-01 rule)", () => {
    expect(quadCorePlacementBonus(owner, quads, 5, 20)).toBe(20);
    // The starting card and ownership no longer matter.
    const variants = [...["As", "2c", "Ah", undefined].map(firstCardId => ({ ...owner, firstCardId })), { ...owner, ownedCardIds: [] }];
    for (const variant of variants) expect(quadCorePlacementBonus(variant, quads, 5, 20)).toBe(20);
    expect(quadCorePlacementBonus({ ...owner, abilityId: "predator" }, quads, 5, 20)).toBe(0);
    expect(quadCorePlacementBonus(owner, quads, 5, 0)).toBe(0);
  });
  it.each([
    ["Js", "Jh", "Jd", "As", "Ah", "2c", "3c"],
    ["Js", "Ts", "9s", "8s", "7s", "2c", "3c"],
    ["As", "Ks", "Qs", "Js", "Ts", "2c", "3c"],
  ])("does not activate on other final categories: %j", (...ids) => {
    const hand = findBestFive(deck.filter(card => ids.includes(card.id)));
    expect(quadCorePlacementBonus(owner, hand, 5, 20)).toBe(0);
  });
  it.each(ABILITY_IDS.filter(id => id !== "quad-core"))("does not alter %s", abilityId => {
    expect(quadCorePlacementBonus({ ...owner, abilityId }, quads, 5, 20)).toBe(0);
  });
});

describe("QUAD CORE settlement", () => {
  it.each([20, 12, 5, 3])("doubles only placement award %s and records only the bonus", award => {
    const index = [20, 12, 5, 3].indexOf(award);
    const before = fourQuadsFixture();
    before.players[index]!.abilityId = "quad-core";
    const baseline = resolvePrimary({ ...before, players: before.players.map(player => ({ ...player, abilityId: undefined })) });
    const after = resolvePrimary(before);
    const player = after.players[index]!;
    expect(player.points).toBe(77 + award * 2);
    expect(player.stackBB).toBe(50);
    expect(player.abilityTotals).toEqual({ activations: 1, points: award, bb: 0, savedBB: 0 });
    expect(after.abilityEvents).toContainEqual(expect.objectContaining({ reason: "r5-quad-core", points: award, playerId: player.id }));
    const match = after.roundResults[0]!;
    expect(match.pointAwards![player.id]).toBe(award * 2);
    expect(match.rewards!.find(item => item.playerId === player.id)!.deltaPoints).toBe(award * 2);
    const final = finalStandings(after).find(row => row.playerId === player.id)!;
    const base = finalStandings(baseline).find(row => row.playerId === player.id)!;
    expect(final.handScore).toBe(base.handScore);
    expect(final.stackScore).toBe(base.stackScore);
    expect(final.total - base.total).toBe(award);
    after.players.filter(p => p.id !== player.id).forEach(p => expect(p.points).toBe(baseline.players.find(b => b.id === p.id)!.points));
    rewardQuadCorePlacement(after, match);
    expect(player.abilityTotals!.activations).toBe(1);
    expect(player.points).toBe(77 + award * 2);
    expect(() => resolvePrimary(after)).toThrow();
  });
  it("doubles an already allocated ICM share without redistributing anyone else's share", () => {
    const state = fourQuadsFixture();
    const match = structuredClone(resolvePrimary(state).roundResults[0]!);
    // Synthetic tie tests allocation ordering defensively. Identical quads cannot
    // tie in the current disjoint, boardless R5 deck.
    match.results.find(result => result.playerId === "p2")!.place = 1;
    state.players[0]!.stackBB = 90; state.players[1]!.stackBB = 10;
    state.players[0]!.abilityId = "quad-core";
    rewardFinalPlacements(state, match);
    const allocations = { ...match.pointAwards };
    const beforePoints = state.players.map(player => player.points);
    expect(allocations.p1! + allocations.p2!).toBeCloseTo(32);
    expect(allocations.p1).not.toBe(16);
    rewardQuadCorePlacement(state, match);
    expect(match.pointAwards!.p1).toBe(allocations.p1! * 2);
    for (const id of ["p2", "p3", "p4"]) expect(match.pointAwards![id]).toBe(allocations[id]);
    expect(state.players[0]!.points).toBe(beforePoints[0]! + allocations.p1!);
    expect(state.players[1]!.points).toBe(beforePoints[1]);
  });
});

describe("expanded ability draft", () => {
  it("accepts the eleventh wire slot and rejects out-of-range inputs", () => {
    const message = (slot: number) => JSON.stringify({ type: "ABILITY_PICK", slot, requestId: "quad-test", turnKey: "1:ABILITY_PICK:0:0" });
    expect(parseClientMessage(message(10))).toMatchObject({ slot: 10 });
    for (const slot of [-1, ABILITY_IDS.length, 1.5, NaN, Infinity]) expect(() => parseClientMessage(message(slot))).toThrow();
  });
  it("selects slot eleven, restores a public view and autopicks eight unique abilities", () => {
    let game = openAbilitySelection(createAbilityGame(42));
    expect(game.abilityDraft!.deck).toHaveLength(ABILITY_IDS.length);
    game.abilityDraft!.deck = [...ABILITY_IDS];
    game.abilityDraft!.order = game.players.map(player => player.id);
    const firstId = game.abilityDraft!.order[0]!;
    game = pickAbility(game, firstId, 10);
    expect(game.players.find(player => player.id === firstId)!.abilityId).toBe("quad-core");
    expect(() => pickAbility(game, game.abilityDraft!.order[1]!, 10)).toThrow();
    expect(() => pickAbility(game, game.abilityDraft!.order[1]!, ABILITY_IDS.length)).toThrow();
    while (game.phase === "ABILITY_PICK") game = autoPickAbility(game);
    expect(new Set(game.players.map(player => player.abilityId)).size).toBe(8);
    const room = { ...addSession(createRoom("QUAD", 42), "quad-session").room, status: "PLAYING" as const, game };
    const restored = JSON.parse(JSON.stringify(room)) as typeof room;
    const view = createPlayerView(restored, firstId);
    expect(view.abilityDraft).toMatchObject({ slotCount: ABILITY_IDS.length, pickedCount: 8, myPick: { slot: 10, abilityId: "quad-core" } });
    expect(view.abilityDraft!.availableSlots).toHaveLength(ABILITY_IDS.length - 8);
    expect(view.abilityDraft).not.toHaveProperty("deck");
    const dealt = finishAbilitySelection(game);
    // Only Royal Blood and Target Sniper are dealt a starting card; Quad Core buys both R1 cards.
    expect(dealt.players.find(player => player.id === firstId)!.ownedCardIds).toEqual([]);
    expect(dealt.players.find(player => player.id === firstId)!.firstCardId).toBeUndefined();
  });
});
