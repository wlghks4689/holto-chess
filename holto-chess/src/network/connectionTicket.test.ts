import { expect, it, vi } from "vitest";
import { connectionProtocols } from "./connectionTicket";
import { roomSocketUrl } from "./endpoints";

it("transports long-lived proof only in POST, with an ephemeral protocol and credential-free URL", async () => {
  const session = { roomId: "ABCDEF", playerId: "p1", token: "a".repeat(64) };
  const request = vi.fn(async () => Response.json({ ticket: "b".repeat(64), expiresAt: Date.now() + 30000 }));
  expect(await connectionProtocols(session, request)).toEqual(["porena-v1", `porena-ticket-${"b".repeat(64)}`]);
  expect(request).toHaveBeenCalledWith("/api/rooms/ABCDEF/connection-ticket", { method: "POST", headers: { "X-Porena-Session": session.token }, cache: "no-store" });
  expect(roomSocketUrl(session.roomId, { protocol: "https:", host: "porena.kr" })).toBe("wss://porena.kr/ws/rooms/ABCDEF");
});

it("does not fall back to unauthenticated upgrade on a missing or malformed proof", async () => {
  const session = { roomId: "ABCDEF", playerId: "p1", token: "a".repeat(64) };
  await expect(connectionProtocols(session, async () => new Response(null, { status: 401 }))).rejects.toThrow("unavailable");
  await expect(connectionProtocols(session, async () => Response.json({ ticket: "bad" }))).rejects.toThrow("Invalid");
});

it.each([401, 404, 410, 429, 503])("preserves HTTP %i for connection recovery", async status => {
  const session = { roomId: "ABCDEF", playerId: "p1", token: "a".repeat(64) };
  await expect(connectionProtocols(session, async () => new Response(null, { status }))).rejects.toMatchObject({ cause: status });
});
