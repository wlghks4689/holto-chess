import { INTER_MATCH_HOLD_MS, MATCH_HOLD_MS, MATCH_PREP_MS, PRESENTATION_LEAD_MS, PRESENTATION_VERSION, presentationDurationMs } from "../shared/presentationTimeline";
import type { PresentationEntry, PresentationView } from "../shared/protocol";
import { createMatchView } from "./matchView";
import type { RoomSnapshot } from "./room";
import type { MatchResult } from "./types";

/** Phases in which a seat can see its showdown matches (and so watches their cinematic). */
export const MATCH_VISIBLE_PHASES: readonly string[] = ["GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT", "GAME_RESULT"];

/** Server-only schedule. Each seat is sent only its own entries (see presentationViewFor). */
export type PresentationSchedule = {
  /** Identifies the showdown set; the same set keeps its schedule across phase changes. */
  key: string;
  version: number; startsAt: number; endsAt: number;
  perPlayer: Record<string, PresentationEntry[]>;
};

export function matchesVisible(room: RoomSnapshot): boolean {
  return room.status === "PLAYING" && MATCH_VISIBLE_PHASES.includes(room.game.phase);
}

/** The matches a seat watches, in the order its client plays them. */
export function visibleMatchesFor(room: RoomSnapshot, playerId: string): MatchResult[] {
  const eliminated = room.game.players.find((player) => player.id === playerId)?.eliminated;
  // Keep a newly eliminated viewer on their own deciding match first. In
  // later rounds, automatically show the remaining tables instead of silence.
  if (eliminated && !room.game.roundResults.some((match) => match.playerIds.includes(playerId))) return room.game.roundResults;
  return room.game.roundResults.filter((match) => match.playerIds.includes(playerId) || room.game.round === 3 && match.tiebreakKind === "SURVIVAL_TIEBREAK");
}

/**
 * Stamps one shared start time when a new showdown set becomes visible. The room waits for the
 * seat with the longest playback, so everyone leaves the cinematic at the same moment.
 */
export function syncPresentation(room: RoomSnapshot, now: number): void {
  if (!matchesVisible(room)) { delete room.presentation; return; }
  const key = `${room.game.round}:${room.game.roundResults.map((match) => match.id).join(",")}`;
  if (room.presentation?.key === key) return;
  const durations = new Map<string, number>();
  const durationOf = (match: MatchResult) => {
    if (!durations.has(match.id)) durations.set(match.id, presentationDurationMs(createMatchView(room.game, match)));
    return durations.get(match.id)!;
  };
  const startsAt = now + PRESENTATION_LEAD_MS;
  const perPlayer: Record<string, PresentationEntry[]> = {};
  let longest = 0;
  const watching = room.sessions.filter((session) => !session.departed);
  const hasSpectators = watching.some((session) => room.game.players.find((player) => player.id === session.playerId)?.eliminated);
  const sequences = Object.fromEntries(room.game.players.map(({ id }) => [id, visibleMatchesFor(room, id)]));
  const entryDuration = (match: MatchResult, index: number, last: boolean) =>
    durationOf(match) + (room.game.round === 5 || index === 0 ? 0 : MATCH_PREP_MS) - (last ? 0 : MATCH_HOLD_MS);
  // All seats share the same match-slot starts, even when one table has a longer decider.
  // A shorter table keeps its completed result visible until the last three seconds of the slot.
  const slotStarts = [0];
  const slotCount = Math.max(0, ...Object.values(sequences).map((matches) => matches.length));
  for (let index = 0; index < slotCount - 1; index += 1) {
    const longestMatch = Math.max(0, ...Object.values(sequences).map((matches) =>
      matches[index] ? entryDuration(matches[index], index, index === matches.length - 1) : 0));
    slotStarts.push(slotStarts[index]! + longestMatch + INTER_MATCH_HOLD_MS);
  }
  for (const { id: playerId, eliminated } of room.game.players) {
    perPlayer[playerId] = sequences[playerId]!.map((match, index, matches) => {
      const prepMs = room.game.round === 5 || index === 0 ? 0 : MATCH_PREP_MS;
      return { matchId: match.id, offsetMs: slotStarts[index]!, durationMs: entryDuration(match, index, index === matches.length - 1), ...(prepMs ? { prepMs } : {}) };
    });
    const last = perPlayer[playerId]!.at(-1);
    if (last && (watching.some((session) => session.playerId === playerId) || (hasSpectators && !eliminated)))
      longest = Math.max(longest, last.offsetMs + last.durationMs);
  }
  room.presentation = { key, version: PRESENTATION_VERSION, startsAt, endsAt: startsAt + longest, perPlayer };
}

export function presentationViewFor(room: RoomSnapshot, playerId: string): PresentationView | undefined {
  const schedule = room.presentation;
  if (!schedule || !matchesVisible(room)) return undefined;
  return { version: schedule.version, startsAt: schedule.startsAt, endsAt: schedule.endsAt,
    matches: (schedule.perPlayer[playerId] ?? []).map((entry) => ({ ...entry })) };
}
