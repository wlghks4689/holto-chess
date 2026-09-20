import { describe, expect, it } from "vitest";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE } from "./config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, createGame as createGameCurrent, finalStandings,
  leaveRoundResult, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  sellCard, startNextRound, toggleSelectedCard,
} from "./engine";
import type { PorenaGameState } from "./types";

function fillHuman(state: PorenaGameState): PorenaGameState {
  if (state.players[0]!.eliminated) return state;
  const target = BALANCE.handLimits[state.round];
  while (state.players[0]!.ownedCardIds.length < target) {
    const id = state.players[0]!.shopCardIds[0];
    if (!id) throw new Error("test shop unexpectedly empty");
    state = buyCard(state, "p1", id);
  }
  return state;
}

function playRound(state: PorenaGameState): PorenaGameState {
  state = fillHuman(state); state = prepareShowdown(state);
  if (state.phase === "DECK_SELECT") {
    const required = state.round === 3 ? 4 : 2;
    for (const id of state.players[0]!.ownedCardIds.slice(0, required)) state = toggleSelectedCard(state, "p1", id);
    state = confirmSelection(state);
  }
  state = resolvePrimary(state);
  if (state.phase === "GROUP_ASSIGNMENT") { state = beginSecondary(state); state = resolveSecondary(state); }
  return state;
}

describe("PORENA engine", () => {
  it("assigns a distinct readable nickname to every seat", () => {
    const names = createGame(99).players.map((player) => player.name);
    expect(new Set(names).size).toBe(8);
    expect(names.slice(1).every((name) => !/^Player \d+$/.test(name))).toBe(true);
  });
  it("stores authoritative pre-flop, flop, turn and river hand snapshots", () => {
    let state = fillHuman(createGame(100));
    state = prepareShowdown(state); state = resolvePrimary(state);
    const snapshots = state.roundResults[0]!.streetSnapshots![0]!;
    expect(snapshots.map((snapshot) => snapshot.street)).toEqual(["PRE_FLOP", "FLOP", "TURN", "RIVER"]);
    expect(snapshots.map((snapshot) => snapshot.results).every((results) => results.length === 2)).toBe(true);
    expect(snapshots[3]!.results).toEqual(state.roundResults[0]!.boardResults[0]);
  });
  it("reserves shops globally without duplicate cards", () => {
    const state = createGame(101);
    const ids = state.players.flatMap((player) => player.shopCardIds);
    expect(ids).toHaveLength(16); expect(new Set(ids).size).toBe(16); expect(assertPoolIntegrity(state)).toBe(true);
  });

  it("returns rerolled and sold cards to legal pool states", () => {
    let state = createGame(202);
    state = rerollShop(state, "p1");
    expect(state.players[0]!.shopCardIds).toHaveLength(2);
    expect(new Set(state.players.flatMap((player) => player.shopCardIds)).size).toBe(16);
    const bought = state.players[0]!.shopCardIds[0]!; state = buyCard(state, "p1", bought); state = sellCard(state, "p1", bought);
    expect(state.ownershipCardPool.find((entry) => entry.card.id === bought)?.state).toBe("AVAILABLE"); expect(assertPoolIntegrity(state)).toBe(true);
  });

  it("completes the specified 8 → 8 → 6 → 6 → 4 → 4 flow", () => {
    let state = createGame(303); const expectedAlive = [8, 6, 6, 4, 4];
    for (let round = 1; round <= 5; round += 1) {
      state = playRound(state);
      expect(state.players.filter((player) => !player.eliminated)).toHaveLength(expectedAlive[round - 1]);
      expect(assertPoolIntegrity(state)).toBe(true);
      if (round === 5) break;
      state = leaveRoundResult(state);
      if (state.phase === "AUGMENT") state = chooseAugment(state, "p1", state.augmentChoices[0]!.id);
      state = startNextRound(state);
    }
    expect(state.phase).toBe("GAME_RESULT");
    const standings = finalStandings(state);
    expect(standings).toHaveLength(8);
    expect(standings.map(({ placement, rankPoints }) => [placement, rankPoints])).toEqual([
      [1, 8], [2, 4], [3, 2], [4, 0], [5, -1], [6, -2], [7, -4], [8, -8],
    ]);
    expect(state.players.filter((player) => player.eliminated).every((player) => player.eliminationSnapshot)).toBe(true);
  });

  it("creates independent R2 match universes and excludes unselected owned cards", () => {
    let state = playRound(createGame(404)); state = startNextRound(leaveRoundResult(state));
    state = fillHuman(state); state = prepareShowdown(state);
    for (const id of state.players[0]!.ownedCardIds.slice(0, 2)) state = toggleSelectedCard(state, "p1", id);
    state = confirmSelection(state); state = resolvePrimary(state);
    expect(state.roundResults).toHaveLength(4);
    for (const match of state.roundResults) {
      expect(match.runoutCount).toBe(2);
      expect(match.results).toEqual(match.boardResults.at(-1));
      expect(new Set(match.boards.slice(0, 2).flat().map((card) => card.id)).size).toBe(10);
      const owned = match.playerIds.flatMap((id) => state.players.find((player) => player.id === id)!.ownedCardIds);
      expect(match.boards.flat().some((card) => owned.includes(card.id))).toBe(false);
    }
    const sudden = state.roundResults.find((match) => match.suddenDeathCount > 0);
    expect(sudden).toBeDefined();
    expect(sudden!.results).toEqual(sudden!.boardResults.at(-1));
    expect(sudden!.winnerIds).toEqual(sudden!.boardWinnerIds.at(-1));
    expect(state.roundResults[0]!.boards[0]).not.toBe(state.roundResults[1]!.boards[0]);
  });

  it("does not mutate ownership ledger while generating boards", () => {
    let state = fillHuman(createGame(505)); state = prepareShowdown(state);
    const before = state.ownershipCardPool.map(({ card, state: poolState, ownerPlayerId, reservedPlayerId }) => [card.id, poolState, ownerPlayerId, reservedPlayerId]);
    state = resolvePrimary(state);
    const after = state.ownershipCardPool.map(({ card, state: poolState, ownerPlayerId, reservedPlayerId }) => [card.id, poolState, ownerPlayerId, reservedPlayerId]);
    expect(after).toEqual(before);
  });

  it("runs R3 as two independent Omaha games with disjoint two-card loadouts", () => {
    let state = createGame(515); state.round = 3; state.phase = "SHOP";
    for (const entry of state.ownershipCardPool) { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; }
    state.players.forEach((player, playerIndex) => {
      player.ownedCardIds = state.ownershipCardPool.slice(playerIndex * 4, playerIndex * 4 + 4).map((entry) => entry.card.id);
      player.shopCardIds = []; player.selectedCardIds = []; player.purchasesThisRound = 0;
      for (const id of player.ownedCardIds) { const entry = state.ownershipCardPool.find((candidate) => candidate.card.id === id)!; entry.state = "OWNED"; entry.ownerPlayerId = player.id; }
    });
    state = prepareShowdown(state);
    expect(state.phase).toBe("DECK_SELECT");
    for (const id of state.players[0]!.ownedCardIds) state = toggleSelectedCard(state, "p1", id);
    state = resolvePrimary(confirmSelection(state));
    expect(state.roundResults).toHaveLength(8);
    for (let index = 0; index < state.roundResults.length; index += 2) {
      const game1 = state.roundResults[index]!; const game2 = state.roundResults[index + 1]!;
      expect([game1.gameNumber, game2.gameNumber]).toEqual([1, 2]);
      expect(game1.playerIds).toEqual(game2.playerIds);
      expect(game1.boards[0]).not.toBe(game2.boards[0]);
      for (const match of [game1, game2]) {
        expect(match.suddenDeathCount).toBe(0);
        const owned = match.playerIds.flatMap((id) => state.players.find((player) => player.id === id)!.ownedCardIds);
        expect(match.boards[0]!.some((card) => owned.includes(card.id))).toBe(false);
        expect(Object.values(match.revealedCardIds).every((ids) => ids.length === 2)).toBe(true);
        for (const reward of match.rewards!) expect(reward.deltaPoints).toBe(match.winnerIds.includes(reward.playerId) ? (match.winnerIds.length > 1 ? 2 : 5) : 0);
      }
      for (const playerId of game1.playerIds) {
        const player = state.players.find((candidate) => candidate.id === playerId)!;
        expect(new Set(player.selectedCardIds.slice(0, 2).filter((id) => player.selectedCardIds.slice(2).includes(id))).size).toBe(0);
      }
    }
  });

  it("applies the centralized point table through every engine round without tiebreak bonuses", () => {
    let state = createGame(909);
    for (let round = 1; round <= 4; round += 1) {
      state = playRound(state);
      const matches = state.matches.filter((match) => match.id.startsWith(`${round}-`));
      for (const match of matches) {
        const rewards = Object.fromEntries(match.rewards!.map((reward) => [reward.playerId, reward.deltaPoints]));
        if (round === 1 || round === 3) {
          const value = match.winnerIds.length > 1 ? (round === 1 ? 1 : 2) : (round === 1 ? 3 : 5);
          match.playerIds.forEach((id) => expect(rewards[id]).toBe(match.winnerIds.includes(id) ? value : 0));
        } else if (round === 2 && match.stage === "primary") {
          match.playerIds.forEach((id) => expect(rewards[id]).toBe(match.winnerIds.includes(id) ? 6 : 0));
        } else if (round === 2) {
          const value = match.group === "winner" ? 3 : 2;
          match.playerIds.forEach((id) => expect(rewards[id]).toBe(match.winnerIds.includes(id) ? value : 0));
        } else if (round === 4 && match.stage === "primary") {
          const scoringWinners = match.regulationWinnerIds ?? match.winnerIds;
          const value = match.regulationWinnerIds ? 5 : 10;
          match.playerIds.forEach((id) => expect(rewards[id]).toBe(scoringWinners.includes(id) ? value : 0));
        } else if (round === 4 && match.group === "winner") {
          match.playerIds.forEach((id) => expect(rewards[id]).toBe(match.winnerIds.includes(id) ? 5 : 0));
        } else {
          match.playerIds.forEach((id) => expect(rewards[id]).toBe(0));
        }
      }
      state = leaveRoundResult(state);
      if (state.phase === "AUGMENT") state = chooseAugment(state, "p1", state.augmentChoices[0]!.id);
      state = startNextRound(state);
    }
  });

  it("uses separate boards for R4 winner and loser three-way encounters", () => {
    let state = createGame(606);
    for (let round = 1; round <= 3; round += 1) {
      state = playRound(state); state = leaveRoundResult(state);
      if (state.phase === "AUGMENT") state = chooseAugment(state, "p1", state.augmentChoices[0]!.id);
      state = startNextRound(state);
    }
    state = fillHuman(state); state = prepareShowdown(state); state = resolvePrimary(state);
    expect(state.roundResults).toHaveLength(3);
    expect(state.roundResults.every((match) => match.playerIds.length === 2 && match.boards.length >= 1)).toBe(true);
    state = resolveSecondary(beginSecondary(state));
    const [winnerEncounter, loserEncounter] = state.roundResults;
    expect(winnerEncounter?.playerIds).toHaveLength(3); expect(loserEncounter?.playerIds).toHaveLength(3);
    expect(winnerEncounter?.boards[0]).not.toBe(loserEncounter?.boards[0]);
    for (const match of state.roundResults) {
      const owned = match.playerIds.flatMap((id) => state.players.find((player) => player.id === id)!.ownedCardIds);
      expect(match.boards.flat().some((card) => owned.includes(card.id))).toBe(false);
    }
  });
});

// Regression coverage for persisted games created before the open-draft rules.
function createGame(...args: Parameters<typeof createGameCurrent>) { return createGameCurrent(args[0], args[1], 1); }
