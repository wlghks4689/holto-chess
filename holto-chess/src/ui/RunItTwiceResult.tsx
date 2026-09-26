import { useTranslation } from "../i18n";

export function RunWinner({ winners }: { winners: string[] }) {
  const { t } = useTranslation();
  return <p className="run-winner">{winners.length > 1 ? t("match.split") : winners.length === 1 ? t("match.winner", { player: winners[0]! }) : t("match.awaitResult")}</p>;
}
