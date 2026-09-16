import type { MatchView, RevealedHand } from "../shared/protocol";
import type { HoltoChessGameState, MatchResult, PlayerShowdown } from "./types";

export function revealedHand(result: PlayerShowdown): RevealedHand {
  return { playerId: result.playerId, place: result.place, category: result.hand.category,
    kickers: [...result.hand.kickers], displayName: result.hand.displayName, usedCardIds: [...result.usedCardIds] };
}

/** Public match allowlist, called only after the caller has checked visibility. */
export function createMatchView(game: HoltoChessGameState, match: MatchResult): MatchView {
  return {
    id: match.id, round: game.round, matchNumber: game.roundResults.findIndex((m) => m.id === match.id) + 1,
    stage: match.stage, group: match.group, participantIds: [...match.playerIds], winnerIds: [...match.winnerIds],
    boards: match.boards.map((board) => board.map((card) => ({ ...card }))),
    boardWinnerIds: match.boardWinnerIds.map((ids) => [...ids]),
    results: match.results.map(revealedHand), boardResults: match.boardResults.map((results) => results.map(revealedHand)),
    runoutCount: match.runoutCount, suddenDeathCount: match.suddenDeathCount,
    revealedCards: Object.fromEntries(match.playerIds.map((id) => [id, (match.revealedCardIds[id] ?? [])
      .map((cardId) => ({ ...game.ownershipCardPool.find((entry) => entry.card.id === cardId)!.card }))])),
    rewards: (match.rewards ?? []).map((r) => ({ playerId: r.playerId,
      beforeBB: r.beforeBB, afterBB: r.afterBB, deltaBB: r.deltaBB,
      beforePoints: r.beforePoints, afterPoints: r.afterPoints, deltaPoints: r.deltaPoints, outcome: r.outcome })),
  };
}
