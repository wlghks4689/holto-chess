import { TUTORIAL_CHAPTERS } from "../../tutorial/chapters";
import type { TutorialSave } from "../../tutorial/storage";
import type { ChapterId } from "../../tutorial/tutorialTypes";
import { useTranslation } from "../../i18n";
import { EN_CHAPTERS } from "../../tutorial/englishCopy";
import { classifyGameError } from "../../shared/gameErrorCode";
import { renderGameError } from "../../i18n/gameError";

export function TutorialChapterMenu({ save, error, onStart, onHome }: {
  save: TutorialSave; error: string | null; onStart: (chapter: ChapterId) => void; onHome: () => void;
}) {
  const { locale, t } = useTranslation();
  const resume = save.resume;
  return <main className="tutorial-screen tutorial-menu">
    <section className="panel tutorial-menu-panel">
      <span className="eyebrow">{t("tutorial.eyebrow")}</span>
      <h1>{t("tutorial.menuTitle")}</h1>
      <p>{t("tutorial.menuIntro")}</p>
      <ol className="tutorial-route">
        <li>{t("tutorial.routeBuy")}</li><li>{t("tutorial.routeWatch")}</li><li>{t("tutorial.routeResult")}</li>
      </ol>
      {error ? <p className="tutorial-error" role="alert">{locale === "ko-KR" ? error : renderGameError({ ...classifyGameError(error), message: error }, t)}</p> : null}
      <div className="tutorial-menu-actions">
        <button type="button" className="primary" onClick={() => onStart(1)}>{t("tutorial.startFromBeginning")}</button>
        {resume && resume !== 1 ? <button type="button" className="secondary" onClick={() => onStart(resume)}>{t("tutorial.resumeChapter", { chapter: resume })}</button> : null}
      </div>
      <p className="tutorial-muted">{t("tutorial.practiceDisclaimer")}</p>
      <details className="tutorial-optional">
      <summary>{t("tutorial.optionalRounds")}</summary>
      <ol className="tutorial-chapter-list">
        {TUTORIAL_CHAPTERS.slice(1).map((chapter) => <li key={chapter.id}>
          <button type="button" onClick={() => onStart(chapter.id)}>
            <b>{t("tutorial.chapterNumber", { chapter: chapter.id })} · {locale === "en-US" ? EN_CHAPTERS[chapter.id].title : chapter.title}</b>
            <small>{locale === "en-US" ? EN_CHAPTERS[chapter.id].summary : chapter.summary}</small>
            <em>{t(save.completed.includes(chapter.id) ? "tutorial.completed" : "tutorial.learn")} →</em>
          </button>
        </li>)}
      </ol>
      </details>
      <p className="tutorial-muted">{t("tutorial.optional")}</p>
      <button type="button" className="secondary" onClick={onHome}>{t("action.home")}</button>
    </section>
  </main>;
}
