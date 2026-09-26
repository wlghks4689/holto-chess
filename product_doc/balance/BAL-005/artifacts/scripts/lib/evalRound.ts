import { compareHands, findBestFive, findBestOmaha } from "/home/user/holto-chess/holto-chess/src/core/poker/evaluate.ts";
import type { Card } from "/home/user/holto-chess/holto-chess/src/core/poker/cards.ts";

/** Same round->evaluator mapping as showdownEquity.ts and engine.ts's handFor:
 * R3 is Omaha (2-of-hole + 3-of-board), everything else is best-5-of-N. */
export function compareRound(round: 1 | 3 | 4, left: readonly Card[], right: readonly Card[], board: readonly Card[]): number {
  if (round === 3) return compareHands(findBestOmaha(left, board), findBestOmaha(right, board));
  return compareHands(findBestFive([...left, ...board]), findBestFive([...right, ...board]));
}

/** 1 = left win, 0.5 = tie, 0 = left loss — same encoding as showdownEquity.ts. */
export function outcomeFor(cmp: number): number {
  return cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
}
