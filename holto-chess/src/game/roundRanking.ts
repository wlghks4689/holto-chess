type Standing = { playerId: string; points: number; stackBB: number };

/** Existing standings order: cumulative points, BB, then stable seat order.
 * Live scoreboards use player IDs for the same fixed p1..p8 seats.
 */
export function compareRoundStanding(a: Standing, b: Standing, seats?: ReadonlyMap<string, number>): number {
  return b.points - a.points || b.stackBB - a.stackBB
    || (seats ? seats.get(a.playerId)! - seats.get(b.playerId)! : a.playerId.localeCompare(b.playerId));
}
