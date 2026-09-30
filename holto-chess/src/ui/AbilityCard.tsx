import { useId, useState } from "react";
import { useTranslation } from "../i18n";
import { type AbilityId } from "./abilityCatalog";
import { AbilityArtwork } from "./AbilityArtwork";
import { ABILITY_FRAME } from "./abilityArtworkLoader";
import "./abilities.css";

function AbilityCardFront({ ability, id }: { ability: AbilityId; id: string }) {
  const { t, locale } = useTranslation();
  return <article className="ability-card" data-ability={ability} lang={locale} aria-labelledby={`${id}-name`} aria-describedby={`${id}-description`}>
    <AbilityArtwork ability={ability} />
    <h2 className="ability-card-name" id={`${id}-name`}>{t(`ability.card.${ability}.name`)}</h2>
    <p className="ability-card-description" id={`${id}-description`}>{t(`ability.card.${ability}.description`)}</p>
  </article>;
}

/** The reverse face: the same frame with the finer points the short front text leaves out. */
export function AbilityCardBack({ ability }: { ability: AbilityId }) {
  const { t, locale } = useTranslation();
  const id = useId();
  const notes = t(`ability.card.${ability}.details`).split("\n").filter(Boolean);
  return <article className="ability-card ability-card-reverse" data-ability={ability} lang={locale} aria-labelledby={`${id}-back-name`}>
    <span className="ability-artwork" aria-hidden="true" data-ready="true"><img className="ability-artwork-frame" src={ABILITY_FRAME} alt="" draggable={false} /></span>
    <div className="ability-reverse-body">
      <small>{t("ability.details")}</small>
      <h2 id={`${id}-back-name`}>{t(`ability.card.${ability}.name`)}</h2>
      <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </div>
  </article>;
}

/**
 * An enlarged card flips on tap/click to show situations the short front text leaves open.
 * The flip control is a transparent button laid over the card, so the card text stays readable to screen readers.
 */
export function AbilityCard({ ability, flippable = false }: { ability: AbilityId; flippable?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const [flipped, setFlipped] = useState(false);
  if (!flippable) return <AbilityCardFront ability={ability} id={id} />;
  return <div className="ability-flip" data-flipped={flipped}>
    <div className="ability-flip-inner">
      <div className="ability-flip-face" aria-hidden={flipped}><AbilityCardFront ability={ability} id={id} /></div>
      <div className="ability-flip-face is-back" aria-hidden={!flipped}><AbilityCardBack ability={ability} /></div>
    </div>
    <button type="button" className="ability-flip-toggle" aria-pressed={flipped} aria-label={t(flipped ? "ability.flipToFront" : "ability.flipToBack")} onClick={() => setFlipped((value) => !value)}>
      <span aria-hidden="true">↻</span>
    </button>
  </div>;
}
