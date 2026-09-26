=== Case: one player has only 4 owned cards (incomplete hand) ===
winnerIds [ 'p3' ]
results [
  { id: 'p1', place: 3, category: 'HIGH_CARD', categoryRank: 0 },
  { id: 'p2', place: 2, category: 'TWO_PAIR', categoryRank: 3 },
  { id: 'p3', place: 1, category: 'STRAIGHT', categoryRank: 5 }
]
pointAwards { p1: 0, p2: 5, p3: 10 }
=> forfeited player's hand.categoryRank should be 0 (forfeitHand sentinel), pointAwards 0, and it never wins.

=== Case: winner-group of 4 (not 3) ===
playerIds [ 'p1', 'p2', 'p3', 'p4' ] winnerIds [ 'p1' ]
results [
  { id: 'p1', place: 1 },
  { id: 'p2', place: 3 },
  { id: 'p3', place: 4 },
  { id: 'p4', place: 2 }
]
pointAwards { p1: 10, p2: 3, p3: 0, p4: 5 } (note: rewardMatch's r4WinnerGroup prize table only defines places 1/2/3 — place 4 falls through to `?? 0`)

=== Case: duplicate card id across two 'different' hands (should be structurally impossible / must throw) ===
Threw as expected: As already owned by p1 — cannot double-assign
