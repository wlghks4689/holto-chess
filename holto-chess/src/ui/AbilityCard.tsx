import { useId } from "react";
import { useTranslation } from "../i18n";
import { type AbilityId } from "./abilityCatalog";
import { AbilityArtwork } from "./AbilityArtwork";
import "./abilities.css";

export function AbilityCard({ ability }: { ability: AbilityId }) {
  const { t, locale } = useTranslation();
  const id = useId();
  return <article className="ability-card" data-ability={ability} lang={locale} aria-labelledby={`${id}-name`} aria-describedby={`${id}-description`}>
    <AbilityArtwork ability={ability} />
    <h2 className="ability-card-name" id={`${id}-name`}>{t(`ability.card.${ability}.name`)}</h2>
    <p className="ability-card-description" id={`${id}-description`}>{t(`ability.card.${ability}.description`)}</p>
  </article>;
}
