import { env, exports } from "cloudflare:workers";
import { createExecutionContext, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { base64url } from "jose";
import worker from "../../worker/index";
import type { RoomSnapshot } from "../../src/game/room";
import type { GameAction, PlayerView, ServerMessage } from "../../src/shared/protocol";
import { publicCreateCandidate } from "../../worker/publicRoomKeys";
import { freshListing } from "../../worker/publicList";
import { runPublicLobbyRepair } from "../../worker/publicRepair";
import type { PublicRoomEnv } from "../../worker/publicRoomKeys";

// Account seats need the configured auth origin (AUTH_ORIGIN in vitest.workers.config.ts).
const origin = "https://porena.kr";
const sockets: WebSocket[] = [];
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });
type Credential = { roomId: string; playerId: string; token: string; instanceId: string; reservedUntil?: number };
type Internal = { room: RoomSnapshot; expiresAt: number };

const sha = async (value: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", origin);
  if (!headers.has("CF-Connecting-IP")) headers.set("CF-Connecting-IP", crypto.randomUUID());
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
let accounts = 0;
async function account() {
  const id = crypto.randomUUID(), token = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.ACCOUNT_DB.batch([
    env.ACCOUNT_DB.prepare("INSERT INTO users (id, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?)").bind(id, `공개${++accounts}`, Date.now(), Date.now()),
    env.ACCOUNT_DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha(token), id, Date.now(), Date.now() + 3600_000),
  ]);
  return { id, cookie: `__Host-porena_session=${token}` };
}
const accountsOf = (n: number) => Promise.all(Array.from({ length: n }, account));
const post = (path: string, cookie: string, body: unknown) => call(path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const createPublic = (cookie: string, requestId: string = crypto.randomUUID()) => post("/api/public-rooms", cookie, { requestId });
const joinPublic = (room: Credential, cookie: string, requestId: string = crypto.randomUUID(), instanceId = room.instanceId) =>
  post(`/api/public-rooms/${room.roomId}/join`, cookie, { requestId, instanceId });
async function created(cookie: string): Promise<Credential> {
  const response = await createPublic(cookie);
  expect(response.status).toBe(201);
  return response.json();
}
async function joined(room: Credential, cookie: string): Promise<Credential> {
  const response = await joinPublic(room, cookie);
  expect(response.status).toBe(201);
  return response.json();
}
const stubFor = (roomId: string) => env.GAME_ROOM.getByName(`room:${roomId}`);
const saved = async (roomId: string) => (await runInDurableObject(stubFor(roomId), (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1")))!;
/** Moves room clocks without waiting: the next alarm or request sees the deadline as passed. */
const edit = (roomId: string, change: (internal: Internal) => void) => runInDurableObject(stubFor(roomId), instance => {
  const internal = instance as unknown as Internal;
  internal.room = structuredClone(internal.room);
  change(internal);
});
async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 100; i++) { const value = await read(); if (done(value)) return value; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Condition not reached");
}
const errorOf = async (response: Response) => (await response.json() as { error: string }).error;

async function connect(credential: Credential) {
  const response = await call(`/ws/rooms/${credential.roomId}`, { headers: { Upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept(); sockets.push(ws);
  const messages: ServerMessage[] = [];
  const closed: { code?: number } = {};
  const waiters = new Set<() => void>();
  ws.addEventListener("message", event => { messages.push(JSON.parse(event.data as string)); for (const waiter of waiters) waiter(); });
  ws.addEventListener("close", event => { closed.code = event.code; for (const waiter of waiters) waiter(); });
  const wait = (predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> => new Promise((resolve, reject) => {
    const check = () => { const found = messages.find(predicate); if (found) { clearTimeout(timeout); waiters.delete(check); resolve(found); } };
    const timeout = setTimeout(() => { waiters.delete(check); reject(new Error(`Room message timeout: ${JSON.stringify(messages.slice(-2))}`)); }, 5000);
    waiters.add(check); check();
  });
  const view = () => (messages.filter(message => message.type === "PLAYER_VIEW").at(-1) as { type: "PLAYER_VIEW"; payload: PlayerView }).payload;
  const send = async (action: GameAction) => {
    const requestId = crypto.randomUUID();
    ws.send(JSON.stringify({ ...action, requestId, turnKey: view().turnKey }));
    return wait(message => (message.type === "ACK" || message.type === "ERROR") && message.requestId === requestId);
  };
  ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token }));
  await wait(message => message.type === "PLAYER_VIEW" || message.type === "ERROR");
  return { ws, messages, closed, wait, view, send };
}

describe("public room seats (PUB)", () => {
  it("PUB-01: 100 accounts joining at once take exactly the seven free seats", async () => {
    const [host, ...others] = await accountsOf(101);
    const room = await created(host!.cookie);
    const responses = await Promise.all(others.map(user => joinPublic(room, user.cookie)));
    const codes = await Promise.all(responses.map(async response => response.status === 201 ? "OK" : `${response.status}:${await errorOf(response)}`));
    expect(codes.filter(code => code === "OK")).toHaveLength(7);
    expect(new Set(codes.filter(code => code !== "OK"))).toEqual(new Set(["409:ROOM_FULL"]));
    const snapshot = await saved(room.roomId);
    expect(snapshot.sessions).toHaveLength(8);
    expect(new Set(snapshot.sessions.map(session => session.playerId)).size).toBe(8);
  });

  it("PUB-02: 100 accounts racing for the last seat seat exactly one", async () => {
    const [host, ...rest] = await accountsOf(107);
    const room = await created(host!.cookie);
    for (const user of rest.slice(0, 6)) await joined(room, user.cookie);
    const responses = await Promise.all(rest.slice(6).map(user => joinPublic(room, user.cookie)));
    expect(responses.filter(response => response.status === 201)).toHaveLength(1);
    expect((await saved(room.roomId)).sessions).toHaveLength(8);
  });

  it("PUB-04/06: retries of one create or join return one credential; another key cannot double-seat the account", async () => {
    const [host, guest] = await accountsOf(2);
    const requestId = crypto.randomUUID();
    const creates = await Promise.all(Array.from({ length: 20 }, () => createPublic(host!.cookie, requestId)));
    const bodies = await Promise.all(creates.map(response => { expect(response.status).toBe(201); return response.json() as Promise<Credential>; }));
    expect(new Set(bodies.map(body => `${body.roomId}:${body.token}:${body.instanceId}`)).size).toBe(1);
    expect(Object.keys(bodies[0]!).sort()).toEqual(["instanceId", "playerId", "reservedUntil", "roomId", "token"]);
    const room = bodies[0]!;
    expect((await saved(room.roomId)).sessions).toHaveLength(1);

    const joinKey = crypto.randomUUID();
    const joins = await Promise.all(Array.from({ length: 20 }, () => joinPublic(room, guest!.cookie, joinKey)));
    const seats = await Promise.all(joins.map(response => { expect(response.status).toBe(201); return response.json() as Promise<Credential>; }));
    expect(new Set(seats.map(seat => seat.token)).size).toBe(1);
    expect((await saved(room.roomId)).sessions).toHaveLength(2);
    // A different key is a new request: the account already holds a seat.
    const other = await joinPublic(room, guest!.cookie);
    expect(other.status).toBe(409);
    expect(await errorOf(other)).toBe("ACCOUNT_ALREADY_SEATED");
  });

  it("PUB-05: a key reused for another room instance is refused, and malformed requests never reach a room", async () => {
    const [host, guest] = await accountsOf(2);
    const room = await created(host!.cookie);
    const mismatch = await joinPublic(room, guest!.cookie, crypto.randomUUID(), "b".repeat(32));
    expect(mismatch.status).toBe(410);
    expect(await errorOf(mismatch)).toBe("INCARNATION_MISMATCH");
    expect((await post("/api/public-rooms", guest!.cookie, { requestId: "not-a-uuid" })).status).toBe(400);
    expect((await post(`/api/public-rooms/${room.roomId}/join`, guest!.cookie, { requestId: crypto.randomUUID() })).status).toBe(400);
  });

  it("PUB-07: an unconnected reservation is given back after 30 seconds and its retry is told so", async () => {
    const [host, late, next] = await accountsOf(3);
    const room = await created(host!.cookie);
    const key = crypto.randomUUID();
    const reserved = await (await joinPublic(room, late!.cookie, key)).json() as Credential;
    expect(reserved.reservedUntil! - Date.now()).toBeLessThanOrEqual(30_000);
    await edit(room.roomId, internal => { internal.room.sessions.find(session => session.playerId === reserved.playerId)!.reservedUntil = Date.now() - 1; });
    await runDurableObjectAlarm(stubFor(room.roomId));
    expect((await saved(room.roomId)).sessions.map(session => session.playerId)).toEqual([room.playerId]);
    const retry = await joinPublic(room, late!.cookie, key);
    expect(retry.status).toBe(409);
    expect(await errorOf(retry)).toBe("RESERVATION_EXPIRED");
    // The late token no longer owns anything; the seat goes to the next person.
    const stale = await connect(reserved);
    expect(stale.messages.some(message => message.type === "ERROR" && message.code === "SESSION_INVALID")).toBe(true);
    expect((await joined(room, next!.cookie)).playerId).toBe(reserved.playerId);
  });

  it("PUB-03: the last READY and a new join land in one order only", async () => {
    for (let round = 0; round < 5; round++) {
      const [host, guest, racer] = await accountsOf(3);
      const room = await created(host!.cookie);
      const one = await connect(room), two = await connect(await joined(room, guest!.cookie));
      await two.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.filter(player => player.connected).length === 2);
      expect((await one.send({ type: "READY" })).type).toBe("ACK");
      await two.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.some(player => player.ready));
      const [, join] = await Promise.all([two.send({ type: "READY" }), joinPublic(room, racer!.cookie)]);
      const snapshot = await saved(room.roomId);
      if (snapshot.status === "PLAYING") {
        expect(join.status).toBe(409);
        expect(await errorOf(join)).toBe("ROOM_STARTED");
        expect(snapshot.sessions.some(session => session.reservedUntil !== undefined)).toBe(false);
      } else {
        expect(join.status).toBe(201);
        expect(snapshot.readyIds).toEqual([]);
      }
    }
  });
});

describe("public room ownership and presence (PUB)", () => {
  it("PUB-09: a left seat's old socket, token and ticket lose all power over the next owner", async () => {
    const [host, first, second] = await accountsOf(3);
    const room = await created(host!.cookie);
    const hostSocket = await connect(room);
    const old = await joined(room, first!.cookie);
    const oldSocket = await connect(old);
    expect((await oldSocket.send({ type: "LEAVE_ROOM" })).type).toBe("ACK");
    await until(async () => oldSocket.closed.code, code => code === 4003);
    expect((await call(`/api/rooms/${room.roomId}/connection-ticket`, { method: "POST", headers: { "X-Porena-Session": old.token } })).status).toBe(401);
    const fresh = await joined(room, second!.cookie);
    expect(fresh.playerId).toBe(old.playerId);
    const replay = await connect(old);
    expect(replay.messages.some(message => message.type === "ERROR" && message.code === "SESSION_INVALID")).toBe(true);
    const newSocket = await connect(fresh);
    expect(newSocket.messages).toContainEqual(expect.objectContaining({ type: "ROOM_JOINED", playerId: fresh.playerId }));
    expect((await newSocket.send({ type: "READY" })).type).toBe("ACK");
    await hostSocket.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.some(player => player.playerId === fresh.playerId && player.ready));
  });

  it("PUB-10/13: a dropped connection loses READY, keeps the seat through the grace and is reclaimed after it", async () => {
    const [host, guest] = await accountsOf(2);
    const room = await created(host!.cookie);
    await connect(room);
    const seat = await joined(room, guest!.cookie);
    const firstTab = await connect(seat);
    expect((await firstTab.send({ type: "READY" })).type).toBe("ACK");
    // A second tab replaces the first; the replaced tab's close must not start a grace.
    const secondTab = await connect(seat);
    await until(async () => firstTab.closed.code, code => code === 4001);
    const stillHere = await saved(room.roomId);
    expect(stillHere.sessions.find(session => session.playerId === seat.playerId)!.disconnectedAt).toBeUndefined();

    secondTab.ws.close(1000);
    const dropped = await until(() => saved(room.roomId), snapshot => snapshot.sessions.find(session => session.playerId === seat.playerId)!.disconnectedAt !== undefined);
    expect(dropped.readyIds).not.toContain(seat.playerId);

    // Back inside the grace: same seat, READY must be given again.
    const back = await connect(seat);
    expect(back.view().players.find(player => player.playerId === seat.playerId)!.ready).toBe(false);
    const resumed = await saved(room.roomId);
    expect(resumed.sessions.find(session => session.playerId === seat.playerId)!.disconnectedAt).toBeUndefined();

    back.ws.close(1000);
    await until(() => saved(room.roomId), snapshot => snapshot.sessions.find(session => session.playerId === seat.playerId)!.disconnectedAt !== undefined);
    await edit(room.roomId, internal => { internal.room.sessions.find(session => session.playerId === seat.playerId)!.disconnectedAt = Date.now() - 90_000; });
    await runDurableObjectAlarm(stubFor(room.roomId));
    const reclaimed = await saved(room.roomId);
    expect(reclaimed.sessions.map(session => session.playerId)).toEqual([room.playerId]);
    expect(reclaimed.game.players.find(player => player.id === seat.playerId)!.name).toBe(reclaimed.publicLobby!.botNames[seat.playerId]);
  });

  it("PUB-12: a started public game refuses new seats and still lets its own seats reconnect", async () => {
    const [host, guest, late] = await accountsOf(3);
    const room = await created(host!.cookie);
    const one = await connect(room);
    const seat = await joined(room, guest!.cookie);
    const two = await connect(seat);
    await one.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.filter(player => player.connected).length === 2);
    await one.send({ type: "READY" });
    await two.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.some(player => player.ready));
    await two.send({ type: "READY" });
    expect((await saved(room.roomId)).status).toBe("PLAYING");
    const refused = await joinPublic(room, late!.cookie);
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe("ROOM_STARTED");
    two.ws.close(1000);
    const again = await connect(seat);
    expect(again.messages.some(message => message.type === "ROOM_JOINED")).toBe(true);
  });
});

describe("request-time expiry (PUB-11)", () => {
  it("refuses joins, tickets and sockets of an expired private room before its alarm runs, without reviving it", async () => {
    const created = await call("/api/rooms", { method: "POST" });
    const host = await created.json() as Credential;
    await edit(host.roomId, internal => { internal.expiresAt = Date.now() - 1; });
    expect((await call(`/api/rooms/${host.roomId}/join`, { method: "POST" })).status).toBe(404);
    expect((await call(`/api/rooms/${host.roomId}/connection-ticket`, { method: "POST", headers: { "X-Porena-Session": host.token } })).status).toBe(404);
    expect((await call(`/ws/rooms/${host.roomId}`, { headers: { Upgrade: "websocket" } })).status).toBe(404);
    const expiresAt = await runInDurableObject(stubFor(host.roomId), instance => (instance as unknown as Internal).expiresAt);
    expect(expiresAt).toBeLessThan(Date.now());
    await runDurableObjectAlarm(stubFor(host.roomId));
    expect(await runInDurableObject(stubFor(host.roomId), (_instance, state) => state.storage.get("snapshot:v1"))).toBeUndefined();
  });

  it("answers an expired or over-age public lobby with ROOM_EXPIRED", async () => {
    const [host, guest] = await accountsOf(2);
    const room = await created(host!.cookie);
    // Let the first alarm (the registry update right after creation) finish, then stop the next one: it would delete the
    // room first. This shows the answer a request gets before cleanup runs.
    await until(() => saved(room.roomId), snapshot => snapshot.publicSync?.sentAt !== undefined);
    await runInDurableObject(stubFor(room.roomId), async (instance, state) => {
      const internal = instance as unknown as Internal;
      internal.room = structuredClone(internal.room);
      internal.room.publicLobby!.createdAt = Date.now() - 60 * 60_000;
      await state.storage.deleteAlarm();
    });
    const late = await joinPublic(room, guest!.cookie);
    expect(late.status).toBe(410);
    expect(await errorOf(late)).toBe("ROOM_EXPIRED");
  });
});

describe("late alarms and create retries (review c39a765)", () => {
  it("applies lapsed reservations before answering a join retry, a new join, a session check or a ticket", async () => {
    const [host, late, ...others] = await accountsOf(9);
    const room = await created(host!.cookie);
    const key = crypto.randomUUID();
    const reserved = await (await joinPublic(room, late!.cookie, key)).json() as Credential;
    for (const user of others.slice(0, 6)) await joined(room, user.cookie);
    // The reservation lapsed but no alarm has run yet.
    await edit(room.roomId, internal => { internal.room.sessions.find(session => session.playerId === reserved.playerId)!.reservedUntil = Date.now() - 1; });
    expect((await call(`/api/rooms/${room.roomId}/session`, { method: "POST", headers: { "X-Porena-Session": reserved.token } })).status).toBe(401);
    expect((await call(`/api/rooms/${room.roomId}/connection-ticket`, { method: "POST", headers: { "X-Porena-Session": reserved.token } })).status).toBe(401);
    const retry = await joinPublic(room, late!.cookie, key);
    expect(retry.status).toBe(409);
    expect(await errorOf(retry)).toBe("RESERVATION_EXPIRED");
    expect((await joined(room, others[6]!.cookie)).playerId).toBe(reserved.playerId);
  });

  it("frees a seat whose reconnect grace lapsed before the next join, even without the alarm", async () => {
    const [host, gone, ...others] = await accountsOf(9);
    const room = await created(host!.cookie);
    const seat = await joined(room, gone!.cookie);
    for (const user of others.slice(0, 6)) await joined(room, user.cookie);
    await edit(room.roomId, internal => {
      const target = internal.room.sessions.find(session => session.playerId === seat.playerId)!;
      delete target.reservedUntil; target.disconnectedAt = Date.now() - 90_000;
    });
    expect((await joined(room, others[6]!.cookie)).playerId).toBe(seat.playerId);
  });

  it("a create retry returns the room it made even after an earlier candidate code became free", async () => {
    const host = await account();
    const requestId = crypto.randomUUID();
    const first = await publicCreateCandidate("test-public-room-secret", host.id, requestId, 0);
    // Another room holds the first candidate code, so the create lands on the second one.
    const blocker = await stubFor(first.roomId).fetch("https://room/internal/create", { method: "POST", headers: { "X-Room-Id": first.roomId } });
    expect(blocker.status).toBe(201);
    const original = await (await createPublic(host.cookie, requestId)).json() as Credential;
    expect(original.roomId).not.toBe(first.roomId);
    // The blocker expires and is deleted; the creator's room is still alive.
    await edit(first.roomId, internal => { internal.expiresAt = Date.now() - 1; });
    await runDurableObjectAlarm(stubFor(first.roomId));
    const retry = await createPublic(host.cookie, requestId);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(original);
    expect(await runInDurableObject(stubFor(first.roomId), (_instance, state) => state.storage.get("snapshot:v1"))).toBeUndefined();
  });
});

describe("public room boundaries (REG)", () => {
  it("is unreachable while PUBLIC_ROOMS_ENABLED is unset", async () => {
    const user = await account();
    const request = new Request(`${origin}/api/public-rooms`, { method: "POST", headers: { Origin: origin, Cookie: user.cookie, "CF-Connecting-IP": crypto.randomUUID() }, body: JSON.stringify({ requestId: crypto.randomUUID() }) });
    const response = await worker.fetch(request, { ...env, PUBLIC_ROOMS_ENABLED: undefined } as unknown as Env, createExecutionContext());
    expect(response.status).toBe(404);
  });

  it("keeps private rooms out of the public endpoint and their guest invite flow unchanged", async () => {
    const [host, member] = await accountsOf(2);
    const room = await created(host!.cookie);
    // The invite code of a public room applies the public rules: an account is reserved until it connects.
    const invite = await call(`/api/rooms/${room.roomId}/join`, { method: "POST", headers: { Cookie: member!.cookie } });
    expect(invite.status).toBe(201);
    expect((await invite.json() as Credential).reservedUntil).toBeGreaterThan(Date.now());

    const privateRoom = await (await call("/api/rooms", { method: "POST" })).json() as Credential;
    const probe = await joinPublic({ ...privateRoom, instanceId: "c".repeat(32) }, member!.cookie);
    expect(probe.status).toBe(404);
    expect(await errorOf(probe)).toBe("ROOM_NOT_FOUND");
    const privateJoin = await call(`/api/rooms/${privateRoom.roomId}/join`, { method: "POST" });
    expect(privateJoin.status).toBe(201);
    expect(privateJoin.headers.get("Set-Cookie")).toBeNull(); // Private rooms never hand out a guest identity.
    const snapshot = await saved(privateRoom.roomId);
    expect(snapshot.visibility).toBeUndefined();
    expect(snapshot.publicLobby).toBeUndefined();
    expect(snapshot.sessions.every(session => session.guestKey === undefined && session.networkKey === undefined)).toBe(true);
  });
});

/** A guest as a browser would be: the cookie the Worker set on the first public request, sent back afterwards. */
const guestCookieOf = (response: Response) => {
  const header = response.headers.get("Set-Cookie") ?? "";
  const match = /(?:__Host-)?porena_guest=[^;]+/.exec(header);
  return match ? match[0] : "";
};
const guestPost = (path: string, body: Record<string, unknown>, cookie = "", ip?: string) =>
  call(path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", ...(ip ? { "CF-Connecting-IP": ip } : {}) }, body: JSON.stringify(body) });

describe("registry-backed create (PUBLIC-ROOMS-002 2-C)", () => {
  const lobbyDb = () => (env as unknown as { PUBLIC_LOBBY_DB: D1Database }).PUBLIC_LOBBY_DB;

  it("records every public room in the registry and gives each creator one live room", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    const row = await lobbyDb().prepare("SELECT room_code, state, slot_held FROM public_rooms WHERE instance_id = ?").bind(room.instanceId).first();
    expect(row).toEqual({ room_code: room.roomId, state: "PROVISIONING", slot_held: 1 });
    const second = await createPublic(host!.cookie);
    expect(second.status).toBe(409);
    expect(await errorOf(second)).toBe("CREATOR_HAS_ROOM");
  });

  it("answers a retry of an ended room with ROOM_CLOSED instead of making a new room", async () => {
    const [host] = await accountsOf(1);
    const requestId = crypto.randomUUID();
    const room = await (await createPublic(host!.cookie, requestId)).json() as Credential;
    await lobbyDb().prepare("UPDATE public_rooms SET state = 'CLOSED', slot_held = 0 WHERE instance_id = ?").bind(room.instanceId).run();
    const retry = await createPublic(host!.cookie, requestId);
    expect(retry.status).toBe(410);
    expect(await errorOf(retry)).toBe("ROOM_CLOSED");
    // The ended room no longer blocks the creator's next room.
    expect((await createPublic(host!.cookie)).status).toBe(201);
  });

  it("refuses new rooms with Retry-After once 100 public rooms are live", async () => {
    const [host] = await accountsOf(1);
    const now = Date.now();
    const fill = Array.from({ length: 100 }, (_, i) => lobbyDb().prepare(
      `INSERT INTO public_rooms (instance_id, room_code, creator_key, request_id, state, rules_version, protocol_version, created_at, observed_at, lease_expires_at, room_expires_at)
       VALUES (?, ?, ?, ?, 'PLAYING', 2, 1, ?, ?, ?, ?)`).bind(i.toString(16).padStart(32, "a"), `Z${i.toString(36).toUpperCase().padStart(5, "0")}`, `filler-${i}`, `filler-${i}`, now, now, now, now + 3600_000));
    const live = (await lobbyDb().prepare("SELECT COUNT(*) AS n FROM public_rooms WHERE slot_held = 1").first<{ n: number }>())!.n;
    await lobbyDb().batch(fill.slice(0, Math.max(0, 100 - live)));
    const refused = await createPublic(host!.cookie);
    expect(refused.status).toBe(503);
    expect(refused.headers.get("Retry-After")).toBe("30");
    expect(await errorOf(refused)).toBe("PUBLIC_CAPACITY_REACHED");
    await lobbyDb().prepare("UPDATE public_rooms SET slot_held = 0, state = 'CLOSED' WHERE creator_key LIKE 'filler-%'").run();
  });

  it("limits one network to five new rooms per ten minutes", async () => {
    const ip = "203.0.113.200";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await guestPost("/api/public-rooms", { requestId: crypto.randomUUID(), nickname: `만든이${i}` }, "", ip)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe("room to registry updates (PUBLIC-ROOMS-002 2-D)", () => {
  const lobbyDb = () => (env as unknown as { PUBLIC_LOBBY_DB: D1Database }).PUBLIC_LOBBY_DB;
  type Row = { state: string; slot_held: number; confirmed_count: number; reserved_count: number; summary_seq: number; lease_expires_at: number; repair_due_at: number | null };
  const row = (instanceId: string) => lobbyDb().prepare("SELECT state, slot_held, confirmed_count, reserved_count, summary_seq, lease_expires_at, repair_due_at FROM public_rooms WHERE instance_id = ?").bind(instanceId).first<Row>();
  const rowUntil = (instanceId: string, done: (r: Row) => boolean) => until(async () => (await row(instanceId))!, done);
  type SyncInternal = Internal & { commit: (next: RoomSnapshot, activity?: boolean) => Promise<void>; lobbyDb: () => D1Database | undefined };

  it("lists a new room as WAITING, follows its seats and keeps the slot while the game runs", async () => {
    const [host, guest] = await accountsOf(2);
    const room = await created(host!.cookie);
    const waiting = await rowUntil(room.instanceId, r => r.state === "WAITING");
    expect(waiting).toMatchObject({ slot_held: 1, confirmed_count: 0, reserved_count: 1 });
    expect(waiting.lease_expires_at - Date.now()).toBeGreaterThan(60_000);
    const one = await connect(room);
    await rowUntil(room.instanceId, r => r.confirmed_count === 1 && r.reserved_count === 0);
    const two = await connect(await joined(room, guest!.cookie));
    await rowUntil(room.instanceId, r => r.confirmed_count === 2 && r.reserved_count === 0);
    await one.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.filter(player => player.connected).length === 2);
    await one.send({ type: "READY" });
    await two.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.some(player => player.ready));
    await two.send({ type: "READY" });
    const playing = await rowUntil(room.instanceId, r => r.state === "PLAYING");
    expect(playing.slot_held).toBe(1);
    expect(playing.repair_due_at! - Date.now()).toBeGreaterThan(25 * 60_000); // checked by Cron about every 30 minutes
  });

  it("gives the slot back when the game reaches its result, and a rematch does not list the room again", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    await rowUntil(room.instanceId, r => r.state === "WAITING");
    await runInDurableObject(stubFor(room.roomId), async instance => {
      const internal = instance as unknown as SyncInternal;
      const next = structuredClone(internal.room);
      next.status = "PLAYING"; next.game.phase = "GAME_RESULT";
      await internal.commit(next, false);
    });
    await runDurableObjectAlarm(stubFor(room.roomId));
    expect(await row(room.instanceId)).toMatchObject({ state: "FINISHED", slot_held: 0, repair_due_at: null });
    await runInDurableObject(stubFor(room.roomId), async instance => {
      const internal = instance as unknown as SyncInternal;
      const next = structuredClone(internal.room);
      next.game.phase = "ABILITY_DEAL"; // a rematch
      await internal.commit(next, false);
      expect(internal.room.publicSync!.terminalSent).toBe(true);
    });
    expect((await row(room.instanceId))!.state).toBe("FINISHED");
  });

  it("keeps the game going while the registry fails, then delivers the update", async () => {
    const [host, guest] = await accountsOf(2);
    const room = await created(host!.cookie);
    await rowUntil(room.instanceId, r => r.state === "WAITING");
    const broken = { prepare() { throw new Error("D1 unavailable"); } } as unknown as D1Database;
    await runInDurableObject(stubFor(room.roomId), instance => { (instance as unknown as SyncInternal).lobbyDb = () => broken; });
    // Seats still work: the room decides on its own and only the listing waits.
    const seat = await joined(room, guest!.cookie);
    await runDurableObjectAlarm(stubFor(room.roomId));
    const failing = await saved(room.roomId);
    expect(failing.publicSync!.attempts).toBeGreaterThanOrEqual(1);
    expect(failing.publicSync!.retryAt).toBeGreaterThan(Date.now() - 1000);
    expect(failing.sessions.some(session => session.playerId === seat.playerId)).toBe(true);
    expect((await row(room.instanceId))!.reserved_count).toBe(1); // the registry still shows the old count
    await runInDurableObject(stubFor(room.roomId), async instance => {
      const internal = instance as unknown as SyncInternal;
      delete (internal as Partial<SyncInternal>).lobbyDb; // back to the real database
      internal.room = structuredClone(internal.room);
      internal.room.publicSync!.retryAt = Date.now() - 1;
    });
    await runDurableObjectAlarm(stubFor(room.roomId));
    expect((await row(room.instanceId))!.reserved_count).toBe(2);
    const delivered = (await saved(room.roomId)).publicSync!;
    expect(delivered.retryAt).toBeUndefined();
    expect(delivered.attempts).toBeUndefined();
    expect(delivered.sentSeq).toBe(delivered.seq);
  });

  it("renews a waiting room's lease every 30 seconds with a newer sequence number", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    const before = await rowUntil(room.instanceId, r => r.state === "WAITING");
    await edit(room.roomId, internal => { internal.room.publicSync!.sentAt = Date.now() - 31_000; });
    await runDurableObjectAlarm(stubFor(room.roomId));
    const after = (await row(room.instanceId))!;
    expect(after.summary_seq).toBeGreaterThan(before.summary_seq);
    expect(after.lease_expires_at).toBeGreaterThanOrEqual(before.lease_expires_at);
  });

  it("closes the listing and frees the slot when the room is deleted", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    await rowUntil(room.instanceId, r => r.state === "WAITING");
    await edit(room.roomId, internal => { internal.expiresAt = Date.now() - 1; });
    await runDurableObjectAlarm(stubFor(room.roomId));
    expect(await row(room.instanceId)).toMatchObject({ state: "CLOSED", slot_held: 0 });
    expect(await runInDurableObject(stubFor(room.roomId), (_instance, state) => state.storage.get("snapshot:v1"))).toBeUndefined();
  });
});

describe("public room list (PUBLIC-ROOMS-002 2-E)", () => {
  const lobbyDb = () => (env as unknown as { PUBLIC_LOBBY_DB: D1Database }).PUBLIC_LOBBY_DB;
  type Page = { serverNow: number; rooms: { instanceId: string; roomCode: string; openSeats: number }[]; nextCursor: string | null };
  // A same-origin browser GET carries no Origin header; the list must still answer it.
  const list = (query = "") => exports.default.fetch(new Request(`${origin}/api/public-rooms${query}`, { headers: { "CF-Connecting-IP": crypto.randomUUID() } }));
  const page = async (query = "") => { const response = await list(query); expect(response.status).toBe(200); return response.json() as Promise<Page>; };
  const listed = async (instanceId: string) => (await page()).rooms.some(room => room.instanceId === instanceId);
  const waitingWithSomeone = async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    const socket = await connect(room);
    await until(async () => (await lobbyDb().prepare("SELECT confirmed_count FROM public_rooms WHERE instance_id = ?").bind(room.instanceId).first<{ confirmed_count: number }>())?.confirmed_count, n => n === 1);
    return { room, socket };
  };

  it("lists a recruiting room with only public fields", async () => {
    const { room } = await waitingWithSomeone();
    const response = await list();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    const body = await response.json() as Page;
    expect(body.serverNow).toBeGreaterThan(0);
    const entry = body.rooms.find(item => item.instanceId === room.instanceId)!;
    expect(Object.keys(entry).sort()).toEqual(["capacity", "confirmed", "createdAt", "instanceId", "language", "leaseExpiresAt", "openSeats", "protocolVersion",
      "regionHint", "reserved", "roomCode", "roomExpiresAt", "rulesVersion"]);
    expect(entry).toMatchObject({ roomCode: room.roomId, openSeats: 7 });
    // No creator, request, network, account, guest, token or snapshot data ever leaves the registry.
    expect(JSON.stringify(body)).not.toMatch(/creator|request_id|network|accountUserId|guestKey|token|tokenHash|cards|snapshot/i);
  });

  it("hides rooms nobody holds a confirmed seat in, full rooms, games in progress, stale leases and private rooms", async () => {
    const [host] = await accountsOf(1);
    const reservedOnly = await created(host!.cookie); // creator never connected
    await until(async () => (await lobbyDb().prepare("SELECT state FROM public_rooms WHERE instance_id = ?").bind(reservedOnly.instanceId).first<{ state: string }>())?.state, s => s === "WAITING");
    expect(await listed(reservedOnly.instanceId)).toBe(false);

    const { room: full } = await waitingWithSomeone();
    await lobbyDb().prepare("UPDATE public_rooms SET confirmed_count = 6, reserved_count = 2 WHERE instance_id = ?").bind(full.instanceId).run();
    expect(await listed(full.instanceId)).toBe(false);

    const { room: playing } = await waitingWithSomeone();
    await lobbyDb().prepare("UPDATE public_rooms SET state = 'PLAYING' WHERE instance_id = ?").bind(playing.instanceId).run();
    expect(await listed(playing.instanceId)).toBe(false);

    const { room: stale } = await waitingWithSomeone();
    expect(await listed(stale.instanceId)).toBe(true);
    await lobbyDb().prepare("UPDATE public_rooms SET lease_expires_at = ? WHERE instance_id = ?").bind(Date.now() - 1, stale.instanceId).run();
    expect(await listed(stale.instanceId)).toBe(false);

    const privateRoom = await (await call("/api/rooms", { method: "POST" })).json() as Credential;
    expect((await page()).rooms.some(item => item.roomCode === privateRoom.roomId)).toBe(false);
  });

  it("pages 20 rooms at a time in a stable order, and refuses a made-up cursor", async () => {
    await lobbyDb().prepare("UPDATE public_rooms SET state = 'CLOSED', slot_held = 0").run(); // start from a known list
    const now = Date.now();
    await lobbyDb().batch(Array.from({ length: 25 }, (_, i) => lobbyDb().prepare(
      `INSERT INTO public_rooms (instance_id, room_code, creator_key, request_id, state, confirmed_count, rules_version, protocol_version, created_at, observed_at, lease_expires_at, room_expires_at)
       VALUES (?, ?, ?, ?, 'WAITING', 1, 2, 1, ?, ?, ?, ?)`).bind(i.toString(16).padStart(32, "b"), `P${i.toString(36).toUpperCase().padStart(5, "0")}`, `pager-${i}`, `pager-${i}`,
      now + Math.floor(i / 2), now, now + 90_000, now + 3600_000)));
    const first = await page();
    expect(first.rooms).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await page(`?cursor=${first.nextCursor}`);
    expect(second.rooms).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.rooms, ...second.rooms].map(room => room.instanceId);
    expect(new Set(ids).size).toBe(25);
    // Ordered by creation time, ties broken by instance id.
    const expected = Array.from({ length: 25 }, (_, i) => ({ id: i.toString(16).padStart(32, "b"), at: now + Math.floor(i / 2) }))
      .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).map(item => item.id);
    expect(ids).toEqual(expected);
    expect((await list("?cursor=not-a-cursor!")).status).toBe(400);
    expect((await list(`?cursor=${btoa("1.zz")}`)).status).toBe(400);
    await lobbyDb().prepare("UPDATE public_rooms SET state = 'CLOSED', slot_held = 0 WHERE creator_key LIKE 'pager-%'").run();
  });

  it("serves a cached page for a few seconds, still dropping rooms whose lease ran out", async () => {
    const { room } = await waitingWithSomeone();
    const cachedEnv = { ...env, PUBLIC_LIST_CACHE_SECONDS: "5" } as unknown as Env;
    const get = async () => (await worker.fetch(new Request(`${origin}/api/public-rooms`, { headers: { "CF-Connecting-IP": crypto.randomUUID() } }), cachedEnv, createExecutionContext())).json() as Promise<Page>;
    expect((await get()).rooms.some(item => item.instanceId === room.instanceId)).toBe(true);
    // The registry changes, but the cached copy answers for a few seconds...
    await lobbyDb().prepare("UPDATE public_rooms SET state = 'PLAYING' WHERE instance_id = ?").bind(room.instanceId).run();
    expect((await get()).rooms.some(item => item.instanceId === room.instanceId)).toBe(true);
    // ...and even a cached entry disappears once its own lease has passed.
    const stale = freshListing({ serverNow: 0, nextCursor: null, rooms: [{ ...(await get()).rooms.find(item => item.instanceId === room.instanceId)!, leaseExpiresAt: Date.now() - 1 } as never] }, Date.now());
    expect(stale.rooms).toHaveLength(0);
  });
});

describe("minute Cron repair (PUBLIC-ROOMS-002 2-F)", () => {
  const lobbyDb = () => (env as unknown as { PUBLIC_LOBBY_DB: D1Database }).PUBLIC_LOBBY_DB;
  const rowOf = (instanceId: string) => lobbyDb().prepare("SELECT state, slot_held, summary_seq, lease_expires_at, repair_due_at FROM public_rooms WHERE instance_id = ?")
    .bind(instanceId).first<{ state: string; slot_held: number; summary_seq: number; lease_expires_at: number; repair_due_at: number | null }>();
  const fakeRow = (instanceId: string, code: string, state: string, extra: { closedAt?: number; slotHeld?: number } = {}) => lobbyDb().prepare(
    `INSERT INTO public_rooms (instance_id, room_code, creator_key, request_id, state, slot_held, rules_version, protocol_version, created_at, observed_at, lease_expires_at, room_expires_at, repair_due_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, 2, 1, ?, ?, ?, ?, ?, ?)`).bind(instanceId, code, `fake-${instanceId}`, `fake-${instanceId}`, state, extra.slotHeld ?? 1,
    Date.now() - 600_000, Date.now() - 600_000, Date.now() - 500_000, Date.now() + 3600_000, extra.slotHeld === 0 ? null : Date.now() - 1, extra.closedAt ?? null).run();
  const repairNow = () => worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env, createExecutionContext());

  it("cancels a create that never produced a room, and closes the listing of a room that is gone", async () => {
    await fakeRow("1".repeat(32), "NEVER2", "PROVISIONING");
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    await until(async () => (await rowOf(room.instanceId))?.state, state => state === "WAITING");
    // The room vanished without its goodbye reaching the registry.
    await runInDurableObject(stubFor(room.roomId), async (instance, state) => {
      (instance as unknown as { room?: RoomSnapshot }).room = undefined;
      await state.storage.deleteAll();
    });
    await lobbyDb().prepare("UPDATE public_rooms SET repair_due_at = ? WHERE instance_id = ?").bind(Date.now() - 1, room.instanceId).run();
    await repairNow();
    expect(await rowOf("1".repeat(32))).toMatchObject({ state: "CANCELLED", slot_held: 0 });
    expect(await rowOf(room.instanceId)).toMatchObject({ state: "CLOSED", slot_held: 0, repair_due_at: null });
  });

  it("refreshes a live room whose listing went stale and re-arms its stopped alarm", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    await connect(room);
    const before = await until(async () => (await rowOf(room.instanceId))!, r => r.state === "WAITING");
    await lobbyDb().prepare("UPDATE public_rooms SET lease_expires_at = ?, repair_due_at = ? WHERE instance_id = ?").bind(Date.now() - 1, Date.now() - 1, room.instanceId).run();
    await runInDurableObject(stubFor(room.roomId), (_instance, state) => state.storage.deleteAlarm());
    await repairNow();
    const after = (await rowOf(room.instanceId))!;
    expect(after.state).toBe("WAITING");
    expect(after.summary_seq).toBeGreaterThan(before.summary_seq);
    expect(after.lease_expires_at).toBeGreaterThan(Date.now());
    expect(after.repair_due_at).toBeGreaterThan(Date.now());
    expect(await runInDurableObject(stubFor(room.roomId), (_instance, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it("deletes ended rows after a day, keeps recent ones, and does nothing while public rooms are off", async () => {
    await fakeRow("2".repeat(32), "OLDOLD", "CLOSED", { slotHeld: 0, closedAt: Date.now() - 25 * 60 * 60_000 });
    await fakeRow("3".repeat(32), "NEWNEW", "CLOSED", { slotHeld: 0, closedAt: Date.now() - 60_000 });
    await fakeRow("4".repeat(32), "OFFOFF", "PROVISIONING");
    expect(await runPublicLobbyRepair({ ...env, PUBLIC_ROOMS_ENABLED: undefined } as unknown as PublicRoomEnv)).toEqual({ checked: 0, closed: 0, refreshed: 0, unanswered: 0, purged: 0 });
    expect((await rowOf("4".repeat(32)))!.state).toBe("PROVISIONING");
    await repairNow();
    expect(await rowOf("2".repeat(32))).toBeNull();
    expect(await rowOf("3".repeat(32))).not.toBeNull();
    expect((await rowOf("4".repeat(32)))!.state).toBe("CANCELLED");
  });

  it("leaves a row alone if its room reported in after the Cron read it", async () => {
    await fakeRow("5".repeat(32), "RACE22", "PROVISIONING");
    // The room answers "gone" for the code read, but the claim moved to another code meanwhile.
    await lobbyDb().prepare("UPDATE public_rooms SET room_code = 'RACE33', summary_seq = 1 WHERE instance_id = ?").bind("5".repeat(32)).run();
    const db = lobbyDb();
    const stale = { prepare: (sql: string) => sql.startsWith("SELECT instance_id, room_code")
      ? { bind: () => ({ all: async () => ({ results: [{ instance_id: "5".repeat(32), room_code: "RACE22", state: "PROVISIONING", summary_seq: 0 }] }) }) }
      : db.prepare(sql) } as unknown as D1Database;
    const report = await runPublicLobbyRepair({ ...env, PUBLIC_LOBBY_DB: stale } as unknown as PublicRoomEnv);
    expect(report).toMatchObject({ checked: 1, closed: 0 });
    expect((await rowOf("5".repeat(32)))!.state).toBe("PROVISIONING");
  });
});

describe("guest seats in public rooms (PUBLIC-ROOMS-002 2-B)", () => {
  it("lets a guest create a public room, remembers the guest by cookie and returns the same seat on retry", async () => {
    const requestId = crypto.randomUUID();
    const first = await guestPost("/api/public-rooms", { requestId, nickname: "손님1" });
    expect(first.status).toBe(201);
    const cookie = guestCookieOf(first);
    expect(cookie).toMatch(/^__Host-porena_guest=v1\.[a-f0-9]{32}\.\d+\.[a-f0-9]{64}$/);
    expect(first.headers.get("Set-Cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
    const room = await first.json() as Credential;
    const retry = await guestPost("/api/public-rooms", { requestId, nickname: "손님1" }, cookie);
    expect(retry.status).toBe(201);
    expect(retry.headers.get("Set-Cookie")).toBeNull(); // A known guest gets no new identity.
    expect(await retry.json()).toEqual(room);
    const snapshot = await saved(room.roomId);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]!.accountUserId).toBeUndefined();
    expect(snapshot.sessions[0]!.guestKey).toMatch(/^[a-f0-9]{64}$/);
    // The room keeps a derived key only, never the id inside the cookie.
    expect(JSON.stringify(snapshot)).not.toContain(cookie.split(".")[1]!);
    expect(snapshot.game.players.find(player => player.id === room.playerId)!.name).toBe("손님1");
  });

  it("requires a valid nickname from a guest and never accepts a forged guest cookie as that guest", async () => {
    const missing = await guestPost("/api/public-rooms", { requestId: crypto.randomUUID() });
    expect(missing.status).toBe(400);
    expect(await errorOf(missing)).toBe("NICKNAME_REQUIRED");
    expect((await guestPost("/api/public-rooms", { requestId: crypto.randomUUID(), nickname: "<b>x</b>" })).status).toBe(400);

    const requestId = crypto.randomUUID();
    const owner = await guestPost("/api/public-rooms", { requestId, nickname: "주인" });
    const room = await owner.json() as Credential;
    const cookie = guestCookieOf(owner);
    const [name, value] = cookie.split("=");
    const parts = value!.split(".");
    // Same id with a broken signature, and another id under the original signature: both are strangers.
    for (const forged of [`${name}=${parts[0]}.${parts[1]}.${parts[2]}.${"0".repeat(64)}`, `${name}=${parts[0]}.${"f".repeat(32)}.${parts[2]}.${parts[3]}`]) {
      const attempt = await guestPost("/api/public-rooms", { requestId, nickname: "주인" }, forged);
      expect(attempt.status).toBe(201);
      expect(guestCookieOf(attempt)).not.toBe(""); // Treated as a new guest and given a fresh identity...
      expect((await attempt.json() as Credential).token).not.toBe(room.token); // ...so it never gets the owner's seat.
    }
  });

  it("seats a guest by public join or invite code, once per guest, and keeps guests out of RP", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    const join = await guestPost(`/api/public-rooms/${room.roomId}/join`, { requestId: crypto.randomUUID(), instanceId: room.instanceId, nickname: "손님" });
    expect(join.status).toBe(201);
    const cookie = guestCookieOf(join);
    const seat = await join.json() as Credential;
    const again = await guestPost(`/api/public-rooms/${room.roomId}/join`, { requestId: crypto.randomUUID(), instanceId: room.instanceId, nickname: "손님" }, cookie);
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe("GUEST_ALREADY_SEATED");
    // The invite code needs a guest identity; without one the client must use the public join, which issues it.
    const bare = await call(`/api/rooms/${room.roomId}/join`, { method: "POST" });
    expect(bare.status).toBe(401);
    expect(await errorOf(bare)).toBe("IDENTITY_REQUIRED");
    const viaInvite = await call(`/api/rooms/${room.roomId}/join`, { method: "POST", headers: { Cookie: cookie } });
    expect(viaInvite.status).toBe(409);
    expect(await errorOf(viaInvite)).toBe("GUEST_ALREADY_SEATED");

    const one = await connect(room), two = await connect(seat);
    await one.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.filter(player => player.connected).length === 2);
    expect((await one.send({ type: "READY" })).type).toBe("ACK");
    await two.wait(message => message.type === "PLAYER_VIEW" && message.payload.players.some(player => player.ready));
    expect((await two.send({ type: "READY" })).type).toBe("ACK");
    const started = await saved(room.roomId);
    expect(started.status).toBe("PLAYING");
    // Only the account seat is ranked; the guest still counts as a human for the bonus (current rule, unchanged).
    expect(Object.keys(started.rank!.seats)).toEqual([room.playerId]);
    expect(started.rank!.humanCount).toBe(2);
  });

  it("lets one network hold at most three seats of one public room", async () => {
    const [host] = await accountsOf(1);
    const room = await created(host!.cookie);
    const ip = "203.0.113.77";
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await guestPost(`/api/public-rooms/${room.roomId}/join`, { requestId: crypto.randomUUID(), instanceId: room.instanceId, nickname: `게스트${i}` }, "", ip);
      codes.push(response.status);
      if (response.status !== 201) expect(await errorOf(response)).toBe("NETWORK_SEAT_LIMIT");
    }
    expect(codes).toEqual([201, 201, 201, 409]);
    // Another network still gets in.
    expect((await guestPost(`/api/public-rooms/${room.roomId}/join`, { requestId: crypto.randomUUID(), instanceId: room.instanceId, nickname: "다른곳" }, "", "198.51.100.9")).status).toBe(201);
  });
});
