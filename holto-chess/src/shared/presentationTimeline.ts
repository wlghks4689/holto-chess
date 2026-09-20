import type { MatchView } from "./protocol";

export type CinematicPhase = "ARENA_ENTER" | "VS_INTRO" | "TABLE_ENTER" | "PREFLOP_HAND" | "FLOP_1" | "FLOP_2" | "FLOP_3" | "FLOP_SETTLE" | "FLOP_HAND"
  | "TURN" | "TURN_SETTLE" | "TURN_HAND" | "RIVER_SUSPENSE" | "RIVER" | "RIVER_SETTLE" | "RIVER_HAND" | "BEST5_WAIT" | "FINAL_CARDS"
  | "FINAL_FIRST_REVEAL" | "FINAL_FIRST_HAND" | "FINAL_SECOND_REVEAL" | "FINAL_SECOND_HAND" | "FINAL_LAST_REVEAL" | "FINAL_SEVEN_SETTLE"
  | "HIGH_CARD_NOTICE" | "HIGH_CARD_DRAW" | "BEST5_GLOW" | "HOLE_DIM" | "BOARD_DIM" | "PROFILE" | "MADE_HAND" | "RUN_RESULT" | "RESULT" | "FINAL_PLACE" | "FINAL_WINNER" | "REWARD" | "COMPLETE";
export type CinematicFrame = { at: number; phase: CinematicPhase; boardIndex: number; revealed: number; finalCards: number; finalPlace?: number };

/** R5 arena pre-roll: hold the full arena, push in toward the table, settle (see cinematic.css). */
export const FINAL_ARENA_HOLD_MS = 400;
export const FINAL_ARENA_ZOOM_MS = 1800;
export const FINAL_ARENA_ENTER_MS = FINAL_ARENA_HOLD_MS + FINAL_ARENA_ZOOM_MS + 300;

/** Milliseconds at 1x. Reveal starts are separate from completed flips and pauses. */
export function cinematicTimeline(match: Pick<MatchView, "boards" | "revealedCards" | "highCardDraw"> & { round?: number; results?: Pick<MatchView["results"][number], "place">[] }): CinematicFrame[] {
  const frames: CinematicFrame[] = [];
  let at = 0; let boardIndex = 0; let revealed = 0; let finalCards = 0;
  const add = (phase: CinematicPhase, duration: number, finalPlace?: number) => { frames.push({ at, phase, boardIndex, revealed, finalCards, finalPlace }); at += duration; };
  const bestFive = () => {
    if (match.round === 5) { add("BEST5_GLOW", 500); add("MADE_HAND", 600); }
    else add("BEST5_GLOW", 650);
  };
  // R5 only: the Final Arena establishing shot and camera push-in play before the existing intro.
  if (match.round === 5 && !match.boards.length) add("ARENA_ENTER", FINAL_ARENA_ENTER_MS);
  add("VS_INTRO", 1200);
  add("TABLE_ENTER", 400 );  if (match.round === 4 && match.boards.length) add("PREFLOP_HAND", 2000);
  if (!match.boards.length) {
    if (match.round === 5) {
      // Reveal phases cover the staggered flips (310ms / 320ms / 380ms between cards, 420ms flip,
      // 600ms for the last pair); hand phases are the 1400ms read beat; the settle is a 500ms look
      // before BEST 5 lights up.
      finalCards = 3; add("FINAL_FIRST_REVEAL", 1050); add("FINAL_FIRST_HAND", 1400);
      finalCards = 5; add("FINAL_SECOND_REVEAL", 750); add("FINAL_SECOND_HAND", 1400);
      finalCards = 7; add("FINAL_LAST_REVEAL", 1000); add("FINAL_SEVEN_SETTLE", 500);
      bestFive();
      const places = [...new Set((match.results ?? []).map((result) => result.place).filter((place) => place > 1))].sort((a, b) => b - a);
      for (const place of places) add("FINAL_PLACE", 900, place);
      add("FINAL_WINNER", 1300, 1); add("REWARD", 1600); add("COMPLETE", 0);
      return frames;
    }
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
      revealed = 5; add("RIVER", 600); add("RIVER_SETTLE", 200);
      // One hand read, then one outcome. Intermediate run results are needed only
      // when another board follows; the final board flows straight into RESULT.
      bestFive();
      if (boardIndex < match.boards.length - 1) add("RUN_RESULT", 800);
    }
    boardIndex = match.boards.length - 1;
  }
  if (match.highCardDraw) {
    add("RUN_RESULT", 800);
    add("HIGH_CARD_NOTICE", 6500);
    add("HIGH_CARD_DRAW", 3000);
  }
  add("RESULT", 650); add("REWARD", 1100); add("COMPLETE", 0);
  return frames;
}

export function frameAt(frames: readonly CinematicFrame[], elapsed: number): CinematicFrame {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.at <= elapsed) return frames[i]!;
  return frames[0]!;
}

export function revealFlags(phase: CinematicPhase) {
  if (phase === "HIGH_CARD_NOTICE" || phase === "HIGH_CARD_DRAW") {
    return { glow: true, holeDim: true, boardDim: true, profile: false, made: true, runResult: false, result: false, reward: false, winner: false };
  }
  const order = ["BEST5_GLOW", "MADE_HAND", "RUN_RESULT", "RESULT", "REWARD", "COMPLETE"];
  const index = order.indexOf(phase);
  const finalResolution = ["FINAL_PLACE", "FINAL_WINNER", "REWARD", "COMPLETE"].includes(phase);
  const finalReveal = ["FINAL_PLACE", "FINAL_WINNER"].includes(phase);
  return { glow: index >= 0 || finalResolution, holeDim: index >= 0 || finalResolution, boardDim: index >= 0 || finalResolution,
    profile: index >= 2 || finalResolution, made: index >= 0 || finalResolution, runResult: phase === "RUN_RESULT",
    result: index >= 3 || finalReveal, reward: index >= 4, winner: ["FINAL_WINNER", "REWARD", "COMPLETE"].includes(phase) };
}

/** Keeps the previous made hand visible while a newly opened street settles for 200ms. */
export function displayedStreetIndex(phase: CinematicPhase): 0 | 1 | 2 | 3 {
  if (phase === "HIGH_CARD_NOTICE" || phase === "HIGH_CARD_DRAW") return 3;
  if (["FLOP_HAND"].includes(phase)) return 1;
  if (["TURN_HAND"].includes(phase)) return 2;
  if (["RIVER_HAND", "BEST5_WAIT", "BEST5_GLOW", "MADE_HAND", "RUN_RESULT", "RESULT", "REWARD", "COMPLETE"].includes(phase)) return 3;
  if (["TURN", "TURN_SETTLE"].includes(phase)) return 1;
  if (["RIVER_SUSPENSE", "RIVER", "RIVER_SETTLE"].includes(phase)) return 2;
  return 0;
}

/**
 * Server-scheduled presentation. The server stamps one start time per showdown set and every
 * client derives its frame from that clock, so all seats see the same beat at the same moment.
 * Bump the version whenever timeline durations change so stale clients can be recognised.
 */
export const PRESENTATION_VERSION = 3;
/** Head start between commit and playback so every socket has the view before frame 0. */
export const PRESENTATION_LEAD_MS = 700;
/** Pause on a finished match before the next one starts (replaces the per-match confirm click). */
export const MATCH_HOLD_MS = 1500;

export function presentationDurationMs(match: Parameters<typeof cinematicTimeline>[0]): number {
  return cinematicTimeline(match).at(-1)!.at + MATCH_HOLD_MS;
}
