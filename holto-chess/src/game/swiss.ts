export type SwissRecord = { wins: number; draws: number; losses: number; score: number };
export const emptySwissRecord = (): SwissRecord => ({ wins: 0, draws: 0, losses: 0, score: 0 });

/** Enumerate perfect matchings (only 105 for eight players). Avoid repeats first,
 * then minimize score gaps globally; input order is the seeded random tiebreak. */
export function swissPairs(ids: string[], records: Record<string, SwissRecord>, history: string[][]): string[][] {
  if (ids.length % 2 || new Set(ids).size !== ids.length) throw new Error("Swiss requires distinct, even participants");
  let best: string[][] = []; let bestRepeats = Infinity; let bestGap = Infinity;
  const visit = (remaining: string[], pairs: string[][], repeats: number, gap: number) => {
    if (repeats > bestRepeats || (repeats === bestRepeats && gap >= bestGap)) return;
    if (!remaining.length) { best = pairs; bestRepeats = repeats; bestGap = gap; return; }
    const a = remaining[0]!;
    for (let i = 1; i < remaining.length; i++) {
      const b = remaining[i]!;
      const repeat = history.some((pair) => pair.includes(a) && pair.includes(b)) ? 1 : 0;
      const difference = records[a]!.score - records[b]!.score;
      visit(remaining.filter((id) => id !== a && id !== b), [...pairs, [a, b]], repeats + repeat, gap + difference * difference);
    }
  };
  visit(ids, [], 0, 0);
  return best;
}

/**
 * A perfect matching that avoids earlier meetings in priority order: a repeat from `tiers[0]` costs more
 * than any number from `tiers[1]`, and so on; then the smallest score gaps. Input order is the seeded
 * random tiebreak. `repeats` counts the pairs that repeat each tier (non-zero: that tier was relaxed).
 */
export function avoidingPairs(ids: string[], records: Record<string, SwissRecord>, tiers: string[][][]): { pairs: string[][]; repeats: number[] } {
  if (ids.length % 2 || new Set(ids).size !== ids.length) throw new Error("Pairing requires distinct, even participants");
  const met = (tier: string[][], a: string, b: string) => tier.some((pair) => pair.includes(a) && pair.includes(b));
  // Lexicographic: no completion of a partial cost can beat a best it already equals or exceeds.
  const worse = (cost: number[], best: number[]) => { for (let i = 0; i < cost.length; i++) if (cost[i] !== best[i]) return cost[i]! > best[i]!; return true; };
  let best: string[][] = []; let bestCost = [...tiers.map(() => Infinity), Infinity];
  const visit = (remaining: string[], pairs: string[][], cost: number[]) => {
    if (worse(cost, bestCost)) return;
    if (!remaining.length) { best = pairs; bestCost = cost; return; }
    const a = remaining[0]!;
    for (let i = 1; i < remaining.length; i++) {
      const b = remaining[i]!;
      const difference = records[a]!.score - records[b]!.score;
      const next = [...tiers.map((tier, t) => cost[t]! + (met(tier, a, b) ? 1 : 0)), cost.at(-1)! + difference * difference];
      visit(remaining.filter((id) => id !== a && id !== b), [...pairs, [a, b]], next);
    }
  };
  visit(ids, [], [...tiers.map(() => 0), 0]);
  return { pairs: best, repeats: bestCost.slice(0, tiers.length) };
}
