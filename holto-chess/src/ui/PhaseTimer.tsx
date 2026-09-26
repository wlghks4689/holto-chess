import { countdownUrgency } from "./countdown";
import "./countdown.css";
import { useTranslation } from "../i18n";

export function PhaseTimer({ seconds, ariaLabel, className = "" }: { seconds: number; ariaLabel: string; className?: string }) {
  const { t } = useTranslation();
  const urgency = countdownUrgency(seconds);
  return <div className={`phase-timer is-${urgency} ${className}`.trim()} role="timer" aria-label={ariaLabel} aria-live={urgency === "normal" ? "off" : "polite"}>
    <span>{t("shop.timeLeft")}</span><strong>{seconds}<i>{t("timer.secondsShort")}</i></strong>
  </div>;
}
