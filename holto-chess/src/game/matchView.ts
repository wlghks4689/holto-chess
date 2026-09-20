import type { MatchView, RevealedHand } from "../shared/protocol";
import type { PorenaGameState, MatchResult, PlayerShowdown } from "./types";

export function revealedHand(result: PlayerShowdown): RevealedHand {
  return { playerId: result.playerId, place: result.place, category: result.hand.category,
    kickers: [...result.hand.kickers], displayName: result.hand.displayName, usedCardIds: [...result.usedCardIds] };
}

/** Public match allowlist, called only after the caller has checked visibility. */
export function createMatchView(game: PorenaGameState, match: MatchResult): MatchView {
  return {
    matchday: match.matchday, swissBefore: match.swissBefore ? structuredClone(match.swissBefore) : undefined,
    swissAfter: match.swissAfter ? structuredClone(match.swissAfter) : undefined,
    id: match.id, round: game.round, matchNumber: game.roundResults.findIndex((m) => m.id === match.id) + 1,
    stage: match.stage, group: match.group, gameNumber: match.gameNumber, participantIds: [...match.playerIds], winnerIds: [...match.winnerIds],
    boards: match.boards.map((board) => board.map((card) => ({ ...card }))),
    boardWinnerIds: match.boardWinnerIds.map((ids) => [...ids]),
    results: match.results.map(revealedHand), boardResults: match.boardResults.map((results) => results.map(revealedHand)),
    streetSnapshots: (match.streetSnapshots ?? []).map((snapshots) => snapshots.map((snapshot) => ({ street: snapshot.street, results: snapshot.results.map(revealedHand) }))),
    runoutCount: match.runoutCount, suddenDeathCount: match.suddenDeathCount,
    highCardDraw: match.highCardDraw ? structuredClone(match.highCardDraw) : undefined,
    tiebreakKind: match.tiebreakKind, tiebreakStartIndex: match.tiebreakStartIndex,
    regulationWinnerIds: match.regulationWinnerIds ? [...match.regulationWinnerIds] : undefined,
    pointAwards: match.pointAwards ? { ...match.pointAwards } : undefined,
    pointAwardDetails: match.pointAwardDetails ? { ...match.pointAwardDetails } : undefined,
    revealedCards: Object.fromEntries(match.playerIds.map((id) => [id, (match.revealedCardIds[id] ?? [])
      .map((cardId) => ({ ...game.ownershipCardPool.find((entry) => entry.card.id === cardId)!.card }))])),
    rewards: (match.rewards ?? []).map((r) => ({ playerId: r.playerId,
      beforeBB: r.beforeBB, afterBB: r.afterBB, deltaBB: r.deltaBB,
      beforePoints: r.beforePoints, afterPoints: r.afterPoints, deltaPoints: r.deltaPoints, outcome: r.outcome, detail: r.detail })),
  };
}
