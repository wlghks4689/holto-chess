import { loadSavedFinalResults } from "./finalResultArchive";
import { OnlineEntryFrame } from "./OnlineEntryFrame";

const display = (value: number) => Number(value.toFixed(2));

export function MatchHistoryPage({ onBack }: { onBack: () => void }) {
  const results = loadSavedFinalResults();
  return <OnlineEntryFrame title="대전 기록" eyebrow="MATCH HISTORY">
    <p className="entry-description">이 기기에서 완료한 최근 경기입니다. 최대 20경기까지 저장됩니다.</p>
    {results.length ? <div className="match-history-list">{results.map((result) => {
      const mine = result.standings.find((row) => row.playerId === result.viewerId);
      return <article className="match-history-card" key={result.id}>
        <header><div><b>{new Date(result.savedAt).toLocaleString("ko-KR")}</b><small>ROOM {result.roomId}</small></div><strong>{mine ? `${mine.placement}위 · ${display(mine.total)}P` : "최종 결과"}</strong></header>
        <ol>{result.standings.map((row) => <li className={row.playerId === result.viewerId ? "is-me" : ""} key={row.playerId}><b>{row.placement}</b><span>{row.name}<small>{row.handName || "족보 없음"} · 최종 {display(row.stackBB)}BB</small></span><em>{display(row.total)}P</em></li>)}</ol>
      </article>;
    })}</div> : <section className="match-history-empty"><b>저장된 대전 기록이 없습니다</b><p>멀티플레이 경기가 끝나면 최종 결과가 이 기기에 자동으로 저장됩니다.</p></section>}
    <button className="entry-back" type="button" onClick={onBack}>← 멀티플레이 로비</button>
  </OnlineEntryFrame>;
}
