import { secondsUntil } from "./countdown";
import { PhaseTimer } from "./PhaseTimer";
import { useTranslation } from "../i18n";

/**
 * Shop deadline shown next to the ready button. When it runs out the server lets the bot finish
 * the seats that have not committed, so the copy says so while the player can still act.
 */
export function ShopCountdown({ endsAt, now, committed }: { endsAt: number; totalMs: number; now: number; committed: boolean }) {
  const { t } = useTranslation();
  const seconds = secondsUntil(endsAt, now);
  return <PhaseTimer className="shop-countdown" seconds={seconds} ariaLabel={t(committed ? "shop.othersCloseTimer" : "shop.closeTimer", { seconds })} />;
}
