import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { GameAction, PlayerView, ServerMessage, SessionCredential } from "../../src/shared/protocol";
import type { RoomSnapshot } from "../../src/game/room";
import { assertPoolIntegrity, releasePlayerCards } from "../../src/game/cardPool";

const origin = "https://porena.test";
const sockets: WebSocket[] = [];
let sessionSequence = 0;
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });
async function session(roomId?: string): Promise<SessionCredential> {
  // Independent visitors keep the expanded suite from exhausting the shared unknown-IP quota.
  const res = await exports.default.fetch(`${origin}/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: { Origin: origin, "CF-Connecting-IP": `192.0.2.${++sessionSequence}` } });
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
        const timeout = setTimeout(() => reject(new Error(`Message timeout: ${JSON.stringify(messages.slice(-3))}`)), 5000);
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
  it("persists and broadcasts an empty-hand timeout forfeit, including after reconnect", async () => {
    const a = await session(); const b = await session(a.roomId);
    const clients = await Promise.all([a, b].map(connect));
    await Promise.all(clients.map((client) => client.send({ type: "READY" })));
    const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
    // The legal spending sequence is covered by the engine/room regression.
    // Here exercise storage re-entry, real alarms, serialization and reconnect.
    await runInDurableObject(stub, async (_instance, state) => {
      const saved = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
      const player = saved.game.players.find((p) => p.id === a.playerId)!;
      releasePlayerCards(saved.game, player); player.stackBB = 0;
      saved.barrierSince = Date.now() - 120_000;
      expect(assertPoolIntegrity(saved.game)).toBe(true);
      await state.storage.put("snapshot:v1", saved);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance) => instance.alarm());
    await clients[0].wait((m) => m.type === "PLAYER_VIEW" && m.payload.phase === "SHOWDOWN_PRIMARY");
    await runInDurableObject(stub, async (_instance, state) => {
      const saved = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
      saved.barrierSince = Date.now() - 120_000;
      await state.storage.put("snapshot:v1", saved);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance) => instance.alarm());
    await Promise.all(clients.map((client) => client.wait((m) => m.type === "PLAYER_VIEW" && m.payload.phase === "ROUND_RESULT")));
    const saved = (await runInDurableObject(stub, (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1")))!;
    expect(saved.game.players.find((p) => p.id === a.playerId)).toMatchObject({ stackBB: 0, points: 0, ownedCardIds: [] });
    expect(saved.game.roundResults.filter((match) => match.playerIds.includes(a.playerId)).every((match) =>
      match.results.find((r) => r.playerId === a.playerId)!.hand.displayName === "몰수패")).toBe(true);
    const reconnected = await connect(a);
    expect(reconnected.view().me).toEqual(clients[0].view().me);
    expect(reconnected.view().phase).toBe("ROUND_RESULT");
    expect(assertPoolIntegrity(saved.game)).toBe(true);
  });
  it("persists and broadcasts AI purchases from a fully locked shop after timeout", async () => {
    const a = await session(); const b = await session(a.roomId);
    const clients = await Promise.all([a, b].map(connect));
    await Promise.all(clients.map((client) => client.send({ type: "READY" })));
    await clients[0].wait((message) => message.type === "PLAYER_VIEW" && message.payload.phase === "SHOP");
    expect(await clients[0].send({ type: "REROLL" })).toMatchObject({ type: "ACK" });
    const lockedIds = clients[0].view().me.shopCards.map(({ card }) => card.id);
    for (const cardId of lockedIds) expect(await clients[0].send({ type: "LOCK_SHOP", cardId })).toMatchObject({ type: "ACK" });
    expect(clients[0].view().me.stackBB).toBe(39);

    const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
    await runInDurableObject(stub, async (_instance, state) => {
      const saved = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
      saved.barrierSince = Date.now() - 120_000;
      await state.storage.put("snapshot:v1", saved);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance) => instance.alarm());
    await Promise.all(clients.map((client) => client.wait((message) => message.type === "PLAYER_VIEW" && message.payload.phase === "SHOWDOWN_PRIMARY")));

    const saved = (await runInDurableObject(stub, (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1")))!;
    const player = saved.game.players.find((candidate) => candidate.id === a.playerId)!;
    expect(player.ownedCardIds).toHaveLength(2);
    expect(player.ownedCardIds.some((id) => lockedIds.includes(id))).toBe(true);
    expect(player.lockedShopCardIds.every((id) => player.shopCardIds.includes(id))).toBe(true);
    expect(player.lockedShopCardIds.every((id) => !player.ownedCardIds.includes(id))).toBe(true);
    expect(assertPoolIntegrity(saved.game)).toBe(true);
    const reconnected = await connect(a);
    expect(reconnected.view().phase).toBe("SHOWDOWN_PRIMARY");
    expect(reconnected.view().me.ownedCards).toHaveLength(2);
  });
  it("limits connection attempts and expires old room snapshots", async () => {
    const headers = { Origin: origin, "CF-Connecting-IP": "192.0.2.92" };
    for (let i = 0; i < 120; i++) {
      expect((await exports.default.fetch(`${origin}/api/unknown`, { headers })).status).toBe(404);
    }
    expect((await exports.default.fetch(`${origin}/api/unknown`, { headers })).status).toBe(429);
    const a = await session();
    const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
    await runInDurableObject(stub, (_instance, state) => state.storage.put("expiresAt", Date.now() - 1));
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance, state) => {
      await instance.alarm();
      expect(await state.storage.get("snapshot:v1")).toBeUndefined();
      expect(await state.storage.get("expiresAt")).toBeUndefined();
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });
  it("limits room creation without allocating more rooms and keeps health available", async () => {
    const headers = { Origin: origin, "CF-Connecting-IP": "192.0.2.91" };
    for (let i = 0; i < 10; i++) {
      expect((await exports.default.fetch(`${origin}/api/rooms`, { method: "POST", headers })).status).toBe(201);
    }
    const limited = await exports.default.fetch(`${origin}/api/rooms`, { method: "POST", headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect((await exports.default.fetch(`${origin}/api/health`, { headers })).status).toBe(200);
  });
  it("caps a room at eight players and preserves www paths and query strings", async () => {
    const a = await session();
    for (let i = 1; i < 8; i++) await session(a.roomId);
    const full = await exports.default.fetch(`${origin}/api/rooms/${a.roomId}/join`, { method: "POST", headers: { Origin: origin } });
    expect(full.status).toBe(409);
    const redirect = await exports.default.fetch("https://www.porena.kr/play?room=ABC234", { redirect: "manual" });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("Location")).toBe("https://porena.kr/play?room=ABC234");
  });
  it.each([2, 4, 8])("finishes R1–R5 over %i sockets, reconnects in each reached phase and agrees on standings", async (count) => {
    const a = await session();
    const credentials = [a];
    for (let i = 1; i < count; i++) credentials.push(await session(a.roomId));
    const clients = await Promise.all(credentials.map(connect));
    const readyReplies = await Promise.all(clients.map((client) => client.send({ type: "READY" })));
    expect(readyReplies.every((reply) => reply.type === "ACK")).toBe(true);
    const reconnected = new Set<string>();
    // Automatic Deal-In and match-setup beats are real server phases now, so a
    // complete five-round run needs more transitions than the old ready-only flow.
    for (let step = 0; step < 120; step++) {
      const revision = Math.max(...clients.map((c) => c.view().revision));
      await Promise.all(clients.map((c) => c.wait((m) => m.type === "PLAYER_VIEW" && m.payload.revision >= revision)));
      if (clients[0].view().phase === "GAME_RESULT") break;
      const phase = clients[0].view().phase;
      const phaseKey = `${clients[0].view().round}:${phase}`;
      if (!reconnected.has(phaseKey)) {
        const before = clients[0].view();
        const previous = clients[0];
        clients[0] = await connect(a); // Also exercises replacement of the same session in another tab.
        previous.ws.close(1000);
        expect(clients[0].view().me).toEqual(before.me);
        expect(clients[0].view().barrierEndsAt).toBe(before.barrierEndsAt);
        expect(clients[0].view().standings).toEqual(before.standings);
        reconnected.add(phaseKey);
      }
      if (clients[0].view().presentation) {
        // Advance the stored clock past playback AND the result-confirmation
        // window, then exercise the real alarm/broadcast path (also for spectators).
        const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
        await runInDurableObject(stub, async (_instance, state) => {
          const saved = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
          saved.barrierSince = Date.now() - 120_000;
          saved.presentation!.startsAt = Date.now() - 240_000;
          saved.presentation!.endsAt = Date.now() - 120_000;
          await state.storage.put("snapshot:v1", saved);
        });
        await evictDurableObject(stub);
        await runInDurableObject(stub, (instance) => instance.alarm());
        await Promise.all(clients.map((c) => c.wait((m) => m.type === "PLAYER_VIEW" && m.payload.revision > revision)));
        continue;
      }
      if (phase === "OPEN_DRAFT") {
        const draft = clients[0].view().draft!;
        const picker = clients.find((c) => c.view().me.playerId === draft.currentPlayerId);
        if (picker) {
          const card = picker.view().draft!.cards.find((c) => !c.claimedBy && c.price <= picker.view().me.stackBB)!;
          expect(await picker.send({ type: "DRAFT_PICK", cardId: card.card.id })).toMatchObject({ type: "ACK" });
        } else {
          const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
          await runInDurableObject(stub, async (_instance, state) => {
            const saved = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
            saved.barrierSince = Date.now() - 21_000;
            await state.storage.put("snapshot:v1", saved);
          });
          await evictDurableObject(stub);
          await runInDurableObject(stub, (instance) => instance.alarm());
          await Promise.all(clients.map((c) => c.wait((m) => m.type === "PLAYER_VIEW" && m.payload.revision > revision)));
        }
        continue;
      }
      if (["DRAFT_ORDER", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(phase)) {
        const stub = env.GAME_ROOM.getByName(`room:${a.roomId}`);
        await runInDurableObject(stub, async (_instance, state) => {
          const saved = (await state.storage.get<RoomSnapshot>("snapshot:v1"))!;
          saved.barrierSince = Date.now() - 120_000;
          await state.storage.put("snapshot:v1", saved);
        });
        await evictDurableObject(stub);
        await runInDurableObject(stub, (instance) => instance.alarm());
        await Promise.all(clients.map((c) => c.wait((m) => m.type === "PLAYER_VIEW" && m.payload.revision > revision)));
        continue;
      }
      for (const client of clients) {
        const view = client.view();
        if (view.phase !== phase) break;
        if (!view.me.alive && clients.some((c) => c.view().me.alive)) continue;
        if (phase === "SHOP") {
          while (client.view().me.ownedCards.length < client.view().me.handLimit) {
            expect(await client.send({ type: "BUY_CARD", cardId: client.view().me.shopCards[0].card.id })).toMatchObject({ type: "ACK" });
          }
          expect(await client.send({ type: "END_SHOP_PHASE" })).toMatchObject({ type: "ACK" });
        } else if (phase === "RUN_LOADOUT") {
          expect(await client.send({ type: "RUN_LOADOUT", cardIds: view.me.ownedCards.map((c) => c.id) })).toMatchObject({ type: "ACK" });
          expect(await client.send({ type: "LOCK_RUN_LOADOUT" })).toMatchObject({ type: "ACK" });
        } else if (phase === "AUGMENT") {
          expect(await client.send({ type: "SELECT_AUGMENT", augmentId: view.me.augmentChoices[0].id })).toMatchObject({ type: "ACK" });
        } else if (view.waitingOn.includes(view.me.playerId)) expect(await client.send({ type: "READY" })).toMatchObject({ type: "ACK" });
      }
    }
    const revision = Math.max(...clients.map((c) => c.view().revision));
    await Promise.all(clients.map((c) => c.wait((m) => m.type === "PLAYER_VIEW" && m.payload.revision >= revision)));
    expect(clients[0].view().phase).toBe("GAME_RESULT");
    for (const client of clients) expect(client.view().standings).toEqual(clients[0].view().standings);
    expect(clients[0].view().standings).toHaveLength(8);
    const status = await exports.default.fetch(`${origin}/api/rooms/${a.roomId}/session`, { method: "POST", headers: { Origin: origin, "X-Porena-Session": a.token } });
    expect(status.status).toBe(410);
    const reconnect = await exports.default.fetch(`${origin}/ws/rooms/${a.roomId}`, { headers: { Upgrade: "websocket", Origin: origin } });
    expect(reconnect.status).toBe(101);
    reconnect.webSocket?.accept();
    reconnect.webSocket?.close(1000, "test complete");
    const expiresAt = await runInDurableObject(env.GAME_ROOM.getByName(`room:${a.roomId}`), (_instance, state) => state.storage.get<number>("expiresAt"));
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

    for (const client of clients) expect(await client.send({ type: "REMATCH_READY" })).toMatchObject({ type: "ACK" });
    await Promise.all(clients.map((client) => client.wait((message) => message.type === "PLAYER_VIEW" && message.payload.phase === "SHOP" && message.payload.round === 1)));
    expect(clients.every((client) => client.view().players.filter((player) => player.human).every((player) => player.alive))).toBe(true);
    const rematchExpiry = await runInDurableObject(env.GAME_ROOM.getByName(`room:${a.roomId}`), (_instance, state) => state.storage.get<number>("expiresAt"));
    expect(rematchExpiry).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  }, 60_000);
  it("serializes concurrent rerolls, keeps locks, deduplicates lock retries and rejects a burst past the limit", async () => {
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
    const secondLock = clients[0].view().me.shopCards.find(({ card }) => card.id !== locked)!.card.id;
    const packet = JSON.stringify({ type: "LOCK_SHOP", cardId: secondLock, requestId, turnKey: clients[0].view().turnKey });
    clients[0].ws.send(packet); clients[0].ws.send(packet);
    await clients[0].wait((m) => m.type === "ACK" && m.requestId === requestId);
    const burst = await Promise.all(Array.from({ length: 3 }, () => clients[0].send({ type: "REROLL" })));
    expect(burst.every((r) => r.type === "ERROR")).toBe(true);
    const after = (await saved())!;
    expect(after.game.players[0].rerollsUsed).toBe(1);
    expect(after.game.players[0].stackBB).toBe(39);
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
