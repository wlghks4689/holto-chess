// Builds a real, engine-valid PorenaGameState in R4 SHOWDOWN_SECONDARY with a
// controllable winner-group (the 3-way match under test) and a throwaway
// 2-player loser-group (so resolveSecondary's other branch doesn't crash).
// This is the SAME fixture technique src/game/loserBracketReview.test.ts uses
// (release every player's cards, hand-assign ownership, set winnerGroup/
// loserGroup directly) — not a reimplementation of engine rules.
import { createGame } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/engine.ts";
import { assertPoolIntegrity, releasePlayerCards } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/cardPool.ts";
import type { PorenaGameState } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/types.ts";

/** Assigns `cardIds` to `playerId` in the ownership pool AND the player's ownedCardIds. */
function assignCards(state: PorenaGameState, playerId: string, cardIds: readonly string[]): void {
  const player = state.players.find((p) => p.id === playerId)!;
  for (const id of cardIds) {
    const entry = state.ownershipCardPool.find((e) => e.card.id === id)!;
    if (entry.state !== "AVAILABLE") throw new Error(`Card ${id} is not available (double-assigned across hands)`);
    entry.state = "OWNED";
    entry.ownerPlayerId = playerId;
    player.ownedCardIds.push(id);
  }
}

export type ThreeWaySpec = {
  /** Exactly 3 five-card hands (card ids) for the group under test. */
  hands: [string[], string[], string[]];
  /** "winner" tests WINNER_TIEBREAK/r4WinnerGroup rewards; "loser" tests SURVIVAL_TIEBREAK/r4LoserGroup. */
  group: "winner" | "loser";
  seed: number;
  /** Two arbitrary 5-card hands to keep the OTHER bracket (winner or loser) valid but irrelevant. */
  paddingHands?: [string[], string[]];
};

// createGame() deals all 8 players and re-validates the pool — expensive to
// repeat per Monte Carlo trial. Build it once and structuredClone the (much
// smaller, already-reset) template per call instead.
let cachedBase: PorenaGameState | undefined;
function baseState(): PorenaGameState {
  if (!cachedBase) {
    const state = createGame(1, "seeded", 2);
    for (const player of state.players) releasePlayerCards(state, player);
    cachedBase = state;
  }
  return structuredClone(cachedBase);
}

/** Builds a fresh, engine-valid state with the 3-way group under test wired up. Deterministic per `seed`. */
export function buildThreeWayState(spec: ThreeWaySpec): PorenaGameState {
  const state = baseState();
  const testIds = ["p1", "p2", "p3"] as const;
  const paddingIds = ["p4", "p5"] as const;
  for (const [i, id] of testIds.entries()) assignCards(state, id, spec.hands[i]!);
  if (spec.paddingHands) for (const [i, id] of paddingIds.entries()) assignCards(state, id, spec.paddingHands[i]!);
  else {
    // Deterministic, disjoint filler so the untested bracket is still legal (5 cards each, no collisions).
    const used = new Set(state.ownershipCardPool.filter((e) => e.state === "OWNED").map((e) => e.card.id));
    const free = state.ownershipCardPool.filter((e) => !used.has(e.card.id)).map((e) => e.card.id);
    assignCards(state, paddingIds[0], free.slice(0, 5));
    assignCards(state, paddingIds[1], free.slice(5, 10));
  }
  state.round = 4;
  state.phase = "SHOWDOWN_SECONDARY";
  state.winnerGroup = spec.group === "winner" ? [...testIds] : [...paddingIds];
  state.loserGroup = spec.group === "loser" ? [...testIds] : [...paddingIds];
  state.matches = [];
  state.roundResults = [];
  state.encounterSequence = 0;
  state.seed = (spec.seed >>> 0) || 1;
  assertPoolIntegrity(state);
  return state;
}
