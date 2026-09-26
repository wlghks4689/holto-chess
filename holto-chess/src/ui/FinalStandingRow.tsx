import { useId, useState } from "react";
import { cardLabel } from "../core/poker/cards";
import type { FinalStandingView } from "../shared/protocol";
import { compactHandName } from "./handLabel";
import { madeTone } from "./madeTone";
import { useTranslation } from "../i18n";
import "./final-standings.css";

const display = (value: number) => Number(value.toFixed(2));
const ordinal = (value: number, locale: string) => {
  if (locale === "ko-KR") return String(value);
  const rule = new Intl.PluralRules("en-US", { type: "ordinal" }).select(value);
  return `${value}${rule === "one" ? "st" : rule === "two" ? "nd" : rule === "few" ? "rd" : "th"}`;
};

export function FinalStandingsHeader() {
  const { t } = useTranslation();
  return <div className="final-standings-head" aria-hidden="true"><span>{t("final.rank")}</span><span>{t("final.nickname")}</span><span>BEST 5</span><span>{t("final.cumulativePoints")}</span><span>{t("final.handScore")}</span><span>{t("final.stack")}</span><span>{t("final.total")}</span><span>{t("final.rankPoints")}</span></div>;
}

export function FinalStandingRow({ row, name }: { row: FinalStandingView; name: string }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useTranslation();
  const popupId = useId();
  const concealed = row.placement > 4 && row.eliminatedRound !== undefined;
  return <div className={`standing final-standing podium-${row.placement}`}>
    <div className="final-rank-panel"><span className="final-rank-ornament" aria-hidden="true">{row.placement === 1 ? "♛" : row.placement <= 3 ? "✦" : ""}</span><strong>{row.placement}<small>{locale === "ko-KR" ? t("final.placeSuffix") : ordinal(row.placement, locale).slice(String(row.placement).length)}</small></strong></div>
    <div className="final-player-name"><b>{name}</b></div>
    <div className={`final-hand made-${madeTone(row.displayName)}`} aria-label={t("final.lastHandAria", { name })}>
      {(row.cards ?? []).map((card) => {
        if (concealed) return <span key={card.id} className="final-mini-card is-card-back" aria-label={t("final.hiddenCard")}><i aria-hidden="true">◇</i></span>;
        const label = cardLabel(card);
        const best = row.usedCardIds?.includes(card.id);
        return <span key={card.id} aria-label={`${label}${best ? ` ${row.usedCardIds!.length >= 5 ? "BEST 5" : t("final.handUsed")}` : ""}`} className={`final-mini-card ${card.suit === "h" || card.suit === "d" ? "red" : ""} ${best ? "is-best" : "is-unused"}`}><b>{label.slice(0, -1)}</b><i>{label.slice(-1)}</i></span>;
      })}
    </div>
    <span className="final-score-part">{display(row.points)}</span>
    <span className="final-score-part">{row.handScore}</span>
    <span className="final-score-part">{row.stackScore}</span>
    <div className="final-total" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button type="button" aria-label={t("final.totalScoreAria", { name, total: display(row.total) })} aria-expanded={open} aria-controls={popupId} onClick={() => setOpen((current) => !current)}>{display(row.total)}<span className="final-total-info" aria-hidden="true">ⓘ</span></button>
      <div id={popupId} className="final-score-popover" hidden={!open} role="region" aria-label={t("final.scoreDetails")}>
        <b>{t("final.scoreCalculation")}</b><span>{t("final.cumulativePoints")} <strong>{display(row.points)}P</strong></span><span>{t("final.handScore")} <strong>{row.handScore}P</strong></span><small>{compactHandName(row.displayName, t) || t("final.noHand")}</small><span>{t("final.bbScore")} <strong>{row.stackScore}P</strong></span><small>{display(row.stackBB)}BB ÷ 10 · {t("final.roundDown")}</small><hr /><span>{t("final.total")} <strong>{display(row.total)}P</strong></span>
      </div>
    </div>
    <i className={`rank-point ${row.rankPoints > 0 ? "positive" : row.rankPoints < 0 ? "negative" : ""}`}>{row.rankPoints > 0 ? "+" : ""}{row.rankPoints}</i>
  </div>;
}
