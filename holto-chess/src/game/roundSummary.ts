import type { HoltoChessGameState } from "./types";
import type { RoundSummaryRow } from "../shared/protocol";

export function roundMatches(state: HoltoChessGameState) {
  return state.matches.filter((match) => match.id.startsWith(`${state.round}-`));
}

/** Only cards already revealed in resolved matches may enter the public summary. */
export function createRoundSummary(state: HoltoChessGameState): RoundSummaryRow[] {
  const matches = roundMatches(state);
  return state.players.flatMap((player) => {
    const played = matches.filter((match) => match.playerIds.includes(player.id));
    if (!played.length) return [];
    const cardIds = [...new Set(played.flatMap((match) => match.revealedCardIds[player.id] ?? []))];
    const wins = played.filter((match) => match.winnerIds.length === 1 && match.winnerIds.includes(player.id)).length;
    const draws = played.filter((match) => match.winnerIds.length > 1 && match.winnerIds.includes(player.id)).length;
    return [{ playerId: player.id, name: player.name, cards: cardIds.map((id) => ({ ...state.ownershipCardPool.find((entry) => entry.card.id === id)!.card })),
      wins, draws, losses: played.length - wins - draws,
      points: played.reduce((sum, match) => sum + (match.rewards?.find((reward) => reward.playerId === player.id)?.deltaPoints ?? match.pointAwards?.[player.id] ?? 0), 0) }];
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.draws - a.draws);
}
