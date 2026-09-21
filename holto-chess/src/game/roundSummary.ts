import type { PorenaGameState } from "./types";
import type { RoundSummaryRow } from "../shared/protocol";

export function roundMatches(state: PorenaGameState) {
  return state.matches.filter((match) => match.id.startsWith(`${state.round}-`));
}

/** Only cards already revealed in resolved matches may enter the public summary. */
export function createRoundSummary(state: PorenaGameState): RoundSummaryRow[] {
  const matches = roundMatches(state);
  return state.players.flatMap((player) => {
    const played = matches.filter((match) => match.playerIds.includes(player.id));
    if (!played.length) return [];
    const cardIds = [...new Set(played.flatMap((match) => match.runCards?.[player.id]?.flat() ?? match.revealedCardIds[player.id] ?? []))];
    const outcomes = played.filter((m) => m.tiebreakKind !== "SURVIVAL_TIEBREAK" || state.round !== 3).flatMap((m) => m.runCards ? m.boardWinnerIds : [m.winnerIds]);
    const wins = outcomes.filter((ids) => ids.length === 1 && ids.includes(player.id)).length;
    const draws = outcomes.filter((ids) => ids.length > 1 && ids.includes(player.id)).length;
    return [{ playerId: player.id, name: player.name, cards: cardIds.map((id) => ({ ...state.ownershipCardPool.find((entry) => entry.card.id === id)!.card })),
      wins, draws, losses: outcomes.length - wins - draws, eliminated: player.eliminated,
      bracket: state.winnerGroup.includes(player.id) ? "winner" as const : state.loserGroup.includes(player.id) ? "loser" as const : undefined,
      points: played.reduce((sum, match) => sum + (match.rewards?.find((reward) => reward.playerId === player.id)?.deltaPoints ?? match.pointAwards?.[player.id] ?? 0), 0) }];
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.draws - a.draws);
}
