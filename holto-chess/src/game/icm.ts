export type IcmEntry = { playerId: string; stackBB: number };

/**
 * Standard recursive ICM. Each recursion assigns the next occupied place by
 * chip probability, removes that player, then continues through the ladder.
 */
export function calculateIcm(entries: readonly IcmEntry[], prizes: readonly number[]): Record<string, number> {
  const values = Object.fromEntries(entries.map(({ playerId }) => [playerId, 0])) as Record<string, number>;
  if (!entries.length || !prizes.length) return values;

  const visit = (remaining: readonly IcmEntry[], place: number, probability: number): void => {
    if (!remaining.length || place >= prizes.length || probability === 0) return;
    const total = remaining.reduce((sum, entry) => sum + Math.max(0, entry.stackBB), 0);
    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index]!;
      const nextProbability = probability * (total > 0 ? Math.max(0, entry.stackBB) / total : 1 / remaining.length);
      values[entry.playerId] += nextProbability * prizes[place]!;
      visit([...remaining.slice(0, index), ...remaining.slice(index + 1)], place + 1, nextProbability);
    }
  };

  visit(entries, 0, 1);
  return values;
}
