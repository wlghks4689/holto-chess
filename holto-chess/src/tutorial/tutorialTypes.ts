import type { PorenaGameState, Round } from "../game/types";
import type { TutorialCheckpoint } from "./tutorialPlayback";

export type ChapterId = 1 | 2 | 3 | 4 | 5;

/**
 * EXPLAIN and REVIEW steps wait for the reader. ACT steps wait for something that really happened in
 * the game, so a purchase made early counts and a sale that undoes it puts the step back.
 */
export type StepKind = "EXPLAIN" | "ACT" | "REVIEW";

export type StepText = string[] | ((game: PorenaGameState) => string[]);

export type TutorialStep = {
  id: string;
  kind: StepKind;
  title: string;
  body: StepText;
  /** Folded away behind "더 알아보기". */
  more?: StepText;
  /** Element carrying the matching data-tutorial-id. */
  focus?: string;
  /** Shown in the header as the current objective. */
  goal?: string;
  /** Button label for a step the reader dismisses. */
  next?: string;
  /** ACT steps finish when this is true of the live game. */
  done?: (game: PorenaGameState) => boolean;
  /** Runs once when the step becomes current, for beats the player does not trigger. */
  onEnter?: (game: PorenaGameState) => PorenaGameState;
  /** Holds the showdown cinematic on this beat of the given match. */
  hold?: { matchIndex: number; at: TutorialCheckpoint };
};

export type TutorialChapter = {
  id: ChapterId;
  title: string;
  round: Round;
  summary: string;
  steps: TutorialStep[];
};

export function stepText(text: StepText | undefined, game: PorenaGameState): string[] {
  if (!text) return [];
  return typeof text === "function" ? text(game) : text;
}
