import { useId } from "react";
import { useTranslation } from "../i18n";
import { ABILITY_CARDS, type AbilityId } from "./abilityCatalog";
import "./abilities.css";

export function AbilityCard({ ability }: { ability: AbilityId }) {
  const { t, locale } = useTranslation();
  const id = useId();
  return <article className="ability-card" data-ability={ability} lang={locale} aria-labelledby={`${id}-name`} aria-describedby={`${id}-description`}>
    <img className="ability-card-icon" src={`/assets/abilities/${ABILITY_CARDS[ability]}`} alt="" draggable={false} />
    <h2 className="ability-card-name" id={`${id}-name`}>{t(`ability.card.${ability}.name`)}</h2>
    <p className="ability-card-description" id={`${id}-description`}>{t(`ability.card.${ability}.description`)}</p>
  </article>;
}
