import type { Card } from "../core/poker/cards";
import { evaluatePartial, findBestFive, type HandValue } from "../core/poker/evaluate";

/** R5 presentation helper. It only evaluates the cards already visible in the current frame. */
export function visibleFinalHand(cards: readonly Card[], visibleCount: number): HandValue | undefined {
  const visible = cards.slice(0, visibleCount);
  if (!visible.length) return undefined;
  return visible.length >= 5 ? findBestFive(visible) : evaluatePartial(visible);
}
