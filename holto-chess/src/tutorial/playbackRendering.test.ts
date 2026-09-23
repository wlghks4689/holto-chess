import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bestBotSelection, bestRunLoadout } from "../game/botStrategy";
import { BALANCE } from "../game/config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, getCard, getCardPrice, leaveRoundResult, lockRunLoadouts,
  pickDraftCard, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, setRunLoadout,
  startNextRound, toggleSelectedCard,
} from "../game/engine";
import { createMatchView } from "../game/matchView";
import type { PorenaGameState } from "../game/types";
import type { MatchView } from "../shared/protocol";
import { ShowdownCinematic } from "../ui/ShowdownCinematic";
import { checkpointMs } from "./tutorialPlayback";
import {
  advance, applyGame, currentStep, matchesPending, startChapter, tutorialMatches, type TutorialSession,
} from "./tutorialController";
import type { ChapterId } from "./tutorialTypes";

function play(game: PorenaGameState): PorenaGameState {
  const me = game.players[0]!;
  switch (game.phase) {
    case "SHOP": {
      if (me.ownedCardIds.length >= BALANCE.handLimits[game.round]) return prepareShowdown(game, ["p1"]);
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
      const open = draft.cardIds.find((id) => !draft.picks.some((pick) => pick.cardId === id) && getCardPrice(game, "p1", id) <= me.stackBB);
      return pickDraftCard(game, "p1", open!);
    }
    case "RUN_LOADOUT": return lockRunLoadouts(setRunLoadout(game, "p1", bestRunLoadout(me, me.ownedCardIds.map((id) => getCard(game, id)))));
    case "AUGMENT": return chooseAugment(game, "p1", game.augmentChoices[0]!.id);
    case "ROUND_RESULT": return leaveRoundResult(game);
    case "GROUP_ASSIGNMENT": return beginSecondary(game);
    case "SHOWDOWN_PRIMARY": return resolvePrimary(game);
    case "SHOWDOWN_SECONDARY": return resolveSecondary(game);
    case "SURVIVAL_READY": return resolveSurvival(game);
    case "NEXT_ROUND": return startNextRound(game);
    default: throw new Error(`알 수 없는 단계: ${game.phase}`);
  }
}

type Beat = { stepId: string; at: string; elapsed: number; match: MatchView; game: PorenaGameState };

/** Walks a chapter the way the screen does, collecting every beat the guide stops the film on. */
function beatsOf(chapterId: ChapterId): Beat[] {
  let session: TutorialSession = startChapter(chapterId);
  const beats: Beat[] = [];
  for (let guard = 0; guard < 160; guard += 1) {
    const step = currentStep(session);
    if (!step) break;
    if (step.hold && matchesPending(session.game) && step.hold.matchIndex >= tutorialMatches(session.game).length) {
      session = applyGame(session, play(session.game));
      continue;
    }
    if (step.hold) {
      const match = tutorialMatches(session.game).map((entry) => createMatchView(session.game, entry))[step.hold.matchIndex];
      if (match) beats.push({ stepId: step.id, at: step.hold.at, elapsed: checkpointMs(match, step.hold.at) ?? -1, match, game: session.game });
    }
    if (step.kind === "ACT") { session = applyGame(session, play(session.game)); continue; }
    session = advance(session);
  }
  return beats;
}

function render(beat: Beat): string {
  return renderToStaticMarkup(createElement(ShowdownCinematic, {
    match: beat.match,
    profiles: beat.game.players.map((player) => ({ playerId: player.id, name: player.name, points: player.points, alive: !player.eliminated })),
    viewerId: "p1", onComplete: () => {}, elapsedMs: beat.elapsed,
  }));
}

/** How many of this board's cards are face up in the rendered frame. */
function openBoardCards(html: string, beat: Beat): number {
  const board = beat.match.boards[0] ?? [];
  return board.filter((card) => new RegExp(`data-card-id="${card.id}" data-open="true"`).test(html)).length;
}

describe("the guide's checkpoints land on frames that actually show the cards", () => {
  // The film is a pure function of elapsedMs, so the beats can be checked without a running clock.
  const expectedBoardCards: Record<string, number> = { FLOP_HAND: 3, TURN_HAND: 4, RIVER_SETTLE: 5, BEST5_GLOW: 5, COMPLETE: 5 };

  it("opens the board one street at a time through chapter 1", () => {
    const beats = beatsOf(1).filter((beat) => beat.match.boards.length === 1);
    expect(beats.length).toBeGreaterThan(0);
    for (const beat of beats) {
      expect(beat.elapsed).toBeGreaterThanOrEqual(0);
      const html = render(beat);
      if (beat.at === "VS_INTRO") {
        // The intro frame is the two hands only: the board has not been dealt on screen yet.
        expect(html).not.toContain("cinema-board-cards");
        continue;
      }
      const expected = expectedBoardCards[beat.at];
      if (expected === undefined) continue;
      expect({ step: beat.stepId, open: openBoardCards(html, beat) }).toEqual({ step: beat.stepId, open: expected });
    }
  });

  it("holds one millisecond before the next beat, so the checkpoint frame is the one on screen", () => {
    for (const beat of beatsOf(1)) {
      const html = render(beat);
      expect(html).toContain(`data-phase="${beat.at}"`);
    }
  });

  it("reveals the final seven in three batches across chapter 5", () => {
    const wanted: Record<string, number> = { FINAL_FIRST_HAND: 3, FINAL_SECOND_HAND: 5, FINAL_SEVEN_SETTLE: 7 };
    const beats = beatsOf(5).filter((beat) => wanted[beat.at] !== undefined);
    expect(beats.map((beat) => beat.at)).toEqual(["FINAL_FIRST_HAND", "FINAL_SECOND_HAND", "FINAL_SEVEN_SETTLE"]);
    for (const beat of beats) {
      const html = render(beat);
      const mine = beat.match.revealedCards["p1"] ?? [];
      const open = mine.filter((card) => new RegExp(`data-card-id="${card.id}" data-open="true"`).test(html)).length;
      expect({ at: beat.at, open }).toEqual({ at: beat.at, open: wanted[beat.at] });
    }
  });
});
