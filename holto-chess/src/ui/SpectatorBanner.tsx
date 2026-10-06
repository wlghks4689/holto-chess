import { useTranslation } from "../i18n";

/** Eliminated seats pick which survivor to follow; stays outside the cinematic so it is always reachable. */
export function SpectatorBanner({ candidates, activeId, onPick, onClose }: {
  candidates: { playerId: string; name: string }[]; activeId: string | null;
  onPick: (playerId: string) => void;
  /** Only while a player was picked by hand; the automatic follow has nothing to close. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  return <section className="spectator-banner" role="status">
    <div><span>{t("spectator.title")}</span></div>
    <div className="spectator-picker">
      <select aria-label={t("spectator.choosePlayer")} value={activeId ?? candidates[0]?.playerId ?? ""} disabled={!candidates.length} onChange={event => onPick(event.target.value)}>
        {candidates.map(candidate => <option key={candidate.playerId} value={candidate.playerId}>{candidate.name}</option>)}
      </select>
      {onClose && <button type="button" className="spectator-close" onClick={onClose}>{t("spectator.close")}</button>}
    </div>
  </section>;
}
