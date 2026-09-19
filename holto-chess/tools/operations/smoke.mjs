// Bounded protocol smoke test, not a capacity benchmark. Never prints tokens.
import WebSocket from "ws";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as pause } from "node:timers/promises";

const origin = process.env.PORENA_TEST_ORIGIN ?? "http://localhost:8787";
const rooms = Number(process.env.PORENA_TEST_ROOMS ?? 2);
const players = Number(process.env.PORENA_TEST_PLAYERS ?? 8);
if (!Number.isInteger(rooms) || rooms < 1 || rooms > 5 || !Number.isInteger(players) || players < 2 || players > 8) throw new Error("Limit: 1–5 rooms, 2–8 players each");
if (new URL(origin).hostname !== "localhost" && origin !== "http://127.0.0.1:8787" && !(origin === "https://porena.kr" && process.argv.includes("--production"))) throw new Error("Production requires explicit --production");
const sockets = new Set();
const latencies = [];
let actions = 0;
const started = performance.now();
async function session(roomId) {
  const response = await fetch(`${origin}/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 201, "Session creation failed");
  return response.json();
}
async function connect(credential) {
  const ws = new WebSocket(`${origin.replace(/^http/, "ws")}/ws/rooms/${credential.roomId}`, { origin, handshakeTimeout: 15000 });
  sockets.add(ws);
  const messages = [];
  let view;
  let failure;
  ws.on("error", (error) => { failure = error; });
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "PLAYER_VIEW") view = message.payload;
    else messages.push(message);
  });
  async function wait(predicate) {
    const deadline = performance.now() + 20000;
    while (!predicate()) {
      if (failure) throw failure;
      if (ws.readyState === WebSocket.CLOSED) throw new Error("Unexpected socket close");
      if (performance.now() > deadline) throw new Error(`Timeout at ${view?.phase ?? "connection"}`);
      await pause(10);
    }
  }
  await wait(() => ws.readyState === WebSocket.OPEN);
  ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token }));
  await wait(() => !!view);
  async function send(action) {
    await pause(120); // Avoid an artificial flood unlike normal human play.
    const requestId = randomUUID();
    const before = performance.now();
    ws.send(JSON.stringify({ ...action, requestId, turnKey: view.turnKey }));
    await wait(() => messages.some((m) => m.requestId === requestId));
    const reply = messages.find((m) => m.requestId === requestId);
    assert.equal(reply.type, "ACK", `Action ${action.type}: ${reply.message ?? "rejected"}`);
    await wait(() => view.revision >= reply.revision);
    latencies.push(performance.now() - before);
    actions++;
  }
  return { ws, wait, send, view: () => view };
}
async function play(roomNumber) {
  const credentials = [await session()];
  for (let i = 1; i < players; i++) credentials.push(await session(credentials[0].roomId));
  const clients = await Promise.all(credentials.map(connect));
  for (const c of clients) await c.send({ type: "READY" });
  for (let step = 0; step < 100; step++) {
    const revision = Math.max(...clients.map((c) => c.view().revision));
    await Promise.all(clients.map((c) => c.wait(() => c.view().revision >= revision)));
    if (clients[0].view().phase === "GAME_RESULT") break;
    const phase = clients[0].view().phase;
    // Parallel across rooms; sequential within a room matches existing game tests.
    for (const c of clients) {
      const v = c.view();
      if (!v.me.alive) continue;
      if (phase === "SHOP") {
        while (c.view().me.ownedCards.length < c.view().me.handLimit) {
          await c.send({ type: "BUY_CARD", cardId: c.view().me.shopCards[0].card.id });
        }
        if ([2, 3].includes(v.round)) await c.send({ type: "SELECT_CARDS", cardIds: c.view().me.ownedCards.slice(0, v.round === 2 ? 2 : 4).map((card) => card.id) });
        await c.send({ type: "END_SHOP_PHASE" });
      } else if (phase === "AUGMENT") await c.send({ type: "SELECT_AUGMENT", augmentId: v.me.augmentChoices[0].id });
      else await c.send({ type: "READY" });
    }
    if (step === 2) {
      const old = clients[0];
      clients[0] = await connect(credentials[0]);
      old.ws.close(1000);
      assert.equal(clients[0].view().me.playerId, credentials[0].playerId);
    }
  }
  const revision = Math.max(...clients.map((c) => c.view().revision));
  await Promise.all(clients.map((c) => c.wait(() => c.view().revision >= revision)));
  assert.equal(clients[0].view().phase, "GAME_RESULT");
  for (const c of clients) assert.deepEqual(c.view().standings, clients[0].view().standings);
  console.log(JSON.stringify({ room: roomNumber, players, result: "PASS", reconnect: true, finalStandingsAgree: true }));
}
try {
  const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200);
  await Promise.all(Array.from({ length: rooms }, (_, i) => play(i + 1)));
  latencies.sort((a, b) => a - b);
  console.log(JSON.stringify({ result: "PASS", origin, rooms, players: rooms * players, actions, elapsedSeconds: Math.round((performance.now() - started) / 1000), actionP50Ms: Math.round(latencies[Math.floor(latencies.length * .5)]), actionP95Ms: Math.round(latencies[Math.floor(latencies.length * .95)]), maxMs: Math.round(latencies.at(-1)) }));
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", error: error.message, actions }));
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.terminate();
}
