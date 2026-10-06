import type { Card } from "../core/poker/cards";
import type { MatchView, PresentationEntry } from "../shared/protocol";
import { cinematicTimeline, displayedStreetIndex, frameAt, revealFlags, INTER_MATCH_HOLD_MS } from "../shared/presentationTimeline";
import { createMatchView } from "./matchView";
import type { RoomSnapshot } from "./room";

/** An opaque slot, not a real card. The UI never renders/evaluates its dummy rank/suit. */
export const concealedCard = (slot: string): Card => ({ id: `hidden:${slot}`, rank: 2, suit: "c", hidden: true });
export const presentationComplete = (room: RoomSnapshot, now: number) => !room.presentation || now >= room.presentation.endsAt;
/**
 * Cinematic beats are released this far ahead of the shared clock. Clients hold on the last released
 * beat, so releasing exactly on time turned every alarm or network delay into a visible stall.
 * Final standings still wait for the real end of the presentation.
 */
export const DISCLOSURE_LEAD_MS = 1_500;

export function discloseMatch(view: MatchView, entry: PresentationEntry, startsAt: number, now: number): MatchView | undefined {
  const start = startsAt + entry.offsetMs;
  if (now < start) return undefined;
  const elapsed = now - start - (entry.prepMs ?? 0);
  const frames = cinematicTimeline(view);
  const frame = frameAt(frames, elapsed);
  const flags = revealFlags(frame.phase);
  const final = view.round === 5;
  const resultVisible = elapsed >= 0 && (flags.result || flags.runResult);
  const finalWinner = ["FINAL_WINNER", "REWARD", "COMPLETE"].includes(frame.phase);
  const boardKnown = (index: number) => elapsed >= 0 && (index < frame.boardIndex || index === frame.boardIndex && frame.revealed === 5);
  const boardResultVisible = (index: number) => boardKnown(index) && (index < frame.boardIndex || resultVisible);
  const safe = structuredClone(view);
  safe.abilityCues = (view.abilityCues ?? []).filter(cue => elapsed >= 0 && (final ? finalWinner :
    cue.run ? boardResultVisible(cue.run - 1) : boardResultVisible(0)));
  safe.disclosure = { frames: frames.filter((item, index) => index === 0 || item.at <= elapsed), elapsedMs: elapsed,
    frameDurationMs: (frames[frames.indexOf(frame) + 1]?.at ?? frame.at) - frame.at };
  const regulationBoards = view.round === 5 && !view.boards.length ? 0 : view.round === 2 ? 2 : 1;
  // RUN_RESULT publicly announces the next closed board; never announce the total future count.
  const queued = frame.phase === "RUN_RESULT" && frame.boardIndex + 1 < view.boards.length ? 1 : 0;
  const visibleBoards = Math.max(regulationBoards, elapsed >= 0 ? frame.boardIndex + 1 + queued : 0);
  safe.boards = view.boards.slice(0, visibleBoards).map((board, bi) => board.map((card, ci) => elapsed >= 0 && (bi < frame.boardIndex || bi === frame.boardIndex && ci < frame.revealed) ? card : concealedCard(`board:${bi}:${ci}`)));
  safe.runoutCount = safe.boards.length;
  safe.suddenDeathCount = Math.max(0, safe.boards.length - regulationBoards);
  const deciderVisible = elapsed >= 0 && (view.tiebreakStartIndex !== undefined && frame.boardIndex >= view.tiebreakStartIndex
    || ["HIGH_CARD_NOTICE", "HIGH_CARD_DRAW"].includes(frame.phase));
  if (!deciderVisible) { delete safe.tiebreakKind; delete safe.tiebreakStartIndex; }
  safe.revealedCards = Object.fromEntries(Object.entries(view.revealedCards).map(([id, cards]) => [id, cards.map((card, i) => !final || view.boards.length > 0 || elapsed >= 0 && i < frame.finalCards ? card : concealedCard(`hand:${id}:${i}`))]));
  safe.winnerIds = final ? finalWinner ? view.winnerIds : [] : flags.result && elapsed >= 0 ? view.winnerIds : [];
  safe.boardWinnerIds = view.boardWinnerIds.slice(0, visibleBoards).map((ids, i) => boardKnown(i) ? ids : []);
  safe.boardResults = view.boardResults.slice(0, visibleBoards).map((rows, i) => boardKnown(i) ? rows.map(row => ({ ...row, place: boardResultVisible(i) ? row.place : 0 })) : []);
  safe.results = final ? (view.boards.length ? frame.revealed === 5 : frame.finalCards >= 7) ? view.results.map(row => ({ ...row,
    place: finalWinner || frame.phase === "FINAL_PLACE" && row.place >= (frame.finalPlace ?? Infinity) ? row.place : 0 })) : []
    : flags.result && elapsed >= 0 ? view.results : [];
  safe.streetSnapshots = view.streetSnapshots?.slice(0, visibleBoards).map((snapshots, bi) => bi > frame.boardIndex || elapsed < 0 ? []
    : snapshots.slice(0, bi < frame.boardIndex ? 4 : displayedStreetIndex(frame.phase) + 1));
  safe.rewards = (final ? finalWinner : flags.result) && elapsed >= 0 ? view.rewards : [];
  safe.runRewards = view.runRewards?.slice(0, visibleBoards).map((rows, i) => boardResultVisible(i) ? rows : []);
  safe.standingsAfterRuns = final ? finalWinner ? view.standingsAfterRuns : []
    : view.standingsAfterRuns?.slice(0, Math.max(0, frame.boardIndex + (resultVisible ? 1 : 0)));
  if ((final ? !finalWinner : !flags.result) || elapsed < 0) { delete safe.swissAfter; delete safe.pointAwards; delete safe.pointAwardDetails; delete safe.regulationWinnerIds; }
  if (view.round === 3 && (view.matchday ?? 3) < 3) safe.rewards = safe.rewards.map(reward => ({ ...reward, outcome: "SURVIVED", detail: undefined }));
  if (!["HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase)) {
    safe.highCardDraw = frame.phase === "HIGH_CARD_NOTICE" && view.highCardDraw
      ? { draws: [], winnerId: "", surviveCount: view.highCardDraw.surviveCount } : undefined;
  }
  return safe;
}

/** The single durable alarm also sends every authorized reveal, including final release eligibility. */
export function nextDisclosureAt(room: RoomSnapshot, now: number): number | undefined {
  const schedule = room.presentation;
  if (!schedule || now >= schedule.endsAt) return undefined;
  const times = [schedule.startsAt, schedule.endsAt];
  const entries = new Map(Object.values(schedule.perPlayer).flat().map(entry => [entry.matchId, entry]));
  for (const entry of entries.values()) {
    const match = room.game.roundResults.find(match => match.id === entry.matchId);
    if (!match) continue;
    const start = schedule.startsAt + entry.offsetMs;
    times.push(start - DISCLOSURE_LEAD_MS);
    times.push(start + entry.durationMs);
    if (entry.offsetMs > 0) times.push(start - INTER_MATCH_HOLD_MS);
    for (const frame of cinematicTimeline(createMatchView(room.game, match))) times.push(start + (entry.prepMs ?? 0) + frame.at - DISCLOSURE_LEAD_MS);
  }
  return Math.min(...times.filter(time => time > now));
}
