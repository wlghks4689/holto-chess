import { expect, it } from "vitest";
import { createGame as createGameCurrent, rerollShop, startNextRound, toggleShopLock } from "./engine";
import { assertPoolIntegrity } from "./cardPool";

it("allows one R1 reroll, rejects the second without changes, and resets for R2", () => {
  let state = createGame(11);
  state = rerollShop(state, "p1");
  expect(state.players[0].rerollsUsed).toBe(1);
  expect(state.players[0].stackBB).toBe(45);
  const before = structuredClone(state);
  expect(() => rerollShop(state, "p1")).toThrow(/횟수/);
  expect(state).toEqual(before);
  state.phase = "NEXT_ROUND";
  state = startNextRound(state);
  expect(state.players[0].rerollsUsed).toBe(0);
});

it.each(["funds", "phase", "eliminated"])("rejects %s without changing BB, count, shop or ledger", (reason) => {
  const state = createGame(12);
  if (reason === "funds") state.players[0].stackBB = 4;
  if (reason === "phase") state.phase = "ROUND_RESULT";
  if (reason === "eliminated") state.players[0].eliminated = true;
  const before = structuredClone(state);
  expect(() => rerollShop(state, "p1")).toThrow();
  expect(state).toEqual(before);
});

it("keeps locks, charges the base cost, and checks both directions of the ledger", () => {
  let state = createGame(13);
  const locked = state.players[0].shopCardIds[0];
  state = toggleShopLock(state, "p1", locked);
  state.players[0].stackBB = 5;
  state = rerollShop(state, "p1");
  expect(state.players[0].stackBB).toBe(0);
  expect(state.players[0].shopCardIds).toContain(locked);
  expect(assertPoolIntegrity(state)).toBe(true);
  state.players[1].shopCardIds.push(locked);
  expect(() => assertPoolIntegrity(state)).toThrow();
});

it("supports legacy snapshots with an absent counter", () => {
  const state = createGame(14);
  delete state.players[0].rerollsUsed;
  expect(rerollShop(state, "p1").players[0].rerollsUsed).toBe(1);
});

it("rejects reroll without charging when both dealt cards are locked", () => {
  let state = createGame(131);
  for (const id of [...state.players[0].shopCardIds]) state = toggleShopLock(state, "p1", id);
  const before = structuredClone(state);
  expect(() => rerollShop(state, "p1")).toThrow(/모든 상점 카드가 잠겨/);
  expect(state).toEqual(before);
});

// Legacy persisted rounds keep their individual shops.
function createGame(...args: Parameters<typeof createGameCurrent>) { return createGameCurrent(args[0], args[1], 1); }

it("allows three rerolls in R5 and rejects the fourth", () => {
  let state = createGame(15); state.round = 5; state.players[0].stackBB = 100;
  state = rerollShop(rerollShop(rerollShop(state, "p1"), "p1"), "p1");
  expect(state.players[0].rerollsUsed).toBe(3);
  expect(() => rerollShop(state, "p1")).toThrow(/횟수/);
});
