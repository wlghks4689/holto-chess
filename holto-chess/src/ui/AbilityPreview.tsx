import { useRef, useState } from "react";
import { setLocale, useTranslation } from "../i18n";
import { AbilityCard, AbilityCardBack } from "./AbilityCard";
import { ABILITY_IDS, type AbilityId } from "./abilityCatalog";

// Dev-only review page. `?sides=both` lays every card's front and back side by side for copy review.
const readSidesMode = () => typeof location !== "undefined" && new URLSearchParams(location.search).get("sides") === "both";

export function AbilityPreview() {
  const { locale, t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<AbilityId>("target-sniper");
  const [bothSides, setBothSides] = useState(readSidesMode);
  const toggleSides = () => {
    const next = !bothSides;
    setBothSides(next);
    history.replaceState(null, "", next ? "?sides=both" : location.pathname);
  };
  return <main className="ability-preview">
    <header className="ability-preview-header"><div><span>PORENA / ABILITIES</span><h1>{t("ability.collection")}</h1><p>{t("ability.previewHint", { count: ABILITY_IDS.length })}</p></div>
      <div className="ability-preview-actions">
        <button type="button" aria-pressed={bothSides} onClick={toggleSides}>{bothSides ? "앞면만 보기" : "앞·뒤 함께 보기"}</button>
        <button type="button" onClick={() => setLocale(locale === "ko-KR" ? "en-US" : "ko-KR")}>{locale === "ko-KR" ? "English" : "한국어"}</button>
      </div>
    </header>
    {bothSides ? <section className="ability-sides-gallery" aria-label={t("ability.collection")}>
      {ABILITY_IDS.map((ability, index) => <div className="ability-sides-item" key={ability}>
        <h2><span>{String(index + 1).padStart(2, "0")}</span>{t(`ability.card.${ability}.name`)}</h2>
        <div className="ability-sides-pair">
          <figure><AbilityCard ability={ability} /><figcaption>앞면</figcaption></figure>
          <figure><AbilityCardBack ability={ability} /><figcaption>뒷면</figcaption></figure>
        </div>
      </div>)}
    </section> : <section className="ability-gallery" aria-label={t("ability.collection")}>
      {ABILITY_IDS.map((ability, index) => <div className="ability-preview-item" key={ability}>
        <AbilityCard ability={ability} />
        <button type="button" className="ability-enlarge" aria-label={t("ability.enlarge", { name: t(`ability.card.${ability}.name`) })} onClick={() => { setSelected(ability); dialog.current?.showModal(); }}><span>{String(index + 1).padStart(2, "0")}</span>{t("ability.viewCard")} ↗</button>
      </div>)}
    </section>}
    <dialog className="ability-preview-dialog" ref={dialog} aria-label={t("ability.enlarge", { name: t(`ability.card.${selected}.name`) })} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button className="ability-dialog-close" type="button" aria-label={t("ability.close")} onClick={() => dialog.current?.close()}>×</button>
      <AbilityCard key={selected} ability={selected} flippable />
    </dialog>
  </main>;
}
