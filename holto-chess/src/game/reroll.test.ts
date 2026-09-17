import { expect, it } from "vitest";
import { createGame, rerollShop, startNextRound, toggleShopLock } from "./engine";
import { assertPoolIntegrity } from "./cardPool";

it("allows two rerolls, rejects the third without changes, and resets next round", () => {
  let state = createGame(11);
  state = rerollShop(rerollShop(state, "p1"), "p1");
  expect(state.players[0].rerollsUsed).toBe(2);
  expect(state.players[0].stackBB).toBe(40);
  const before = structuredClone(state);
  expect(() => rerollShop(state, "p1")).toThrow(/횟수/);
  expect(state).toEqual(before);
  state.phase = "NEXT_ROUND";
  state = startNextRound(state);
  expect(state.players[0].rerollsUsed).toBe(0);
  expect(rerollShop(rerollShop(state, "p1"), "p1").players[0].rerollsUsed).toBe(2);
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

it("keeps locks, honors discounts, and checks both directions of the ledger", () => {
  let state = createGame(13);
  const locked = state.players[0].shopCardIds[0];
  state = toggleShopLock(state, "p1", locked);
  state.players[0].augments.push({ id: "reroll_discount", name: "test", description: "test" });
  state.players[0].stackBB = 3;
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

it("allows three rerolls in R5 and rejects the fourth", () => {
  let state = createGame(15); state.round = 5; state.players[0].stackBB = 100;
  state = rerollShop(rerollShop(rerollShop(state, "p1"), "p1"), "p1");
  expect(state.players[0].rerollsUsed).toBe(3);
  expect(() => rerollShop(state, "p1")).toThrow(/횟수/);
});
