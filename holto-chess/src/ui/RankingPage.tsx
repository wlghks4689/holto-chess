import { useEffect, useState } from "react";
import { TIERS, type TierId } from "../game/rank";
import { useTranslation } from "../i18n";
import { ArenaBrand } from "./ArenaBrand";
import "./ranking.css";

type Season = { id: number; startsAt: number; endsAt: number };
type Entry = { rank: number; displayName: string; points: number; tier: TierId; games: number; wins: number };
type Board = { season: Season; total: number; page: number; pageCount: number; podium: Entry[]; entries: Entry[] };
type Me = { authenticated: false; season: Season } | { authenticated: true; season: Season; points: number; tier: TierId; rank: number | null; games: number; wins: number };

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return await response.json() as T;
}

/** Current season leaderboard; anyone may read it, only the signed-in account sees its own rank. */
export function RankingPage({ onBack }: { onBack: () => void }) {
  const { t, locale } = useTranslation();
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<Board | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([getJson<Board>(`/api/rankings?page=${page}`), page === 1 ? getJson<Me>("/api/rankings/me").catch(() => null) : Promise.resolve(undefined)])
      .then(([nextBoard, nextMe]) => { if (!live) return; setBoard(nextBoard); if (nextMe !== undefined) setMe(nextMe); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [page, attempt]);
  const season = board?.season ?? me?.season;
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(ms);
  const name = (tier: TierId) => t(`tier.${tier}`);
  const podium = board?.podium ?? [];
  return <main className="ranking-page">
    <nav className="ranking-nav"><button type="button" className="brand brand-home" onClick={onBack} aria-label={t("ranking.back")}><ArenaBrand /></button>
      <button type="button" className="secondary" onClick={onBack}>{t("ranking.back")}</button></nav>
    <header className="ranking-header">
      <span className="eyebrow">PORENA · SEASON RANKING</span><h1>{t("ranking.title")}</h1>
      {season && <p>{t("ranking.season", { season: season.id })} · {t("ranking.endsAt", { date: date(season.endsAt - 1) })}</p>}
    </header>
    {failed && <section className="panel ranking-error" role="alert"><p>{t("ranking.unavailable")}</p><button type="button" className="secondary" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>{t("ranking.retry")}</button></section>}
    {me && <section className="panel ranking-me" aria-label={t("ranking.me")}>
      <span className="eyebrow">{t("ranking.me")}</span>
      {me.authenticated ? <div className="ranking-me-row">
        <strong>{me.points} RP</strong><span className={`tier-chip tier-${me.tier}`}>{name(me.tier)}</span>
        <b>{me.rank ? t("ranking.myRank", { rank: me.rank }) : t("ranking.noRecord")}</b>
        {me.games > 0 && <small>{t("ranking.games", { games: me.games, wins: me.wins })}</small>}
      </div> : <p>{t("ranking.loginPrompt")}</p>}
    </section>}
    {board && page === 1 && <section className="ranking-podium" aria-label={t("ranking.podium")}>
      <h2>{t("ranking.podium")}</h2>
      {podium.length ? <ol>{podium.map((entry) => <li key={entry.rank} className={`podium-place place-${entry.rank}`}>
        <span className="podium-rank">{entry.rank}</span><b>{entry.displayName}</b>
        <span className={`tier-chip tier-${entry.tier}`}>{name(entry.tier)}</span><strong>{entry.points} RP</strong>
        <small>{t("ranking.games", { games: entry.games, wins: entry.wins })}</small>
      </li>)}</ol> : <p className="ranking-empty">{t("ranking.empty")}</p>}
    </section>}
    {board && board.total > 3 && <section className="panel ranking-list" aria-label={t("ranking.list")}>
      <h2>{t("ranking.list")}</h2>
      <table><thead><tr><th scope="col">{t("ranking.colRank")}</th><th scope="col">{t("ranking.colName")}</th><th scope="col">{t("ranking.colTier")}</th><th scope="col">{t("ranking.colRp")}</th></tr></thead>
        <tbody>{board.entries.map((entry) => <tr key={entry.rank}><td>{entry.rank}</td><td>{entry.displayName}</td><td><span className={`tier-chip tier-${entry.tier}`}>{name(entry.tier)}</span></td><td>{entry.points}</td></tr>)}</tbody></table>
      {board.pageCount > 1 && <div className="ranking-pages">
        <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>{t("ranking.prev")}</button>
        <span>{t("ranking.page", { page, pages: board.pageCount })}</span>
        <button type="button" className="secondary" disabled={page >= board.pageCount} onClick={() => setPage((n) => n + 1)}>{t("ranking.next")}</button>
      </div>}
    </section>}
    <section className="ranking-guide">
      <div className="panel"><h2>{t("ranking.tiers")}</h2><ul className="ranking-tiers">{TIERS.map((tier, i) => <li key={tier.id}>
        <span className={`tier-chip tier-${tier.id}`}>{name(tier.id)}</span><span>{tier.min}{TIERS[i + 1] ? `–${TIERS[i + 1]!.min - 1}` : "+"} RP</span></li>)}</ul></div>
      <div className="panel"><h2>{t("ranking.rules")}</h2><ul className="ranking-rules">
        {(["ranking.rulesPlacement", "ranking.rulesScore", "ranking.rulesHuman", "ranking.rulesForfeit", "ranking.rulesSeason", "ranking.rulesGuest"] as const).map((key) => <li key={key}>{t(key)}</li>)}
      </ul></div>
    </section>
  </main>;
}

