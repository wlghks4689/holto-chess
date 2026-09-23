import { describe, expect, it } from "vitest";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE } from "./config";
import { buyCard, createGame, getCard, prepareShowdown, type BotShopAction, type BotShopInput } from "./engine";
import { tutorialBotPolicy } from "../tutorial/tutorialBots";

/** R1 needs two cards, so buy one for the human before every showdown preparation. */
function readyHuman() {
  const state = createGame(2052);
  const me = state.players[0]!;
  return buyCard(state, me.id, me.shopCardIds[0]!);
}

describe("bot shop policy injection", () => {
  it("leaves the normal bots untouched when no policy is passed", () => {
    const prepared = prepareShowdown(readyHuman());
    for (const bot of prepared.players.slice(1)) expect(bot.ownedCardIds.length).toBe(BALANCE.handLimits[1]);
    expect(assertPoolIntegrity(prepared)).toBe(true);
  });

  it("uses the injected policy instead", () => {
    const seen: BotShopInput[] = [];
    const prepared = prepareShowdown(readyHuman(), ["p1"], (input) => { seen.push(input); return { type: "DONE" }; });
    expect(seen.length).toBe(7);
    expect(seen.every((input) => input.playerId !== "p1")).toBe(true);
    // Every bot stopped at its starting card because the policy asked for nothing.
    for (const bot of prepared.players.slice(1)) expect(bot.ownedCardIds.length).toBe(1);
    expect(assertPoolIntegrity(prepared)).toBe(true);
  });

  it("refuses an illegal request without bending the rules", () => {
    const illegal = (input: BotShopInput): BotShopAction => ({ type: "BUY", cardId: input.ownedCards[0]!.id });
    const prepared = prepareShowdown(readyHuman(), ["p1"], illegal);
    for (const bot of prepared.players.slice(1)) {
      expect(bot.ownedCardIds.length).toBe(1);
      expect(bot.stackBB).toBe(BALANCE.startStackBB);
      expect(bot.purchasesThisRound).toBe(0);
    }
    expect(assertPoolIntegrity(prepared)).toBe(true);
  });

  it("keeps the tutorial policy inside the real limits", () => {
    const prepared = prepareShowdown(readyHuman(), ["p1"], tutorialBotPolicy);
    for (const bot of prepared.players.slice(1)) {
      expect(bot.ownedCardIds.length).toBe(BALANCE.handLimits[1]);
      expect(bot.purchasesThisRound).toBeLessThanOrEqual(BALANCE.purchaseLimits[1]);
      expect(bot.rerollsUsed ?? 0).toBeLessThanOrEqual(BALANCE.rerollLimits[1]);
      expect(bot.stackBB).toBeGreaterThanOrEqual(0);
    }
    expect(assertPoolIntegrity(prepared)).toBe(true);
  });

  it("prefers a pair, then a shared suit", () => {
    const state = createGame(2052);
    const owned = [getCard(state, "8c")];
    const pick = (ids: string[]) => tutorialBotPolicy({
      round: 1, playerId: "p2", stackBB: 50, handLimit: 2, purchasesLeft: 2, rerollsLeft: 1, rerollCost: 5,
      ownedCards: owned, shopCards: ids.map((id) => ({ card: getCard(state, id), price: 8 })),
    });
    expect(pick(["8s", "Kd"])).toEqual({ type: "BUY", cardId: "8s" });
    expect(pick(["9c", "Kd"])).toEqual({ type: "BUY", cardId: "9c" });
    expect(pick(["Kd", "2h"])).toEqual({ type: "BUY", cardId: "Kd" });
  });
});
