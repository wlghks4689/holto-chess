import { BALANCE } from "../game/config";
import { useTranslation } from "../i18n";
import "./r2-briefing.css";

/**
 * R2 BEST FIVE briefing, between the draft and the match loading screen: the rules only, never cards,
 * opponents or pairings. It ends when every connected person confirms or the server timer runs out.
 */
export function R2Briefing({ seconds, ready, total, confirmed, disabled, onConfirm }: {
  seconds: number | null; ready: number; total: number; confirmed: boolean; disabled: boolean; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { win, split, sweepBonus } = BALANCE.points.r2Run;
  const steps = [
    t("r2Brief.allCards"),
    t("r2Brief.boards"),
    t("r2Brief.points", { win, split }),
    t("r2Brief.sweep", { bonus: sweepBonus }),
    t("r2Brief.matches"),
  ];
  return <section className="r2-briefing" aria-labelledby="r2-briefing-title">
    <header><small>{t("r2Brief.kicker")}</small><h2 id="r2-briefing-title">{t("r2Brief.title")}</h2></header>
    <ol>{steps.map((step, index) => <li key={index}><i>{index + 1}</i><span>{step}</span></li>)}</ol>
    <footer>
      <div className="r2-briefing-status" aria-live="polite">
        {seconds !== null && <p>{t("r2Brief.startsIn")} <strong className="r2-briefing-countdown">{seconds}</strong>{t("r2Brief.secondsUnit")}</p>}
        <p className="r2-briefing-ready">{t("r2Brief.confirmed", { ready, total })}</p>
      </div>
      <button type="button" className="primary" disabled={disabled || confirmed} onClick={onConfirm}>{t(confirmed ? "r2Brief.confirmDone" : "r2Brief.confirm")}</button>
    </footer>
  </section>;
}
