import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, it } from "vitest";
import type { SessionCredential } from "../../src/shared/protocol";

const origin = "https://porena.test";
const sockets: WebSocket[] = [];
let visitor = 0;
let sharedNetwork: string | undefined;
const headers = () => ({ Origin: origin, "CF-Connecting-IP": sharedNetwork ?? `198.51.100.${++visitor}` });
afterEach(() => { sharedNetwork = undefined; for (const socket of sockets.splice(0)) socket.close(1000); });
async function seat(roomId?: string): Promise<SessionCredential> {
  const response = await exports.default.fetch(`${origin}/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: headers() });
  expect(response.status).toBe(201); return response.json();
}
async function mint(session: SessionCredential) {
  const response = await exports.default.fetch(`${origin}/api/rooms/${session.roomId}/connection-ticket`, { method: "POST", headers: { ...headers(), "X-Porena-Session": session.token } });
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return response.json() as Promise<{ ticket: string; expiresAt: number }>;
}
async function upgrade(roomId: string, ticket?: string) {
  const response = await exports.default.fetch(`${origin}/ws/rooms/${roomId}`, { headers: { ...headers(), Upgrade: "websocket", ...(ticket ? { "Sec-WebSocket-Protocol": `porena-v1, porena-ticket-${ticket}` } : {}) } });
  if (response.webSocket) { response.webSocket.accept(); sockets.push(response.webSocket); }
  else await response.text(); // Complete rejected HTTP requests before asking workerd to evict.
  return response;
}
async function authenticate(socket: WebSocket, session: SessionCredential) {
  const joined = new Promise<{ type: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Authentication timeout")), 3000);
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data as string);
      if (message.type === "ROOM_JOINED" || message.type === "ERROR") { clearTimeout(timeout); resolve(message); }
    });
  });
  socket.send(JSON.stringify({ type: "JOIN_ROOM", token: session.token }));
  return joined;
}

it("reserves valid-seat reconnects after legacy pending saturation, including eight shared-network seats", async () => {
  sharedNetwork = "203.0.113.8";
  const host = await seat();
  const seats = [host]; for (let n = 1; n < 8; n++) seats.push(await seat(host.roomId));
  for (let n = 0; n < 8; n++) expect((await upgrade(host.roomId)).status).toBe(101);
  expect((await upgrade(host.roomId)).status).toBe(429);
  for (const session of seats) {
    const proof = await mint(session);
    const response = await upgrade(session.roomId, proof.ticket);
    expect(response.status).toBe(101);
    expect(response.headers.get("Sec-WebSocket-Protocol")).toBe("porena-v1");
    expect(await authenticate(response.webSocket!, session)).toMatchObject({ type: "ROOM_JOINED" });
  }
  const pending = [];
  for (const session of seats) {
    const proof = await mint(session);
    const response = await upgrade(session.roomId, proof.ticket);
    expect(response.status).toBe(101);
    pending.push(response.webSocket!);
  }
  const proof = await mint(host);
  const replacement = await upgrade(host.roomId, proof.ticket);
  expect(replacement.status).toBe(101);
  expect(await authenticate(replacement.webSocket!, host)).toMatchObject({ type: "ROOM_JOINED" });
  for (let n = 1; n < seats.length; n++) expect(await authenticate(pending[n]!, seats[n]!)).toMatchObject({ type: "ROOM_JOINED" });
});

it("rejects invalid sessions, cross-room proofs and mismatched seat authentication", async () => {
  const host = await seat(); const guest = await seat(host.roomId); const other = await seat();
  const invalid = await exports.default.fetch(`${origin}/api/rooms/${host.roomId}/connection-ticket`, { method: "POST", headers: { ...headers(), "X-Porena-Session": "a".repeat(64) } });
  expect(invalid.status).toBe(401);
  await invalid.text();
  const foreign = await exports.default.fetch(`${origin}/api/rooms/${host.roomId}/connection-ticket`, { method: "POST", headers: { ...headers(), Origin: "https://evil.test", "X-Porena-Session": host.token } });
  expect(foreign.status).toBe(403);
  await foreign.text();
  expect((await upgrade(host.roomId, "malformed")).status).toBe(401);
  const proof = await mint(host);
  expect((await upgrade(other.roomId, proof.ticket)).status).toBe(401);
  const response = await upgrade(host.roomId, proof.ticket);
  expect(response.status).toBe(101);
  expect(await authenticate(response.webSocket!, guest)).toMatchObject({ type: "ERROR" });
});

it("admits a proven seat when a previous deployment left 24 pending sockets", async () => {
  const host = await seat();
  const stub = env.GAME_ROOM.getByName(`room:${host.roomId}`);
  await runInDurableObject(stub, async (_instance, state) => {
    for (let n = 0; n < 24; n++) {
      const [, server] = Object.values(new WebSocketPair());
      state.acceptWebSocket(server);
      server.serializeAttachment({ roomId: host.roomId, playerId: null, joinedAt: Date.now() + n });
    }
    expect(state.getWebSockets().length).toBe(24);
  });
  const proof = await mint(host);
  const response = await upgrade(host.roomId, proof.ticket);
  expect(response.status).toBe(101);
  expect(await authenticate(response.webSocket!, host)).toMatchObject({ type: "ROOM_JOINED" });
  await runInDurableObject(stub, async (_instance, state) => {
    expect(state.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN)).toHaveLength(9);
    for (const socket of state.getWebSockets()) socket.close(1000);
  });
});

it("consumes exactly once under concurrent upgrade requests and retains consumption across hibernation", async () => {
  const host = await seat(); const proof = await mint(host);
  const stub = env.GAME_ROOM.getByName(`room:${host.roomId}`);
  await evictDurableObject(stub);
  const results = await Promise.all([upgrade(host.roomId, proof.ticket), upgrade(host.roomId, proof.ticket)]);
  expect(results.map(response => response.status).sort()).toEqual([101, 401]);
  expect(await authenticate(results.find(response => response.status === 101)!.webSocket!, host)).toMatchObject({ type: "ROOM_JOINED" });
  await runInDurableObject(stub, async (_instance, state) => {
    expect(await state.storage.get("connection-tickets:v1")).toEqual({});
  });
  await evictDurableObject(stub);
  expect((await upgrade(host.roomId, proof.ticket)).status).toBe(401);
});

it("bounds outstanding proofs to one per seat and invalidates superseded or expired proofs", async () => {
  const host = await seat(); const first = await mint(host); const second = await mint(host);
  expect(second.expiresAt - Date.now()).toBeGreaterThan(20_000);
  expect(second.expiresAt - Date.now()).toBeLessThanOrEqual(30_000);
  expect((await upgrade(host.roomId, first.ticket)).status).toBe(401);
  const stub = env.GAME_ROOM.getByName(`room:${host.roomId}`);
  await runInDurableObject(stub, async (instance, state) => {
    const target = instance as unknown as { tickets: Record<string, { digest: string; expiresAt: number }> };
    expect(Object.keys(target.tickets)).toEqual([host.playerId]);
    target.tickets[host.playerId]!.expiresAt = Date.now() - 1;
    await state.storage.put("connection-tickets:v1", target.tickets);
  });
  expect((await upgrade(host.roomId, second.ticket)).status).toBe(401);
  await runInDurableObject(stub, async (instance, state) => {
    await instance.alarm();
    expect(await state.storage.get("connection-tickets:v1")).toEqual({});
  });
});

it("reclaims timed-out legacy pending capacity without altering valid sessions", async () => {
  const host = await seat();
  for (let n = 0; n < 8; n++) await upgrade(host.roomId);
  const stub = env.GAME_ROOM.getByName(`room:${host.roomId}`);
  await runInDurableObject(stub, async (instance, state) => {
    for (const socket of state.getWebSockets()) {
      const attachment = socket.deserializeAttachment(); attachment.joinedAt = Date.now() - 16_000;
      socket.serializeAttachment(attachment);
    }
    await instance.alarm();
  });
  const proof = await mint(host);
  const response = await upgrade(host.roomId, proof.ticket);
  expect(response.status).toBe(101);
  expect(await authenticate(response.webSocket!, host)).toMatchObject({ type: "ROOM_JOINED" });
  expect((await upgrade(host.roomId)).status).toBe(101);
});
