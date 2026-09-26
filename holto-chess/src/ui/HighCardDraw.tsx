import type { HighCardDraw } from "../game/types";
import { useTranslation } from "../i18n";

const rankLabel = (rank: number) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] ?? String(rank);

export function HighCardDrawResult({ draw, name, survival }: {
  draw: HighCardDraw; name: (id: string) => string; survival: boolean;
}) {
  const { t } = useTranslation();
  return <section className="high-card-result" aria-label={t("highCard.resultAria")}>
    <h3>{t("highCard.title")}</h3>
    <div className="high-card-players">{draw.draws.map((entry) => <div key={entry.playerId} className={(draw.survivorIds ?? [draw.winnerId]).includes(entry.playerId) ? "draw-winner" : ""}>
      <b>{name(entry.playerId)}</b><strong>{rankLabel(entry.rank)}</strong>
      <span>{t((draw.survivorIds ?? [draw.winnerId]).includes(entry.playerId) ? survival ? "highCard.survived" : "highCard.won" : survival ? "highCard.eliminated" : "highCard.lost")}</span>
    </div>)}</div>
    <p>{t(survival ? "highCard.survivalOutcome" : "highCard.winOutcome", { players: (draw.survivorIds ?? [draw.winnerId]).map(name).join(", ") })}</p>
  </section>;
}

export function HighCardDrawNotice({ survival, seconds, surviveCount = 1 }: { survival: boolean; seconds: number; surviveCount?: number }) {
  const { t } = useTranslation();
  return <div className="high-card-backdrop"><section className="high-card-notice" role="alertdialog" aria-modal="true" aria-labelledby="high-card-title" aria-describedby="high-card-rules">
    <small>{t("highCard.tieLimit")}</small>
    <h2 id="high-card-title">{t("highCard.title")}</h2>
    <div id="high-card-rules"><p>{t("highCard.drawRule")}</p>
      <strong>{t(survival ? "highCard.survivalRule" : "highCard.winRule", { count: surviveCount })}</strong>
      <p>{t("highCard.rankRule")}</p>
    </div><b role="timer">{t("highCard.autoReveal", { seconds })}</b>
  </section></div>;
}
