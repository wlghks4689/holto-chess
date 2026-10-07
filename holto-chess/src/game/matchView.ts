import type { MatchView, RevealedHand } from "../shared/protocol";
import type { PorenaGameState, MatchResult, PlayerShowdown } from "./types";
import { isRoundAbilityEvent } from "./abilities";
import { abilityCue } from "./abilityVisibility";
import { isFinalRound, isLineupFinal } from "./config";
import { burnCardIds } from "./engine";

export function revealedHand(result: PlayerShowdown): RevealedHand {
  return { playerId: result.playerId, place: result.place, category: result.hand.category,
    kickers: [...result.hand.kickers], displayName: result.hand.displayName, usedCardIds: [...result.usedCardIds] };
}

/** Public match allowlist, called only after the caller has checked visibility. */
export function createMatchView(game: PorenaGameState, match: MatchResult): MatchView {
  return {
    ...(game.round === 5 && game.finalAuction?.loadoutsRevealed ? { blockCards: Object.fromEntries(match.playerIds.map(id => {
      const p = game.players.find(p => p.id === id)!;
      return [id, p.ownedCardIds.filter(cardId => !p.finalLoadoutCardIds?.includes(cardId)).map(cardId => ({ ...game.ownershipCardPool.find(e => e.card.id === cardId)!.card }))];
    })) } : {}),
    // R6 burn cards are public from the showdown prep onwards.
    ...(match.stage === "final" && isLineupFinal(game.round, game) ? { blockCards: Object.fromEntries(match.playerIds.map(id =>
      [id, burnCardIds(game, id).map(cardId => ({ ...game.ownershipCardPool.find(e => e.card.id === cardId)!.card }))])) } : {}),
    abilityCues: (game.abilityEvents ?? []).filter(event => event.matchId === match.id && !isRoundAbilityEvent(event)).flatMap(event => {
      const cue = abilityCue(event); return cue ? [cue] : [];
    }),
    runCards: match.runCards ? Object.fromEntries(Object.entries(match.runCards).map(([id, runs]) => [id, runs.map((ids) => ids.map((cardId) => ({ ...game.ownershipCardPool.find((e) => e.card.id === cardId)!.card })))])) : undefined,
    runRewards: match.runRewards ? structuredClone(match.runRewards) : undefined,
    standingsBefore: match.standingsBefore ? { ...match.standingsBefore } : undefined,
    standingsAfterRuns: match.standingsAfterRuns?.map((s) => ({ ...s })),
    matchday: match.matchday, swissBefore: match.swissBefore ? structuredClone(match.swissBefore) : undefined,
    swissAfter: match.swissAfter ? structuredClone(match.swissAfter) : undefined,
    id: match.id, round: game.round, final: isFinalRound(game.round, game), matchNumber: game.roundResults.findIndex((m) => m.id === match.id) + 1,
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

/** A table may disclose its own rewards, never another simultaneous table's ledger. */
export function normalizeMatchStandings(game: PorenaGameState, view: MatchView): void {
  const peers = game.roundResults.filter(match => match.stage === view.stage && match.matchday === view.matchday);
  const baseline = Object.fromEntries(game.players.map(player => {
    const reward = peers.flatMap(match => match.rewards ?? []).find(reward => reward.playerId === player.id);
    return [player.id, reward?.beforePoints ?? peers[0]?.standingsBefore?.[player.id] ?? player.points];
  }));
  if (view.standingsBefore) view.standingsBefore = { ...baseline };
  if (view.standingsAfterRuns) view.standingsAfterRuns = view.standingsAfterRuns.map(snapshot =>
    Object.fromEntries(Object.entries(baseline).map(([id, points]) => [id, view.participantIds.includes(id) ? snapshot[id] ?? points : points])));
}
