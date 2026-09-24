import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom as createRoomCurrent, forceBarrier, turnKey, type RoomSnapshot } from "./room";
import { createPlayerView } from "./playerView";
import { parseClientMessage, type GameAction } from "../shared/protocol";
import { assertPoolIntegrity } from "./cardPool";

function lobby(count = 2, seed = 303) {
  let room = createRoom("ABCDEF", seed);
  for (let i = 0; i < count; i++) room = addSession(room, `hash-${i}`).room;
  return room;
}
// Clients confirm only after the shared presentation has finished.
function act(r: RoomSnapshot, id: string, a: GameAction) { return applyRoomAction(r, id, a, turnKey(r), Math.max(Date.now(), r.presentation?.endsAt ?? 0)); }
function start(count = 2, seed = 303) {
  let r = lobby(count, seed);
  for (const s of r.sessions) r = act(r, s.playerId, { type: "READY" });
  return r;
}
describe("server room authority and projections", () => {
  it("rejects retired decisions and validates guest nicknames", () => {
    expect(() => parseClientMessage(JSON.stringify({ type: "SELECT_AUGMENT", augmentId: "r5_hand_bonus", requestId: "test-request", turnKey: "4:AUGMENT" }))).toThrow("지원하지 않는 명령");
    expect(parseClientMessage(JSON.stringify({ type: "JOIN_ROOM", token: "a".repeat(64), nickname: "테스터 1" }))).toHaveProperty("nickname", "테스터 1");
    expect(() => parseClientMessage(JSON.stringify({ type: "JOIN_ROOM", token: "a".repeat(64), nickname: "123456789" }))).toThrow("1~8자");
    expect(() => parseClientMessage(JSON.stringify({ type: "JOIN_ROOM", token: "a".repeat(64), nickname: "<script>" }))).toThrow();
  });
  it("requires two humans, clears ready on joins, and never treats a human as AI", () => {
    let r = lobby(1);
    r = act(r, "p1", { type: "READY" }); expect(r.status).toBe("LOBBY");
    r = addSession(r, "second").room; expect(r.readyIds).toEqual([]);
    r = act(act(r, "p1", { type: "READY" }), "p2", { type: "READY" });
    expect(r.status).toBe("PLAYING");
    expect(r.game.players[1].purchasesThisRound).toBe(0);
  });
  it("rejects opponent purchases, spoofed authority, invalid phases and stale turns without mutating state", () => {
    const r = start(); const before = structuredClone(r);
    expect(() => act(r, "p1", { type: "BUY_CARD", cardId: r.game.players[1].shopCardIds[0] })).toThrow();
    expect(() => act(r, "p3", { type: "REROLL" })).toThrow();
    expect(() => applyRoomAction(r, "p1", { type: "REROLL" }, "1:LOBBY")).toThrow();
    expect(() => parseClientMessage(JSON.stringify({ type: "BUY_CARD", cardId: "As", playerId: "p2", stackBB: 999, requestId: "abcdefghi", turnKey: "1:SHOP" }))).toThrow();
    expect(() => parseClientMessage('{"type":"__proto__","requestId":"abcdefghi","turnKey":"1:SHOP"}')).toThrow();
    expect(r).toEqual(before);
  });
  it("lets a player cancel deck readiness while another player is still preparing", () => {
    let r = start();
    const shopCard = createPlayerView(r, "p1").me.shopCards[0]!.card.id;
    r = act(r, "p1", { type: "BUY_CARD", cardId: shopCard });
    r = act(r, "p1", { type: "END_SHOP_PHASE" });
    expect(createPlayerView(r, "p1").me.committed).toBe(true);
    r = act(r, "p1", { type: "CANCEL_SHOP_READY" });
    expect(createPlayerView(r, "p1").me.committed).toBe(false);
    expect(r.game.phase).toBe("SHOP");
  });
  it("starts a fresh game in the same room after every remaining player requests a rematch", () => {
    let r = start();
    r.game.phase = "GAME_RESULT";
    r.finalResultsReleasedAt = Date.now();
    r.game.players[0].name = "첫 번째";
    r.game.players[1].name = "두 번째";
    r.game.players[0].eliminated = true;
    r = act(r, "p1", { type: "REMATCH_READY" });
    expect(r.game.phase).toBe("GAME_RESULT");
    expect(r.readyIds).toEqual(["p1"]);
    r = act(r, "p2", { type: "REMATCH_READY" });
    expect(r.game.phase).toBe("SHOP");
    expect(r.game.round).toBe(1);
    expect(r.readyIds).toEqual([]);
    expect(r.game.players.slice(0, 2).map((player) => player.name)).toEqual(["첫 번째", "두 번째"]);
    expect(r.game.players.every((player) => !player.eliminated)).toBe(true);
  });
  it("does not serialize private cards, logs, ledger, seed or another player's choices", () => {
    const r = start();
    r.game.logs.push({ id: 999, tone: "info", message: "SECRET_LOG" });
    const view = createPlayerView(r, "p1"); const json = JSON.stringify(view);
    for (const id of [...r.game.players[1].ownedCardIds, ...r.game.players[1].shopCardIds]) expect(json).not.toContain(`"${id}"`);
    for (const key of ["ownershipCardPool", "seed", "tokenHash", "SECRET_LOG", "selectedCardIds"]) {
      if (key !== "selectedCardIds") expect(json).not.toContain(key);
      else expect(view.players.every((p) => !(key in p))).toBe(true);
    }
    expect(view.matches).toEqual([]);
    view.me.ownedCards[0].rank = 2;
    expect(r).not.toHaveProperty("me");
  });
  it("exposes read-only live player perspectives only after the viewer is eliminated", () => {
    const r = start();
    expect(createPlayerView(r, "p1").spectatorViews).toBeUndefined();

    r.game.players[0].eliminated = true;
    const view = createPlayerView(r, "p1");
    expect(view.spectatorViews?.map((candidate) => candidate.playerId)).toEqual(
      r.game.players.filter((player) => !player.eliminated).map((player) => player.id),
    );
    const playerTwo = view.spectatorViews?.find((candidate) => candidate.playerId === "p2");
    expect(playerTwo?.me.ownedCards).toHaveLength(r.game.players[1].ownedCardIds.length);
    expect(playerTwo?.me.ownedCards.every(card => card.hidden)).toBe(true);
    expect(playerTwo?.me.shopCards).toEqual([]);
    expect(view.me.playerId).toBe("p1");
  });
  it.each([2, 3, 8])("completes all five rounds with %i humans using shared rules", (count) => {
    let r = start(count);
    let sawR2 = false; let sawR5 = false;
    for (let steps = 0; steps < 100 && r.game.phase !== "GAME_RESULT"; steps++) {
      const active = r.sessions.filter((s) => !r.game.players.find((p) => p.id === s.playerId)!.eliminated);
      if (r.game.phase === "SHOP") {
        for (const s of active) {
          let v = createPlayerView(r, s.playerId);
          while (v.me.ownedCards.length < v.me.handLimit) {
            r = act(r, s.playerId, { type: "BUY_CARD", cardId: v.me.shopCards[0].card.id });
            v = createPlayerView(r, s.playerId);
          }
          if (r.game.round === 2) {
            const required = 2;
            r = act(r, s.playerId, { type: "SELECT_CARDS", cardIds: v.me.ownedCards.slice(0, required).map((c) => c.id) });
          }
          r = act(r, s.playerId, { type: "END_SHOP_PHASE" });
        }
      } else if (["DRAFT_ORDER", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(r.game.phase)) {
        r = forceBarrier(r, barrierDeadline(r)!)!;
      } else {
        if (!active.length) r = forceBarrier(r, barrierDeadline(r)!)!;
        else for (const s of active) r = act(r, s.playerId, { type: "READY" });
      }
      assertPoolIntegrity(r.game);
      for (const session of r.sessions) {
        const v = createPlayerView(r, session.playerId, [], Math.max(Date.now(), r.presentation?.endsAt ?? 0));
        for (const m of v.matches) {
          if (v.me.alive) expect(m.participantIds).toContain(session.playerId);
          const source = r.game.roundResults.find((result) => result.id === m.id)!;
          expect(m.results).toEqual(source.results.map((result) => ({
            playerId: result.playerId, place: result.place,
            category: result.hand.category, kickers: result.hand.kickers,
            displayName: result.hand.displayName, usedCardIds: result.usedCardIds,
          })));
          for (const result of m.results) expect(new Set(result.usedCardIds).size).toBe(5);
          if (r.game.round === 2) {
            sawR2 = true;
            for (const cards of Object.values(m.revealedCards)) expect(cards).toHaveLength(2);
            expect(new Set(m.boards.slice(0, 2).flat().map((c) => c.id)).size).toBe(10);
          }
          for (const reward of m.rewards) {
            expect(reward.afterBB - reward.beforeBB).toBe(reward.deltaBB);
            expect(reward.afterPoints - reward.beforePoints).toBe(reward.deltaPoints);
            const currentPoints = r.game.players.find((p) => p.id === reward.playerId)!.points;
            if ((r.game.round !== 3 || m.gameNumber === 2) && (r.game.round !== 1 || m.matchday === 3)) expect(reward.afterPoints).toBe(currentPoints);
            else expect(reward.afterPoints).toBeLessThanOrEqual(currentPoints);
          }
          if (r.game.round === 5) {
            sawR5 = true; expect(m.boards).toHaveLength(0); expect(m.participantIds).toHaveLength(4);
            for (const id of m.participantIds) {
              expect(m.revealedCards[id].map((card) => card.id)).toEqual(r.game.players.find((p) => p.id === id)!.ownedCardIds);
              expect(m.revealedCards[id].length).toBeLessThanOrEqual(7);
            }
          }
        }
      }
    }
    expect(r.game.phase).toBe("GAME_RESULT");
    expect(r.game.players.filter((p) => !p.eliminated)).toHaveLength(4);
    expect(sawR2).toBe(true);
    if (count === 8) expect(sawR5).toBe(true);
  });
  it("freezes a committed shop and only advances after all surviving humans commit", () => {
    let r = start();
    r = act(r, "p1", { type: "BUY_CARD", cardId: r.game.players[0].shopCardIds[0] });
    r = act(r, "p1", { type: "END_SHOP_PHASE" });
    expect(r.game.phase).toBe("SHOP");
    expect(() => act(r, "p1", { type: "REROLL" })).toThrow();
    expect(r.game.players[1].purchasesThisRound).toBe(0);
  });
  it("enforces balance, ownership cap, purchase count and elimination on the server", () => {
    const base = start(); const id = base.game.players[0].shopCardIds[0];
    const broke = structuredClone(base); broke.game.players[0].stackBB = 0;
    expect(() => act(broke, "p1", { type: "BUY_CARD", cardId: id })).toThrow();
    const capped = act(base, "p1", { type: "BUY_CARD", cardId: id });
    expect(() => act(capped, "p1", { type: "BUY_CARD", cardId: capped.game.players[0].shopCardIds[0] })).toThrow();
    const spent = structuredClone(base); spent.game.players[0].purchasesThisRound = 2;
    expect(() => act(spent, "p1", { type: "BUY_CARD", cardId: id })).toThrow();
    const dead = structuredClone(base); dead.game.players[0].eliminated = true;
    expect(() => act(dead, "p1", { type: "BUY_CARD", cardId: id })).toThrow();
    expect(() => act(base, "p1", { type: "SELL_CARD", cardId: base.game.players[1].ownedCardIds[0] })).toThrow();
    expect(() => act(base, "p1", { type: "END_SHOP_PHASE" })).toThrow();
  });
  it("prevents selling into an unrecoverable hand-size deadlock", () => {
    let r = start();
    const initial = r.game.players[0].ownedCardIds[0];
    r = act(r, "p1", { type: "SELL_CARD", cardId: initial });
    r = act(r, "p1", { type: "BUY_CARD", cardId: r.game.players[0].shopCardIds[0] });
    r = act(r, "p1", { type: "BUY_CARD", cardId: r.game.players[0].shopCardIds[0] });
    const before = structuredClone(r);
    expect(() => act(r, "p1", { type: "SELL_CARD", cardId: r.game.players[0].ownedCardIds[0] })).toThrow("남은 구매 횟수");
    expect(r).toEqual(before);
  });
});

// Regression coverage for persisted games created before the open-draft rules.
function createRoom(...args: Parameters<typeof createRoomCurrent>) { return createRoomCurrent(args[0], args[1], args[2], 1); }
