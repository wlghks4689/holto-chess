import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerMessage, SessionCredential } from "../../src/shared/protocol";
import { discordActivityOrigins, isAllowedOrigin } from "../../worker/origin";

// vitest.workers.config.ts configures this application id; production leaves the list empty.
const game = "https://porena.test";
const activity = "https://123456789012345678.discordsays.com";
const otherActivity = "https://876543210987654321.discordsays.com";
const sockets: WebSocket[] = [];
let visitor = 0;
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(1000); });
const post = (path: string, origin: string) => exports.default.fetch(`${game}${path}`, { method: "POST", headers: { Origin: origin, "CF-Connecting-IP": `192.0.2.${200 + (++visitor % 50)}` } });

describe("Discord Activity origin allowlist", () => {
  it("parses only well-formed application ids", () => {
    expect(discordActivityOrigins(undefined)).toEqual([]);
    expect(discordActivityOrigins("")).toEqual([]);
    expect(discordActivityOrigins(" 123456789012345678 , not-an-id,12,876543210987654321")).toEqual([activity, otherActivity]);
    expect(discordActivityOrigins("*")).toEqual([]);
  });

  it("matches exact origins only", () => {
    const ids = "123456789012345678";
    expect(isAllowedOrigin(game, game, "")).toBe(true);
    expect(isAllowedOrigin(game, game, ids)).toBe(true);
    expect(isAllowedOrigin(activity, game, ids)).toBe(true);
    expect(isAllowedOrigin(activity, game, "")).toBe(false);
    for (const origin of [
      otherActivity,
      "http://123456789012345678.discordsays.com",
      "https://123456789012345678.discordsays.com.evil.test",
      "https://evil.123456789012345678.discordsays.com",
      "https://123456789012345678.discordsays.com:8443",
      `${activity}/`,
      "https://discordsays.com",
      "https://discord.com",
      "null",
    ]) expect(isAllowedOrigin(origin, game, ids), origin).toBe(false);
    expect(isAllowedOrigin(null, game, ids)).toBe(false);
  });

  it("creates and joins rooms from the configured Activity origin and rejects other applications", async () => {
    const created = await post("/api/rooms", activity);
    expect(created.status).toBe(201);
    const host = await created.json() as SessionCredential;
    expect((await post(`/api/rooms/${host.roomId}/join`, otherActivity)).status).toBe(403);
    expect((await post("/api/rooms", otherActivity)).status).toBe(403);
    const joined = await post(`/api/rooms/${host.roomId}/join`, activity);
    expect(joined.status).toBe(201);
    // A web player and a Discord player share the same room.
    expect((await post(`/api/rooms/${host.roomId}/join`, game)).status).toBe(201);
    const check = await exports.default.fetch(`${game}/api/rooms/${host.roomId}/session`, { method: "POST", headers: { Origin: activity, "X-Porena-Session": host.token } });
    expect(check.status).toBe(204);
  });

  it("opens the room WebSocket from the Activity origin only", async () => {
    const host = await (await post("/api/rooms", activity)).json() as SessionCredential;
    const rejected = await exports.default.fetch(`${game}/ws/rooms/${host.roomId}`, { headers: { Upgrade: "websocket", Origin: otherActivity } });
    expect(rejected.status).toBe(403);
    const res = await exports.default.fetch(`${game}/ws/rooms/${host.roomId}`, { headers: { Upgrade: "websocket", Origin: activity } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!; ws.accept(); sockets.push(ws);
    const joined = new Promise<ServerMessage>((resolve) => ws.addEventListener("message", (e) => { const m = JSON.parse(e.data as string) as ServerMessage; if (m.type === "ROOM_JOINED") resolve(m); }));
    ws.send(JSON.stringify({ type: "JOIN_ROOM", token: host.token }));
    expect(await joined).toMatchObject({ type: "ROOM_JOINED", roomId: host.roomId, playerId: host.playerId });
  });

  it("applies the same gate to feedback", async () => {
    const rejected = await exports.default.fetch(`${game}/api/feedback`, { method: "POST", headers: { Origin: otherActivity, "Content-Type": "application/json" }, body: "{}" });
    expect(rejected.status).toBe(403);
  });
});
