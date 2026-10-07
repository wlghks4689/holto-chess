/** R5 places six cards as RUN 1, RUN 1, RUN 2, RUN 2, RUN 3, RUN 3. */
export const TRIPLE_RUN_SLOTS = 6;

/** The saved placement when it is a complete split of the owned cards, otherwise the owned order. */
export function tripleRunOrder(selectedCardIds: readonly string[], ownedIds: readonly string[]): string[] {
  const complete = selectedCardIds.length === TRIPLE_RUN_SLOTS && new Set(selectedCardIds).size === TRIPLE_RUN_SLOTS
    && selectedCardIds.every((id) => ownedIds.includes(id));
  return complete ? [...selectedCardIds] : [...ownedIds];
}

/** Swaps two placed cards; the same position twice leaves the order unchanged. */
export function swapPlacement(order: readonly string[], from: number, to: number): string[] {
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Swaps two whole RUN hands (each two slots wide), keeping each pair's card order. */
export function swapRuns(order: readonly string[], from: number, to: number): string[] {
  const next = [...order];
  for (const slot of [0, 1]) [next[from * 2 + slot], next[to * 2 + slot]] = [next[to * 2 + slot]!, next[from * 2 + slot]!];
  return next;
}
