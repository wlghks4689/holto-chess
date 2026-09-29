import { useEffect, useState } from "react";
import { ABILITY_CARDS, type AbilityId } from "./abilityCatalog";
import { ABILITY_FRAME, decodeAbilityImage } from "./abilityArtworkLoader";

/** One visibility change reveals both decoded images; text never changes their geometry. */
export function AbilityArtwork({ ability }: { ability: AbilityId }) {
  const icon = `/assets/abilities/${ABILITY_CARDS[ability]}`;
  const [decodedIcon, setDecodedIcon] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([decodeAbilityImage(ABILITY_FRAME), decodeAbilityImage(icon)]).then(() => {
      if (active) setDecodedIcon(icon);
    }).catch(() => { /* Keep the neutral card surface instead of showing half a card. */ });
    return () => { active = false; };
  }, [icon]);
  return <span className="ability-artwork" aria-hidden="true" data-ready={decodedIcon === icon}>
    <img className="ability-artwork-frame" src={ABILITY_FRAME} alt="" draggable={false} />
    <img className="ability-card-icon" src={icon} alt="" draggable={false} />
  </span>;
}
