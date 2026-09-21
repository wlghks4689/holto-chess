import { useState } from "react";
import type { PlayerView } from "../shared/protocol";
import { loadSavedFinalResults, makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { FinalStandingRow } from "./FinalStandingRow";

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
    <div className="standings">{view.standings.map((row) => <FinalStandingRow key={row.playerId} row={row} name={view.players.find((player) => player.playerId === row.playerId)?.name ?? row.playerId} />)}</div>
  </section>;
}
