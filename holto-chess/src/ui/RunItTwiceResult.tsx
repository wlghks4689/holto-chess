import { runItTwiceSummary } from "../game/runItTwiceSummary";

type Props = {
  match: { runoutCount: number; boardWinnerIds: string[][]; winnerIds: string[] };
  players: string[]; name: (id: string) => string;
  completedBoards?: number; showFinal?: boolean;
};
export function RunWinner({ winners }: { winners: string[] }) {
  return <p className="run-winner">{winners.length > 1 ? "SPLIT" : winners.length === 1 ? `${winners[0]} WIN` : "결과 대기"}</p>;
}
export function RunItTwiceResult({ match, players, name, completedBoards = match.boardWinnerIds.length, showFinal = true }: Props) {
  const summary = runItTwiceSummary(match, players);
  if (!summary) return null;
  const visibleRuns = summary.runs.slice(0, completedBoards);
  const score = players.map((id) => visibleRuns.filter((r) => r.winnerPlayerId === id).length);
  return <section className="run-summary" aria-label="Run It Twice 결과">
    <span className="eyebrow">RUN IT TWICE</span>
    <div className="run-results">{visibleRuns.map((run, i) => <div key={i}><small>RUN {i + 1}</small><b>{run.split ? "SPLIT" : run.winnerPlayerId ? `${name(run.winnerPlayerId)} WIN` : "결과 대기"}</b></div>)}</div>
    <div className="run-score"><span>{name(players[0])}</span><strong>{score[0]} : {score[1]}</strong><span>{name(players[1])}</span></div>
    <small>정규 Run 단독 승리 횟수 · Split은 양쪽 0승</small>
    {completedBoards >= 2 && summary.tied && <div className="run-sudden"><b>SUDDEN DEATH</b><small>런 잇 트와이스 동률</small>
      {summary.suddenDeath.slice(0, Math.max(0, completedBoards - 2)).map((run) => <p key={run.attempt}>#{run.attempt} · {run.split ? "SPLIT · 재대결" : run.winnerPlayerId ? `${name(run.winnerPlayerId)} WIN` : "결과 대기"}</p>)}
    </div>}
    {showFinal && summary.finalWinnerPlayerId && <div className="run-final"><small>MATCH WINNER</small><strong>♔ {name(summary.finalWinnerPlayerId)}</strong><small>{summary.suddenDeath.length ? "Sudden Death 승리" : "정규 Run 승리"}</small></div>}
  </section>;
}
