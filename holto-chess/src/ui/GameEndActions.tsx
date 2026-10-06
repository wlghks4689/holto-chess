import { useTranslation } from "../i18n";

export function GameEndActions({ onStart, onHome, disabled = false, startLabel }: {
  onStart: () => void; onHome: () => void; disabled?: boolean; startLabel?: string;
}) {
  const { t } = useTranslation();
  return <div className="final-exit-actions">
    <button className="primary" disabled={disabled} onClick={onStart}>{startLabel ?? t("action.startNewGame")}</button>
    <button className="secondary" type="button" onClick={onHome}>{t("action.home")}</button>
  </div>;
}
