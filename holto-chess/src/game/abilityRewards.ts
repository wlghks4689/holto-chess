import { madeAbilityReward, type AbilityEvent } from "./abilities";
import type { MatchResult, PlayerState, PorenaGameState } from "./types";

function record(state: PorenaGameState, player: PlayerState, reason: string, bb = 0, points = 0, savedBB = 0, match?: MatchResult): void {
  if (!player.abilityId || (!bb && !points && !savedBB)) return;
  const event: AbilityEvent = { round: state.round, playerId: player.id, abilityId: player.abilityId, reason, bb, points, savedBB,
    ...(match ? { matchId: match.id, ...(match.gameNumber ? { run: match.gameNumber } : {}) } : {}) };
  (state.abilityEvents ??= []).push(event);
  const totals = player.abilityTotals ??= { activations: 0, bb: 0, points: 0, savedBB: 0 };
  totals.activations++; totals.bb += bb; totals.points += points; totals.savedBB += savedBB;
  player.stackBB += bb; player.points += points;
  if (match && (bb || points)) (match.pointAwardDetails ??= {})[player.id] = [match.pointAwardDetails[player.id], `${bb ? `+${bb}BB` : `+${points}P`}`].filter(Boolean).join(" · ");
  if (bb || points) {
    state.logs.unshift({ id: ++state.logSequence, tone: "economy", playerId: player.id, event: "ABILITY_REWARD",
      params: { abilityId: player.abilityId, player: player.name, bb, points }, message: `${player.name} · ${player.abilityId} ${bb ? `+${bb}BB` : `+${points}P`}` });
    state.logs = state.logs.slice(0, 24);
  }
}

/** Resolves effects from the regulation board only. Extra tiebreak boards never enter this function. */
export function rewardAbilities(state: PorenaGameState, match: MatchResult): void {
  const results = match.boardResults[0] ?? [];
  const winners = match.regulationWinnerIds ?? match.boardWinnerIds[0] ?? [];
  for (const result of results) {
    const player = state.players.find(item => item.id === result.playerId)!;
    if (!player.abilityId) continue;
    const won = winners.length === 1 && winners[0] === player.id && result.hand.categoryRank > 0;
    if (player.abilityId === "predator") {
      player.abilityWinStreak = won ? (player.abilityWinStreak ?? 0) + 1 : 0;
      if (won && player.abilityWinStreak >= 2) record(state, player, "win-streak", 10, 0, 0, match);
    }
    if (result.hand.categoryRank > 0) {
      const reward = madeAbilityReward(player, result.hand, state.round);
      if (reward.bb || reward.points) record(state, player, "made-hand", reward.bb, reward.points, 0, match);
    }
    const equity = match.equities?.[player.id];
    if (player.abilityId === "zero-risk" && state.round < 5 && winners.length === 1 && !won && equity?.insuranceEligible)
      record(state, player, "favored-loss", 20, 0, 0, match);
  }
}

/** Pays at most once after round survival/elimination is known. */
export function rewardAbilityInterest(state: PorenaGameState): void {
  if (state.survival || state.abilityInterestRounds?.includes(state.round)) return;
  (state.abilityInterestRounds ??= []).push(state.round);
  for (const player of state.players.filter(item => !item.eliminated && item.abilityId === "capitalism"))
    record(state, player, "round-interest", Math.floor(player.stackBB * 0.2));
}
