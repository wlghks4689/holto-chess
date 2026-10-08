import { env, exports } from "cloudflare:workers";
import { createExecutionContext, createScheduledController } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { base64url, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import worker from "../../worker/index";
import { AUTH_SESSION_TTL_MS, OAUTH_FLOW_TTL_MS, handleAuth, readPorenaSession } from "../../worker/auth";

const origin = "https://porena.kr";
const sha = async (value: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const count = (table: string) => env.ACCOUNT_DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<number>("n");
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let claims: JWTPayload = {};
let badSignature = false;
let exchangeFailure = false;
let exchangeRedirect = false;
let malformedToken = false;
const exchanges = new Map<string, { nonce: string; verifier: string }>();
let fetchSpy: ReturnType<typeof vi.spyOn>;

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", crypto.randomUUID());
  return new Request(`${origin}${path}`, { redirect: "manual", ...init, headers });
}
const call = (path: string, init?: RequestInit) => exports.default.fetch(request(path, init));
function sessionCookie(response: Response): string {
  return response.headers.getSetCookie().find((c) => c.startsWith("__Host-porena_session="))!.split(";")[0];
}
async function begin() {
  const response = await call("/api/auth/google/start?redirect_uri=https://evil.example/&returnTo=https://evil.example/");
  expect(response.status).toBe(302);
  const target = new URL(response.headers.get("Location")!);
  const state = target.searchParams.get("state")!;
  const row = await env.ACCOUNT_DB.prepare("SELECT pkce_verifier FROM oauth_flows WHERE state_hash = ?").bind(await sha(state)).first<{ pkce_verifier: string }>();
  const code = crypto.randomUUID();
  exchanges.set(code, { nonce: target.searchParams.get("nonce")!, verifier: row!.pkce_verifier });
  return { response, target, state, code, cookie: response.headers.getSetCookie()[0].split(";")[0] };
}
type Started = Awaited<ReturnType<typeof begin>>;
const finish = (flow: Started, cookie = flow.cookie, query = `state=${flow.state}&code=${flow.code}`) => call(`/api/auth/google/callback?${query}`, {
  headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
});

beforeAll(async () => {
  keys = await generateKeyPair("RS256", { extractable: true });
  otherKeys = await generateKeyPair("RS256", { extractable: true });
});
beforeEach(async () => {
  await env.ACCOUNT_DB.batch([env.ACCOUNT_DB.prepare("DELETE FROM users"), env.ACCOUNT_DB.prepare("DELETE FROM oauth_flows")]);
  claims = {}; badSignature = false; exchangeFailure = false; exchangeRedirect = false; malformedToken = false; exchanges.clear();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [{ ...await exportJWK(keys.publicKey), kid: "test-key", alg: "RS256", use: "sig" }] });
    if (url !== "https://oauth2.googleapis.com/token") throw new Error("Unexpected external request");
    // Match workerd's unsupported redirect mode even though fetch is mocked.
    if (init?.redirect === "error") throw new TypeError("Unsupported redirect mode");
    expect(init?.redirect).toBe("manual");
    if (exchangeRedirect) return new Response(null, { status: 302, headers: { Location: "https://evil.example/" } });
    if (exchangeFailure) return Response.json({ error: "private-google-error" }, { status: 400 });
    const body = new URLSearchParams(String(init?.body));
    const flow = exchanges.get(body.get("code")!);
    expect(flow).toBeDefined();
    expect(body.get("client_id")).toBe("test-google-client");
    expect(body.get("client_secret")).toBe("test-google-secret");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe(`${origin}/api/auth/google/callback`);
    expect(body.get("code_verifier")).toBe(flow!.verifier);
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: "https://accounts.google.com", aud: "test-google-client", sub: "google-subject-123", iat: now, exp: now + 3600, nonce: flow!.nonce, ...claims };
    const token = malformedToken ? "not-a-jwt" : await new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(badSignature ? otherKeys.privateKey : keys.privateKey);
    return Response.json({ id_token: token, access_token: "must-not-be-stored", refresh_token: "must-not-be-stored" });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("account schema and constraints", () => {
  it("applies a separate migration, enforces provider uniqueness/FK and cascades sessions", async () => {
    expect(await env.ACCOUNT_DB.prepare("SELECT name FROM d1_migrations").first<string>("name")).toBe("0001_accounts.sql");
    await env.ACCOUNT_DB.prepare("INSERT INTO users (id, created_at, last_login_at) VALUES ('u', 1, 1)").run();
    const insert = (sub: string, user: string) => env.ACCOUNT_DB.prepare("INSERT INTO oauth_accounts VALUES ('google', ?, ?, 1)").bind(sub, user).run();
    await insert("s", "u");
    await expect(insert("s", "u")).rejects.toThrow();
    await expect(insert("missing", "not-a-user")).rejects.toThrow();
    await expect(env.ACCOUNT_DB.prepare("INSERT INTO sessions VALUES ('hash', 'missing', 1, 2)").run()).rejects.toThrow();
    await env.ACCOUNT_DB.prepare("INSERT INTO sessions VALUES ('hash', 'u', 1, 2)").run();
    await env.ACCOUNT_DB.prepare("DELETE FROM users WHERE id = 'u'").run();
    expect(await count("oauth_accounts")).toBe(0);
    expect(await count("sessions")).toBe(0);
    expect(await env.ACCOUNT_DB.prepare("SELECT name FROM sqlite_master WHERE name = 'feedback'").first()).toBeNull();
  });
});

describe("Google OIDC", () => {
  it("rejects a token endpoint redirect without creating an account or following it", async () => {
    const flow = await begin();
    exchangeRedirect = true;
    expect((await finish(flow)).headers.get("Location")).toBe("/?auth=failed");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await count("users")).toBe(0);
    expect(await count("sessions")).toBe(0);
    expect(await count("oauth_flows")).toBe(0);
  });
  it("starts with fixed redirect, minimum scope, random browser-bound state, nonce and S256", async () => {
    const flow = await begin();
    expect(flow.target.origin).toBe("https://accounts.google.com");
    expect(flow.target.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/google/callback`);
    expect(flow.target.searchParams.get("scope")).toBe("openid profile");
    expect(flow.target.searchParams.get("client_id")).toBe("test-google-client");
    expect(flow.target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(flow.target.searchParams.get("code_challenge")).toBe(await sha(exchanges.get(flow.code)!.verifier));
    const row = await env.ACCOUNT_DB.prepare("SELECT * FROM oauth_flows").first<{ state_hash: string; browser_hash: string; created_at: number; expires_at: number }>();
    expect(row!.state_hash).not.toBe(flow.state);
    expect(row!.browser_hash).toBe(await sha(flow.cookie.split("=")[1]));
    expect(row!.expires_at - row!.created_at).toBe(OAUTH_FLOW_TTL_MS);
    expect(flow.response.headers.get("Cache-Control")).toBe("no-store");
    expect(flow.response.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Lax; Max-Age=600; Secure");
    expect((await begin()).state).not.toBe(flow.state);
  });
  it.each(["wrong-state", "missing-cookie", "wrong-cookie", "expired", "duplicate-state", "wrong-redirect", "denied"])("rejects %s before contacting Google", async (scenario) => {
    const flow = await begin();
    if (scenario === "expired") await env.ACCOUNT_DB.prepare("UPDATE oauth_flows SET expires_at = 0").run();
    if (scenario === "wrong-redirect") await env.ACCOUNT_DB.prepare("UPDATE oauth_flows SET redirect_uri = 'https://evil.example/callback'").run();
    const cookie = scenario === "missing-cookie" ? "" : scenario === "wrong-cookie" ? `__Host-porena_oauth=${"x".repeat(43)}` : flow.cookie;
    const query = scenario === "denied" ? `state=${flow.state}&error=access_denied&error_description=private-error` :
      `state=${scenario === "wrong-state" ? "x".repeat(43) : flow.state}&code=${flow.code}${scenario === "duplicate-state" ? `&state=${flow.state}` : ""}`;
    const result = await finish(flow, cookie, query);
    expect(result.headers.get("Location")).toBe("/?auth=failed");
    expect(await result.text()).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await count("users")).toBe(0);
    if (["expired", "wrong-redirect", "denied"].includes(scenario)) expect(await count("oauth_flows")).toBe(0);
  });
  it.each(["exchange", "malformed", "signature", "issuer", "audience", "nonce", "expiration", "missing-sub", "missing-exp", "missing-nonce", "missing-iat", "azp", "multiple-audiences"])("rejects %s and consumes the flow", async (scenario) => {
    const flow = await begin();
    exchangeFailure = scenario === "exchange"; malformedToken = scenario === "malformed"; badSignature = scenario === "signature";
    if (scenario === "issuer") claims.iss = "https://evil.example";
    if (scenario === "audience") claims.aud = "other-client";
    if (scenario === "nonce") claims.nonce = "other-nonce";
    if (scenario === "expiration") claims.exp = 1;
    if (scenario === "missing-sub") claims.sub = undefined;
    if (scenario === "missing-exp") claims.exp = undefined;
    if (scenario === "missing-nonce") claims.nonce = undefined;
    if (scenario === "missing-iat") claims.iat = undefined;
    if (scenario === "azp") claims.azp = "other-client";
    if (scenario === "multiple-audiences") claims.aud = ["test-google-client", "other-client"];
    const result = await finish(flow);
    expect(result.headers.get("Location")).toBe("/?auth=failed");
    expect(await count("users")).toBe(0);
    expect(await count("sessions")).toBe(0);
    expect(await count("oauth_flows")).toBe(0);
    const before = fetchSpy.mock.calls.length;
    expect((await finish(flow)).headers.get("Location")).toBe("/?auth=failed");
    expect(fetchSpy.mock.calls.length).toBe(before);
  });
  it("creates a UUID account and hashed session; repeats login without duplicating the user", async () => {
    claims.email = "not-stored@example.com";
    claims.name = "Not stored";
    const flow = await begin();
    const result = await finish(flow);
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/");
    const cookie = sessionCookie(result);
    const token = cookie.split("=")[1];
    const user = await env.ACCOUNT_DB.prepare("SELECT * FROM users").first<{ id: string; display_name: null; status: string; last_login_at: number }>();
    expect(user!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user!.id).not.toBe("google-subject-123");
    expect(user!.display_name).toBeNull();
    expect(user!.status).toBe("active");
    expect(Object.keys(user!).sort()).toEqual(["created_at", "display_name", "id", "last_login_at", "status"]);
    const session = await env.ACCOUNT_DB.prepare("SELECT * FROM sessions").first<{ token_hash: string; created_at: number; expires_at: number }>();
    expect(session!.token_hash).toBe(await sha(token));
    expect(session!.token_hash).not.toBe(token);
    expect(session!.expires_at - session!.created_at).toBe(AUTH_SESSION_TTL_MS);
    expect(result.headers.getSetCookie().join(";")).toContain("Max-Age=2592000; Secure");
    expect(result.headers.getSetCookie().find((c) => c.startsWith("__Host-porena_session="))).toContain("Path=/; HttpOnly; SameSite=Lax;");
    expect(await (await call("/api/auth/me", { headers: { Cookie: cookie } })).json()).toEqual({ authenticated: true, user: { id: user!.id, displayName: null } });
    const profile = await call("/api/profile", { method: "PATCH", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "포레나" }) });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toEqual({ user: { id: user!.id, displayName: "포레나" } });
    expect((await finish(flow)).headers.get("Location")).toBe("/?auth=failed");
    await env.ACCOUNT_DB.prepare("UPDATE users SET last_login_at = 1").run();
    const again = await begin();
    const relogin = await finish(again, `${again.cookie}; ${cookie}`);
    expect(relogin.headers.get("Location")).toBe("/");
    expect(await count("users")).toBe(1);
    expect(await count("oauth_accounts")).toBe(1);
    expect(await count("sessions")).toBe(1);
    expect(await env.ACCOUNT_DB.prepare("SELECT last_login_at FROM users").first<number>("last_login_at")).toBeGreaterThan(1);
    expect(await (await call("/api/auth/me", { headers: { Cookie: sessionCookie(relogin) } })).json()).toEqual({ authenticated: true, user: { id: user!.id, displayName: "포레나" } });
    expect(await readPorenaSession(request("/", { headers: { Cookie: cookie } }), env)).toBeNull();
    expect(JSON.stringify(await env.ACCOUNT_DB.prepare("SELECT * FROM oauth_accounts").all())).not.toContain("must-not-be-stored");
  });
  it("serializes concurrent first logins without orphan or duplicate users", async () => {
    const [one, two] = await Promise.all([begin(), begin()]);
    const results = await Promise.all([finish(one), finish(two)]);
    expect(results.map((r) => r.headers.get("Location"))).toEqual(["/", "/"]);
    expect(await count("users")).toBe(1);
    expect(await count("oauth_accounts")).toBe(1);
    expect(await count("sessions")).toBe(2);
  });
  it("allows only one callback to consume a state, even concurrently", async () => {
    const flow = await begin();
    const results = await Promise.all([finish(flow), finish(flow)]);
    expect(results.map((r) => r.headers.get("Location")).sort()).toEqual(["/", "/?auth=failed"]);
    expect(await count("sessions")).toBe(1);
  });
});

describe("first-party session and boundaries", () => {
  it("returns anonymous for absent/malformed cookies, expiry and inactive accounts", async () => {
    for (const cookie of ["", "__Host-porena_session=invalid"]) {
      expect(await (await call("/api/auth/me", { headers: { Cookie: cookie } })).json()).toEqual({ authenticated: false });
    }
    const result = await finish(await begin());
    const cookie = sessionCookie(result);
    await env.ACCOUNT_DB.prepare("UPDATE users SET status = 'disabled'").run();
    expect(await readPorenaSession(request("/", { headers: { Cookie: cookie } }), env)).toBeNull();
    expect((await finish(await begin())).headers.get("Location")).toBe("/?auth=failed");
    expect(await count("sessions")).toBe(1);
    await env.ACCOUNT_DB.prepare("UPDATE users SET status = 'active'").run();
    await env.ACCOUNT_DB.prepare("UPDATE sessions SET expires_at = ?").bind(Date.now()).run();
    expect(await (await call("/api/auth/me", { headers: { Cookie: cookie } })).json()).toEqual({ authenticated: false });
  });
  it("logout requires same Origin, deletes the session and remains idempotent", async () => {
    const cookie = sessionCookie(await finish(await begin()));
    for (const rejectedOrigin of ["", "https://evil.example", "https://123456789012345678.discordsays.com"]) {
      expect((await call("/api/auth/logout", { method: "POST", headers: { Cookie: cookie, Origin: rejectedOrigin } })).status).toBe(403);
    }
    expect(await count("sessions")).toBe(1);
    for (let i = 0; i < 2; i++) {
      const response = await call("/api/auth/logout", { method: "POST", headers: { Cookie: cookie, Origin: origin } });
      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0; Secure");
    }
    expect(await count("sessions")).toBe(0);
    expect(await (await call("/api/auth/me", { headers: { Cookie: cookie } })).json()).toEqual({ authenticated: false });
  });
  it("uses plain HttpOnly cookies on configured localhost HTTP only; rejects other hosts/origins/methods", async () => {
    const local = new URL("http://localhost:5173/api/auth/google/start");
    const localEnv = { ...env, AUTH_ORIGIN: local.origin } as Env;
    const response = await handleAuth(new Request(local), localEnv, local);
    expect(response.status).toBe(302);
    expect(response.headers.get("Set-Cookie")).toMatch(/^porena_oauth=/);
    expect(response.headers.get("Set-Cookie")).not.toContain("Secure");
    expect(new URL(response.headers.get("Location")!).searchParams.get("redirect_uri")).toBe("http://localhost:5173/api/auth/google/callback");
    expect((await call("/api/auth/google/start", { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await call("/api/auth/me", { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await call("/api/auth/logout")).status).toBe(404);
    expect((await exports.default.fetch("https://unexpected.example/api/auth/me")).status).toBe(403);
    expect((await exports.default.fetch("https://admin.porena.kr/api/auth/me")).status).toBe(404);
    const www = await exports.default.fetch("https://www.porena.kr/api/auth/google/start", { redirect: "manual" });
    expect(www.status).toBe(301);
    expect(www.headers.get("Location")).toBe(`${origin}/api/auth/google/start`);
  });
  it("fails closed without Google credentials, while guest session checks still work", async () => {
    const url = new URL(`${origin}/api/auth/google/start`);
    expect((await handleAuth(request(url.pathname), { ...env, GOOGLE_CLIENT_SECRET: "" }, url)).status).toBe(503);
    expect(await count("oauth_flows")).toBe(0);
    expect(await (await call("/api/auth/me")).json()).toEqual({ authenticated: false });
  });
  it("rate-limits login attempts without spending the guest room budget", async () => {
    const ip = crypto.randomUUID();
    let result: Response | undefined;
    for (let i = 0; i < 11; i++) {
      result = await exports.default.fetch(new Request(`${origin}/api/auth/google/start`, { redirect: "manual", headers: { "CF-Connecting-IP": ip } }));
    }
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Retry-After")).toBe("60");
    expect((await env.ROOM_CREATE_LIMITER.limit({ key: ip })).success).toBe(true);
  });
  it("daily cleanup removes expired flows/sessions but keeps account identity and valid rows", async () => {
    await finish(await begin());
    await begin();
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ scheduledTime: Date.now() }), env, ctx);
    expect(await count("sessions")).toBe(1);
    expect(await count("oauth_flows")).toBe(1);
    await env.ACCOUNT_DB.batch([env.ACCOUNT_DB.prepare("UPDATE sessions SET expires_at = 0"), env.ACCOUNT_DB.prepare("UPDATE oauth_flows SET expires_at = 0")]);
    await worker.scheduled!(createScheduledController({ scheduledTime: Date.now() }), env, ctx);
    expect(await count("sessions")).toBe(0);
    expect(await count("oauth_flows")).toBe(0);
    expect(await count("users")).toBe(1);
  });
});
