import { useTranslation } from "../i18n";

/** Eliminated seats pick which survivor to follow; stays outside the cinematic so it is always reachable. */
export function SpectatorBanner({ candidates, activeId, onPick, onClose }: {
  candidates: { playerId: string; name: string }[]; activeId: string | null;
  onPick: (playerId: string) => void;
  /** Only while a player was picked by hand; the automatic follow has nothing to close. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const active = candidates.find((candidate) => candidate.playerId === activeId);
  return <section className="spectator-banner" role="status">
    <div><span>{t("spectator.title")}</span><b>{active?.name ?? ""}</b><small>{t("spectator.readOnly")}</small></div>
    <div className="spectator-picker" role="group" aria-label={t("spectator.choosePlayer")}>
      {candidates.map((candidate) => <button key={candidate.playerId} type="button" className={candidate.playerId === activeId ? "active" : ""}
        aria-pressed={candidate.playerId === activeId} onClick={() => onPick(candidate.playerId)}>{candidate.name}</button>)}
      {onClose && <button type="button" className="spectator-close" onClick={onClose}>{t("spectator.close")}</button>}
    </div>
  </section>;
}
