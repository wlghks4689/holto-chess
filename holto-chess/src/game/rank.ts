/**
 * RANK-SYSTEM-002: season RP. Pure rules only; the server settles them (worker/rankSettlement.ts).
 * RP is a beta participation incentive, not a skill rating.
 */

/** Final placement 1..8 -> base RP. finalStandings() uses the same table. */
export const PLACEMENT_RP = [8, 4, 2, 0, -1, -2, -4, -8] as const;
export const RANK_START_RP = 100;
export const SEASON_LENGTH_MS = 28 * 24 * 60 * 60 * 1000;
/** Season 1 starts Monday 2026-10-12 00:00 KST; a game started earlier still counts toward season 1. */
export const SEASON_EPOCH_MS = Date.parse("2026-10-12T00:00:00+09:00");

export type Season = { id: number; startsAt: number; endsAt: number };
export function seasonAt(now: number): Season {
  const id = Math.max(1, Math.floor((now - SEASON_EPOCH_MS) / SEASON_LENGTH_MS) + 1);
  const startsAt = SEASON_EPOCH_MS + (id - 1) * SEASON_LENGTH_MS;
  return { id, startsAt, endsAt: startsAt + SEASON_LENGTH_MS };
}

/** Next season's start RP; applied once per season boundary, including seasons the player skipped. */
export function carryOver(points: number): number {
  return Math.max(0, Math.round((points - RANK_START_RP) * 0.4 + RANK_START_RP));
}
export function startingPoints(previous: { seasonId: number; points: number } | null, seasonId: number): number {
  if (!previous) return RANK_START_RP;
  let points = previous.points;
  for (let season = previous.seasonId; season < seasonId; season += 1) points = carryOver(points);
  return points;
}

export function scoreBonus(finalScore: number): number {
  const score = Math.floor(finalScore);
  return score >= 131 ? 3 : score >= 121 ? 2 : score >= 111 ? 1 : 0;
}
/** Humans seated when the game started (guests included, AI excluded); only a top-3 finish earns it. */
export function humanBonus(humanCount: number): number {
  return humanCount >= 8 ? 4 : humanCount >= 6 ? 3 : humanCount >= 4 ? 2 : humanCount >= 2 ? 1 : 0;
}

export type RankOutcome = { placement: number; finalScore: number; humanCount: number; forfeited: boolean };
export type RankDelta = { base: number; scoreBonus: number; humanBonus: number; delta: number };
/** A forfeit counts as 8th with no bonus: -8 before the 0 floor. */
export function rankDelta(outcome: RankOutcome): RankDelta {
  if (outcome.forfeited) return { base: PLACEMENT_RP[7], scoreBonus: 0, humanBonus: 0, delta: PLACEMENT_RP[7] };
  const base = PLACEMENT_RP[outcome.placement - 1] ?? PLACEMENT_RP[7];
  const bonus = scoreBonus(outcome.finalScore);
  const humans = outcome.placement <= 3 ? humanBonus(outcome.humanCount) : 0;
  return { base, scoreBonus: bonus, humanBonus: humans, delta: base + bonus + humans };
}
export const applyDelta = (before: number, delta: number) => Math.max(0, before + delta);

export const TIERS = [
  { id: "HIGH_CARD", min: 0 }, { id: "ONE_PAIR", min: 200 }, { id: "TWO_PAIR", min: 300 }, { id: "TRIPS", min: 400 },
  { id: "STRAIGHT", min: 500 }, { id: "FLUSH", min: 650 }, { id: "FULL_HOUSE", min: 800 }, { id: "QUADS", min: 1000 },
  { id: "STRAIGHT_FLUSH", min: 1200 }, { id: "ROYAL_FLUSH", min: 1500 },
] as const;
export type TierId = typeof TIERS[number]["id"];
export function tierFor(points: number): TierId {
  return [...TIERS].reverse().find((tier) => points >= tier.min)!.id;
}
