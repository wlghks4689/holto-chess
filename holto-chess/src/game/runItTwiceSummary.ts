type ResultSource = { runoutCount: number; boardWinnerIds: string[][]; winnerIds: string[] };
export type RunOutcome = { winnerPlayerId: string | null; split: boolean };
export type RunItTwiceSummary = {
  runs: RunOutcome[];
  regularScore: Record<string, number>;
  tied: boolean;
  suddenDeath: (RunOutcome & { attempt: number })[];
  finalWinnerPlayerId: string | null;
};
/** Presentation projection of authoritative winners only; never evaluates cards. */
export function runItTwiceSummary(match: ResultSource, players: readonly string[]): RunItTwiceSummary | null {
  if (match.runoutCount !== 2 || players.length !== 2) return null;
  const outcome = (ids: string[]): RunOutcome => ({ winnerPlayerId: ids.length === 1 ? ids[0] : null, split: ids.length > 1 });
  const runs = match.boardWinnerIds.slice(0, 2).map(outcome);
  const regularScore = Object.fromEntries(players.map((id) => [id, runs.filter((r) => r.winnerPlayerId === id).length]));
  return { runs, regularScore, tied: regularScore[players[0]] === regularScore[players[1]],
    suddenDeath: match.boardWinnerIds.slice(2).map((ids, i) => ({ ...outcome(ids), attempt: i + 1 })),
    finalWinnerPlayerId: match.winnerIds.length === 1 ? match.winnerIds[0] : null };
}
