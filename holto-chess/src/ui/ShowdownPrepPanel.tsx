import { PhaseTimer } from "./PhaseTimer";
import "./showdown-prep.css";

export function ShowdownPrepPanel({ round, playerName, seconds, secondary = false }: {
  round: number; playerName: string; seconds: number | null; secondary?: boolean;
}) {
  const avatar = [...playerName][0] ?? "P";
  return <section className="showdown-prep panel" aria-label="쇼다운 매치업 동기화 중">
    <header className="showdown-prep-heading">
      <div><small>ROUND {String(round).padStart(2, "0")} · {secondary ? "SECOND MATCH" : "MATCH SETUP"}</small><h2>매치업 동기화 중</h2></div>
      {seconds !== null && <PhaseTimer className="showdown-prep-clock" seconds={seconds} ariaLabel={`쇼다운 시작까지 ${seconds}초`} />}
    </header>
    <div className="showdown-prep-stage" aria-hidden="true">
      <article className="showdown-prep-player is-viewer"><span>{avatar}</span><small>PLAYER</small><b>{playerName}</b><i>READY</i></article>
      <strong className="showdown-prep-vs">VS</strong>
      <article className="showdown-prep-player is-opponent"><span>?</span><small>OPPONENT</small><b>상대 매칭 중</b><i>SYNC</i></article>
    </div>
    <div className="showdown-prep-status" role="status">
      <span aria-hidden="true"><i /><i /><i /></span>
      <p>다음 상대와 쇼다운 화면을 동기화하고 있습니다.<br />준비가 끝나면 자동으로 시작합니다.</p>
    </div>
  </section>;
}
