import type { PorenaGameState, Round } from "../game/types";
import { TUTORIAL_CHAPTERS, TUTORIAL_SEED } from "./chapters";
import { autoStep, practiceState, roundEntryPhase } from "./practiceState";
import type { ChapterId, TutorialChapter, TutorialStep } from "./tutorialTypes";

export type TutorialSession = {
  chapterId: ChapterId;
  stepIndex: number;
  game: PorenaGameState;
  /** State as it was when the current step began, for "이 단계 다시 연습하기". */
  checkpoint: PorenaGameState;
  /** Steps whose onEnter already ran, so re-reading never replays an engine action. */
  entered: string[];
  completed: ChapterId[];
  /** Whether this chapter started from the player's own run or from a prepared practice hand. */
  origin: "continued" | "practice";
};

export function chapterById(id: ChapterId): TutorialChapter {
  return TUTORIAL_CHAPTERS.find((chapter) => chapter.id === id)!;
}

export function currentStep(session: TutorialSession): TutorialStep | null {
  return chapterById(session.chapterId).steps[session.stepIndex] ?? null;
}

export function chapterFinished(session: TutorialSession): boolean {
  return session.stepIndex >= chapterById(session.chapterId).steps.length;
}

/** Matches of this round the practice seat takes part in: what the cinematic will actually play. */
export function tutorialMatches(game: PorenaGameState) {
  const mine = game.roundResults.filter((match) => match.playerIds.includes("p1"));
  return mine.length ? mine : game.roundResults;
}

/** Phases that can still add matches, so a beat is not skipped just because it has not been played yet. */
const PENDING_PHASES = ["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY", "GROUP_ASSIGNMENT", "SURVIVAL_READY"];
export function matchesPending(game: PorenaGameState): boolean {
  return PENDING_PHASES.includes(game.phase);
}

/**
 * Selling a card (or any other change) can undo a goal that was already met, so the session drops
 * back to that step and asks for it again. The search stops at a showdown beat: once cards are on
 * the table the tutorial never rewinds past what the player has already watched.
 */
function reopenUndoneStep(session: TutorialSession): TutorialSession {
  const steps = chapterById(session.chapterId).steps;
  for (let index = session.stepIndex - 1; index >= 0; index -= 1) {
    const step = steps[index]!;
    if (step.hold) break;
    if (step.kind === "ACT" && step.done && !step.done(session.game)) return { ...session, stepIndex: index };
  }
  return session;
}

/**
 * Settles the session on a step that is genuinely waiting for the reader: runs any pending onEnter,
 * skips beats this match never plays, and clears action steps whose goal is already met (bought
 * early, or met again after a sale changed the state).
 */
export function sync(session: TutorialSession): TutorialSession {
  let next = session;
  for (let guard = 0; guard < 64; guard += 1) {
    next = reopenUndoneStep(next);
    const step = currentStep(next);
    if (!step) return next;
    if (step.hold && !matchesPending(next.game) && step.hold.matchIndex >= tutorialMatches(next.game).length) {
      next = { ...next, stepIndex: next.stepIndex + 1 };
      continue;
    }
    if (!next.entered.includes(step.id)) {
      const game = step.onEnter ? step.onEnter(next.game) : next.game;
      next = { ...next, game, checkpoint: game, entered: [...next.entered, step.id] };
    }
    if (step.kind === "ACT" && step.done?.(next.game)) {
      next = { ...next, stepIndex: next.stepIndex + 1 };
      continue;
    }
    return next;
  }
  return next;
}

/** Phases that belong to the player: a carried game is never stepped through one of these for them. */
const DECISION_PHASES = ["SHOP", "DECK_SELECT", "OPEN_DRAFT", "RUN_LOADOUT", "GAME_RESULT"];

/**
 * Carries the player's own hand into the next chapter by closing out the round they just finished.
 * Only the transitions nobody chooses (round result, round change) are stepped; if a real decision is
 * still open, the chapter falls back to its prepared practice hand instead of deciding for them.
 */
function carryInto(carried: PorenaGameState, round: Round): PorenaGameState | null {
  const entry = roundEntryPhase(round);
  let game = carried;
  for (let step = 0; step < 12; step += 1) {
    if (game.round === round && game.phase === entry) return game.players[0]!.eliminated ? null : game;
    if (game.round > round || DECISION_PHASES.includes(game.phase) || matchesPending(game)) return null;
    try { game = autoStep(game); } catch { return null; }
  }
  return null;
}

/** Starts a chapter from the player's own run when it is offered, otherwise from a practice hand. */
export function startChapter(chapterId: ChapterId, carried?: PorenaGameState): TutorialSession {
  const chapter = chapterById(chapterId);
  const continued = carried && !carried.players[0]!.eliminated ? carryInto(carried, chapter.round) : null;
  const game = continued ?? practiceState(TUTORIAL_SEED, chapter.round);
  return sync({
    chapterId, stepIndex: 0, game, checkpoint: game, entered: [], completed: [],
    origin: continued ? "continued" : "practice",
  });
}

/** The reader pressed the step's button. Action steps are never advanced this way. */
export function advance(session: TutorialSession): TutorialSession {
  const step = currentStep(session);
  if (!step || step.kind === "ACT") return session;
  return sync({ ...session, stepIndex: session.stepIndex + 1 });
}

/** A real engine result came back (purchase, reroll, placement, phase change). */
export function applyGame(session: TutorialSession, game: PorenaGameState): TutorialSession {
  return sync({ ...session, game });
}

/** Restores the whole practice game — ledger, BB, shop, bots and RNG — to the step's own start. */
export function restartStep(session: TutorialSession): TutorialSession {
  return sync({ ...session, game: session.checkpoint });
}

export function completeChapter(session: TutorialSession): TutorialSession {
  return session.completed.includes(session.chapterId) ? session : { ...session, completed: [...session.completed, session.chapterId] };
}
