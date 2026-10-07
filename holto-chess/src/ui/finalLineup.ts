/** R6 lineup: the five played cards and the rest burned. */
export const LINEUP_SIZE = 5;

/** The saved five when it is a valid lineup of owned cards, otherwise the first five owned. */
export function lineupOf(selectedCardIds: readonly string[], ownedIds: readonly string[]): string[] {
  const valid = selectedCardIds.length === LINEUP_SIZE && new Set(selectedCardIds).size === LINEUP_SIZE
    && selectedCardIds.every((id) => ownedIds.includes(id));
  return valid ? [...selectedCardIds] : ownedIds.slice(0, LINEUP_SIZE);
}

/** Puts a burned card into the played card's slot; the played card is burned instead. */
export function swapLineup(lineup: readonly string[], playedId: string, burnedId: string): string[] {
  return lineup.map((id) => id === playedId ? burnedId : id);
}
