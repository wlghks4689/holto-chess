import type { Round } from "../game/types";

const FIVE_ROUND_TITLES = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];
const SIX_ROUND_TITLES = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "RUN IT THREE TIMES", "THE LAST HAND"];

/** Round title for the game's format; `lastRound` is 6 in six-round games. */
export function roundTitle(round: Round | number, lastRound: Round | number = 5): string {
  return (lastRound === 6 ? SIX_ROUND_TITLES : FIVE_ROUND_TITLES)[round] ?? `ROUND ${round}`;
}
