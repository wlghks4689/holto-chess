import { useCallback, useState } from "react";
import type { AbilityId } from "./abilityCatalog";
import { AbilityArtwork } from "./AbilityArtwork";

/** Keep one slot mounted from back to front; reveal only after both images decode. */
export function AbilityDraftSlot({ slot, ability, own, label, title, owner, disabled, onClick }: {
  slot: number; ability?: AbilityId; own: boolean; label: string; title?: string; owner?: string;
  disabled: boolean; onClick: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [arrivedWithCard] = useState(!!ability);
  const onReady = useCallback(() => setReady(true), []);
  return <button type="button" className={`ability-card-back ability-draft-slot${ready ? " is-revealed" : ""}${own ? " is-viewer" : ""}${!own && !arrivedWithCard ? " can-flip" : ""}`}
    data-slot={slot} disabled={disabled} aria-label={label} onClick={onClick}>
    <span className="ability-slot-rotator">
      <span className="ability-slot-back" aria-hidden="true">?</span>
      <span className={`ability-slot-front${ability ? " ability-card-thumbnail" : ""}${own ? " is-viewer" : ""}`} aria-hidden="true">
        {ability && <><AbilityArtwork ability={ability} onReady={onReady} /><b>{title}</b>
          <span className="ability-card-owner"><small>{owner}</small></span></>}
      </span>
    </span>
  </button>;
}
