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
  // later rounds, follow one live participant's schedule instead of all tables.
  if (eliminated && !room.game.roundResults.some((match) => match.playerIds.includes(playerId))) {
    const target = room.game.players.find((player) => !player.eliminated)?.id;
    return target ? room.game.roundResults.filter((match) => match.playerIds.includes(target)) : [];
  }
  return room.game.roundResults.filter((match) => match.playerIds.includes(playerId) || room.game.round === 3 && match.tiebreakKind === "SURVIVAL_TIEBREAK");
}

/**
 * Stamps one shared start time when a new showdown set becomes visible. The room waits for the
 * actual participant path with the longest playback, including genuine deciders.
 * Spectators follow those paths and never add an extra wait to the room.
 */
export function syncPresentation(room: RoomSnapshot, now: number): void {
  if (!matchesVisible(room)) { delete room.presentation; return; }
  const key = `${room.game.round}:${room.game.roundResults.map((match) => match.id).join(",")}`;
  if (room.presentation?.key === key && room.presentation.version === PRESENTATION_VERSION) return;
  const durations = new Map<string, number>();
  const durationOf = (match: MatchResult) => {
    if (!durations.has(match.id)) durations.set(match.id, presentationDurationMs(createMatchView(room.game, match)));
    return durations.get(match.id)!;
  };
  const startsAt = now + PRESENTATION_LEAD_MS;
  const perPlayer: Record<string, PresentationEntry[]> = {};
  // Derive slots from the participants' actual match order, never spectator playback.
  const sequences = Object.fromEntries(room.game.players.map(({ id }) => [id, room.game.roundResults.filter((match) => match.playerIds.includes(id))]));
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
  const byMatch = new Map<string, PresentationEntry>();
  for (const matches of Object.values(sequences)) {
    matches.forEach((match, index) => {
      const prepMs = room.game.round === 5 || index === 0 ? 0 : MATCH_PREP_MS;
      const entry = { matchId: match.id, offsetMs: slotStarts[index]!, durationMs: entryDuration(match, index, index === matches.length - 1), ...(prepMs ? { prepMs } : {}) };
      const existing = byMatch.get(match.id);
      if (!existing || entry.offsetMs > existing.offsetMs) byMatch.set(match.id, entry);
    });
  }
  for (const { id } of room.game.players) perPlayer[id] = visibleMatchesFor(room, id).map((match) => ({ ...byMatch.get(match.id)! }));
  const longest = Math.max(0, ...[...byMatch.values()].map((entry) => entry.offsetMs + entry.durationMs));
  room.presentation = { key, version: PRESENTATION_VERSION, startsAt, endsAt: startsAt + longest, perPlayer };
}

export function presentationViewFor(room: RoomSnapshot, playerId: string): PresentationView | undefined {
  const schedule = room.presentation;
  if (!schedule || !matchesVisible(room)) return undefined;
  return { version: schedule.version, startsAt: schedule.startsAt, endsAt: schedule.endsAt,
    matches: (schedule.perPlayer[playerId] ?? []).map((entry) => ({ ...entry })) };
}
