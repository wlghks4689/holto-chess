import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom as createRoomCurrent, forceBarrier, migrateRoomSnapshot, resumeSession, turnKey, type RoomSnapshot } from "./room";
import { ABILITY_IDS } from "./abilities";
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
    for (let i = 0; i < 2; i += 1) r = act(r, "p1", { type: "BUY_CARD", cardId: createPlayerView(r, "p1").me.shopCards[0]!.card.id });
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
    expect(r.game.phase).toBe("ABILITY_DEAL");
    expect(r.game.round).toBe(1);
    expect(r.readyIds).toEqual([]);
    expect(new Set(r.game.players.map((player) => player.abilityId)).size).toBe(8);
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
    view.me.shopCards[0].card.rank = 2;
    expect(r).not.toHaveProperty("me");
  });
  it("sends only the viewer's own dealt ability until the reveal, to players and spectators alike", () => {
    let r = createRoomCurrent("ABCDEF", 303, "seeded", 2, true);
    r = addSession(r, "hash-0").room;
    r = addSession(r, "hash-1").room;
    const ability = (id: string) => r.game.players.find(player => player.id === id)!.abilityId!;
    const othersIn = (json: string, viewer: string) => r.game.players.filter(player => player.id !== viewer).filter(player => json.includes(`"${player.abilityId}"`));
    // Dealt with the game but hidden in the lobby, even from the owner.
    expect(JSON.stringify(createPlayerView(r, "p1"))).not.toContain("abilityId");
    r.status = "PLAYING";
    expect(r.game.phase).toBe("ABILITY_DEAL");
    const own = createPlayerView(r, "p1");
    expect(own.abilityDraft).toEqual({ mine: ability("p1"), abilities: [] });
    expect(own.me.abilityId).toBe(ability("p1"));
    expect(othersIn(JSON.stringify(own), "p1")).toEqual([]);
    expect(othersIn(JSON.stringify(createPlayerView(r, "p2")), "p2")).toEqual([]);
    // An eliminated viewer follows live seats; their dealt abilities stay hidden too.
    r.game.players[1]!.eliminated = true;
    const spectator = createPlayerView(r, "p2");
    expect(spectator.spectatorViews?.length).toBeGreaterThan(0);
    expect(othersIn(JSON.stringify(spectator), "p2")).toEqual([]);
    r.game.players[1]!.eliminated = false;

    r.game.phase = "ABILITY_REVEAL";
    const reveal = createPlayerView(r, "p2");
    expect(reveal.abilityDraft?.abilities).toHaveLength(8);
    expect(reveal.players.map(player => player.abilityId)).toEqual(r.game.players.map(player => player.abilityId));
    expect(reveal.abilityDraft).not.toHaveProperty("deck");
  });
  it("keeps the 30 second reveal deadline, or advances once every human is ready", () => {
    let r = createRoomCurrent("DRAFT", 303, "seeded", 2, true);
    for (let i = 0; i < 8; i++) r = addSession(r, `draft-${i}`).room;
    for (const session of r.sessions) r = applyRoomAction(r, session.playerId, { type: "READY" }, turnKey(r), 1000);
    // The deal is server-timed: nobody readies it, and it ends five seconds after the game starts.
    expect(r.game.phase).toBe("ABILITY_DEAL");
    expect(barrierDeadline(r)).toBe(6_000);
    expect(() => applyRoomAction(r, "p1", { type: "READY" }, turnKey(r), 2_000)).toThrow();
    expect(forceBarrier(r, 5_999)).toBeNull();
    r = forceBarrier(r, 6_000)!;
    expect(r.game.phase).toBe("ABILITY_REVEAL");
    expect(barrierDeadline(r)).toBe(36_000);
    const deadline = barrierDeadline(r)!;
    expect(forceBarrier(r, deadline - 1)).toBeNull();
    expect(forceBarrier(r, deadline)!.game.phase).toBe("SHOP");
    r = applyRoomAction(r, "p1", { type: "READY" }, turnKey(r), deadline - 10_000);
    expect(r.game.phase).toBe("ABILITY_REVEAL");
    expect(barrierDeadline(r)).toBe(deadline);
    expect(createPlayerView(r, "p1").players[0].ready).toBe(true);
    r = applyRoomAction(r, "p1", { type: "READY" }, turnKey(r), deadline - 9_000);
    expect(r.readyIds).toEqual(["p1"]);
    for (const session of r.sessions.slice(1)) r = applyRoomAction(r, session.playerId, { type: "READY" }, turnKey(r), deadline - 8_000);
    expect(r.game.phase).toBe("SHOP");
    expect(r.readyIds).toEqual([]);
  });
  it("never stalls the deal: 1, 2 or 8 humans, everyone gone, and a reconnect mid-deal", () => {
    const started = (humans: number) => {
      let r = createRoomCurrent("DEALS", 303, "seeded", 2, true);
      for (let i = 0; i < Math.max(humans, 2); i++) r = addSession(r, `deal-${i}`).room;
      for (const session of r.sessions) r = applyRoomAction(r, session.playerId, { type: "READY" }, turnKey(r), 1000);
      return r;
    };
    for (const humans of [2, 8]) {
      const r = forceBarrier(started(humans), 6_000)!;
      expect(r.game.phase).toBe("ABILITY_REVEAL");
    }
    // One human left at the table: the other seat departed.
    let one = applyRoomAction(started(2), "p2", { type: "LEAVE_ROOM" }, turnKey(started(2)), 2_000);
    expect(one.game.phase).toBe("ABILITY_DEAL");
    one = forceBarrier(one, barrierDeadline(one)!)!;
    expect(one.game.phase).toBe("ABILITY_REVEAL");
    // Every human gone: bots carry the game on without waiting for a timer.
    let empty = started(2);
    empty = applyRoomAction(empty, "p1", { type: "LEAVE_ROOM" }, turnKey(empty), 2_000);
    empty = applyRoomAction(empty, "p2", { type: "LEAVE_ROOM" }, turnKey(empty), 2_000);
    expect(["ABILITY_DEAL", "ABILITY_REVEAL"]).not.toContain(empty.game.phase);
    // Leaving and coming back during the deal keeps the original deadline.
    let back = applyRoomAction(started(2), "p2", { type: "LEAVE_ROOM" }, turnKey(started(2)), 2_000);
    back = resumeSession(back, "p2", 3_000)!;
    expect(back.game.phase).toBe("ABILITY_DEAL");
    expect(forceBarrier(back, barrierDeadline(back)!)!.game.phase).toBe("ABILITY_REVEAL");
  });
  it("finishes a deal saved under the retired pick flow, keeping abilities already picked", () => {
    const legacy = (status: "LOBBY" | "PLAYING", phase: string, picks: { playerId: string; slot: number }[]) => {
      let r = createRoomCurrent("OLDPK", 303, "seeded", 2, true);
      r = addSession(addSession(r, "old-0").room, "old-1").room;
      r.status = status;
      const game = r.game as unknown as { phase: string; abilityDraft: { order: string[]; deck: string[]; picks: typeof picks }; players: { id: string; abilityId?: string }[] };
      game.phase = phase;
      game.abilityDraft = { order: game.players.map(player => player.id).reverse(), deck: [...ABILITY_IDS], picks };
      for (const player of game.players) delete player.abilityId;
      for (const pick of picks) game.players.find(player => player.id === pick.playerId)!.abilityId = ABILITY_IDS[pick.slot];
      return JSON.parse(JSON.stringify(r)) as RoomSnapshot;
    };
    const playing = migrateRoomSnapshot(legacy("PLAYING", "ABILITY_PICK", [{ playerId: "p8", slot: 0 }, { playerId: "p3", slot: 11 }]));
    expect(playing.game.phase).toBe("ABILITY_REVEAL");
    expect(playing.game.players.find(player => player.id === "p8")!.abilityId).toBe(ABILITY_IDS[0]);
    expect(playing.game.players.find(player => player.id === "p3")!.abilityId).toBe(ABILITY_IDS[11]);
    expect(new Set(playing.game.players.map(player => player.abilityId)).size).toBe(8);
    expect(barrierDeadline(playing)).toBeGreaterThanOrEqual(Date.now() + 29_000);
    expect(forceBarrier(playing, barrierDeadline(playing)!)!.game.phase).toBe("SHOP");
    const ordering = migrateRoomSnapshot(legacy("PLAYING", "ABILITY_ORDER", []));
    expect(ordering.game.phase).toBe("ABILITY_REVEAL");
    expect(new Set(ordering.game.players.map(player => player.abilityId)).size).toBe(8);
    const waiting = migrateRoomSnapshot(legacy("LOBBY", "ABILITY_ORDER", []));
    expect(waiting.game.phase).toBe("ABILITY_DEAL");
    expect(new Set(waiting.game.players.map(player => player.abilityId)).size).toBe(8);
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
    for (let steps = 0; steps < 220 && r.game.phase !== "GAME_RESULT"; steps++) {
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
      } else if (["DRAFT_ORDER", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY", "FINAL_AUCTION", "FINAL_LOADOUT"].includes(r.game.phase)) {
        r = forceBarrier(r, barrierDeadline(r)!)!;
      } else {
        if (!active.length) r = forceBarrier(r, barrierDeadline(r)!)!;
        else for (const s of active) r = act(r, s.playerId, { type: "READY" });
      }
      expect(r.game.phase).not.toBe("NEXT_ROUND");
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
            sawR5 = true; expect(m.boards).toHaveLength(1); expect(m.participantIds).toHaveLength(4);
            for (const id of m.participantIds) {
              expect(m.revealedCards[id].map((card) => card.id)).toEqual(r.game.players.find((p) => p.id === id)!.finalLoadoutCardIds);
              expect(m.revealedCards[id]).toHaveLength(5);
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
    const one = act(base, "p1", { type: "BUY_CARD", cardId: id });
    const capped = act(one, "p1", { type: "BUY_CARD", cardId: one.game.players[0].shopCardIds[0] });
    const extra = structuredClone(capped); extra.game.players[0].purchasesThisRound = 0; extra.game.players[0].shopCardIds = [...one.game.players[1].shopCardIds];
    expect(() => act(extra, "p1", { type: "BUY_CARD", cardId: extra.game.players[0].shopCardIds[0] })).toThrow();
    const spent = structuredClone(base); spent.game.players[0].purchasesThisRound = 2;
    expect(() => act(spent, "p1", { type: "BUY_CARD", cardId: id })).toThrow();
    const dead = structuredClone(base); dead.game.players[0].eliminated = true;
    expect(() => act(dead, "p1", { type: "BUY_CARD", cardId: id })).toThrow();
    expect(() => act(capped, "p1", { type: "SELL_CARD", cardId: base.game.players[1].shopCardIds[0] })).toThrow();
    expect(() => act(base, "p1", { type: "END_SHOP_PHASE" })).toThrow();
  });
  it("prevents selling into an unrecoverable hand-size deadlock", () => {
    let r = start();
    r = act(r, "p1", { type: "BUY_CARD", cardId: r.game.players[0].shopCardIds[0] });
    const before = structuredClone(r);
    expect(() => act(r, "p1", { type: "SELL_CARD", cardId: r.game.players[0].ownedCardIds[0] })).toThrow("남은 구매 횟수");
    expect(r).toEqual(before);
  });
});

// Regression coverage for persisted games created before the open-draft rules.
function createRoom(...args: Parameters<typeof createRoomCurrent>) { return createRoomCurrent(args[0], args[1], args[2], 1); }
