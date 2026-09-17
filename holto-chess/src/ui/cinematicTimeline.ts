import type { MatchView } from "../shared/protocol";

export type CinematicPhase = "VS_INTRO" | "TABLE_ENTER" | "PREFLOP_HAND" | "FLOP_1" | "FLOP_2" | "FLOP_3" | "FLOP_SETTLE" | "FLOP_HAND"
  | "TURN" | "TURN_SETTLE" | "TURN_HAND" | "RIVER_SUSPENSE" | "RIVER" | "RIVER_SETTLE" | "RIVER_HAND" | "BEST5_WAIT" | "FINAL_CARDS"
  | "BEST5_GLOW" | "HOLE_DIM" | "BOARD_DIM" | "PROFILE" | "MADE_HAND" | "RUN_RESULT" | "RESULT" | "REWARD" | "COMPLETE";
export type CinematicFrame = { at: number; phase: CinematicPhase; boardIndex: number; revealed: number; finalCards: number };

/** Milliseconds at 1x. Reveal starts are separate from completed flips and pauses. */
export function cinematicTimeline(match: Pick<MatchView, "boards" | "revealedCards"> & { round?: number }): CinematicFrame[] {
  const frames: CinematicFrame[] = [];
  let at = 0; let boardIndex = 0; let revealed = 0; let finalCards = 0;
  const add = (phase: CinematicPhase, duration: number) => { frames.push({ at, phase, boardIndex, revealed, finalCards }); at += duration; };
  const bestFive = () => {
    add("BEST5_GLOW", 500); add("MADE_HAND", 600);
  };
  add("VS_INTRO", 1200);
  add("TABLE_ENTER", 400 );  if (match.round === 4 && match.boards.length) add("PREFLOP_HAND", 2000);
  if (!match.boards.length) {
    const count = Math.max(0, ...Object.values(match.revealedCards).map((cards) => cards.length));
    for (let i = 1; i <= count; i++) { finalCards = i; add("FINAL_CARDS", i === count ? 220 : 110); }
    add("BEST5_WAIT", 800); bestFive();
  } else {
    for (boardIndex = 0; boardIndex < match.boards.length; boardIndex++) {
      revealed = 0;
      revealed = 1; add("FLOP_1", 400);
      revealed = 2; add("FLOP_2", 400);
      revealed = 3; add("FLOP_3", 420); add("FLOP_SETTLE", 200); add("FLOP_HAND", 800);
      revealed = 4; add("TURN", 420); add("TURN_SETTLE", 200); add("TURN_HAND", 800);
      add("RIVER_SUSPENSE", 250);
      revealed = 5; add("RIVER", 600); add("RIVER_SETTLE", 200); add("RIVER_HAND", 600); add("BEST5_WAIT", 300);
      bestFive(); add("RUN_RESULT", 1000);
    }
    boardIndex = match.boards.length - 1;
  }
  add("RESULT", 1100); add("REWARD", 1600); add("COMPLETE", 0);
  return frames;
}

export function frameAt(frames: readonly CinematicFrame[], elapsed: number): CinematicFrame {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.at <= elapsed) return frames[i]!;
  return frames[0]!;
}

export function revealFlags(phase: CinematicPhase) {
  const order = ["BEST5_GLOW", "MADE_HAND", "RUN_RESULT", "RESULT", "REWARD", "COMPLETE"];
  const index = order.indexOf(phase);
  return { glow: index >= 0, holeDim: index >= 0, boardDim: index >= 0, profile: index >= 2,
    made: index >= 0, runResult: phase === "RUN_RESULT", result: index >= 3, reward: index >= 4 };
}

/** Keeps the previous made hand visible while a newly opened street settles for 200ms. */
export function displayedStreetIndex(phase: CinematicPhase): 0 | 1 | 2 | 3 {
  if (["FLOP_HAND"].includes(phase)) return 1;
  if (["TURN_HAND"].includes(phase)) return 2;
  if (["RIVER_HAND", "BEST5_WAIT", "BEST5_GLOW", "MADE_HAND", "RUN_RESULT", "RESULT", "REWARD", "COMPLETE"].includes(phase)) return 3;
  if (["TURN", "TURN_SETTLE"].includes(phase)) return 1;
  if (["RIVER_SUSPENSE", "RIVER", "RIVER_SETTLE"].includes(phase)) return 2;
  return 0;
}
