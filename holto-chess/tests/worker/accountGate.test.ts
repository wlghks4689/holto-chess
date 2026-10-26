import { env } from "cloudflare:workers";
import { createExecutionContext, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { base64url } from "jose";
import worker from "../../worker/index";
import type { RoomSnapshot } from "../../src/game/room";

// Production closes login, ranking and feedback reply emails (wrangler.jsonc ACCOUNTS_ENABLED="0", HOME-GATE-001). The suite runs with them
// open, so these tests call the Worker with the production value.
const origin = "https://porena.kr";
const closedEnv = { ...env, ACCOUNTS_ENABLED: "0" } as unknown as Env;
const sha = async (value: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const call = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", origin);
  headers.set("CF-Connecting-IP", crypto.randomUUID());
  return worker.fetch(new Request(`${origin}${path}`, { ...init, headers }), closedEnv, createExecutionContext());
};
/** A visitor who signed in before the closure and still carries the session cookie. */
async function signedInBefore() {
  const id = crypto.randomUUID(), token = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.ACCOUNT_DB.batch([
    env.ACCOUNT_DB.prepare("INSERT INTO users (id, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?)").bind(id, "예전계정", Date.now(), Date.now()),
    env.ACCOUNT_DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha(token), id, Date.now(), Date.now() + 3600_000),
  ]);
  return `__Host-porena_session=${token}`;
}

describe("login and ranking closed (HOME-GATE-001)", () => {
  it("answers every visitor as not signed in and closes the login, profile and ranking APIs", async () => {
    const cookie = await signedInBefore();
    const me = await call("/api/auth/me", { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ authenticated: false });
    expect(me.headers.get("Cache-Control")).toBe("no-store");
    for (const [path, method] of [["/api/auth/google/start", "GET"], ["/api/auth/logout", "POST"], ["/api/profile", "PATCH"], ["/api/rankings", "GET"], ["/api/rankings/me", "GET"]] as const) {
      expect((await call(path, { method, headers: { Cookie: cookie } })).status, `${method} ${path}`).toBe(404);
    }
  });

  it("seats a visitor with a leftover sign-in cookie as a guest instead of refusing them", async () => {
    const cookie = await signedInBefore();
    const created = await call("/api/rooms", { method: "POST", headers: { Cookie: cookie, "X-Porena-Identity": "guest" } });
    expect(created.status).toBe(201);
    const { roomId } = await created.json() as { roomId: string };
    const joined = await call(`/api/rooms/${roomId}/join`, { method: "POST", headers: { Cookie: cookie, "X-Porena-Identity": "guest" } });
    expect(joined.status).toBe(201);
    const snapshot = await runInDurableObject(env.GAME_ROOM.getByName(`room:${roomId}`), (_instance, state) => state.storage.get<RoomSnapshot>("snapshot:v1"));
    expect(snapshot!.sessions.every(session => session.accountUserId === undefined)).toBe(true);
  });

  it("refuses a feedback reply email instead of storing it, and still takes the message alone", async () => {
    const message = `closed-email-${crypto.randomUUID()}`;
    const post = (body: object) => call("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "feedback", message, ...body }) });
    const withEmail = await post({ contactEmail: "player@example.com", consent: true });
    expect(withEmail.status).toBe(400);
    expect(await withEmail.json()).toEqual({ error: "email" });
    expect((await post({})).status).toBe(201);
    const rows = await env.FEEDBACK_DB.prepare("SELECT contact_email FROM feedback WHERE message = ?").bind(message).all<{ contact_email: string | null }>();
    expect(rows.results).toEqual([{ contact_email: null }]);
  });

  it("keeps the account-only server solo closed", async () => {
    const cookie = await signedInBefore();
    const solo = await call("/api/rooms", { method: "POST", headers: { Cookie: cookie, "X-Porena-Identity": "account", "X-Porena-Mode": "solo" } });
    expect(solo.status).toBe(401);
    expect(await solo.json()).toEqual({ error: "ACCOUNT_REQUIRED" });
  });
});
