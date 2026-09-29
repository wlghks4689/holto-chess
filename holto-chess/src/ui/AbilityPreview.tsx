import { useRef, useState } from "react";
import { setLocale, useTranslation } from "../i18n";
import { AbilityCard } from "./AbilityCard";
import { ABILITY_IDS, type AbilityId } from "./abilityCatalog";

export function AbilityPreview() {
  const { locale, t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<AbilityId>("target-sniper");
  return <main className="ability-preview">
    <header className="ability-preview-header"><div><span>PORENA / ABILITIES</span><h1>{t("ability.collection")}</h1><p>{t("ability.previewHint", { count: ABILITY_IDS.length })}</p></div>
      <button type="button" onClick={() => setLocale(locale === "ko-KR" ? "en-US" : "ko-KR")}>{locale === "ko-KR" ? "English" : "한국어"}</button>
    </header>
    <section className="ability-gallery" aria-label={t("ability.collection")}>
      {ABILITY_IDS.map((ability, index) => <div className="ability-preview-item" key={ability}>
        <AbilityCard ability={ability} />
        <button type="button" className="ability-enlarge" aria-label={t("ability.enlarge", { name: t(`ability.card.${ability}.name`) })} onClick={() => { setSelected(ability); dialog.current?.showModal(); }}><span>{String(index + 1).padStart(2, "0")}</span>{t("ability.viewCard")} ↗</button>
      </div>)}
    </section>
    <dialog className="ability-preview-dialog" ref={dialog} aria-label={t("ability.enlarge", { name: t(`ability.card.${selected}.name`) })} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button className="ability-dialog-close" type="button" aria-label={t("ability.close")} onClick={() => dialog.current?.close()}>×</button>
      <AbilityCard ability={selected} />
    </dialog>
  </main>;
}
