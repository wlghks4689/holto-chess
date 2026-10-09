import { useEffect } from "react";
import "./exit-dialog.css";
import { useTranslation, type TranslationKey } from "../i18n";

/**
 * Leaving means different things, so the copy says what actually happens:
 * - single: a local practice game is discarded (no RP).
 * - multi: a guest seat keeps playing through the bot and can be taken back from the lobby.
 * - forfeit: a live ranked seat is fixed at 8th (-8 RP) by the server, permanently for this game.
 * - settled: a ranked seat whose placement is already fixed leaves with no extra penalty.
 * - reconnecting: the server cannot confirm a forfeit yet; going home keeps the seat.
 */
export type ExitVariant = "single" | "multi" | "forfeit" | "settled" | "reconnecting";
const COPY: Record<ExitVariant, { eyebrow: string; title: TranslationKey; body: TranslationKey; hint: TranslationKey; confirm: TranslationKey; cancel: TranslationKey }> = {
  single: { eyebrow: "LEAVE GAME", title: "exit.title", body: "exit.singleDescription", hint: "exit.singleHint", confirm: "exit.leave", cancel: "exit.keepPlaying" },
  multi: { eyebrow: "LEAVE MATCH", title: "exit.title", body: "exit.multiDescription", hint: "exit.multiHint", confirm: "exit.leaveToAi", cancel: "exit.keepPlaying" },
  forfeit: { eyebrow: "RANKED FORFEIT", title: "exit.forfeitTitle", body: "exit.forfeitDescription", hint: "exit.forfeitHint", confirm: "exit.forfeitConfirm", cancel: "exit.forfeitCancel" },
  settled: { eyebrow: "LEAVE MATCH", title: "exit.title", body: "exit.settledDescription", hint: "exit.settledHint", confirm: "exit.leave", cancel: "exit.keepWatching" },
  reconnecting: { eyebrow: "RECONNECTING", title: "exit.reconnectingTitle", body: "exit.reconnectingDescription", hint: "exit.reconnectingHint", confirm: "exit.homeKeepSeat", cancel: "exit.keepWaiting" },
};

export function ExitGameDialog({ mode, busy = false, onCancel, onConfirm }: {
  mode: ExitVariant; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const copy = COPY[mode];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return <div className="exit-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title" onClick={busy ? undefined : onCancel}>
    <section className={`exit-dialog panel is-${mode}`} onClick={(event) => event.stopPropagation()}>
      <span className="eyebrow">{copy.eyebrow}</span>
      <h2 id="exit-dialog-title">{t(copy.title)}</h2>
      <p>{t(copy.body)}</p><p className="exit-dialog-hint">{t(copy.hint)}</p>
      <div className="exit-dialog-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy} autoFocus>{t(copy.cancel)}</button>
        <button type="button" className={mode === "forfeit" ? "primary danger" : "primary"} onClick={onConfirm} disabled={busy}>{t(busy ? "exit.leaving" : copy.confirm)}</button>
      </div>
    </section>
  </div>;
}
