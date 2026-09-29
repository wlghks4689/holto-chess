import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";
import { BeginnerGuide } from "./guide/BeginnerGuide";
import { GUIDE_COPY } from "./guide/guideCopy";
import { RuleBook } from "./guide/RuleBook";
import "./guide/game-guide.css";

export type GuideView = "home" | "beginner" | "rules";

/** Start-screen game guide: a two-way entry into the beginner walkthrough or the rule book. */
export function GameOverviewGuide({ onClose, initialView = "home" }: { onClose: () => void; initialView?: GuideView }) {
  const { t, locale } = useTranslation();
  const copy = GUIDE_COPY[locale];
  const [view, setView] = useState<GuideView>(initialView);
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Each view starts at its top, and focus follows so screen readers announce the new page.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    if (view === "home") body.current?.querySelector<HTMLButtonElement>(".pg-choice")?.focus();
    else heading.current?.focus();
  }, [view]);

  return <div className="game-guide-backdrop pg-backdrop" role="presentation">
    <section className="game-guide pg-guide" role="dialog" aria-modal="true" aria-labelledby="game-guide-title" data-view={view}>
      <header className="pg-header">
        {view !== "home" ? <button type="button" className="pg-icon" aria-label={copy.home} onClick={() => setView("home")}>←</button> : <span className="pg-icon-spacer" />}
        <h2 id="game-guide-title" ref={heading} tabIndex={-1}>{copy.title}</h2>
        {view !== "home" ? <div className="pg-tabs">
          {(["beginner", "rules"] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)}>{copy.tabs[tab]}</button>)}
        </div> : null}
        <button type="button" className="pg-icon" aria-label={`${copy.title} · ${copy.close}`} onClick={onClose}>×</button>
      </header>
      <div className="pg-body" ref={body}>
        {view === "home" ? <div className="pg-chooser">
          <span className="pg-kicker">{copy.chooser.kicker}</span>
          <h3>{copy.chooser.title}</h3><p>{copy.chooser.lead}</p>
          <div className="pg-choices">
            <button type="button" className="pg-choice beginner" onClick={() => setView("beginner")}><span>01</span><strong>{copy.chooser.beginner.title}</strong><small>{copy.chooser.beginner.lead}</small><em>{copy.chooser.beginner.cta} →</em></button>
            <button type="button" className="pg-choice rules" onClick={() => setView("rules")}><span>02</span><strong>{copy.chooser.rules.title}</strong><small>{copy.chooser.rules.lead}</small><em>{copy.chooser.rules.cta} →</em></button>
          </div>
        </div> : view === "beginner" ? <BeginnerGuide copy={copy} t={t} onRules={() => setView("rules")} />
          : <RuleBook copy={copy} t={t} scroller={body} onBeginner={() => setView("beginner")} />}
      </div>
    </section>
  </div>;
}
