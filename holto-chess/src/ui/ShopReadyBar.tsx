import { useTranslation } from "../i18n";
import { ShopCountdown } from "./ShopCountdown";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";

export function ShopReadyBar({ ready, total, committed, disabled, endsAt, now, onToggle }: {
  ready: number; total: number; committed: boolean; disabled: boolean;
  endsAt?: number; now: number; onToggle: () => void;
}) {
  const { t } = useTranslation();
  return <div className="action-bar shop-ready-bar">
    <div className="shop-ready-copy" aria-live="polite"><p>{t("online.readyWarning", { ready, total })}</p></div>
    {endsAt !== undefined && <ShopCountdown endsAt={endsAt} totalMs={BARRIER_TIMEOUT_MS.SHOP} now={now} committed={committed} />}
    <button className={committed ? "secondary" : "primary"} disabled={disabled} onClick={onToggle}>{t(committed ? "online.cancelReady" : "online.confirmReady")}</button>
  </div>;
}
