import { CAPITALISM_INTEREST_PERCENT, madeAbilityReward, predatorStreakReward, protectorLossReward, quadCorePlacementBonus, targetSniperWinReward, type AbilityEvent } from "./abilities";
import type { MatchResult, PlayerState, PorenaGameState } from "./types";
import { FRONT_RUNNER_POINTS } from "./config";
import { compareRoundStanding } from "./roundRanking";

/** Records an already applied advantage. This must never pay BB/points again. */
export function recordAbilityBenefit(state: PorenaGameState, player: PlayerState, input: Omit<AbilityEvent, "sequence" | "round" | "playerId" | "abilityId">): void {
  if (!player.abilityId) return;
  const sequence = (state.abilityEventSequence ?? Math.max(0, ...(state.abilityEvents ?? []).map(event => event.sequence ?? 0))) + 1;
  state.abilityEventSequence = sequence;
  (state.abilityEvents ??= []).push({ ...input, sequence, round: state.round, playerId: player.id, abilityId: player.abilityId });
  const totals = player.abilityTotals ??= { activations: 0, bb: 0, points: 0, savedBB: 0 };
  totals.activations++; totals.bb += input.bb; totals.points += input.points; totals.savedBB += input.savedBB;
}

export function recordAbilitySaving(state: PorenaGameState, player: PlayerState, reason: string, savedBB: number, subjectId?: string): void {
  if (savedBB <= 0) return;
  if (reason === "shop-lock" && state.abilityEvents?.some(event => event.round === state.round && event.playerId === player.id && event.reason === reason && event.subjectId === subjectId)) return;
  recordAbilityBenefit(state, player, { reason, savedBB, bb: 0, points: 0, subjectId });
}

function record(state: PorenaGameState, player: PlayerState, reason: string, bb = 0, points = 0, savedBB = 0, match?: MatchResult): void {
  if (!player.abilityId || (!bb && !points && !savedBB)) return;
  const event: AbilityEvent = { round: state.round, playerId: player.id, abilityId: player.abilityId, reason, bb, points, savedBB,
    ...(match ? { matchId: match.id, ...(match.gameNumber ? { run: match.gameNumber } : {}) } : {}) };
  recordAbilityBenefit(state, player, event);
  player.stackBB += bb; player.points += points;
  if (match && (bb || points)) (match.pointAwardDetails ??= {})[player.id] = [match.pointAwardDetails[player.id], `${bb ? `+${bb}BB` : `+${points}P`}`].filter(Boolean).join(" · ");
  if (bb || points) {
    state.logs.unshift({ id: ++state.logSequence, tone: "economy", playerId: player.id, event: "ABILITY_REWARD",
      params: { abilityId: player.abilityId, player: player.name, bb, points }, message: `${player.name} · ${player.abilityId} ${bb ? `+${bb}BB` : `+${points}P`}` });
    state.logs = state.logs.slice(0, 24);
  }
}

/** Apply after placement/ICM allocation, before other ability payouts. */
export function rewardQuadCorePlacement(state: PorenaGameState, match: MatchResult): void {
  if (state.round !== 5 || match.stage !== "final") return;
  for (const result of match.results) {
    const player = state.players.find(item => item.id === result.playerId)!;
    if (state.abilityEvents?.some(event => event.reason === "r5-quad-core" && event.matchId === match.id && event.playerId === player.id)) continue;
    const base = match.pointAwards?.[player.id] ?? 0;
    const bonus = quadCorePlacementBonus(player, result.hand, state.round, base);
    if (!bonus) continue;
    const detail = match.pointAwardDetails?.[player.id];
    record(state, player, "r5-quad-core", 0, bonus, 0, match);
    match.pointAwards![player.id] = base + bonus;
    match.pointAwardDetails![player.id] = [detail, `QUAD CORE ×2 (+${bonus}P)`].filter(Boolean).join(" · ");
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
      if (won) record(state, player, "win-streak", predatorStreakReward(player.abilityWinStreak), 0, 0, match);
    }
    if (won) record(state, player, "won-with-first-card", targetSniperWinReward(player, result.hand), 0, 0, match);
    if (result.hand.categoryRank > 0) {
      const reward = madeAbilityReward(player, result.hand, state.round);
      if (reward.bb || reward.points) record(state, player, "made-hand", reward.bb, reward.points, 0, match);
    }
    const equity = match.equities?.[player.id];
    if (player.abilityId === "zero-risk" && state.round < 5 && winners.length === 1 && !won && equity?.insuranceEligible)
      record(state, player, "favored-loss", protectorLossReward(equity.rawPercent), 0, 0, match);
  }
}

/** Pays at most once after round survival/elimination is known. */
export function rewardRoundLeader(state: PorenaGameState, finalMatch?: MatchResult): void {
  if (state.survival || state.abilityLeaderRounds?.includes(state.round)) return;
  if (state.round === 5 ? state.phase !== "GAME_RESULT" || finalMatch?.stage !== "final" : state.phase !== "ROUND_RESULT") return;
  const survivors = state.players.filter(player => !player.eliminated);
  const seats = new Map(state.players.map((player, index) => [player.id, index]));
  // Freeze the entire qualifying set before any reward mutates points.
  const leaders = state.round === 5
    ? survivors.filter(player => finalMatch!.results.some(result => result.playerId === player.id && result.place === 1))
    : [...survivors].sort((a, b) => compareRoundStanding({ ...a, playerId: a.id }, { ...b, playerId: b.id }, seats)).slice(0, 1);
  (state.abilityLeaderRounds ??= []).push(state.round);
  for (const player of leaders) if (player.abilityId === "front-runner")
    record(state, player, "round-leader", 0, FRONT_RUNNER_POINTS[state.round], 0, finalMatch);
}

/** Pays at most once after round survival/elimination is known. */
export function rewardAbilityInterest(state: PorenaGameState): void {
  if (state.survival || state.abilityInterestRounds?.includes(state.round)) return;
  (state.abilityInterestRounds ??= []).push(state.round);
  for (const player of state.players.filter(item => !item.eliminated && item.abilityId === "capitalism"))
    record(state, player, "round-interest", Math.floor(player.stackBB * CAPITALISM_INTEREST_PERCENT / 100));
}
