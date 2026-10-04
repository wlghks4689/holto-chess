import { describe, expect, it } from "vitest";
import { CAPITALISM_INTEREST_PERCENT } from "./abilities";
import { rewardAbilityInterest } from "./abilityRewards";
import { BALANCE } from "./config";
import { assertPoolIntegrity } from "./cardPool";
import { beginSecondary, createGame, finalStandings, leaveRoundResult, resolvePrimary, resolveSecondary, resolveSurvival } from "./engine";
import { addSession, applyRoomAction, createRoom, forceBarrier, turnKey } from "./room";
import { createPlayerView } from "./playerView";
import { createRoundSummary } from "./roundSummary";
import type { PorenaGameState, Round } from "./types";

function fixture(round: Round) {
  const state = createGame(123);
  state.round = round; state.phase = "SHOWDOWN_PRIMARY";
  const count = round === 5 ? 4 : round === 4 ? 6 : 8;
  const size = BALANCE.handLimits[round];
  for (const entry of state.ownershipCardPool) { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; }
  state.players.forEach((player, index) => {
    player.eliminated = index >= count; player.points = index * 100; player.stackBB = 57;
    player.shopCardIds = []; player.lockedShopCardIds = [];
    player.ownedCardIds = index < count ? state.ownershipCardPool.slice(index * size, index * size + size).map(entry => entry.card.id) : [];
    player.selectedCardIds = [...player.ownedCardIds];
    for (const id of player.ownedCardIds) {
      const entry = state.ownershipCardPool.find(item => item.card.id === id)!;
      entry.state = "OWNED"; entry.ownerPlayerId = player.id;
    }
  });
  if (round === 3) state.r3Seeds = state.players.map(player => player.id);
  assertPoolIntegrity(state); return state;
}

function settle(state: PorenaGameState) {
  const result = resolvePrimary(state);
  return result.phase === "GROUP_ASSIGNMENT" ? resolveSecondary(beginSecondary(result)) : result;
}

function pendingSurvival() {
  const state = fixture(3);
  const control = resolvePrimary(state);
  // Freeze three players at the elimination boundary after regulation rewards.
  state.players.forEach((player, index) => {
    const earned = control.players[index]!.points - player.points;
    player.points = (index < 3 ? 100 : 200 + index * 100) - earned;
  });
  const pending = resolvePrimary(state);
  expect(pending.survival).toEqual({ playerIds: ["p1", "p2", "p3"], eliminateCount: 2 });
  expect(pending.abilityInterestRounds ?? []).not.toContain(3);
  return leaveRoundResult(pending);
}

function assertInterest(control: PorenaGameState, paid: PorenaGameState, id: string) {
  const before = control.players.find(player => player.id === id)!;
  const player = paid.players.find(player => player.id === id)!;
  const amount = before.eliminated ? 0 : Math.floor(before.stackBB * CAPITALISM_INTEREST_PERCENT / 100);
  expect(player.stackBB).toBe(before.stackBB + amount);
  const events = paid.abilityEvents?.filter(event => event.reason === "round-interest" && event.playerId === id) ?? [];
  expect(events).toHaveLength(amount ? 1 : 0);
  if (amount) {
    expect(events[0]).toMatchObject({ round: paid.round, bb: amount, points: 0 });
    expect(player.abilityTotals).toMatchObject({ activations: 1, bb: amount, points: 0 });
  }
  expect(paid.abilityInterestRounds?.filter(round => round === paid.round)).toHaveLength(1);
  expect(createRoundSummary(paid).find(row => row.playerId === id)?.stackBB).toBe(player.stackBB);
  const room = { ...addSession(createRoom("INTEREST", 123), "session").room, game: paid, status: "PLAYING" as const };
  room.sessions[0]!.playerId = id;
  const view = createPlayerView(room, id);
  expect(view.me.stackBB).toBe(player.stackBB);
  expect(view.roundSummary?.find(row => row.playerId === id)?.stackBB).toBe(player.stackBB);
  const restored = JSON.parse(JSON.stringify(paid)) as PorenaGameState;
  rewardAbilityInterest(restored);
  expect(restored).toEqual(paid);
}

describe("Capitalism round settlement", () => {
  it.each([1, 2, 3, 4, 5] as Round[])("R%s pays once on the post-reward BB, preserving non-holders", round => {
    const source = fixture(round);
    const control = settle(source);
    expect(control.survival).toBeUndefined();
    const holder = control.players.find(player => !player.eliminated)!;
    source.players.find(player => player.id === holder.id)!.abilityId = "capitalism";
    const paid = settle(source);
    assertInterest(control, paid, holder.id);
    for (const player of paid.players.filter(player => player.id !== holder.id))
      expect(player).toEqual(control.players.find(item => item.id === player.id));
    if (round === 2) {
      // Interest is a separate round event, not another RUN reward.
      const ledgers = paid.roundResults.find(match => match.playerIds.includes(holder.id))!.runRewards!;
      expect(ledgers.flat().filter(row => row.playerId === holder.id).reduce((sum, row) => sum + row.deltaBB, 0))
        .toBe(holder.stackBB - source.players.find(player => player.id === holder.id)!.stackBB);
    }
    if (round === 5) expect(finalStandings(paid).find(row => row.playerId === holder.id)!.stackBB).toBe(paid.players.find(player => player.id === holder.id)!.stackBB);
    expect(() => resolvePrimary(paid)).toThrow();
  });

  it.each(["boundary-survivor", "boundary-eliminated", "safe-survivor"])("R3 survival settles %s only after final elimination", role => {
    const source = pendingSurvival();
    const control = resolveSurvival(source);
    const holder = control.players.find(player => role === "safe-survivor" ? !source.survival!.playerIds.includes(player.id)
      : source.survival!.playerIds.includes(player.id) && player.eliminated === (role === "boundary-eliminated"))!;
    source.players.find(player => player.id === holder.id)!.abilityId = "capitalism";
    rewardAbilityInterest(source);
    expect(source.abilityInterestRounds ?? []).not.toContain(3);
    const paid = resolveSurvival(source);
    expect(paid.survival).toBeUndefined();
    expect(paid.players.filter(player => player.eliminated)).toHaveLength(2);
    assertInterest(control, paid, holder.id);
    const reward = paid.roundResults[0]!.rewards!.find(row => row.playerId === holder.id);
    if (reward) expect(reward.afterBB).toBe(paid.players.find(player => player.id === holder.id)!.stackBB);
    if (holder.eliminated) expect(paid.players.find(player => player.id === holder.id)!.eliminationSnapshot).toEqual(holder.eliminationSnapshot);
    expect(() => resolveSurvival(paid)).toThrow();
  });

  it.each([3, 4] as const)("R%s excludes a newly eliminated holder without a survival tiebreak", round => {
    const source = fixture(round);
    const control = settle(source);
    const holder = control.players.find(player => player.eliminated && !source.players.find(item => item.id === player.id)!.eliminated)!;
    source.players.find(player => player.id === holder.id)!.abilityId = "capitalism";
    const paid = settle(source);
    expect(paid.survival).toBeUndefined();
    assertInterest(control, paid, holder.id);
    expect(paid.players.find(player => player.id === holder.id)!.eliminationSnapshot).toEqual(holder.eliminationSnapshot);
  });

  it.each([0, 1, 6, 7, 19, 20, 57, 99, 100, 101])("floors the interest rate of %s BB and persists even a zero payout", bb => {
    const state = fixture(1); state.phase = "ROUND_RESULT";
    state.players[0]!.abilityId = "capitalism"; state.players[0]!.stackBB = bb;
    state.players[1]!.abilityId = "capitalism"; state.players[1]!.eliminated = true;
    const others = structuredClone(state.players.slice(1));
    rewardAbilityInterest(state);
    expect(state.players[0]!.stackBB).toBe(bb + Math.floor(bb * CAPITALISM_INTEREST_PERCENT / 100));
    expect(state.players.slice(1)).toEqual(others);
    expect(state.abilityEvents ?? []).toHaveLength(Math.floor(bb * CAPITALISM_INTEREST_PERCENT / 100) > 0 ? 1 : 0);
    const restored = JSON.parse(JSON.stringify(state)) as PorenaGameState;
    restored.players[0]!.stackBB += 100;
    rewardAbilityInterest(restored);
    expect(restored.players[0]!.stackBB).toBe(state.players[0]!.stackBB + 100);
    expect(restored.abilityInterestRounds).toEqual([1]);
  });

  it.each([2, 3] as const)("R%s room transition matches local settlement and rejects stale retry", round => {
    const game = round === 2 ? fixture(2) : pendingSurvival();
    const control = round === 2 ? resolvePrimary(game) : resolveSurvival(game);
    const holder = control.players.find(player => !player.eliminated && (round === 2 || game.survival!.playerIds.includes(player.id)))!;
    game.players.find(player => player.id === holder.id)!.abilityId = "capitalism";
    const local = round === 2 ? resolvePrimary(game) : resolveSurvival(game);
    let room = { ...addSession(createRoom("INTEREST", 123), "session").room, game, status: "PLAYING" as const, barrierSince: 0 };
    const key = turnKey(room);
    room = forceBarrier(room, 100_000)! as typeof room;
    expect(room.game.players).toEqual(local.players);
    expect(room.game.abilityEvents).toEqual(local.abilityEvents);
    expect(room.game.abilityInterestRounds).toEqual(local.abilityInterestRounds);
    expect(() => applyRoomAction(room, "p1", { type: "READY" }, key, 1001)).toThrow();
  });
});
