import { useState } from "react";
import type { FinalStandingView, PlayerView } from "../shared/protocol";
import { loadSavedFinalResults, makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { compactHandName } from "./handLabel";

const display = (value: number) => Number(value.toFixed(2));

function StandingRow({ row, name }: { row: FinalStandingView; name: string }) {
  return <div className={`standing podium-${row.placement} ${row.placement === 1 ? "champion" : ""} ${row.eliminatedRound ? "eliminated" : ""}`}>
    <strong>{row.placement}</strong>
    <span><b>{name}</b>{row.eliminatedRound ? <small>R{row.eliminatedRound} 탈락</small> : null}</span>
    <span>{display(row.points)}<small>승점</small></span>
    <span>{row.handScore}<small>{compactHandName(row.displayName) || "족보 없음"}</small></span>
    <span>{row.stackScore}<small>{display(row.stackBB)}BB</small></span>
    <em>{display(row.total)} P</em>
    <i className={`rank-point ${row.rankPoints > 0 ? "positive" : row.rankPoints < 0 ? "negative" : ""}`}>{row.rankPoints > 0 ? "+" : ""}{row.rankPoints}<small>RANK</small></i>
  </div>;
}

export function FinalResultsPanel({ view }: { view: PlayerView }) {
  const [savedResults, setSavedResults] = useState(loadSavedFinalResults);
  const [storageError, setStorageError] = useState("");
  const currentId = `${view.gameId}:${view.me.playerId}`;
  const saved = savedResults.some((result) => result.id === currentId);
  const save = () => {
    try { setSavedResults(saveFinalResult(makeSavedFinalResult(view))); setStorageError(""); }
    catch { setStorageError("브라우저 저장 공간을 사용할 수 없습니다."); }
  };
  return <section className="panel final-panel">
    <header className="final-panel-head"><div><h2>최종 결과</h2><p className="formula">누적 승점 + 족보 점수 + ⌊BB ÷ 10⌋ · 탈락자는 탈락 시점 기준</p></div><button className="secondary" type="button" onClick={save}>{saved ? "이 기기에 저장됨 ✓" : "이 기기에 결과 저장"}</button></header>
    {storageError && <p className="room-error" role="alert">{storageError}</p>}
    <div className="standings">{view.standings.map((row) => <StandingRow key={row.playerId} row={row} name={view.players.find((player) => player.playerId === row.playerId)?.name ?? row.playerId} />)}</div>
  </section>;
}
