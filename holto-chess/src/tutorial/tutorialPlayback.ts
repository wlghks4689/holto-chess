import { cinematicTimeline, type CinematicPhase } from "../shared/presentationTimeline";
import type { MatchView } from "../shared/protocol";

/** Showdown beats the tutorial is allowed to stop on, in the order they can occur. */
export type TutorialCheckpoint = CinematicPhase;

/**
 * Where playback must hold so the player still sees the checkpoint frame. The tutorial drives the
 * existing cinematic through its `elapsedMs` input, so nothing in the shared timeline changes: the
 * clock simply stops one millisecond before the next beat would start.
 */
export function checkpointMs(match: MatchView, phase: TutorialCheckpoint): number | null {
  const frames = cinematicTimeline(match);
  const index = frames.findIndex((frame) => frame.phase === phase);
  if (index < 0) return null;
  const next = frames[index + 1];
  return next ? next.at - 1 : frames[index]!.at;
}

/** The checkpoints that actually exist for this match, skipping beats the round never plays. */
export function tutorialCheckpoints(match: MatchView, wanted: readonly TutorialCheckpoint[]): { phase: TutorialCheckpoint; at: number }[] {
  return wanted.flatMap((phase) => {
    const at = checkpointMs(match, phase);
    return at === null ? [] : [{ phase, at }];
  }).sort((a, b) => a.at - b.at);
}

/** Total length of one match, used to release the tutorial from the cinematic. */
export function matchEndMs(match: MatchView): number {
  return cinematicTimeline(match).at(-1)!.at;
}
