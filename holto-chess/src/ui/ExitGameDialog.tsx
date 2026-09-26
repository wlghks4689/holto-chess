import "./exit-dialog.css";
import { useTranslation } from "../i18n";

/**
 * Leaving means different things per mode, so the copy says what actually happens: a single game is
 * discarded, while a multiplayer seat keeps playing through the bot and can be taken back by
 * reconnecting from the lobby.
 */
export function ExitGameDialog({ mode, busy = false, onCancel, onConfirm }: {
  mode: "single" | "multi"; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const multi = mode === "multi";
  return <div className="exit-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title" onClick={onCancel}>
    <section className="exit-dialog panel" onClick={(event) => event.stopPropagation()}>
      <span className="eyebrow">{multi ? "LEAVE MATCH" : "LEAVE GAME"}</span>
      <h2 id="exit-dialog-title">{t("exit.title")}</h2>
      {multi
        ? <><p>{t("exit.multiDescription")}</p><p className="exit-dialog-hint">{t("exit.multiHint")}</p></>
        : <><p>{t("exit.singleDescription")}</p><p className="exit-dialog-hint">{t("exit.singleHint")}</p></>}
      <div className="exit-dialog-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>{t("exit.keepPlaying")}</button>
        <button type="button" className="primary" onClick={onConfirm} disabled={busy}>{t(busy ? "exit.leaving" : multi ? "exit.leaveToAi" : "exit.leave")}</button>
      </div>
    </section>
  </div>;
}
