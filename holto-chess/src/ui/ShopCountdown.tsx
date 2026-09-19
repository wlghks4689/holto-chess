import type { CSSProperties } from "react";
import { countdownUrgency, formatCountdown, secondsUntil } from "./countdown";
import "./countdown.css";

/**
 * Shop deadline shown next to the ready button. When it runs out the server lets the bot finish
 * the seats that have not committed, so the copy says so while the player can still act.
 */
export function ShopCountdown({ endsAt, totalMs, now, committed }: { endsAt: number; totalMs: number; now: number; committed: boolean }) {
  const seconds = secondsUntil(endsAt, now);
  const urgency = countdownUrgency(seconds);
  const ratio = Math.min(1, Math.max(0, (endsAt - now) / totalMs));
  return <div className={`shop-countdown is-${urgency}`} role="timer" aria-live={urgency === "normal" ? "off" : "polite"}
    aria-label={`${committed ? "다른 플레이어 상점 종료까지" : "상점 종료까지"} ${seconds}초`} style={{ "--countdown-ratio": ratio } as CSSProperties}>
    <small>{committed ? "다른 플레이어 상점 종료까지" : "상점 종료까지"}</small>
    <strong>{formatCountdown(seconds)}</strong>
    <i className="shop-countdown-bar" aria-hidden="true"><b /></i>
    {!committed && <em>0초가 되면 AI가 자동 확정합니다</em>}
  </div>;
}
