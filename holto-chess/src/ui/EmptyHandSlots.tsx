import { useTranslation } from "../i18n";

export function EmptyHandSlots({ count, limit }: { count: number; limit: number }) {
  const { t } = useTranslation();
  return <>{Array.from({ length: Math.max(0, limit - count) }, (_, index) => <div className="empty-card inventory-empty-slot" key={count + index} aria-label={t("card.emptySlotAria", { slot: count + index + 1, limit })}><span>＋</span><small>{t("card.emptySlot")}</small></div>)}</>;
}
