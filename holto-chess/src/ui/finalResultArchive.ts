import type { PlayerView } from "../shared/protocol";

const STORAGE_KEY = "porena-final-results-v1";
const MAX_RESULTS = 20;

export type SavedFinalResult = {
  id: string;
  roomId: string;
  savedAt: string;
  viewerId: string;
  standings: Array<{
    playerId: string; name: string; placement: number; points: number;
    handScore: number; handName: string; stackScore: number; stackBB: number;
    total: number; rankPoints: number; eliminatedRound?: number;
  }>;
};

export function makeSavedFinalResult(view: PlayerView, savedAt = new Date().toISOString()): SavedFinalResult {
  return {
    id: `${view.gameId}:${view.me.playerId}`,
    roomId: view.roomId,
    savedAt,
    viewerId: view.me.playerId,
    standings: view.standings.map((row) => ({
      playerId: row.playerId,
      name: view.players.find((player) => player.playerId === row.playerId)?.name ?? row.playerId,
      placement: row.placement,
      points: row.points,
      handScore: row.handScore,
      handName: row.displayName,
      stackScore: row.stackScore,
      stackBB: row.stackBB,
      total: row.total,
      rankPoints: row.rankPoints,
      ...(row.eliminatedRound ? { eliminatedRound: row.eliminatedRound } : {}),
    })),
  };
}

export function loadSavedFinalResults(): SavedFinalResult[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is SavedFinalResult => !!entry && typeof entry === "object" && typeof (entry as SavedFinalResult).id === "string" && Array.isArray((entry as SavedFinalResult).standings)).slice(0, MAX_RESULTS);
  } catch { return []; }
}

export function saveFinalResult(record: SavedFinalResult): SavedFinalResult[] {
  const next = [record, ...loadSavedFinalResults().filter((entry) => entry.id !== record.id)].slice(0, MAX_RESULTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
