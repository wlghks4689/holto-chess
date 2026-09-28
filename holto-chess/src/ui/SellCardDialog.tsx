import { useEffect, useRef } from "react";
import { rankDisplay, SUIT_SYMBOL, type Card } from "../core/poker/cards";
import { useTranslation } from "../i18n";

export function SellCardDialog({ card, refund, sellPercent, onCancel, onConfirm }: {
  card: Card; refund: number; sellPercent: number; onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  const cardName = `${rankDisplay(card.rank)}${SUIT_SYMBOL[card.suit]}`;

  return <dialog ref={dialog} className="sell-confirm-dialog" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <p>{t("shop.sellConfirm", { card: cardName })}</p>
    <p className="sell-confirm-detail">{t("shop.sellRefund", { refund, percent: sellPercent })}</p>
    <div className="sell-confirm-actions">
      <button type="button" className="primary" onClick={onConfirm}>{t("shop.sellYes")}</button>
      <button type="button" className="secondary" onClick={onCancel}>{t("shop.sellNo")}</button>
    </div>
  </dialog>;
}
