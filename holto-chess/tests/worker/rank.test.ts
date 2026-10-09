import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base64url } from "jose";
import { settleRankObligation } from "../../worker/rank";
import type { RankObligation } from "../../src/game/rankRoom";
import { barrierDeadline, forceBarrier, type RoomSnapshot } from "../../src/game/room";
import { finalStandings } from "../../src/game/engine";
import type { GameAction, PlayerView, ServerMessage, SessionCredential } from "../../src/shared/protocol";
import { seasonAt } from "../../src/game/rank";

const origin = "https://porena.kr";
const sockets: WebSocket[] = [];
const sha = async (value: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", origin);
  headers.set("CF-Connecting-IP", crypto.randomUUID());
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
async function account(displayName: string | null = "랭커") {
  const id = crypto.randomUUID();
  const token = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.ACCOUNT_DB.batch([
    env.ACCOUNT_DB.prepare("INSERT INTO users (id, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?)").bind(id, displayName, Date.now(), Date.now()),
    env.ACCOUNT_DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha(token), id, Date.now(), Date.now() + 3600_000),
  ]);
  return { id, cookie: `__Host-porena_session=${token}` };
}
async function seat(cookie = "", roomId?: string, extra: Record<string, string> = {}): Promise<SessionCredential> {
  const response = await call(`/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: { Cookie: cookie, ...extra } });
  expect(response.status).toBe(201);
  return await response.json() as SessionCredential;
}
const stubFor = (roomId: string) => env.GAME_ROOM.getByName(`room:${roomId}`);
const saved = async (roomId: string) => (await runInDurableObject(stubFor(roomId), (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1")))!;
async function connect(credential: SessionCredential) {
  const response = await call(`/ws/rooms/${credential.roomId}`, { headers: { Upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept(); sockets.push(ws);
  const messages: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  ws.addEventListener("message", event => { messages.push(JSON.parse(event.data as string)); for (const waiter of waiters) waiter(); });
  const wait = (predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> => {
    const found = messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const check = () => { const result = messages.find(predicate); if (result) { clearTimeout(timeout); waiters.delete(check); resolve(result); } };
      const timeout = setTimeout(() => { waiters.delete(check); reject(new Error("Room message timeout")); }, 5000);
      waiters.add(check);
    });
  };
  const view = () => (messages.filter(message => message.type === "PLAYER_VIEW").at(-1) as { type: "PLAYER_VIEW"; payload: PlayerView }).payload;
  const send = async (action: GameAction) => {
    const requestId = crypto.randomUUID();
    ws.send(JSON.stringify({ ...action, requestId, turnKey: view().turnKey }));
    const reply = await wait(message => (message.type === "ACK" || message.type === "ERROR") && message.requestId === requestId);
    if (reply.type === "ACK") await wait(message => message.type === "PLAYER_VIEW" && message.payload.revision >= reply.revision);
    return reply;
  };
  ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token }));
  await wait(message => message.type === "PLAYER_VIEW");
  return { ws, messages, wait, view, send };
}
const events = (userId: string) => env.ACCOUNT_DB.prepare("SELECT * FROM rank_events WHERE user_id = ?").bind(userId).all<Record<string, number | string>>().then(r => r.results);
const points = (userId: string, seasonId: number) => env.ACCOUNT_DB.prepare("SELECT rank_points FROM rank_profiles WHERE user_id = ? AND season_id = ?").bind(userId, seasonId).first<number>("rank_points");
const obligation = (userId: string, extra: Partial<RankObligation> = {}): RankObligation => ({
  gameId: `G-${crypto.randomUUID()}`, seasonId: 1, startedAt: 1, mode: "MULTI", playerId: "p1", userId, placement: 1, finalScore: 131, humanCount: 8, forfeited: false, ...extra,
});

beforeEach(async () => {
  await env.ACCOUNT_DB.batch(["DELETE FROM rank_events", "DELETE FROM rank_profiles", "DELETE FROM seasons", "DELETE FROM users"].map(sql => env.ACCOUNT_DB.prepare(sql)));
});
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });

describe("RANK-SYSTEM-002 D1 settlement", () => {
  it("writes one event and changes RP once, however often the same game is settled", async () => {
    const user = await account();
    const o = obligation(user.id);
    const first = await settleRankObligation(env.ACCOUNT_DB, o, 1000);
    const replay = await settleRankObligation(env.ACCOUNT_DB, o, 2000);
    expect(first).toMatchObject({ before: 100, after: 115, delta: 15, base: 8, scoreBonus: 3, humanBonus: 4 });
    expect(replay).toEqual(first);
    expect(await events(user.id)).toHaveLength(1);
    expect(await points(user.id, 1)).toBe(115);
    expect(await env.ACCOUNT_DB.prepare("SELECT games, wins, best_score FROM rank_profiles WHERE user_id = ?").bind(user.id).first()).toEqual({ games: 1, wins: 1, best_score: 131 });
  });

  it("applies concurrent games for one account one after another", async () => {
    const user = await account();
    await Promise.all([settleRankObligation(env.ACCOUNT_DB, obligation(user.id), 1), settleRankObligation(env.ACCOUNT_DB, obligation(user.id, { placement: 8, finalScore: 0 }), 2)]);
    expect(await points(user.id, 1)).toBe(100 + 15 - 8);
    expect(await events(user.id)).toHaveLength(2);
  });

  it("floors a forfeit at 0 RP and records it as 8th with no bonus", async () => {
    const user = await account();
    await settleRankObligation(env.ACCOUNT_DB, obligation(user.id), 1);
    await env.ACCOUNT_DB.prepare("UPDATE rank_profiles SET rank_points = 3 WHERE user_id = ?").bind(user.id).run();
    const result = await settleRankObligation(env.ACCOUNT_DB, obligation(user.id, { forfeited: true, placement: 1, finalScore: 150 }), 2);
    expect(result).toMatchObject({ forfeited: true, placement: 8, finalScore: 0, base: -8, scoreBonus: 0, humanBonus: 0, before: 3, after: 0 });
  });

  it("starts a season from the carried-over RP, skipping seasons the account missed", async () => {
    const user = await account();
    await settleRankObligation(env.ACCOUNT_DB, obligation(user.id, { seasonId: 1, placement: 4, finalScore: 0 }), 1);
    await env.ACCOUNT_DB.prepare("UPDATE rank_profiles SET rank_points = 600 WHERE user_id = ?").bind(user.id).run();
    const result = await settleRankObligation(env.ACCOUNT_DB, obligation(user.id, { seasonId: 3, placement: 4, finalScore: 0 }), 2);
    expect(result).toMatchObject({ before: 180, after: 180 });
    expect(await env.ACCOUNT_DB.prepare("SELECT starting_points FROM rank_profiles WHERE user_id = ? AND season_id = 3").bind(user.id).first("starting_points")).toBe(180);
  });

  it("skips an account deleted before settlement instead of failing forever", async () => {
    const user = await account();
    await env.ACCOUNT_DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
    expect(await settleRankObligation(env.ACCOUNT_DB, obligation(user.id), 1)).toEqual({ skipped: true });
    expect(await events(user.id)).toEqual([]);
  });
});

describe("RANK-SYSTEM-002 room forfeit and settlement", () => {
  async function rankedRoom() {
    const ranked = await account("랭커");
    const host = await seat(ranked.cookie);
    const guest = await seat("", host.roomId);
    const a = await connect(host); const b = await connect(guest);
    expect((await a.send({ type: "READY" })).type).toBe("ACK");
    expect((await b.send({ type: "READY" })).type).toBe("ACK");
    await a.wait(message => message.type === "PLAYER_VIEW" && message.payload.status === "PLAYING");
    return { ranked, host, guest, a, b };
  }

  it("rejects an unconfirmed leave, then forfeits once, settles -8 RP and never hands the seat back", async () => {
    const { ranked, host, a } = await rankedRoom();
    expect(a.view().rank).toMatchObject({ ranked: true, forfeited: false });
    const refused = await a.send({ type: "LEAVE_ROOM" });
    expect(refused).toMatchObject({ type: "ERROR", code: "FORFEIT_CONFIRM_REQUIRED" });
    expect((await saved(host.roomId)).sessions[0]!.departed).toBeFalsy();
    expect((await a.send({ type: "LEAVE_ROOM", confirmForfeit: true })).type).toBe("ACK");
    expect((await saved(host.roomId)).rankPending).toHaveLength(1);
    await runDurableObjectAlarm(stubFor(host.roomId));
    const room = await saved(host.roomId);
    expect(room.rankPending).toBeUndefined();
    expect(room.rank!.results.p1).toMatchObject({ forfeited: true, before: 100, after: 92 });
    expect(await points(ranked.id, seasonAt(Date.now()).id)).toBe(92);
    // Same token again: the seat stays departed and nothing is settled twice.
    const again = await connect(host);
    expect(again.view().players.find(player => player.playerId === "p1")!.departed).toBe(true);
    expect(again.view().rank).toMatchObject({ forfeited: true, result: { after: 92 } });
    expect((await saved(host.roomId)).sessions[0]!.departed).toBe(true);
    await runDurableObjectAlarm(stubFor(host.roomId));
    expect(await events(ranked.id)).toHaveLength(1);
  });

  it("keeps the settlement queued through a D1 failure and room expiry, then writes it once", async () => {
    const { ranked, host, a } = await rankedRoom();
    await env.ACCOUNT_DB.prepare("ALTER TABLE rank_events RENAME TO rank_events_offline").run();
    try {
      expect((await a.send({ type: "LEAVE_ROOM", confirmForfeit: true })).type).toBe("ACK");
      await runDurableObjectAlarm(stubFor(host.roomId));
      const failed = await saved(host.roomId);
      expect(failed.rankPending).toHaveLength(1);
      expect(failed.rankAttempts).toBe(1);
      // Force the room past its lifetime: expiry must wait for the ranked outcome.
      await runInDurableObject(stubFor(host.roomId), async (instance, state) => {
        await state.storage.put("expiresAt", Date.now() - 1);
        (instance as unknown as { expiresAt: number }).expiresAt = Date.now() - 1;
        const room = await state.storage.get<RoomSnapshot>("snapshot:v1");
        room!.rankRetryAt = Date.now() - 1;
        await state.storage.put("snapshot:v1", room);
        (instance as unknown as { room: RoomSnapshot }).room = room!;
      });
      await runDurableObjectAlarm(stubFor(host.roomId));
      expect((await saved(host.roomId)).rankPending).toHaveLength(1);
    } finally {
      await env.ACCOUNT_DB.prepare("ALTER TABLE rank_events_offline RENAME TO rank_events").run();
    }
    await runInDurableObject(stubFor(host.roomId), async (instance, state) => {
      const room = await state.storage.get<RoomSnapshot>("snapshot:v1");
      room!.rankRetryAt = Date.now() - 1;
      await state.storage.put("snapshot:v1", room);
      (instance as unknown as { room: RoomSnapshot }).room = room!;
    });
    await runDurableObjectAlarm(stubFor(host.roomId));
    expect(await events(ranked.id)).toHaveLength(1);
    expect(await points(ranked.id, seasonAt(Date.now()).id)).toBe(92);
  });

  it("settles the real placement at GAME_RESULT, even if nobody opens the final standings", async () => {
    const { ranked, host, guest, a } = await rankedRoom();
    a.ws.close(1000);
    await runInDurableObject(stubFor(host.roomId), async (instance) => {
      const room = instance as unknown as { room: RoomSnapshot; commit(next: RoomSnapshot): Promise<void>; rescheduleAlarm(): Promise<void> };
      let next = room.room;
      for (let step = 0; step < 300 && next.game.phase !== "GAME_RESULT"; step++) next = forceBarrier(next, barrierDeadline(next)!)!;
      await room.commit(next);
      await room.rescheduleAlarm();
    });
    await runDurableObjectAlarm(stubFor(host.roomId));
    const room = await saved(host.roomId);
    expect(room.game.phase).toBe("GAME_RESULT");
    expect(room.finalResultsReleasedAt).toBeUndefined();
    const placement = finalStandings(room.game).find(row => row.playerId === host.playerId)!.placement;
    const [event] = await events(ranked.id);
    expect(event).toMatchObject({ placement, forfeited: 0, human_count: 2, mode: "MULTI" });
    expect(room.rank!.results[host.playerId]).toMatchObject({ placement });
    // The guest seat is never ranked.
    expect(room.rank!.seats[guest.playerId]).toBeUndefined();
    expect((await env.ACCOUNT_DB.prepare("SELECT COUNT(*) AS n FROM rank_events").first<number>("n"))).toBe(1);
  });

  it("creates a ranked solo room only for a signed-in account and starts it at once", async () => {
    const anonymous = await call("/api/rooms", { method: "POST", headers: { "X-Porena-Mode": "solo" } });
    expect(anonymous.status).toBe(401);
    const forged = await call("/api/rooms", { method: "POST", headers: { "X-Internal-Porena-Solo": "1" } });
    expect(forged.status).toBe(201);
    expect((await saved((await forged.json() as SessionCredential).roomId)).status).toBe("LOBBY");
    const user = await account("솔로");
    const solo = await seat(user.cookie, undefined, { "X-Porena-Mode": "solo" });
    const room = await saved(solo.roomId);
    expect(room).toMatchObject({ status: "PLAYING", solo: true, rank: { mode: "SOLO", humanCount: 1 } });
    const client = await connect(solo);
    expect(client.view()).toMatchObject({ solo: true, rank: { ranked: true, forfeited: false } });
  });
});

describe("RANK-SYSTEM-002 rankings API", () => {
  it("orders by RP, then who reached it first, never exposing account ids", async () => {
    const season = seasonAt(Date.now()).id;
    const rows: [string, number, number][] = [["가", 140, 5], ["나", 140, 3], ["다", 180, 9], ["라", 90, 1], ["마", 130, 2]];
    const users = [];
    for (const [name, rp, updated] of rows) {
      const user = await account(name);
      users.push(user);
      await settleRankObligation(env.ACCOUNT_DB, obligation(user.id, { seasonId: season, placement: 4, finalScore: 0 }), updated);
      await env.ACCOUNT_DB.prepare("UPDATE rank_profiles SET rank_points = ?, updated_at = ? WHERE user_id = ?").bind(rp, updated, user.id).run();
    }
    await account("미참가");
    const response = await call("/api/rankings");
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const user of users) expect(text).not.toContain(user.id);
    const board = JSON.parse(text) as { total: number; podium: { displayName: string; rank: number; tier: string }[]; entries: { displayName: string; rank: number }[] };
    expect(board.total).toBe(5);
    expect(board.podium.map(entry => entry.displayName)).toEqual(["다", "나", "가"]);
    expect(board.entries.map(entry => [entry.rank, entry.displayName])).toEqual([[4, "마"], [5, "라"]]);
    const me = await (await call("/api/rankings/me", { headers: { Cookie: users[0]!.cookie } })).json() as { rank: number; points: number; tier: string };
    expect(me).toMatchObject({ rank: 3, points: 140, tier: "HIGH_CARD" });
    expect(await (await call("/api/rankings/me")).json()).toMatchObject({ authenticated: false });
  });
});
