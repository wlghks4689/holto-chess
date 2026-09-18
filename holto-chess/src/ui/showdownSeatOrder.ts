/** Heads-up seats are chosen once from match identity, never from phase or winner state. */
export function showdownSeatOrder(participantIds: readonly string[], viewerId: string): string[] {
  if (participantIds.length !== 2 || !participantIds.includes(viewerId)) return [...participantIds];
  return [viewerId, participantIds.find((id) => id !== viewerId)!];
}
