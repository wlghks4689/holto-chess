import { describe, expect, it } from "vitest";
import { ABILITY_IDS } from "./abilities";
import { rewardAbilities, rewardAbilityInterest, rewardRoundLeader } from "./abilityRewards";
import { BALANCE, FRONT_RUNNER_POINTS } from "./config";
import { assertPoolIntegrity } from "./cardPool";
import { autoPickAbility, beginSecondary, createAbilityGame, createGame, finalStandings, openAbilitySelection, pickAbility, resolvePrimary, resolveSecondary, resolveSurvival } from "./engine";
import { compareRoundStanding } from "./roundRanking";
import { createRoundSummary } from "./roundSummary";
import { parseClientMessage } from "../shared/protocol";
import { addSession, createRoom } from "./room";
import { createPlayerView } from "./playerView";
import type { Round } from "./types";

function fixture(round: Round) {
  const state = createGame(123, "seeded", 2, false, false);
  state.round = round; state.phase = "SHOWDOWN_PRIMARY";
  const count = round === 5 ? 4 : round === 4 ? 6 : 8;
  const size = BALANCE.handLimits[round];
  for (const entry of state.ownershipCardPool) { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; }
  state.players.forEach((player, index) => {
    player.eliminated = index >= count; player.points = index; player.stackBB = 50;
    player.shopCardIds = []; player.selectedCardIds = [];
    player.ownedCardIds = index < count ? state.ownershipCardPool.slice(index * size, index * size + size).map(entry => entry.card.id) : [];
    player.selectedCardIds = [...player.ownedCardIds];
    for (const id of player.ownedCardIds) {
      const entry = state.ownershipCardPool.find(item => item.card.id === id)!;
      entry.state = "OWNED"; entry.ownerPlayerId = player.id;
    }
  });
  assertPoolIntegrity(state); return state;
}

describe("Front Runner round settlement", () => {
  it.each([1, 2, 3, 4] as Round[])("R%s uses points, BB and existing stable seat order, once per round", round => {
    const state = fixture(round); state.phase = "ROUND_RESULT";
    state.players.forEach(player => { player.points = 0; player.abilityId = "front-runner"; });
    state.players[0]!.points = 100; state.players[1]!.points = 100;
    state.players[1]!.stackBB = 60;
    rewardRoundLeader(state);
    expect(state.players[1]!.points).toBe(100 + FRONT_RUNNER_POINTS[round]);
    expect(state.players[0]!.points).toBe(100);
    expect(state.abilityEvents).toHaveLength(1);
    expect(state.players[1]!.abilityTotals).toEqual({ activations: 1, bb: 0, points: FRONT_RUNNER_POINTS[round], savedBB: 0 });
    const restored = JSON.parse(JSON.stringify(state)) as typeof state;
    restored.players[0]!.points = 999;
    rewardRoundLeader(restored);
    expect(restored.abilityEvents).toHaveLength(1);
    expect(restored.players[0]!.points).toBe(999);
  });
  it("breaks equal points/BB by the same stable seat order as the standings", () => {
    const state = fixture(1); state.phase = "ROUND_RESULT";
    state.players.forEach(player => { player.points = 0; player.abilityId = "front-runner"; });
    rewardRoundLeader(state);
    expect(state.abilityEvents![0]!.playerId).toBe("p1");
    expect(compareRoundStanding({ playerId:"p1", points:0, stackBB:50 }, { playerId:"p2", points:0, stackBB:50 })).toBeLessThan(0);
  });
  it.each([3, 4] as Round[])("R%s excludes an eliminated points leader", round => {
    const state = fixture(round); state.phase = "ROUND_RESULT";
    state.players[0]!.eliminated = true; state.players[0]!.points = 999; state.players[0]!.abilityId = "front-runner";
    state.players[1]!.points = 100; state.players[1]!.abilityId = "front-runner";
    rewardRoundLeader(state);
    expect(state.abilityEvents!.map(event => event.playerId)).toEqual(["p2"]);
    expect(state.players[0]!.points).toBe(999);
  });
  it("does not re-evaluate an already settled round that had no qualifying holder", () => {
    const state = fixture(1); state.phase = "ROUND_RESULT";
    rewardRoundLeader(state);
    state.players[0]!.abilityId = "front-runner"; state.players[0]!.points = 100;
    rewardRoundLeader(state);
    expect(state.abilityEvents ?? []).toEqual([]);
  });
  it("never settles during a match, group assignment or pending survival", () => {
    const state = fixture(3);
    state.players.forEach(player => { player.abilityId = "front-runner"; });
    for (const phase of ["SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "SURVIVAL_READY"] as const) {
      state.phase = phase; rewardRoundLeader(state);
    }
    state.phase = "ROUND_RESULT"; state.survival = { playerIds: ["p1","p2","p3"], eliminateCount:2 };
    rewardRoundLeader(state);
    expect(state.abilityLeaderRounds).toBeUndefined();
    expect(state.abilityEvents).toBeUndefined();
  });
  it.each([1, 2] as Round[])("R%s actual resolution pays only after all Swiss matches / both runs", round => {
    const before = fixture(round);
    const base = resolvePrimary(before);
    const leaderId = createRoundSummary(base).find(row => !row.eliminated)!.playerId;
    before.players.forEach(player => { player.abilityId = "front-runner"; });
    const after = resolvePrimary(before);
    expect(after.abilityEvents).toHaveLength(1);
    expect(after.abilityEvents![0]).toMatchObject({ playerId:leaderId, round, reason:"round-leader", points:FRONT_RUNNER_POINTS[round] });
    expect(after.players.find(player => player.id === leaderId)!.points - base.players.find(player => player.id === leaderId)!.points).toBe(FRONT_RUNNER_POINTS[round]);
    expect(createRoundSummary(after).find(row => row.playerId === leaderId)!.points - createRoundSummary(base).find(row => row.playerId === leaderId)!.points).toBe(FRONT_RUNNER_POINTS[round]);
    for (const match of after.roundResults) expect(match.pointAwardDetails?.[leaderId] ?? "").not.toContain("round-leader");
    if (round === 1) expect(after.roundResults).toHaveLength(12);
    else expect(after.roundResults.every(match => match.runRewards?.length === 2)).toBe(true);
  });
  it("R3 pays after the survival resolver eliminates the boundary losers", () => {
    const state = fixture(3); state.phase = "SURVIVAL_READY";
    state.survival = { playerIds:["p1","p2","p3"], eliminateCount:2 };
    state.players.forEach(player => { player.abilityId = "front-runner"; });
    state.players[0]!.points = 999;
    const after = resolveSurvival(state);
    expect(after.players.filter(player => !player.eliminated)).toHaveLength(6);
    const leader = [...after.players].filter(player => !player.eliminated).sort((a,b) => b.points-a.points)[0]!;
    expect(after.abilityEvents).toHaveLength(1);
    expect(after.abilityEvents![0]!.playerId).toBe(leader.id);
    expect(after.abilityEvents![0]!.points).toBe(5);
  });
  it("R4 never rewards a bracket slot; pays after both groups and eliminations", () => {
    const state = fixture(4);
    state.players.forEach(player => { player.abilityId = "front-runner"; });
    const primary = resolvePrimary(state);
    expect(primary.phase).toBe("GROUP_ASSIGNMENT");
    expect(primary.abilityEvents ?? []).toEqual([]);
    const after = resolveSecondary(beginSecondary(primary));
    expect(after.players.filter(player => !player.eliminated)).toHaveLength(4);
    expect(after.abilityEvents).toHaveLength(1);
    expect(after.abilityEvents![0]!.points).toBe(6);
    expect(after.players.find(player => player.id === after.abilityEvents![0]!.playerId)!.eliminated).toBe(false);
    expect(createRoundSummary(after).find(row => !row.eliminated)!.playerId).toBe(after.abilityEvents![0]!.playerId);
  });
  it("R5 uses match place, not cumulative points or final total; freezes tied winners", () => {
    const base = fixture(5);
    const match = structuredClone(resolvePrimary(base).roundResults[0]!);
    const state = fixture(5); state.phase = "GAME_RESULT";
    // Synthetic placement fixture isolates the placement contract from hand scoring.
    match.results.forEach((result,index) => { result.place = index < 2 ? 1 : index+1; });
    state.players.forEach(player => { player.abilityId = "front-runner"; player.points = 0; });
    const leaders = match.results.filter(result => result.place === 1).map(result => result.playerId);
    const other = match.results.find(result => result.place !== 1)!.playerId;
    state.players.find(player => player.id === other)!.points = 999;
    rewardRoundLeader(state,match);
    expect(state.abilityEvents!.map(event => event.playerId).sort()).toEqual(leaders.sort());
    expect(state.abilityEvents!.every(event => event.points === 7)).toBe(true);
    expect(state.players.find(player => player.id === other)!.points).toBe(999);
    rewardRoundLeader(state,match);
    expect(state.abilityEvents).toHaveLength(2);
  });
  it("R5 integrates +7 into final totals and ledger without changing placement/ICM", () => {
    const before = fixture(5); const base = resolvePrimary(before);
    const winner = base.roundResults[0]!.results.find(result => result.place === 1)!.playerId;
    before.players.find(player => player.id === winner)!.abilityId = "front-runner";
    const after = resolvePrimary(before);
    expect(after.roundResults[0]!.pointAwards).toEqual(base.roundResults[0]!.pointAwards);
    expect(finalStandings(after).find(row => row.playerId === winner)!.total - finalStandings(base).find(row => row.playerId === winner)!.total).toBe(7);
    expect(after.abilityEvents).toHaveLength(1);
    expect(after.roundResults[0]!.rewards!.find(row => row.playerId === winner)!.deltaPoints - base.roundResults[0]!.rewards!.find(row => row.playerId === winner)!.deltaPoints).toBe(7);
  });
  it("does not pay from the immediate ability hook or change capitalism's once-only interest", () => {
    const state = fixture(1); const match = resolvePrimary(state).roundResults[0]!;
    state.players.forEach(player => { player.abilityId = "front-runner"; });
    rewardAbilities(state,match);
    expect(state.abilityEvents ?? []).toEqual([]);
    state.players[0]!.abilityId = "capitalism"; state.phase = "ROUND_RESULT";
    rewardAbilityInterest(state); rewardRoundLeader(state); rewardAbilityInterest(state);
    // 20% interest, rounded down: 50BB → +10BB.
    expect(state.players[0]!.stackBB).toBe(60);
    expect(state.abilityEvents!.filter(event => event.reason === "round-interest")).toHaveLength(1);
  });
  it("accepts slot twelve and restores 12 slots / 8 unique picks / 4 unpicked", () => {
    let game = openAbilitySelection(createAbilityGame(19, "seeded", false));
    game.abilityDraft!.deck = [...ABILITY_IDS]; game.abilityDraft!.order = game.players.map(player => player.id);
    const action = parseClientMessage(JSON.stringify({ type:"ABILITY_PICK", slot:11, requestId:"leader-test", turnKey:"1:ABILITY_PICK:0:0" }));
    expect(action).toMatchObject({ slot:11 });
    game = pickAbility(game,"p1",11);
    expect(game.players[0]!.abilityId).toBe("front-runner");
    while(game.phase === "ABILITY_PICK") game = autoPickAbility(game);
    const room = { ...addSession(createRoom("LEADER", 19, "seeded", 2, false, false),"leader-session").room, game, status:"PLAYING" as const };
    const restored = JSON.parse(JSON.stringify(room)) as typeof room;
    const draft = createPlayerView(restored,"p1").abilityDraft!;
    expect(draft).toMatchObject({ slotCount:12, pickedCount:8, myPick:{ slot:11, abilityId:"front-runner" } });
    expect(draft.availableSlots).toHaveLength(4);
    expect(new Set(draft.abilities!.map(pick=>pick.abilityId)).size).toBe(8);
  });
});
