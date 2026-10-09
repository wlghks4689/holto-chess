import { finalStandings } from "./engine";
import { seasonAt, type RankDelta, type RankOutcome } from "./rank";
import type { RoomSnapshot } from "./room";

/** Fixed when the game starts; a rematch starts a new one. Internal: seat -> account ids never leave the server. */
export type RankGame = {
  gameId: string; seasonId: number; startedAt: number; humanCount: number; mode: "SOLO" | "MULTI";
  seats: Record<string, string>;
  /** Server-confirmed explicit forfeits. Permanent for this game, even if the seat reconnects. */
  forfeitIds: string[];
  /** Seats whose outcome is final: queued in `rankPending` or already settled. */
  recordedIds: string[];
  results: Record<string, RankResult>;
};
/** Self-contained so a rematch never drops a settlement that is still waiting for D1. */
export type RankObligation = RankOutcome & { gameId: string; seasonId: number; startedAt: number; mode: "SOLO" | "MULTI"; playerId: string; userId: string };
export type RankResult = RankDelta & { seasonId: number; placement: number; finalScore: number; forfeited: boolean; before: number; after: number } | { skipped: true };

/** Every human still seated counts toward the human bonus, guests included; only account seats are ranked. */
export function beginRankGame(room: RoomSnapshot, now: number): void {
  delete room.rank;
  const seated = room.sessions.filter((session) => !session.departed);
  const seats = Object.fromEntries(seated.filter((session) => session.accountUserId).map((session) => [session.playerId, session.accountUserId!]));
  if (!Object.keys(seats).length) return;
  room.rank = {
    gameId: `${room.roomId}-${room.gameGeneration ?? 0}-${now.toString(36)}`, seasonId: seasonAt(now).id, startedAt: now,
    humanCount: seated.length, mode: room.solo ? "SOLO" : "MULTI", seats, forfeitIds: [], recordedIds: [], results: {},
  };
}

/** Leaving now would cost this seat a ranked forfeit: an account seat, still alive, before the final result. */
export function leaveForfeits(room: RoomSnapshot, playerId: string): boolean {
  const rank = room.rank;
  return room.status === "PLAYING" && !!rank && !!rank.seats[playerId] && room.game.phase !== "GAME_RESULT"
    && !room.game.players.find((player) => player.id === playerId)?.eliminated && !rank.forfeitIds.includes(playerId) && !rank.recordedIds.includes(playerId);
}

/** Queues each ranked outcome once: forfeits at once, everyone else at GAME_RESULT. Returns true when it queued any. */
export function collectRankObligations(room: RoomSnapshot): boolean {
  const rank = room.rank;
  if (!rank) return false;
  const queue = (playerId: string, outcome: RankOutcome) => {
    rank.recordedIds.push(playerId);
    (room.rankPending ??= []).push({ ...outcome, gameId: rank.gameId, seasonId: rank.seasonId, startedAt: rank.startedAt, mode: rank.mode, playerId, userId: rank.seats[playerId]! });
  };
  const before = rank.recordedIds.length;
  for (const playerId of rank.forfeitIds) {
    if (!rank.recordedIds.includes(playerId)) queue(playerId, { placement: 8, finalScore: 0, humanCount: rank.humanCount, forfeited: true });
  }
  if (room.game.phase === "GAME_RESULT") {
    for (const row of finalStandings(room.game)) {
      if (rank.seats[row.playerId] && !rank.recordedIds.includes(row.playerId)) {
        queue(row.playerId, { placement: row.placement, finalScore: Math.floor(row.total), humanCount: rank.humanCount, forfeited: false });
      }
    }
  }
  return rank.recordedIds.length > before;
}

export type RankView = { ranked: boolean; forfeited: boolean; pending: boolean; result?: Exclude<RankResult, { skipped: true }> };
/** The viewer's own rank state only. */
export function rankViewFor(room: RoomSnapshot, playerId: string): RankView | undefined {
  const rank = room.rank;
  if (!rank?.seats[playerId]) return undefined;
  const result = rank.results[playerId];
  return { ranked: true, forfeited: rank.forfeitIds.includes(playerId),
    pending: !!room.rankPending?.some((entry) => entry.gameId === rank.gameId && entry.playerId === playerId),
    ...(result && !("skipped" in result) ? { result } : {}) };
}
