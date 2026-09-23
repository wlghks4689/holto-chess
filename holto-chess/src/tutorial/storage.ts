import type { ChapterId } from "./tutorialTypes";

const KEY = "porena-tutorial-v1";
const SCHEMA = 1;
/** Bumped by the game, not by this file: a saved run from different rules restarts its chapter. */
const RULES_VERSION = 2;

export type TutorialSave = {
  schema: number;
  rulesVersion: number;
  /** Chapters finished end to end. */
  completed: ChapterId[];
  /** Where "이어서 배우기" resumes: the start of this chapter, never a half-played hand. */
  resume?: ChapterId;
  /** R1 finished: basic controls learned. Kept apart from finishing all five chapters. */
  basicsDone: boolean;
};

const EMPTY: TutorialSave = { schema: SCHEMA, rulesVersion: RULES_VERSION, completed: [], basicsDone: false };

/** Storage is a convenience here: a blocked or full store must never stop the tutorial itself. */
export function loadTutorial(): TutorialSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const value = JSON.parse(raw) as Partial<TutorialSave>;
    if (value.schema !== SCHEMA || value.rulesVersion !== RULES_VERSION) return { ...EMPTY };
    return {
      schema: SCHEMA, rulesVersion: RULES_VERSION,
      completed: (value.completed ?? []).filter((id): id is ChapterId => [1, 2, 3, 4, 5].includes(id as number)),
      resume: [1, 2, 3, 4, 5].includes(value.resume as number) ? value.resume : undefined,
      basicsDone: !!value.basicsDone,
    };
  } catch { return { ...EMPTY }; }
}

export function saveTutorial(save: TutorialSave): void {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode or a full store: progress just is not remembered */ }
}

export function markChapterDone(save: TutorialSave, chapter: ChapterId): TutorialSave {
  const completed = save.completed.includes(chapter) ? save.completed : [...save.completed, chapter].sort();
  const next: TutorialSave = { ...save, completed, basicsDone: save.basicsDone || chapter === 1, resume: chapter < 5 ? (chapter + 1) as ChapterId : undefined };
  saveTutorial(next);
  return next;
}

export function markChapterStarted(save: TutorialSave, chapter: ChapterId): TutorialSave {
  const next = { ...save, resume: chapter };
  saveTutorial(next);
  return next;
}

export function clearTutorial(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
