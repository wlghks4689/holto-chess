import { useState } from "react";
import type { Round } from "../game/types";
import type { PrepPresentation } from "./prepPresentation";
import { useTranslation, type TranslationKey } from "../i18n";

const PREP_RULE_KEYS: Record<Exclude<Round, 1>, TranslationKey[]> = {
  2: ["prep.r2Draft", "prep.r2Loadout", "prep.r2Points", "prep.r2Survive"],
  3: ["prep.r3Cards", "prep.r3SameCards", "prep.r3Matches", "prep.r3Board", "prep.r3Omaha"],
  4: ["prep.r4Cards", "prep.r4Board", "prep.r4Best5"],
  5: ["prep.r5Cards", "prep.r5NoBoard", "prep.r5Best5"],
};

export function RoundProgress({ round, prep }: { round: Round; prep: PrepPresentation | null }) {
  const { t } = useTranslation();
  if (prep) {
    return <div className="round-progress prep-progress" aria-label={t("progress.prepAria", { completed: prep.completedRound, next: prep.targetRound })}>
      <span className="round-step done"><i>✓</i><span className="round-step-copy"><small>R{prep.completedRound}</small><b>{t("progress.done")}</b></span></span>
      <span className="round-step active prep-step"><i>P</i><span className="round-step-copy"><small>PREP</small><b>{t("progress.preparing")}</b></span></span>
      <span className="round-step upcoming"><i>{prep.targetRound}</i><span className="round-step-copy"><small>R{prep.targetRound}</small><b>{t("progress.next")}</b></span></span>
    </div>;
  }

  return <div className="round-progress" aria-label={t("progress.currentRoundAria", { round })}>
    {[1, 2, 3, 4, 5].map((value) => <span key={value} className={`round-step ${value === round ? "active" : value < round ? "done" : "upcoming"}`}>
      <i>{value < round ? "✓" : value}</i><span className="round-step-copy"><small>R{value}</small><b>{t(value < round ? "progress.done" : value === round ? "progress.current" : "progress.scheduled")}</b></span>
    </span>)}
  </div>;
}

export function PrepRoundHeader({ prep }: { prep: PrepPresentation }) {
  const { t } = useTranslation();
  const [rulesOpen, setRulesOpen] = useState(false);
  return <header className="round-header prep-round-header">
    <div className="prep-heading-copy">
      <h1>PREPARE FOR ROUND {String(prep.targetRound).padStart(2, "0")}</h1>
      <div className={`prep-title-row ${rulesOpen ? "is-open" : ""}`}>
        <h2>{prep.title}</h2>
        <button className="prep-rule-trigger" type="button" aria-label={t("progress.rulesAria", { title: prep.title })} aria-expanded={rulesOpen} onClick={() => setRulesOpen((open) => !open)}>?</button>
        <section className="prep-rule-popover" role="dialog" aria-label={t("progress.rulebookAria", { title: prep.title })}>
          <header><span>ROUND {String(prep.targetRound).padStart(2, "0")} RULEBOOK</span><b>{prep.title}</b></header>
          <ul>{PREP_RULE_KEYS[prep.targetRound].map((key) => <li key={key}>{t(key)}</li>)}</ul>
        </section>
      </div>
    </div>
  </header>;
}
