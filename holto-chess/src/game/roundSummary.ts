import type { PorenaGameState } from "./types";
import type { RoundSummaryRow } from "../shared/protocol";

export function roundMatches(state: PorenaGameState) {
  return state.matches.filter((match) => match.id.startsWith(`${state.round}-`));
}

/** Only cards already revealed in resolved matches may enter the public summary. */
export function createRoundSummary(state: PorenaGameState): RoundSummaryRow[] {
  const matches = roundMatches(state);
  const seatOrder = new Map(state.players.map((player, index) => [player.id, index]));
  const firstStandings = matches.find((match) => match.standingsBefore)?.standingsBefore;
  const rows: RoundSummaryRow[] = state.players.flatMap((player): RoundSummaryRow[] => {
    const played = matches.filter((match) => match.playerIds.includes(player.id));
    if (!played.length) return [];
    const cardIds = [...new Set(played.flatMap((match) => match.runCards?.[player.id]?.flat() ?? match.revealedCardIds[player.id] ?? []))];
    const outcomes = played.filter((m) => m.tiebreakKind !== "SURVIVAL_TIEBREAK" || state.round !== 3).flatMap((m) => m.runCards ? m.boardWinnerIds : [m.winnerIds]);
    const wins = outcomes.filter((ids) => ids.length === 1 && ids.includes(player.id)).length;
    const draws = outcomes.filter((ids) => ids.length > 1 && ids.includes(player.id)).length;
    const points = played.reduce((sum, match) => sum + (match.rewards?.find((reward) => reward.playerId === player.id)?.deltaPoints ?? match.pointAwards?.[player.id] ?? 0), 0);
    return [{ playerId: player.id, name: player.name, cards: cardIds.map((id) => ({ ...state.ownershipCardPool.find((entry) => entry.card.id === id)!.card })),
      wins, draws, losses: outcomes.length - wins - draws, eliminated: player.eliminated,
      bracket: state.winnerGroup.includes(player.id) ? "winner" as const : state.loserGroup.includes(player.id) ? "loser" as const : undefined,
      points, totalPoints: player.points, stackBB: player.stackBB, rank: 0 }];
  });
  const current = [...rows].sort((a, b) => b.totalPoints - a.totalPoints || b.stackBB - a.stackBB || seatOrder.get(a.playerId)! - seatOrder.get(b.playerId)!);
  current.forEach((row, index) => { row.rank = index + 1; });
  if (state.round > 1) {
    const previous = [...rows].sort((a, b) => (firstStandings?.[b.playerId] ?? b.totalPoints - b.points) - (firstStandings?.[a.playerId] ?? a.totalPoints - a.points)
      || seatOrder.get(a.playerId)! - seatOrder.get(b.playerId)!);
    previous.forEach((row, index) => { row.previousRank = index + 1; });
  }
  return current;
}
