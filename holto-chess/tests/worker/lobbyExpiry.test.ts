import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionCredential } from "../../src/shared/protocol";

const origin = "https://porena.test";
const MINUTE = 60_000;
const sockets: WebSocket[] = [];
let visitor = 0;
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });

async function session(roomId?: string): Promise<SessionCredential> {
  const res = await exports.default.fetch(`${origin}/api/rooms${roomId ? `/${roomId}/join` : ""}`, { method: "POST", headers: { Origin: origin, "CF-Connecting-IP": `192.0.2.${100 + ++visitor}` } });
  expect(res.status).toBe(201); return res.json();
}
const expiresIn = (roomId: string) => runInDurableObject(env.GAME_ROOM.getByName(`room:${roomId}`), async (_instance, state) => (await state.storage.get<number>("expiresAt"))! - Date.now());

async function ready(s: SessionCredential) {
  const res = await exports.default.fetch(`${origin}/ws/rooms/${s.roomId}`, { headers: { Upgrade: "websocket", Origin: origin } });
  const ws = res.webSocket!; ws.accept(); sockets.push(ws);
  const views: { turnKey: string; status: string }[] = [];
  const next = () => new Promise<void>((resolve) => ws.addEventListener("message", () => resolve(), { once: true }));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data as string); if (m.type === "PLAYER_VIEW") views.push(m.payload); });
  ws.send(JSON.stringify({ type: "JOIN_ROOM", token: s.token }));
  while (!views.length) await next();
  ws.send(JSON.stringify({ type: "READY", requestId: crypto.randomUUID(), turnKey: views.at(-1)!.turnKey }));
  await next();
}

describe("room lifetime", () => {
  it("closes an idle lobby after 30 minutes, restarts the clock on activity and gives a started game 24 hours", async () => {
    const host = await session();
    const created = await expiresIn(host.roomId);
    expect(created).toBeGreaterThan(29 * MINUTE);
    expect(created).toBeLessThanOrEqual(30 * MINUTE);

    const guest = await session(host.roomId);
    expect(await expiresIn(host.roomId)).toBeGreaterThan(29 * MINUTE);

    await ready(host);
    await ready(guest);
    const started = await expiresIn(host.roomId);
    expect(started).toBeGreaterThan(23 * 60 * MINUTE);
  });
});
