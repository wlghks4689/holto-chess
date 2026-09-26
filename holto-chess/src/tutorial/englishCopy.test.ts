import { describe, expect, it } from "vitest";
import { createGame } from "../game/engine";
import { EN_CHAPTERS, englishStepCopy } from "./englishCopy";
import { TUTORIAL_CHAPTERS } from "./chapters";
import { stepText } from "./tutorialTypes";

describe("English tutorial script", () => {
  it("covers every current chapter and lesson step without Korean leakage", () => {
    const game = createGame(2628);
    for (const chapter of TUTORIAL_CHAPTERS) {
      expect(EN_CHAPTERS[chapter.id].title).not.toMatch(/[가-힣]/);
      expect(EN_CHAPTERS[chapter.id].summary).not.toMatch(/[가-힣]/);
      for (const step of chapter.steps) {
        const copy = englishStepCopy(step);
        for (const text of [copy.title, copy.goal, copy.next, ...stepText(copy.body, game), ...stepText(copy.more, game)]) {
          if (text) expect(text, step.id).not.toMatch(/[가-힣]/);
        }
      }
    }
  });
});
