import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base64url } from "jose";
import worker from "../../worker/index";
import type { RoomSnapshot } from "../../src/game/room";
import type { GameAction, PlayerView, ServerMessage, SessionCredential } from "../../src/shared/protocol";

const origin = "https://porena.kr";
const sockets: WebSocket[] = [];
const sha = async (value: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", origin);
  headers.set("CF-Connecting-IP", crypto.randomUUID());
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
async function account(displayName: string | null = "포레나") {
  const id = crypto.randomUUID();
  const token = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha(token);
  const subject = `private-google-subject-${crypto.randomUUID()}`;
  await env.ACCOUNT_DB.batch([
    env.ACCOUNT_DB.prepare("INSERT INTO users (id, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?)").bind(id, displayName, Date.now(), Date.now()),
    env.ACCOUNT_DB.prepare("INSERT INTO oauth_accounts (provider, provider_subject, user_id, created_at) VALUES ('google', ?, ?, ?)").bind(subject, id, Date.now()),
    env.ACCOUNT_DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(tokenHash, id, Date.now(), Date.now() + 3600_000),
  ]);
  return { id, token, tokenHash, subject, cookie: `__Host-porena_session=${token}` };
}
const profile = (cookie: string, displayName: unknown, headers: HeadersInit = {}) => call("/api/profile", {
  method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json", ...headers }, body: JSON.stringify({ displayName }),
});
async function seat(cookie = "", roomId?: string, extra: Record<string, string> = {}): Promise<SessionCredential> {
  const response = await call(`/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: { Cookie: cookie, ...extra } });
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const result = await response.json() as SessionCredential;
  expect(Object.keys(result).sort()).toEqual(["playerId", "roomId", "token"]);
  return result;
}
const stubFor = (roomId: string) => env.GAME_ROOM.getByName(`room:${roomId}`);
async function saved(roomId: string) {
  return (await runInDurableObject(stubFor(roomId), (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1")))!;
}
async function connect(credential: SessionCredential, nickname?: string, cookie = "", useTicket = false) {
  let proof: Record<string, string> = {};
  if (useTicket) {
    const response = await call(`/api/rooms/${credential.roomId}/connection-ticket`, {
      method: "POST", headers: { "X-Porena-Session": credential.token },
    });
    expect(response.status).toBe(201);
    const { ticket } = await response.json() as { ticket: string };
    proof = { "Sec-WebSocket-Protocol": `porena-v1, porena-ticket-${ticket}` };
  }
  const response = await call(`/ws/rooms/${credential.roomId}`, { headers: { Upgrade: "websocket", Cookie: cookie, ...proof } });
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept(); sockets.push(ws);
  const messages: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  ws.addEventListener("message", event => {
    messages.push(JSON.parse(event.data as string));
    for (const waiter of waiters) waiter();
  });
  const wait = (predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> => {
    const found = messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const check = () => {
        const result = messages.find(predicate);
        if (result) { clearTimeout(timeout); waiters.delete(check); resolve(result); }
      };
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
  ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token, ...(nickname === undefined ? {} : { nickname }) }));
  await wait(message => message.type === "PLAYER_VIEW");
  return { ws, messages, wait, view, send };
}

beforeEach(async () => { await env.ACCOUNT_DB.prepare("DELETE FROM users").run(); });
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });

describe("public PORENA profile", () => {
  it("returns a null profile for first login, then saves a trimmed public nickname for subsequent sessions", async () => {
    const user = await account(null);
    expect(await (await call("/api/auth/me", { headers: { Cookie: user.cookie } })).json()).toEqual({ authenticated: true, user: { id: user.id, displayName: null } });
    const update = await profile(user.cookie, "  포레나  ");
    expect(update.status).toBe(200);
    expect(update.headers.get("Cache-Control")).toBe("no-store");
    expect(await update.json()).toEqual({ user: { id: user.id, displayName: "포레나" } });
    // A fresh account-session credential observes the persisted profile, not browser nickname state.
    const replacement = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
    await env.ACCOUNT_DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha(replacement), user.id, Date.now(), Date.now() + 3600_000).run();
    expect(await (await call("/api/auth/me", { headers: { Cookie: `__Host-porena_session=${replacement}` } })).json()).toEqual({ authenticated: true, user: { id: user.id, displayName: "포레나" } });
  });
  it.each(["가", "가나다라마바사아", "Pang_ 7-", "𐐀".repeat(8)])("accepts the existing Unicode nickname policy: %s", async displayName => {
    const user = await account(null);
    expect((await profile(user.cookie, displayName)).status).toBe(200);
    expect(await env.ACCOUNT_DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(user.id).first("display_name")).toBe(displayName);
  });
  it.each(["", "   ", "가나다라마바사아자", "<b>x</b>", "Pang!", "Pang😀", "Pa\u0000ng", "\nPang", "Pang\t", null, 123])("rejects invalid profile input without changing the stored name: %j", async displayName => {
    const user = await account("기존이름");
    expect((await profile(user.cookie, displayName)).status).toBe(400);
    expect(await env.ACCOUNT_DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(user.id).first("display_name")).toBe("기존이름");
  });
  it("requires an active account and same-origin mutation, while duplicate public names remain allowed", async () => {
    const one = await account("기존"); const two = await account(null);
    expect((await profile("", "Pang")).status).toBe(401);
    expect((await profile("__Host-porena_session=bad", "Pang")).status).toBe(401);
    for (const rejected of ["", "https://evil.example", "https://123456789012345678.discordsays.com"]) {
      expect((await profile(one.cookie, "공격", { Origin: rejected })).status).toBe(403);
    }
    expect((await profile(one.cookie, "공격", { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await profile(one.cookie, "동명이인")).status).toBe(200);
    expect((await profile(two.cookie, "동명이인")).status).toBe(200);
    await env.ACCOUNT_DB.prepare("UPDATE sessions SET expires_at = 0 WHERE user_id = ?").bind(one.id).run();
    expect((await profile(one.cookie, "만료")).status).toBe(401);
    await env.ACCOUNT_DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").bind(two.id).run();
    expect((await profile(two.cookie, "비활성")).status).toBe(401);
  });
  it("rejects malformed or identity-bearing profile bodies without modifying either account", async () => {
    const one = await account("계정하나"); const two = await account("계정둘");
    for (const body of ["{", "null", "[]", "{}", JSON.stringify({ displayName: "위조", id: two.id }), JSON.stringify({ displayName: "위조", accountUserId: two.id })]) {
      const response = await call("/api/profile", { method: "PATCH", headers: { Cookie: one.cookie, "Content-Type": "application/json" }, body });
      expect(response.status).toBe(400);
    }
    expect(await env.ACCOUNT_DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(one.id).first("display_name")).toBe("계정하나");
    expect(await env.ACCOUNT_DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(two.id).first("display_name")).toBe("계정둘");
  });
});

describe("account identity belongs to the room session, never the public player", () => {
  it("rejects a new account cookie appearing after the user explicitly chose a Guest seat", async () => {
    const user = await account(); const host = await seat();
    for (const path of ["/api/rooms", `/api/rooms/${host.roomId}/join`]) {
      const response = await call(path, { method: "POST", headers: { Cookie: user.cookie, "X-Porena-Identity": "guest" } });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "ACCOUNT_CHANGED" });
    }
    expect((await saved(host.roomId)).sessions).toHaveLength(1);
  });
  it("binds authenticated create and join to D1 names, ignores valid forged JOIN nicknames, and preserves Guest naming", async () => {
    const one = await account("방장계정"); const two = await account("참가계정");
    const host = await seat(one.cookie); const joined = await seat(two.cookie, host.roomId); const guest = await seat("", host.roomId);
    const clients = await Promise.all([connect(host, "위조방장"), connect(joined, "위조참가"), connect(guest, "게스트")]);
    const room = await saved(host.roomId);
    expect(room.sessions[0]).toMatchObject({ playerId: host.playerId, accountUserId: one.id });
    expect(room.sessions[1]).toMatchObject({ playerId: joined.playerId, accountUserId: two.id });
    expect(room.sessions[2]).not.toHaveProperty("accountUserId");
    expect(room.game.players.slice(0, 3).map(player => player.name)).toEqual(["방장계정", "참가계정", "게스트"]);
    const names = clients[2].view().players.slice(0, 3).map(player => player.name);
    expect(names).toEqual(["방장계정", "참가계정", "게스트"]);
    const wire = JSON.stringify(clients.flatMap(client => client.messages));
    for (const privateValue of ["accountUserId", "tokenHash", "provider_subject", one.id, one.subject, one.token, one.tokenHash, two.id, two.subject, two.tokenHash]) expect(wire).not.toContain(privateValue);
  });
  it("rejects account create/join until a public profile exists", async () => {
    const user = await account(null); const host = await seat();
    for (const path of ["/api/rooms", `/api/rooms/${host.roomId}/join`]) {
      const response = await call(path, { method: "POST", headers: { Cookie: user.cookie } });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "PROFILE_REQUIRED" });
    }
    expect((await saved(host.roomId)).sessions).toHaveLength(1);
  });
  it("strips external identity headers for Guests and overwrites them for authenticated users", async () => {
    const victim = await account("정상계정");
    const forged = { "X-Internal-Porena-User-Id": victim.id, "X-Internal-Porena-Display-Name": "Impostor", "X-Porena-User-Id": victim.id, "X-Porena-Display-Name": "Impostor" };
    const host = await seat("", undefined, forged); const guest = await seat("", host.roomId, forged);
    const real = await seat(victim.cookie, host.roomId, { ...forged, "X-Internal-Porena-User-Id": crypto.randomUUID() });
    await connect(host, "게스트1"); await connect(guest, "게스트2"); await connect(real, "위조이름");
    const room = await saved(host.roomId);
    expect(room.sessions.slice(0, 2).every(session => !("accountUserId" in session))).toBe(true);
    expect(room.sessions[2]).toMatchObject({ accountUserId: victim.id });
    expect(room.game.players.slice(0, 3).map(player => player.name)).toEqual(["게스트1", "게스트2", "정상계정"]);
  });
  it("treats expired account cookies as Guest for new seats without attaching a stale identity", async () => {
    const user = await account("만료계정");
    await env.ACCOUNT_DB.prepare("UPDATE sessions SET expires_at = 0 WHERE user_id = ?").bind(user.id).run();
    const credential = await seat(user.cookie);
    await connect(credential, "게스트");
    const room = await saved(credential.roomId);
    expect(room.sessions[0]).not.toHaveProperty("accountUserId");
    expect(room.game.players[0].name).toBe("게스트");
  });
  it("rejects an explicit account-seat request when the account session has expired", async () => {
    const user = await account(); const host = await seat();
    await env.ACCOUNT_DB.prepare("UPDATE sessions SET expires_at = 0 WHERE user_id = ?").bind(user.id).run();
    for (const path of ["/api/rooms", `/api/rooms/${host.roomId}/join`]) {
      const response = await call(path, { method: "POST", headers: { Cookie: user.cookie, "X-Porena-Identity": "account" } });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "ACCOUNT_REQUIRED" });
    }
    expect((await saved(host.roomId)).sessions).toHaveLength(1);
  });
  it("fails closed for account DB errors on new seats while keeping existing room-token recovery independent", async () => {
    const user = await account(); const credential = await seat(user.cookie);
    const unavailable = { ...env, ACCOUNT_DB: { prepare() { throw new Error("test database unavailable"); } } as unknown as D1Database };
    const request = (path: string, extra: Record<string, string> = {}) => new Request(`${origin}${path}`, {
      method: "POST", headers: { Cookie: user.cookie, Origin: origin, "CF-Connecting-IP": crypto.randomUUID(), ...extra },
    });
    for (const path of ["/api/rooms", `/api/rooms/${credential.roomId}/join`]) {
      const response = await worker.fetch(request(path), unavailable);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "ACCOUNT_UNAVAILABLE" });
    }
    expect((await worker.fetch(request(`/api/rooms/${credential.roomId}/session`, { "X-Porena-Session": credential.token }), unavailable)).status).toBe(204);
    const ticket = await worker.fetch(request(`/api/rooms/${credential.roomId}/connection-ticket`, { "X-Porena-Session": credential.token }), unavailable);
    expect(ticket.status).toBe(201);
    await ticket.json();
    expect((await saved(credential.roomId)).sessions).toHaveLength(1);
  });
  it("retains the captured room name across profile edits, eviction, account logout and ticket-based reconnect", async () => {
    const user = await account("입장닉네임"); const credential = await seat(user.cookie);
    const client = await connect(credential, "위조");
    expect((await profile(user.cookie, "다음방이름")).status).toBe(200);
    expect((await call("/api/auth/logout", { method: "POST", headers: { Cookie: user.cookie } })).status).toBe(200);
    client.ws.close(1000);
    await evictDurableObject(stubFor(credential.roomId));
    const status = await call(`/api/rooms/${credential.roomId}/session`, { method: "POST", headers: { "X-Porena-Session": credential.token } });
    expect(status.status).toBe(204);
    const restored = await connect(credential, "다시위조", "", true);
    expect(restored.view().players.find(player => player.playerId === credential.playerId)?.name).toBe("입장닉네임");
    expect((await saved(credential.roomId)).sessions[0]).toMatchObject({ accountUserId: user.id, playerId: credential.playerId });
  });
  it("serializes duplicate account joins and preserves room-token resume for a departed seat", async () => {
    const user = await account(); const host = await seat();
    const attempts = await Promise.all([1, 2].map(() => call(`/api/rooms/${host.roomId}/join`, { method: "POST", headers: { Cookie: user.cookie } })));
    expect(attempts.map(response => response.status).sort()).toEqual([201, 409]);
    const credential = await attempts.find(response => response.status === 201)!.json() as SessionCredential;
    await attempts.find(response => response.status === 409)!.text();
    const client = await connect(credential);
    expect(await client.send({ type: "LEAVE_ROOM" })).toMatchObject({ type: "ACK" });
    const duplicate = await call(`/api/rooms/${host.roomId}/join`, { method: "POST", headers: { Cookie: user.cookie } });
    expect(duplicate.status).toBe(409); await duplicate.text();
    expect((await saved(host.roomId)).sessions).toHaveLength(2);
    const restored = await connect(credential, "再命名");
    expect(restored.view().players.find(player => player.playerId === credential.playerId)).toMatchObject({ name: "포레나", departed: false });
    expect((await saved(host.roomId)).sessions[1]).toMatchObject({ accountUserId: user.id, departed: false });
  });
  it("keeps the identity mapping through a rematch and restored legacy Guest snapshots", async () => {
    const user = await account("계정닉네임"); const host = await seat(user.cookie); const guest = await seat("", host.roomId);
    const first = await connect(host); const second = await connect(guest, "레거시");
    first.ws.close(1000); second.ws.close(1000);
    const stub = stubFor(host.roomId);
    await runInDurableObject(stub, async (_instance, state) => {
      const room = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
      room.status = "PLAYING"; room.game.phase = "GAME_RESULT"; room.presentation = undefined; room.readyIds = [];
      room.finalResultsReleasedAt = Date.now();
      await state.storage.put("snapshot:v1", room);
    });
    await evictDurableObject(stub);
    const clients = [await connect(host, "위조"), await connect(guest)];
    for (const client of clients) expect(await client.send({ type: "REMATCH_READY" })).toMatchObject({ type: "ACK" });
    const room = await saved(host.roomId);
    expect(room.gameGeneration).toBe(1);
    expect(room.game.round).toBe(1);
    expect(room.game.sixRounds).toBe(true);
    expect(room.sessions[0]).toMatchObject({ playerId: host.playerId, accountUserId: user.id });
    expect(room.sessions[1]).not.toHaveProperty("accountUserId");
    expect(room.game.players.slice(0, 2).map(player => player.name)).toEqual(["계정닉네임", "레거시"]);
  });
});
