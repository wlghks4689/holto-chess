import { isSurvivalParticipant } from "./survivalReadyPresentation";
import { useTranslation } from "../i18n";

type Props = {
  playerIds: string[];
  eliminateCount: number;
  viewerId: string;
  name: (playerId: string) => string;
};

export function SurvivalReadyPanel({ playerIds, eliminateCount, viewerId, name }: Props) {
  const { t } = useTranslation();
  const participant = isSurvivalParticipant(playerIds, viewerId);
  return <section className="panel transition-panel survival-ready-panel" aria-label={t("survival.noticeAria")}>
    <h2>{t("survival.tiebreakMessage")}</h2>
    <p>{playerIds.map(name).join(" · ")}</p>
    <strong>{t("survival.outcomeCount", { survived: playerIds.length - eliminateCount, eliminated: eliminateCount })}</strong>
    {!participant && <p>{t("survival.spectatorHelp")}</p>}
  </section>;
}
