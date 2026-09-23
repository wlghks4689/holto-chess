import { TUTORIAL_CHAPTERS } from "../../tutorial/chapters";
import type { TutorialSave } from "../../tutorial/storage";
import type { ChapterId } from "../../tutorial/tutorialTypes";

export function TutorialChapterMenu({ save, error, onStart, onHome }: {
  save: TutorialSave; error: string | null; onStart: (chapter: ChapterId) => void; onHome: () => void;
}) {
  const resume = save.resume;
  return <main className="tutorial-screen tutorial-menu">
    <section className="panel tutorial-menu-panel">
      <span className="eyebrow">처음이라면 · 길라잡이</span>
      <h1>카드를 고르며 포레나를 배워보세요</h1>
      <p>포커를 몰라도 괜찮아요. 카드를 직접 골라보며 차근차근 배워볼게요. 설명은 준비되었을 때 직접 넘길 수 있어요.</p>
      <p className="tutorial-muted">연습용 카드와 보드가 사용됩니다. 실제 게임에서는 카드 등장과 상대의 선택이 달라집니다.</p>
      {error ? <p className="tutorial-error" role="alert">{error}</p> : null}
      <div className="tutorial-menu-actions">
        <button type="button" className="primary" onClick={() => onStart(1)}>처음부터 배우기</button>
        {resume && resume !== 1 ? <button type="button" className="secondary" onClick={() => onStart(resume)}>이어서 배우기 · {resume}장</button> : null}
        <button type="button" className="secondary" onClick={onHome}>홈으로</button>
      </div>
      <ol className="tutorial-chapter-list">
        {TUTORIAL_CHAPTERS.map((chapter) => <li key={chapter.id}>
          <button type="button" onClick={() => onStart(chapter.id)}>
            <b>{chapter.id}장 · {chapter.title}</b>
            <small>{chapter.summary}</small>
            <em>{save.completed.includes(chapter.id) ? "완료" : "배우기"} →</em>
          </button>
        </li>)}
      </ol>
      <p className="tutorial-muted">길라잡이를 끝내지 않아도 싱글·멀티 플레이를 바로 시작할 수 있습니다.</p>
    </section>
  </main>;
}
