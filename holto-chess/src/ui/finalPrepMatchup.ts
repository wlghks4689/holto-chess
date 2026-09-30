import type { ShowdownPrepSeatView, ShowdownPrepView } from "../shared/protocol";

/** Only public identity data is needed: final loading never consumes card values. */
export function finalPrepMatchup(seats: Omit<ShowdownPrepSeatView, "cards">[], viewerId: string): ShowdownPrepView | undefined {
  const viewer = seats.find(seat => seat.playerId === viewerId) ?? seats[0];
  if (!viewer) return undefined;
  return { matchNumber: 1, viewer: { ...viewer, cards: [] }, opponents: seats.filter(seat => seat.playerId !== viewer.playerId).slice(0,3).map(seat => ({ ...seat, cards: [] })) };
}

