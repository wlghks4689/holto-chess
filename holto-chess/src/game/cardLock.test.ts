import { expect, it } from "vitest";
import { buyCard, createGame as createGameCurrent, rerollShop, startNextRound, toggleShopLock } from "./engine";
import { assertPoolIntegrity, releasePlayerCards } from "./cardPool";

it("charges 3BB per card lock, keeps locked reservations across rerolls and rounds, and unlocks freely", () => {
  const initial = createGame(42); const id = initial.players[0].shopCardIds[1];
  let state = toggleShopLock(initial, "p1", id);
  expect(initial.players[0].stackBB).toBe(50);
  expect(state.players[0].stackBB).toBe(47);
  state = rerollShop(state, "p1");
  expect(state.players[0].stackBB).toBe(42);
  expect(state.players[0].shopCardIds).toContain(id);
  expect(state.ownershipCardPool.find((e) => e.card.id === id)).toMatchObject({state:"RESERVED_IN_SHOP",reservedPlayerId:"p1"});
  expect(assertPoolIntegrity(state)).toBe(true);
  state.phase = "NEXT_ROUND"; state = startNextRound(state);
  expect(state.players[0].shopCardIds).toContain(id);
  const balance = state.players[0].stackBB;
  state = toggleShopLock(state, "p1", id);
  expect(state.players[0].stackBB).toBe(balance);
  expect(state.players[0].lockedShopCardIds).toEqual([]);
});

// Regression coverage for persisted games created before the open-draft rules.
function createGame(...args: Parameters<typeof createGameCurrent>) { return createGameCurrent(args[0], args[1], 1); }
it("rejects insufficient funds and foreign cards, and clears purchased or released locks", () => {
  const state = createGame(43); const id = state.players[0].shopCardIds[0];
  expect(() => toggleShopLock(state,"p1",state.players[1].shopCardIds[0])).toThrow();
  const poor = structuredClone(state); poor.players[0].stackBB = 2;
  expect(() => toggleShopLock(poor,"p1",id)).toThrow();
  expect(poor.players[0].stackBB).toBe(2);
  const locked = toggleShopLock(state,"p1",id);
  expect(buyCard(locked,"p1",id).players[0].lockedShopCardIds).toEqual([]);
  releasePlayerCards(locked,locked.players[0]);
  expect(locked.players[0].lockedShopCardIds).toEqual([]);
  expect(assertPoolIntegrity(locked)).toBe(true);
});
