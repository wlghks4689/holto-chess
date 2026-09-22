import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";
import { assertPoolIntegrity } from "./cardPool";
import { createPlayerView } from "./playerView";
import type { GameAction } from "../shared/protocol";
import { createGame, prepareShowdown, resolvePrimary } from "./engine";

const startTime = 1_000_000;
function started(count = 2, seed = 20260922) {
  let room = createRoom("QAABCD", seed);
  for (let i = 0; i < count; i++) room = addSession(room, `qa-${i}`).room;
  for (const session of room.sessions) room = act(room, session.playerId, { type: "READY" });
  return room;
}
function act(room: RoomSnapshot, id: string, action: GameAction, now = startTime) {
  return applyRoomAction(room, id, action, turnKey(room), now);
}

describe("release audit: real v2 room loop", () => {
  it.each([2, 4, 8])("finishes R1–R5 with %i human sessions and timeout AI, preserving ledger and projections", (count) => {
    let room = started(count);
    const rounds = new Set<number>();
    const phases = new Set<string>();
    for (let step = 0; step < 120 && room.game.phase !== "GAME_RESULT"; step++) {
      rounds.add(room.game.round); phases.add(room.game.phase);
      const deadline = barrierDeadline(room);
      expect(deadline, `${room.game.round}:${room.game.phase}`).toBeDefined();
      const before = structuredClone(room);
      room = forceBarrier(room, deadline!)!;
      expect(room.revision).toBeGreaterThan(before.revision);
      expect(assertPoolIntegrity(room.game)).toBe(true);
      expect(room.game.players.every((p) => p.stackBB >= 0)).toBe(true);
      if (room.game.round === 4 && ["DRAFT_ORDER", "OPEN_DRAFT", "SHOP", "SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY"].includes(room.game.phase)) expect(room.game.players.filter((p) => !p.eliminated)).toHaveLength(6);
      for (const session of room.sessions) {
        const view = createPlayerView(room, session.playerId, [], deadline!);
        expect(JSON.stringify(view)).not.toMatch(/tokenHash|ownershipCardPool|"seed"/);
        if (view.me.alive) expect(view.spectatorViews).toBeUndefined();
        // Payload generation and simulated refresh must not mutate authoritative rewards.
        expect(createPlayerView(structuredClone(room), session.playerId, [], deadline!)).toEqual(view);
      }
    }
    expect(room.game.phase).toBe("GAME_RESULT");
    expect([...rounds]).toEqual([1, 2, 3, 4, 5]);
    expect(phases.has("OPEN_DRAFT")).toBe(true);
    expect(phases.has("RUN_LOADOUT")).toBe(true);
    expect(room.game.players.filter((p) => !p.eliminated)).toHaveLength(4);
    const final = createPlayerView(room, "p1").standings;
    for (const session of room.sessions) expect(createPlayerView(room, session.playerId).standings).toEqual(final);
  });
});

describe("release audit: deadline and stale-action regressions", () => {
  it("settles either draft input or timeout once at the last 100ms and rejects the losing command", () => {
    let room = started(8);
    while (room.game.phase !== "OPEN_DRAFT") room = forceBarrier(room, barrierDeadline(room)!)!;
    const picker = room.game.draft!.order[0]!.playerId;
    const cardId = room.game.draft!.cardIds[0]!;
    const end = barrierDeadline(room)!;
    const manual = act(room, picker, { type: "DRAFT_PICK", cardId }, end - 100);
    expect(manual.game.draft!.picks).toHaveLength(1);
    expect(forceBarrier(manual, end)).toBeNull();
    expect(() => act(manual, picker, { type: "DRAFT_PICK", cardId }, end - 50)).toThrow();
    const automatic = forceBarrier(room, end)!;
    expect(automatic.game.draft!.picks).toHaveLength(1);
    expect(() => act(automatic, picker, { type: "DRAFT_PICK", cardId }, end)).toThrow();
    expect(assertPoolIntegrity(manual.game)).toBe(true);
    expect(assertPoolIntegrity(automatic.game)).toBe(true);
  });
  it("does not give a live R4 shopper other players' owned cards or augment choices; spectators cannot buy", () => {
    let room = started(8);
    while (!(room.game.round === 4 && room.game.phase === "SHOP")) room = forceBarrier(room, barrierDeadline(room)!)!;
    const alive = room.game.players.filter((player) => !player.eliminated);
    const eliminated = room.game.players.find((player) => player.eliminated)!;
    const privateView = createPlayerView(room, alive[0]!.id);
    const serialized = JSON.stringify(privateView);
    for (const player of alive.slice(1)) {
      for (const id of [...player.ownedCardIds, ...player.shopCardIds]) expect(serialized).not.toContain(`"${id}"`);
    }
    expect(privateView.spectatorViews).toBeUndefined();
    const spectator = createPlayerView(room, eliminated.id);
    expect(spectator.spectatorViews).toHaveLength(6);
    expect(() => act(room, eliminated.id, { type: "BUY_CARD", cardId: alive[0]!.shopCardIds[0]! }, room.barrierSince!)).toThrow();
  });
  it("captures R1 per-match points instead of leaking the final round total into Match 1", () => {
    const game = resolvePrimary(prepareShowdown(createGame(20260922), []));
    for (const match of game.roundResults) for (const reward of match.rewards!) {
      expect(match.standingsBefore![reward.playerId]).toBe(reward.beforePoints);
      expect(match.standingsAfterRuns![0]![reward.playerId]).toBe(reward.afterPoints);
    }
    expect(game.roundResults.filter((match) => match.matchday === 1).every((match) =>
      match.playerIds.every((id) => match.standingsBefore![id] === 0))).toBe(true);
  });
  it.each(["SHOP", "AUGMENT"] as const)("rejects a decision at the exact %s deadline before the alarm runs", (phase) => {
    let room = started();
    while (room.game.phase !== phase) room = forceBarrier(room, barrierDeadline(room)!)!;
    const action: GameAction = phase === "SHOP" ? { type: "REROLL" } : { type: "SELECT_AUGMENT", augmentId: room.augmentChoices.p1![0]!.id };
    const deadline = barrierDeadline(room)!;
    expect(() => act(room, "p1", action, deadline - 100)).not.toThrow();
    expect(() => act(room, "p1", action, deadline)).toThrow(/시간/);
  });
  it("does not reuse a previous game's turn key after a same-room rematch", () => {
    let room = started();
    const oldTurn = turnKey(room);
    const oldGameId = createPlayerView(room, "p1").gameId;
    room.game.phase = "GAME_RESULT";
    room = act(room, "p1", { type: "REMATCH_READY" });
    room = act(room, "p2", { type: "REMATCH_READY" });
    expect(room.game.phase).toBe("SHOP");
    expect(createPlayerView(room, "p1").gameId).not.toBe(oldGameId);
    expect(createPlayerView(room, "p1").roomId).toBe(room.roomId);
    expect(() => applyRoomAction(room, "p1", { type: "REROLL" }, oldTurn, startTime)).toThrow(/단계/);
  });
});

describe("release audit: known release blocker (requires economy policy)", () => {
  it("reproduces legal lock spending leaving an empty hand that crashes timeout showdown", () => {
    let room = started();
    room = act(room, "p1", { type: "SELL_CARD", cardId: room.game.players[0]!.ownedCardIds[0]! });
    const locked = room.game.players[0]!.shopCardIds[0]!;
    while (room.game.players[0]!.stackBB >= 3) {
      room = act(room, "p1", { type: "LOCK_SHOP", cardId: locked });
      room = act(room, "p1", { type: "LOCK_SHOP", cardId: locked });
    }
    expect(room.game.players[0]!.ownedCardIds).toHaveLength(0);
    expect(room.game.players[0]!.stackBB).toBeLessThan(3);
    room = forceBarrier(room, barrierDeadline(room)!)!;
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(room.game.players[0]!.ownedCardIds).toHaveLength(0);
    // This assertion documents the unresolved blocker; it does NOT certify this path as healthy.
    expect(() => forceBarrier(room, barrierDeadline(room)!)).toThrow("Partial hand requires between one and four cards");
  });
});
