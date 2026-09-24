import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "../shared/protocol";
import { loadSavedFinalResults, makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";

export function FinalResultsPanel({ view, onViewed }: { view: PlayerView; onViewed?: () => void }) {
  const notify = useRef(onViewed);
  useEffect(() => { notify.current = onViewed; }, [onViewed]);
  useEffect(() => {
    if (!view.standings.length) return;
    const visible = () => { if (!document.hidden) notify.current?.(); };
    visible();
    const timer = setInterval(visible, 1000);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [view.gameId, view.standings.length]);
  const [savedResults, setSavedResults] = useState(loadSavedFinalResults);
  const [storageError, setStorageError] = useState("");
  const currentId = `${view.gameId}:${view.me.playerId}`;
  const saved = savedResults.some((result) => result.id === currentId);
  const save = () => {
    try { setSavedResults(saveFinalResult(makeSavedFinalResult(view))); setStorageError(""); }
    catch { setStorageError("브라우저 저장 공간을 사용할 수 없습니다."); }
  };
  return <section className="final-panel">
    <div className="final-results-tools"><button className="secondary" type="button" disabled={!view.finalResultsReleased} onClick={save}>{!view.finalResultsReleased ? "최종 순위표 공개 확인 중" : saved ? "이 기기에 저장됨 ✓" : "이 기기에 결과 저장"}</button></div>
    {storageError && <p className="room-error" role="alert">{storageError}</p>}
    <div className="standings"><FinalStandingsHeader />{view.standings.map((row) => <FinalStandingRow key={row.playerId} row={row} name={view.players.find((player) => player.playerId === row.playerId)?.name ?? row.playerId} />)}</div>
  </section>;
}
