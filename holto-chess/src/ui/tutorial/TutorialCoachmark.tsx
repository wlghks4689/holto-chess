import type { HandExplanation } from "../../tutorial/showdownExplainer";
import { useTranslation } from "../../i18n";

/** In-flow guidance never covers the game or traps keyboard focus. */
export function TutorialCoachmark({ step, progress, title, body, more, goal, next, explanation, onNext, onRestart }: {
  step: string; progress: string; title: string; body: string[]; more: string[]; goal?: string;
  next?: string; explanation: HandExplanation | null; onNext?: () => void; onRestart: () => void;
}) {
  const { t } = useTranslation();
  return <aside className="tutorial-coach" aria-label={t("tutorial.eyebrow")}>
    <div aria-live="polite" aria-atomic="true">
      <small className="tutorial-progress">{progress}</small>
      <h2>{title}</h2>
      {explanation
        ? <p className="tutorial-outcome">{explanation.headline}{explanation.outcome ? ` · ${explanation.outcome}` : ""}</p>
        : body.map((line, index) => <p key={index}>{line}</p>)}
    </div>
    <div className="tutorial-coach-actions">
      {onNext ? <button type="button" className="primary" onClick={onNext}>{next ?? t("tutorial.continue")} →</button>
        : <strong className="tutorial-goal">↓ {goal ?? t("tutorial.tryOnScreen")}</strong>}
    </div>
    <details key={step} className="tutorial-help">
      <summary>{t("tutorial.learnMore")}</summary>
      {explanation && body.map((line, index) => <p key={`body-${index}`}>{line}</p>)}
      {more.map((line, index) => <p key={index}>{line}</p>)}
      {explanation && <>
        {explanation.comparison && <p>{explanation.comparison}</p>}
        {explanation.detail.map((line, index) => <p key={index}>{line}</p>)}
        {explanation.unused && <p>{explanation.unused}</p>}
      </>}
      <button type="button" className="secondary" onClick={onRestart}>{t("tutorial.retryStep")}</button>
    </details>
  </aside>;
}
