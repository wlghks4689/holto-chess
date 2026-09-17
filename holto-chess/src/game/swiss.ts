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
