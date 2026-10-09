import { tierFor } from "../game/rank";
import { navigate } from "../legal/legalRoute";
import { useTranslation } from "../i18n";
import type { RankStateView } from "../shared/protocol";
import "./ranking.css";

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

/** Server-settled RP for this game. Until the account DB confirms it, it says so instead of guessing. */
export function RankResultCard({ rank }: { rank: RankStateView }) {
  const { t } = useTranslation();
  const result = rank.result;
  if (!result) return <section className="panel rank-result is-pending" aria-live="polite">
    <span className="eyebrow">RANKED</span><h2>{t("rank.pending")}</h2><p>{t("rank.pendingHint")}</p>
  </section>;
  const before = tierFor(result.before), after = tierFor(result.after);
  const change = result.after - result.before;
  const parts: [string, number][] = result.forfeited ? [[t("rank.forfeitPart"), result.base]]
    : [[t("rank.placementPart", { placement: result.placement }), result.base], [t("rank.scorePart"), result.scoreBonus], [t("rank.humanPart"), result.humanBonus]];
  return <section className={`panel rank-result ${change >= 0 ? "is-gain" : "is-loss"}`} aria-live="polite">
    <header><div><span className="eyebrow">RANKED · {t("ranking.season", { season: result.seasonId })}</span><h2>{t("rank.resultTitle")}</h2></div>
      <strong className="rank-result-delta">{signed(change)} RP</strong></header>
    <p className="rank-result-points"><span>{result.before}</span><i aria-hidden="true">→</i><b>{result.after}</b> RP · {t(`tier.${after}`)}</p>
    {before !== after && <p className="rank-result-tier">{t(result.after > result.before ? "rank.promoted" : "rank.demoted", { tier: t(`tier.${after}`) })}</p>}
    <dl>{parts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{signed(value)}</dd></div>)}</dl>
    {change !== result.delta && <p className="rank-result-note">{t("rank.floorNote")}</p>}
    <button type="button" className="secondary" onClick={() => navigate("/ranking")}>{t("rank.viewRanking")}</button>
  </section>;
}
