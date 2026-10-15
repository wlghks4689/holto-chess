import type { RoomSnapshot } from "./room";
import { PRESENTATION_LEAD_MS } from "../shared/presentationTimeline";

function newPrep(previous: RoomSnapshot | undefined, next: RoomSnapshot) {
  return next.status === "PLAYING" && ["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(next.game.phase)
    && next.barrierSince !== undefined && (previous?.game.phase !== next.game.phase || previous?.game.round !== next.game.round
      || previous?.gameGeneration !== next.gameGeneration || previous?.status !== next.status);
}
function newPresentation(previous: RoomSnapshot | undefined, next: RoomSnapshot) {
  return !!next.presentation && next.presentation.endsAt > next.presentation.startsAt
    && (previous?.presentation?.key !== next.presentation.key || previous?.gameGeneration !== next.gameGeneration);
}
export function needsPresentationAnchor(previous: RoomSnapshot | undefined, next: RoomSnapshot) {
  return newPrep(previous, next) || newPresentation(previous, next);
}

/** Run once before publishing a NEW phase, after computation and a runtime clock tick. Never rebase a live schedule. */
export function anchorNewPresentation(previous: RoomSnapshot | undefined, next: RoomSnapshot, readyAt: number): void {
  // Keep the full prep duration plus the same delivery lead used by cinematic starts.
  if (newPrep(previous, next)) next.barrierSince = Math.max(next.barrierSince!, readyAt + PRESENTATION_LEAD_MS);
  if (newPresentation(previous, next)) {
    const schedule = next.presentation!;
    const delay = Math.max(0, readyAt + PRESENTATION_LEAD_MS - schedule.startsAt);
    schedule.startsAt += delay; schedule.endsAt += delay;
  }
}
