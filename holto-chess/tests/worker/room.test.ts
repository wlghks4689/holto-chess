import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { GameAction, PlayerView, ServerMessage, SessionCredential } from "../../src/shared/protocol";
import type { RoomSnapshot } from "../../src/game/room";
import { assertPoolIntegrity } from "../../src/game/cardPool";

const origin = "https://holto.test";
const sockets: WebSocket[] = [];
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });
async function session(roomId?: string): Promise<SessionCredential> {
  const res = await exports.default.fetch(`${origin}/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: { Origin: origin } });
  expect(res.status).toBe(201); return res.json();
}
async function connect(s: SessionCredential) {
  const res = await exports.default.fetch(`${origin}/ws/rooms/${s.roomId}`, { headers: { Upgrade: "websocket", Origin: origin } });
  expect(res.status).toBe(101); const ws = res.webSocket!; ws.accept(); sockets.push(ws);
  const messages: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener("message", (e) => { messages.push(JSON.parse(e.data as string)); waiters.splice(0).forEach((fn) => fn()); });
  const wait = async (predicate: (m: ServerMessage) => boolean) => {
    for (;;) {
      const found = messages.find(predicate); if (found) return found;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Message timeout: ${JSON.stringify(messages.map((m) => m.type))}`)), 5000);
        waiters.push(() => { clearTimeout(timeout); resolve(); });
      });
    }
  };
  const view = () => (messages.filter((m) => m.type === "PLAYER_VIEW").at(-1) as { type: "PLAYER_VIEW"; payload: PlayerView }).payload;
  ws.send(JSON.stringify({ type: "JOIN_ROOM", token: s.token }));
  await wait((m) => m.type === "PLAYER_VIEW");
  const send = async (action: GameAction, requestId = crypto.randomUUID()) => {
    const revision = view().revision;
    ws.send(JSON.stringify({ ...action, requestId, turnKey: view().turnKey }));
    const reply = await wait((m) => (m.type === "ACK" || m.type === "ERROR") && m.requestId === requestId);
    if (reply.type === "ACK") await wait((m) => m.type === "PLAYER_VIEW" && m.payload.revision >= reply.revision && m.payload.revision >= revision);
    return reply;
  };
  return { ws, messages, wait, view, send };
}
describe("GameRoom in the Cloudflare runtime", () => {
  it("serializes concurrent rerolls, keeps locks, deduplicates retries and rejects a burst past the limit", async () => {
    const a = await session(); const b = await session(a.roomId); const c = await session(a.roomId);
    const clients = await Promise.all([connect(a), connect(b), connect(c)]);
    for (const client of clients) await client.send({ type: "READY" });
    await Promise.all(clients.map((client) => client.wait((m) => m.type === "PLAYER_VIEW" && m.payload.phase === "SHOP")));
    const locked = clients[0].view().me.shopCards[0].card.id;
    await clients[0].send({ type: "LOCK_SHOP", cardId: locked });
    const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
    const saved = () => runInDurableObject(stub, (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1"));
    const replies = await Promise.all(clients.map((client) => client.send({ type: "REROLL" })));
    expect(replies.every((r) => r.type === "ACK")).toBe(true);
    const first = (await saved())!;
    expect(assertPoolIntegrity(first.game)).toBe(true);
    for (const player of first.game.players.slice(0, 3)) expect(player.rerollsUsed).toBe(1);
    const shopIds = first.game.players.flatMap((p) => p.shopCardIds);
    expect(new Set(shopIds).size).toBe(shopIds.length);
    expect(first.game.players[0].shopCardIds).toContain(locked);
    const requestId = crypto.randomUUID();
    const packet = JSON.stringify({ type: "REROLL", requestId, turnKey: clients[0].view().turnKey });
    clients[0].ws.send(packet); clients[0].ws.send(packet);
    await clients[0].wait((m) => m.type === "ACK" && m.requestId === requestId);
    const burst = await Promise.all(Array.from({ length: 3 }, () => clients[0].send({ type: "REROLL" })));
    expect(burst.every((r) => r.type === "ERROR")).toBe(true);
    const after = (await saved())!;
    expect(after.game.players[0].rerollsUsed).toBe(2);
    expect(after.game.players[0].stackBB).toBe(37);
    expect(after.revision).toBe(first.revision + 1);
    expect(assertPoolIntegrity(after.game)).toBe(true);
    await evictDurableObject(stub);
    expect(await clients[0].send({ type: "REROLL" })).toMatchObject({ type: "ERROR" });
    expect(await saved()).toEqual(after);
  });
  it("isolates rooms and per-player payloads; rejects hostile purchases; persists, hibernates, reconnects and deduplicates", async () => {
    const a = await session(); const b = await session(a.roomId); const other = await session();
    const one = await connect(a); const two = await connect(b); const separate = await connect(other);
    expect(one.view().roomId).not.toBe(separate.view().roomId);
    expect(one.view().me.playerId).toBe("p1"); expect(two.view().me.playerId).toBe("p2");
    const privateIds = [...two.view().me.ownedCards, ...two.view().me.shopCards.map((s) => s.card)].map((c) => c.id);
    for (const id of privateIds) expect(JSON.stringify(one.view())).not.toContain(`"${id}"`);
    expect(JSON.stringify(one.view())).not.toMatch(/ownershipCardPool|tokenHash|"seed"/);
    expect(await one.send({ type: "READY" })).toMatchObject({ type: "ACK" });
    expect(await two.send({ type: "READY" })).toMatchObject({ type: "ACK" });
    await one.wait((m) => m.type === "PLAYER_VIEW" && m.payload.phase === "SHOP");
    const before = one.view().me.stackBB;
    const invalid = await one.send({ type: "BUY_CARD", cardId: two.view().me.shopCards[0].card.id });
    expect(invalid).toMatchObject({ type: "ERROR", code: "ACTION_REJECTED" });
    expect(one.view().me.stackBB).toBe(before);
    const requestId = crypto.randomUUID();
    const card = one.view().me.shopCards[0];
    expect(await one.send({ type: "BUY_CARD", cardId: card.card.id }, requestId)).toMatchObject({ type: "ACK" });
    const purchased = one.view();
    expect(purchased.me.stackBB).toBe(before - card.price);
    const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
    const saved = await runInDurableObject(stub, async (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1"));
    expect(saved!.game.players[0].ownedCardIds).toContain(card.card.id);
    expect(saved!.game.randomMode).toBe("secure");
    expect(saved!.sessions.every((s) => s.tokenHash !== a.token && s.tokenHash !== b.token)).toBe(true);
    await evictDurableObject(stub); // Actual constructor re-entry; sockets remain hibernated.
    expect(await one.send({ type: "LOCK_SHOP", cardId: one.view().me.shopCards[0].card.id })).toMatchObject({ type: "ACK" });
    expect(one.view().me.ownedCards).toEqual(purchased.me.ownedCards);
    expect(one.view().me.lockedShopCardIds).toHaveLength(1);
    one.ws.close(1000);
    const reconnect = await connect(a);
    expect(reconnect.view().me.playerId).toBe(a.playerId);
    expect(reconnect.view().me.stackBB).toBe(purchased.me.stackBB - 3);
    expect(await reconnect.send({ type: "BUY_CARD", cardId: card.card.id }, requestId)).toMatchObject({ type: "ACK" });
    expect(reconnect.view().me.purchases).toBe(1);
    expect(separate.view().phase).toBe("LOBBY");
    expect(separate.view().humanCount).toBe(1);
  });
  it("rejects foreign origins and tokens from another room", async () => {
    const forbidden = await exports.default.fetch(`${origin}/api/rooms`, { method: "POST", headers: { Origin: "https://evil.test" } });
    expect(forbidden.status).toBe(403);
    const a = await session(); const b = await session();
    const res = await exports.default.fetch(`${origin}/ws/rooms/${a.roomId}`, { headers: { Upgrade: "websocket", Origin: origin } });
    const ws = res.webSocket!; ws.accept(); sockets.push(ws);
    const message = new Promise<ServerMessage>((resolve) => ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)), { once: true }));
    ws.send(JSON.stringify({ type: "JOIN_ROOM", token: b.token }));
    expect(await message).toMatchObject({ type: "ERROR", code: "UNAUTHORIZED" });
  });
  it("serializes simultaneous purchases and rejects caller-supplied player identity", async () => {
    const a = await session(); const b = await session(a.roomId);
    const one = await connect(a); const two = await connect(b);
    await one.send({ type: "READY" }); await two.send({ type: "READY" });
    await one.wait((m) => m.type === "PLAYER_VIEW" && m.payload.phase === "SHOP");
    const first = one.view().me.shopCards[0];
    const second = two.view().me.shopCards[0];
    const results = await Promise.all([one.send({ type: "BUY_CARD", cardId: first.card.id }), two.send({ type: "BUY_CARD", cardId: second.card.id })]);
    expect(results.every((r) => r.type === "ACK")).toBe(true);
    const saved = await runInDurableObject(env.GAME_ROOM.getByName(`room:${a.roomId}`), (_i, state) => state.storage.get<RoomSnapshot>("snapshot:v1"));
    expect(saved!.game.players[0].stackBB).toBe(50 - first.price);
    expect(saved!.game.players[1].stackBB).toBe(50 - second.price);
    const requestId = crypto.randomUUID();
    one.ws.send(JSON.stringify({ type: "REROLL", playerId: "p2", stackBB: 999, requestId, turnKey: one.view().turnKey }));
    expect(await one.wait((m) => m.type === "ERROR")).toMatchObject({ type: "ERROR", code: "ACTION_REJECTED" });
  });
});
