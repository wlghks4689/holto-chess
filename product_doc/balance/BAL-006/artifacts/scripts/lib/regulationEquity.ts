// A "regulation-board-only" 3-way equity calculator: reuses the SAME shared
// evaluators as engine.ts and showdownEquity.ts (findBestFive, compareHands,
// rankPlayers, placeInRanking from core/poker/evaluate.ts) but skips the full
// PorenaGameState/tie-break-cascade machinery. This answers ONLY "who leads
// after the single regulation board" — not sudden death, not high-card draw,
// not final placement/reward. It is fast enough for exact enumeration and is
// the fair-comparison baseline against the full-engine Monte Carlo (lib/fullEngineMC.ts).
import { makeDeck, type Card } from "/home/user/holto-chess-BAL-006/holto-chess/src/core/poker/cards.ts";
import { combinations, compareHands, findBestFive, placeInRanking, rankPlayers } from "/home/user/holto-chess-BAL-006/holto-chess/src/core/poker/evaluate.ts";

export type RegulationOutcome = {
  /** place[i] for hands[i], via the SAME placeInRanking Olympic-ranking rule engine.ts uses. */
  places: number[];
  /** true if hands[i] is part of a >=2-way tie for 1st on this board. */
  tiedFor1st: boolean[];
};

export function evaluateRegulationBoard(hands: readonly Card[][], board: readonly Card[]): RegulationOutcome {
  const entries = hands.map((cards, i) => ({ playerId: String(i), hand: findBestFive([...cards, ...board]) }));
  const ranking = rankPlayers(entries);
  const firstGroupSize = ranking[0]!.length;
  const places = entries.map((e) => placeInRanking(ranking, e.playerId));
  const tiedFor1st = places.map((p) => p === 1 && firstGroupSize > 1);
  return { places, tiedFor1st };
}

/** Exact enumeration over every remaining board (C(37,5) for 3x 5-card hands). Zero sampling error. */
export function exactRegulationEquity(hands: readonly Card[][]) {
  const known = new Set(hands.flat().map((c) => c.id));
  if (known.size !== hands.flat().length) throw new Error("Duplicate card id across the 3 hands");
  const unseen = makeDeck().filter((c) => !known.has(c.id));
  const boards = combinations(unseen, 5);
  const soloWins = [0, 0, 0];
  const tiedFor1stCounts = [0, 0, 0];
  // fractional equity: 1/(size of the tied-for-1st group) credited to each tied player, 0 to the rest.
  const fractionalEquitySum = [0, 0, 0];
  for (const board of boards) {
    const { places, tiedFor1st } = evaluateRegulationBoard(hands, board);
    const tiedCount = tiedFor1st.filter(Boolean).length;
    for (let i = 0; i < hands.length; i += 1) {
      if (places[i] === 1) {
        if (tiedCount > 1) { tiedFor1stCounts[i]! += 1; fractionalEquitySum[i]! += 1 / tiedCount; }
        else { soloWins[i]! += 1; fractionalEquitySum[i]! += 1; }
      }
    }
  }
  const n = boards.length;
  return {
    n,
    soloWinProbability: soloWins.map((c) => c / n),
    tiedFor1stProbability: tiedFor1stCounts.map((c) => c / n),
    fractionalEquity: fractionalEquitySum.map((c) => c / n),
  };
}
