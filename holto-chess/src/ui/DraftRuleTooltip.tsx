import { useTranslation } from "../i18n";

export function DraftRuleTooltip({ round }: { round: number }) {
  const { t } = useTranslation();
  const flow = t(round === 2 ? "draft.r2Flow" : "draft.r4Flow");
  return <details className="draft-help">
    <summary aria-label={t("draft.helpAria")}>?</summary>
    <div className="draft-help-popover" role="tooltip">
      <strong>{t("draft.pickOrder")}</strong>
      <p>{t("draft.orderRule")}</p>
      <strong>{t("draft.flow")}</strong>
      <p>{flow}</p>
      <small>{t("draft.autoPickRule")}</small>
    </div>
  </details>;
}
