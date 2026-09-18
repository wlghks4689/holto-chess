/**
 * R3 loadout sockets. Slots 0-1 are Game 1 and 2-3 are Game 2, which is exactly the order the
 * engine and server expect in selectedCardIds, so a full loadout converts to that list directly.
 */
export type LoadoutSlots = readonly (string | null)[];
/** What the player is holding: a card to place, or an empty socket waiting for a card. */
export type LoadoutFocus = { kind: "card"; cardId: string } | { kind: "slot"; index: number } | null;
export type LoadoutState = { slots: LoadoutSlots; focus: LoadoutFocus };
export type LoadoutClick = { kind: "card"; cardId: string } | { kind: "slot"; index: number } | { kind: "hand" };

export const LOADOUT_SLOT_COUNT = 4;
export const gameOfSlot = (index: number): 1 | 2 => index < 2 ? 1 : 2;

/** Rebuilds sockets from a saved selection; anything but a complete, owned loadout starts empty. */
export function loadoutFromSelection(selectedCardIds: readonly string[], ownedCardIds: readonly string[]): LoadoutSlots {
  const valid = selectedCardIds.length === LOADOUT_SLOT_COUNT && new Set(selectedCardIds).size === LOADOUT_SLOT_COUNT
    && selectedCardIds.every((id) => ownedCardIds.includes(id));
  return valid ? [...selectedCardIds] : Array.from({ length: LOADOUT_SLOT_COUNT }, () => null);
}

/** Ordered selectedCardIds (Game 1, Game 1, Game 2, Game 2), or null while a socket is empty. */
export function selectionFromLoadout(slots: LoadoutSlots): string[] | null {
  return slots.every((id): id is string => !!id) ? [...slots] : null;
}

/**
 * Moves a card into a socket. If the socket is taken, its card swaps into the moving card's old
 * socket, or goes back to the hand when the moving card came from the hand.
 */
export function placeCard(slots: LoadoutSlots, cardId: string, index: number): LoadoutSlots {
  const next = [...slots];
  const from = next.indexOf(cardId);
  const displaced = next[index];
  if (from >= 0) next[from] = displaced && displaced !== cardId ? displaced : null;
  next[index] = cardId;
  return next;
}

export function returnToHand(slots: LoadoutSlots, cardId: string): LoadoutSlots {
  return slots.map((id) => id === cardId ? null : id);
}

/** Click either the card or the socket first; the second click completes the move. */
export function clickLoadout(state: LoadoutState, click: LoadoutClick): LoadoutState {
  const { slots, focus } = state;
  if (click.kind === "hand") {
    return focus?.kind === "card" && slots.includes(focus.cardId) ? { slots: returnToHand(slots, focus.cardId), focus: null } : { slots, focus: null };
  }
  if (click.kind === "card") {
    if (focus?.kind === "card" && focus.cardId === click.cardId) return { slots, focus: null };
    if (focus?.kind === "slot" && !slots.includes(click.cardId)) return { slots: placeCard(slots, click.cardId, focus.index), focus: null };
    return { slots, focus: { kind: "card", cardId: click.cardId } };
  }
  const occupant = slots[click.index];
  if (focus?.kind === "card") {
    if (occupant === focus.cardId) return { slots, focus: null };
    return { slots: placeCard(slots, focus.cardId, click.index), focus: null };
  }
  if (occupant) return { slots, focus: { kind: "card", cardId: occupant } };
  if (focus?.kind === "slot" && focus.index === click.index) return { slots, focus: null };
  return { slots, focus: { kind: "slot", index: click.index } };
}
