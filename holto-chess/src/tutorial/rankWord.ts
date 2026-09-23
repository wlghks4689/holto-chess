import { rankToChar, SUIT_SYMBOL, type Card } from "../core/poker/cards";

/** Beginners read the ten as "10", not as the shorthand "T" the card faces already avoid. */
export function rankWord(rank: number): string {
  return rank === 10 ? "10" : rankToChar(rank);
}

export function cardWord(card: Card): string {
  return `${rankWord(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

/**
 * Korean object/subject markers depend on the last syllable, and hand names vary at runtime
 * ("트립스" vs "원페어"), so the copy picks the marker instead of printing "을(를)".
 */
export function withParticle(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trimEnd().at(-1) ?? "";
  const code = last.charCodeAt(0);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  // Anything that is not a Hangul syllable (a suit symbol, a digit) reads better with the open form.
  return `${word}${hangul && (code - 0xac00) % 28 !== 0 ? withFinal : withoutFinal}`;
}
