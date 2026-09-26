import type { GameLog, PorenaGameState } from "../game/types";
import type { TranslationKey, TranslationParams } from "../i18n";

export type PlayerFeedEntry = { id: string; tone: GameLog["tone"]; message: string;
  event?: string; params?: TranslationParams };

const EVENT_KEYS: Record<string, TranslationKey> = {
  CARD_PURCHASED: "log.CARD_PURCHASED", CARD_SOLD: "log.CARD_SOLD", SHOP_REROLLED: "log.SHOP_REROLLED",
  CARD_UNLOCKED: "log.CARD_UNLOCKED", CARD_LOCKED: "log.CARD_LOCKED", FINAL_SCORE_COMPLETE: "log.FINAL_SCORE_COMPLETE",
  PLAYER_ELIMINATED: "log.PLAYER_ELIMINATED", DRAFT_SKIPPED_INSUFFICIENT_BB: "log.DRAFT_SKIPPED_INSUFFICIENT_BB",
  ROUND_SUMMARY: "log.ROUND_SUMMARY",
};

/** Old snapshots and unknown future events retain their persisted message. */
export function renderPlayerFeedEntry(entry: PlayerFeedEntry, translate: (key: TranslationKey, params?: TranslationParams) => string): string {
  const key = entry.event && EVENT_KEYS[entry.event];
  return key ? translate(key, entry.params) : entry.message;
}

const RESULT_PHASES = new Set(["ROUND_RESULT", "NEXT_ROUND", "GAME_RESULT"]);

/** Builds a compact, viewer-specific drawer instead of exposing the engine's full diagnostic log. */
export function playerEventFeed(state: PorenaGameState, playerId: string): PlayerFeedEntry[] {
  const summaries: PlayerFeedEntry[] = [];
  for (const round of [1, 2, 3, 4] as const) {
    if (round > state.round || (round === state.round && !RESULT_PHASES.has(state.phase))) continue;
    const matches = state.matches.filter((match) => match.id.startsWith(`${round}-`) && match.playerIds.includes(playerId)
      && !(round === 3 && match.tiebreakKind === "SURVIVAL_TIEBREAK"));
    if (!matches.length) continue;
    const outcomes = matches.flatMap((match) => match.runCards ? match.boardWinnerIds.slice(0, match.runoutCount) : [match.winnerIds]);
    const wins = outcomes.filter((ids) => ids.length === 1 && ids.includes(playerId)).length;
    const draws = outcomes.filter((ids) => ids.length > 1 && ids.includes(playerId)).length;
    const losses = outcomes.length - wins - draws;
    const points = matches.reduce((sum, match) => sum + (match.rewards?.find((reward) => reward.playerId === playerId)?.deltaPoints ?? match.pointAwards?.[playerId] ?? 0), 0);
    summaries.unshift({ id: `round-${round}`, tone: "win", message: `R${round} · ${wins}승 ${draws}무 ${losses}패 · +${points}P 마감`,
      event: "ROUND_SUMMARY", params: { round, wins, draws, losses, points } });
  }
  const playerName = state.players.find((player) => player.id === playerId)?.name ?? playerId;
  const personal = state.logs.filter((entry) => entry.event ? entry.playerId === playerId || entry.event === "FINAL_SCORE_COMPLETE"
    : entry.message.startsWith(`${playerName} ·`) || entry.message.startsWith(`${playerName} 탈락`) || entry.message.includes("최종 점수 집계 완료"))
    .map((entry) => ({ ...entry, id: `log-${entry.id}` }));
  return [...personal, ...summaries].slice(0, 12);
}
