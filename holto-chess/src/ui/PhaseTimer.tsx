import { countdownUrgency } from "./countdown";
import "./countdown.css";

export function PhaseTimer({ seconds, ariaLabel, className = "" }: { seconds: number; ariaLabel: string; className?: string }) {
  const urgency = countdownUrgency(seconds);
  return <div className={`phase-timer is-${urgency} ${className}`.trim()} role="timer" aria-label={ariaLabel} aria-live={urgency === "normal" ? "off" : "polite"}>
    <span>남은 시간</span><strong>{seconds}<i>초</i></strong>
  </div>;
}
