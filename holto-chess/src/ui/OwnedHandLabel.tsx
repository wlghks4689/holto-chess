import type { Card } from "../core/poker/cards";
import { combinations, compareHands, evaluatePartial, findBestFive, type HandValue } from "../core/poker/evaluate";
import type { Round } from "../game/types";
import { isTripleRunRound } from "../game/config";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import { useTranslation } from "../i18n";

/** Made hand of the cards owned right now, before any board. R3 Omaha only ever uses two hole cards. */
function ownedHand(round: Round, cards: readonly Card[]): HandValue | null {
  if (!cards.length || cards.some(card => card.hidden)) return null;
  if (round === 3 && cards.length > 2) return combinations(cards, 2).map(evaluatePartial).reduce((a, b) => compareHands(b, a) > 0 ? b : a);
  return cards.length >= 5 ? findBestFive(cards) : evaluatePartial(cards);
}

/**
 * PC shop only: the inventory panel has spare height below the cards there (hidden at <=768px, where panels stack).
 * Six-round R5 splits the cards into three two-card RUN hands, so a hand made from all of them would mislead.
 */
export function OwnedHandLabel({ round, lastRound, cards }: { round: Round; lastRound: Round; cards: readonly Card[] }) {
  const { t } = useTranslation();
  const hand = isTripleRunRound(round, { sixRounds: lastRound === 6 }) ? null : ownedHand(round, cards);
  if (!hand) return null;
  const label = detailedHandLabel(hand.category, hand.kickers, cards, hand.bestFive.map(card => card.id), t);
  return <p className={`owned-hand-label made-${madeTone(hand.displayName)}`} aria-live="polite">
    <small>{t("shop.currentHand")}</small><strong>{label.title}</strong>{label.kicker && <span>({label.kicker})</span>}
  </p>;
}
