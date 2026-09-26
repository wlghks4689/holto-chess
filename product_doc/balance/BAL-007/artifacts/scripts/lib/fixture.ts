// Builds a real, engine-valid PorenaGameState in R2 SHOWDOWN_PRIMARY with a
// controllable heads-up pair (each player owns exactly 3 cards; selectedCardIds
// order [anchor, secondary1, secondary2] drives RUN1=[anchor,secondary1],
// RUN2=[anchor,secondary2] per engine.ts's handFor/shownCardIds). This is the
// same fixture technique src/game/loserBracketReview.test.ts and BAL-006's
// lib/fixture.ts use (release every player's cards, hand-assign ownership).
import { createGame, resolvePrimary } from "/home/user/holto-chess-BAL-007/holto-chess/src/game/engine.ts";
import { assertPoolIntegrity, releasePlayerCards } from "/home/user/holto-chess-BAL-007/holto-chess/src/game/cardPool.ts";
import type { PorenaGameState, MatchResult } from "/home/user/holto-chess-BAL-007/holto-chess/src/game/types.ts";

function assignCards(state: PorenaGameState, playerId: string, cardIds: readonly string[]): void {
  const player = state.players.find((p) => p.id === playerId)!;
  for (const id of cardIds) {
    const entry = state.ownershipCardPool.find((e) => e.card.id === id)!;
    if (entry.state !== "AVAILABLE") throw new Error(`Card ${id} is not available (double-assigned across hands)`);
    entry.state = "OWNED";
    entry.ownerPlayerId = playerId;
    player.ownedCardIds.push(id);
  }
  player.selectedCardIds = [...cardIds];
}

let cachedBase: PorenaGameState | undefined;
function baseState(): PorenaGameState {
  if (!cachedBase) {
    const state = createGame(1, "seeded", 2);
    for (const player of state.players) releasePlayerCards(state, player);
    cachedBase = state;
  }
  return structuredClone(cachedBase);
}

export type R2Spec = {
  /** [anchor, secondary1, secondary2] — exactly 3 card ids, matches player.selectedCardIds order. */
  leftCards: [string, string, string];
  rightCards: [string, string, string];
  seed: number;
};

/** Builds a fresh R2 SHOWDOWN_PRIMARY state with p1 vs p2 wired up. Deterministic per `seed`. */
export function buildR2State(spec: R2Spec): PorenaGameState {
  const state = baseState();
  assignCards(state, "p1", spec.leftCards);
  assignCards(state, "p2", spec.rightCards);
  state.round = 2;
  state.phase = "SHOWDOWN_PRIMARY";
  state.primaryPairings = [["p1", "p2"]];
  state.matches = [];
  state.roundResults = [];
  state.encounterSequence = 0;
  state.seed = (spec.seed >>> 0) || 1;
  assertPoolIntegrity(state);
  return state;
}

/** Runs resolvePrimary() and returns the p1-vs-p2 combined R2 match result. */
export function resolveR2(spec: R2Spec): MatchResult {
  const state = buildR2State(spec);
  const result = resolvePrimary(state);
  return result.roundResults.find((m) => m.playerIds.includes("p1") && m.playerIds.includes("p2"))!;
}
