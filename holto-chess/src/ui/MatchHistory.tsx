import { loadSavedFinalResults } from "./finalResultArchive";
import { OnlineEntryFrame } from "./OnlineEntryFrame";
import { useTranslation } from "../i18n";
import { compactHandName } from "./handLabel";

const display = (value: number) => Number(value.toFixed(2));

export function MatchHistoryPage({ onBack }: { onBack: () => void }) {
  const { t, locale } = useTranslation();
  const results = loadSavedFinalResults();
  return <OnlineEntryFrame title={t("online.matchHistory")} eyebrow="MATCH HISTORY">
    <p className="entry-description">{t("history.description")}</p>
    {results.length ? <div className="match-history-list">{results.map((result) => {
      const mine = result.standings.find((row) => row.playerId === result.viewerId);
      return <article className="match-history-card" key={result.id}>
        <header><div><b>{new Date(result.savedAt).toLocaleString(locale)}</b><small>ROOM {result.roomId}</small></div><strong>{mine ? t("history.placementTotal", { place: mine.placement, total: display(mine.total) }) : t("history.finalResult")}</strong></header>
        <ol>{result.standings.map((row) => <li className={row.playerId === result.viewerId ? "is-me" : ""} key={row.playerId}><b>{row.placement}</b><span>{row.name}<small>{t("history.handAndStack", { hand: row.handName ? compactHandName(row.handName, t) : t("final.noHand"), stack: display(row.stackBB) })}</small></span><em>{display(row.total)}P</em></li>)}</ol>
      </article>;
    })}</div> : <section className="match-history-empty"><b>{t("history.empty")}</b><p>{t("history.emptyHelp")}</p></section>}
    <button className="entry-back" type="button" onClick={onBack}>{t("history.backToLobby")}</button>
  </OnlineEntryFrame>;
}
