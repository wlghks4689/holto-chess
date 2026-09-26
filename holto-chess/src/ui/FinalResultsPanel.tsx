import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "../shared/protocol";
import { loadSavedFinalResults, makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";
import { useTranslation } from "../i18n";

export function FinalResultsPanel({ view, onViewed }: { view: PlayerView; onViewed?: () => void }) {
  const { t } = useTranslation();
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
  const [storageError, setStorageError] = useState(false);
  const currentId = `${view.gameId}:${view.me.playerId}`;
  const saved = savedResults.some((result) => result.id === currentId);
  const save = () => {
    try { setSavedResults(saveFinalResult(makeSavedFinalResult(view))); setStorageError(false); }
    catch { setStorageError(true); }
  };
  return <section className="final-panel">
    <div className="final-results-tools"><button className="secondary" type="button" disabled={!view.finalResultsReleased} onClick={save}>{t(!view.finalResultsReleased ? "final.waitingRelease" : saved ? "final.saved" : "final.saveLocal")}</button></div>
    {storageError && <p className="room-error" role="alert">{t("final.storageError")}</p>}
    <div className="standings"><FinalStandingsHeader />{view.standings.map((row) => <FinalStandingRow key={row.playerId} row={row} name={view.players.find((player) => player.playerId === row.playerId)?.name ?? row.playerId} />)}</div>
  </section>;
}
