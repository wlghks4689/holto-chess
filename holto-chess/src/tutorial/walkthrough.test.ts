import { describe, expect, it } from "vitest";
import { bestBotSelection, bestRunLoadout } from "../game/botStrategy";
import { assertPoolIntegrity } from "../game/cardPool";
import { BALANCE } from "../game/config";
import {
  beginSecondary, buyCard, confirmSelection, getCard, getCardPrice, leaveRoundResult, lockRunLoadouts,
  pickDraftCard, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, setRunLoadout,
  startNextRound, toggleSelectedCard,
} from "../game/engine";
import type { PorenaGameState } from "../game/types";
import { TUTORIAL_CHAPTERS } from "./chapters";
import { tutorialBotPolicy } from "./tutorialBots";
import {
  advance, applyGame, chapterFinished, currentStep, matchesPending, startChapter, tutorialMatches, type TutorialSession,
} from "./tutorialController";

/** What the player would click for the phase in front of them. */
function play(game: PorenaGameState): PorenaGameState {
  const me = game.players[0]!;
  switch (game.phase) {
    case "SHOP": {
      if (me.ownedCardIds.length >= BALANCE.handLimits[game.round]) return prepareShowdown(game, ["p1"], tutorialBotPolicy);
      const affordable = me.shopCardIds.find((id) => getCardPrice(game, "p1", id) <= me.stackBB);
      return affordable ? buyCard(game, "p1", affordable) : rerollShop(game, "p1");
    }
    case "DECK_SELECT": {
      let state = game;
      for (const id of bestBotSelection(state.round, me.ownedCardIds.map((cardId) => getCard(state, cardId)))) state = toggleSelectedCard(state, "p1", id);
      return confirmSelection(state);
    }
    case "OPEN_DRAFT": {
      const draft = game.draft!;
      const mine = draft.order[draft.picks.length]?.playerId === "p1";
      const open = draft.cardIds.find((id) => !draft.picks.some((pick) => pick.cardId === id) && getCardPrice(game, "p1", id) <= me.stackBB);
      if (!mine || !open) throw new Error("드래프트가 내 차례가 아닙니다.");
      return pickDraftCard(game, "p1", open);
    }
    case "RUN_LOADOUT": return lockRunLoadouts(setRunLoadout(game, "p1", bestRunLoadout(me, me.ownedCardIds.map((id) => getCard(game, id)))));
    case "ROUND_RESULT": return leaveRoundResult(game);
    case "GROUP_ASSIGNMENT": return beginSecondary(game);
    case "SHOWDOWN_PRIMARY": return resolvePrimary(game);
    case "SHOWDOWN_SECONDARY": return resolveSecondary(game);
    case "SURVIVAL_READY": return resolveSurvival(game);
    case "NEXT_ROUND": return startNextRound(game);
    default: throw new Error(`알 수 없는 단계: ${game.phase}`);
  }
}

/** Mirrors the screen: a beat that needs a result resolves it, nothing else moves on its own. */
function resolveForHold(session: TutorialSession): TutorialSession {
  const step = currentStep(session);
  if (!step?.hold || !matchesPending(session.game)) return session;
  if (step.hold.matchIndex < tutorialMatches(session.game).length) return session;
  return applyGame(session, play(session.game));
}

function walk(chapterId: 1 | 2 | 3 | 4 | 5, visited: string[] = []): TutorialSession {
  let session = startChapter(chapterId);
  const seen = new Set<string>();
  for (let guard = 0; guard < 120 && !chapterFinished(session); guard += 1) {
    session = resolveForHold(session);
    const step = currentStep(session);
    if (!step) break;
    if (!visited.includes(step.id)) visited.push(step.id);
    expect(assertPoolIntegrity(session.game)).toBe(true);
    if (step.kind === "ACT") {
      const before = session.stepIndex;
      session = applyGame(session, play(session.game));
      // An action step that cannot be satisfied would otherwise spin forever.
      if (session.stepIndex === before) seen.add(`${step.id}:${session.game.phase}`);
      expect(seen.size).toBeLessThan(40);
      continue;
    }
    session = advance(session);
  }
  return session;
}

describe("every chapter can be finished", () => {
  for (const chapter of TUTORIAL_CHAPTERS) {
    it(`chapter ${chapter.id} · ${chapter.title}`, () => {
      const visited: string[] = [];
      const session = walk(chapter.id, visited);
      expect(chapterFinished(session)).toBe(true);
      expect(assertPoolIntegrity(session.game)).toBe(true);
      // Every beat this chapter promises must actually have been shown, not skipped. The later
      // matches are included on purpose: a wrong match index silently drops a whole beat, which is
      // exactly the regression that had to be found by hand in the browser once already.
      for (const step of chapter.steps) expect(visited).toContain(step.id);
    });
  }
});
