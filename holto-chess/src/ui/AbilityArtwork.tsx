import { useEffect, useState } from "react";
import type { AbilityId } from "./abilityCatalog";
import { ABILITY_FRAME, abilityIconUrl, decodeAbilityImage } from "./abilityArtworkLoader";

/** One visibility change reveals both decoded images; text never changes their geometry. */
export function AbilityArtwork({ ability, onReady }: { ability: AbilityId; onReady?: () => void }) {
  const icon = abilityIconUrl(ability);
  const [decodedIcon, setDecodedIcon] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([decodeAbilityImage(ABILITY_FRAME), decodeAbilityImage(icon)]).then(() => {
      if (active) { setDecodedIcon(icon); onReady?.(); }
    }).catch(() => { /* Keep the neutral card surface instead of showing half a card. */ });
    return () => { active = false; };
  }, [icon, onReady]);
  return <span className="ability-artwork" aria-hidden="true" data-ready={decodedIcon === icon}>
    <img className="ability-artwork-frame" src={ABILITY_FRAME} alt="" draggable={false} />
    <img className="ability-card-icon" src={icon} alt="" draggable={false} />
  </span>;
}
