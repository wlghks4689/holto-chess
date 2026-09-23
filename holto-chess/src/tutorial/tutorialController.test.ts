import { describe, expect, it } from "vitest";
import { assertPoolIntegrity } from "../game/cardPool";
import { BALANCE } from "../game/config";
import { buyCard, rerollShop, sellCard } from "../game/engine";
import { advance, applyGame, currentStep, restartStep, startChapter, sync } from "./tutorialController";

describe("tutorial progression", () => {
  it("starts chapter 1 on the starting card and waits", () => {
    const session = startChapter(1);
    expect(currentStep(session)!.id).toBe("r1-start-card");
    expect(session.game.round).toBe(1);
    expect(session.game.players[0]!.ownedCardIds.length).toBe(1);
  });

  it("does not move on its own while the reader waits", () => {
    const session = startChapter(1);
    // Re-syncing is what every render and every clock tick does; none of it may advance a step.
    const settled = sync(sync(sync(session)));
    expect(settled.stepIndex).toBe(session.stepIndex);
    expect(settled.game.phase).toBe("SHOP");
  });

  it("clears the buying step from a real purchase, whenever it happened", () => {
    let session = startChapter(1);
    // The player buys before ever reaching the buy step.
    const me = session.game.players[0]!;
    session = applyGame(session, buyCard(session.game, "p1", me.shopCardIds[0]!));
    session = advance(advance(advance(session)));
    expect(currentStep(session)!.id).not.toBe("r1-buy");
    expect(session.game.players[0]!.ownedCardIds.length).toBe(BALANCE.handLimits[1]);
  });

  it("re-opens the buying step when a sale undoes it", () => {
    let session = startChapter(1);
    session = advance(advance(advance(session)));
    expect(currentStep(session)!.id).toBe("r1-buy");
    const bought = buyCard(session.game, "p1", session.game.players[0]!.shopCardIds[0]!);
    session = applyGame(session, bought);
    expect(currentStep(session)!.id).toBe("r1-hand");
    session = applyGame(session, sellCard(session.game, "p1", session.game.players[0]!.ownedCardIds[1]!));
    expect(currentStep(session)!.id).toBe("r1-buy");
  });

  it("allows a reroll inside the buying step and keeps the real cost", () => {
    let session = startChapter(1);
    session = advance(advance(advance(session)));
    const before = session.game.players[0]!.stackBB;
    session = applyGame(session, rerollShop(session.game, "p1"));
    expect(currentStep(session)!.id).toBe("r1-buy");
    expect(session.game.players[0]!.stackBB).toBe(before - BALANCE.rerollCostBB);
    expect(session.game.players[0]!.rerollsUsed).toBe(1);
    expect(assertPoolIntegrity(session.game)).toBe(true);
  });

  it("restores the whole game, not just my cards, when a step is practised again", () => {
    let session = startChapter(1);
    session = advance(advance(advance(session)));
    const before = structuredClone(session.game);
    session = applyGame(session, rerollShop(session.game, "p1"));
    session = restartStep(session);
    expect(session.game.players[0]!.stackBB).toBe(before.players[0]!.stackBB);
    expect(session.game.players[0]!.rerollsUsed ?? 0).toBe(before.players[0]!.rerollsUsed ?? 0);
    expect(session.game.seed).toBe(before.seed);
    expect(session.game.ownershipCardPool).toEqual(before.ownershipCardPool);
    expect(assertPoolIntegrity(session.game)).toBe(true);
  });

  it("opens later chapters on a prepared practice hand at the right round", () => {
    for (const [chapter, round, cards] of [[2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5]] as const) {
      const session = startChapter(chapter);
      expect(session.game.round).toBe(round);
      expect(session.origin).toBe("practice");
      expect(session.game.players[0]!.eliminated).toBe(false);
      expect(session.game.players[0]!.ownedCardIds.length).toBeGreaterThanOrEqual(cards - 1);
      expect(assertPoolIntegrity(session.game)).toBe(true);
    }
  });

  it("keeps the player's own game when a chapter follows on from the last one", () => {
    const practice = startChapter(3);
    const carried = startChapter(3, practice.game);
    expect(carried.origin).toBe("continued");
    expect(carried.game.players[0]!.ownedCardIds).toEqual(practice.game.players[0]!.ownedCardIds);
  });
});
