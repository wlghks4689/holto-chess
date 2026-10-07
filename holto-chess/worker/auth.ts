import { base64url, createRemoteJWKSet, jwtVerify } from "jose";
import { sameText } from "./adminAuth";

export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
type AccountUser = { id: string; displayName: string | null };
type Flow = { nonce: string; pkce_verifier: string; redirect_uri: string; expires_at: number };
const randomToken = () => base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (text: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));

function cookieName(url: URL, kind: "session" | "oauth"): string {
  return `${url.protocol === "https:" ? "__Host-" : ""}porena_${kind}`;
}
function cookie(url: URL, kind: "session" | "oauth", value: string, ttl: number): string {
  return `${cookieName(url, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttl / 1000)}${url.protocol === "https:" ? "; Secure" : ""}`;
}
function readCookie(request: Request, kind: "session" | "oauth"): string | null {
  const name = cookieName(new URL(request.url), kind);
  const values = (request.headers.get("Cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function response(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Vary", "Cookie");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return body === null ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}
function configuredOrigin(env: Env): string {
  const url = new URL(env.AUTH_ORIGIN);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.origin !== env.AUTH_ORIGIN || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error("Invalid auth origin");
  return url.origin;
}

/** Account identity only. Existing guest room credentials are intentionally independent. */
export async function readPorenaSession(request: Request, env: Env): Promise<AccountUser | null> {
  const token = readCookie(request, "session");
  if (!token) return null;
  return env.ACCOUNT_DB.prepare(`SELECT u.id, u.display_name AS displayName FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
    .bind(await digest(token), Date.now()).first<AccountUser>();
}

async function start(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return response({ error: "Login unavailable" }, 503);
  const state = randomToken(), browser = randomToken(), nonce = randomToken(), verifier = randomToken();
  const redirect = `${configuredOrigin(env)}/api/auth/google/callback`;
  const now = Date.now();
  const oldBrowser = readCookie(request, "oauth");
  await env.ACCOUNT_DB.batch([
    env.ACCOUNT_DB.prepare("DELETE FROM oauth_flows WHERE browser_hash = ? OR expires_at <= ?").bind(oldBrowser ? await digest(oldBrowser) : "", now),
    env.ACCOUNT_DB.prepare(`INSERT INTO oauth_flows (state_hash, provider, browser_hash, nonce, pkce_verifier, redirect_uri, created_at, expires_at)
      VALUES (?, 'google', ?, ?, ?, ?, ?, ?)`)
      .bind(await digest(state), await digest(browser), nonce, verifier, redirect, now, now + OAUTH_FLOW_TTL_MS),
  ]);
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: "openid profile", state, nonce, code_challenge: await digest(verifier), code_challenge_method: "S256" }).toString();
  return response(null, 302, { Location: target.toString(), "Set-Cookie": cookie(url, "oauth", browser, OAUTH_FLOW_TTL_MS) });
}

async function callback(request: Request, env: Env, url: URL): Promise<Response> {
  const headers = new Headers({ "Set-Cookie": cookie(url, "oauth", "", 0) });
  try {
    const state = url.searchParams.get("state");
    const browser = readCookie(request, "oauth");
    if (!browser || !state || !/^[A-Za-z0-9_-]{43}$/.test(state) || url.searchParams.getAll("state").length !== 1) throw new Error("Invalid flow");
    // DELETE RETURNING is the one-use gate, including failed exchanges. A stolen state alone cannot consume it.
    const flow = await env.ACCOUNT_DB.prepare(`DELETE FROM oauth_flows WHERE state_hash = ? AND browser_hash = ? AND provider = 'google'
      RETURNING nonce, pkce_verifier, redirect_uri, expires_at`).bind(await digest(state), await digest(browser)).first<Flow>();
    if (!flow || flow.expires_at <= Date.now() || flow.redirect_uri !== `${configuredOrigin(env)}/api/auth/google/callback`) throw new Error("Invalid flow");
    const code = url.searchParams.get("code");
    if (url.searchParams.has("error") || !code || code.length > 2048 || url.searchParams.getAll("code").length !== 1) throw new Error("Invalid code");
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        code, redirect_uri: flow.redirect_uri, code_verifier: flow.pkce_verifier }),
    });
    if (!exchange.ok) throw new Error("Exchange failed");
    const tokens: unknown = await exchange.json();
    if (!tokens || typeof tokens !== "object" || !("id_token" in tokens) || typeof tokens.id_token !== "string") throw new Error("Missing ID token");
    const { payload } = await jwtVerify(tokens.id_token, googleKeys, {
      algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"], audience: env.GOOGLE_CLIENT_ID,
      requiredClaims: ["iss", "aud", "exp", "iat", "sub", "nonce"],
    });
    if (typeof payload.nonce !== "string" || !sameText(payload.nonce, flow.nonce) || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
        (payload.azp !== undefined && payload.azp !== env.GOOGLE_CLIENT_ID) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== env.GOOGLE_CLIENT_ID)) throw new Error("Invalid claims");
    const now = Date.now(), id = crypto.randomUUID(), token = randomToken();
    const oldToken = readCookie(request, "session");
    // D1 batches are serialized transactions: check + both inserts cannot interleave with another first login.
    // In particular, do not INSERT a user unconditionally then ignore a conflicting provider mapping.
    const results = await env.ACCOUNT_DB.batch([
      env.ACCOUNT_DB.prepare(`INSERT INTO users (id, created_at, last_login_at) SELECT ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM oauth_accounts WHERE provider = 'google' AND provider_subject = ?)`)
        .bind(id, now, now, payload.sub),
      env.ACCOUNT_DB.prepare(`INSERT INTO oauth_accounts (provider, provider_subject, user_id, created_at)
        SELECT 'google', ?, id, ? FROM users WHERE id = ?`).bind(payload.sub, now, id),
      env.ACCOUNT_DB.prepare(`UPDATE users SET last_login_at = ? WHERE status = 'active' AND id =
        (SELECT user_id FROM oauth_accounts WHERE provider = 'google' AND provider_subject = ?)`)
        .bind(now, payload.sub),
      env.ACCOUNT_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(oldToken ? await digest(oldToken) : ""),
      env.ACCOUNT_DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
        SELECT ?, u.id, ?, ? FROM users u JOIN oauth_accounts o ON o.user_id = u.id
        WHERE o.provider = 'google' AND o.provider_subject = ? AND u.status = 'active' RETURNING user_id`)
        .bind(await digest(token), now, now + AUTH_SESSION_TTL_MS, payload.sub),
    ]);
    if (results[4].results.length !== 1) throw new Error("Inactive account");
    headers.append("Set-Cookie", cookie(url, "session", token, AUTH_SESSION_TTL_MS));
    headers.set("Location", "/");
  } catch {
    // Never log exceptions from token exchange/JWT verification or reflect Google's error description.
    headers.set("Location", "/?auth=failed");
  }
  return response(null, 302, headers);
}

export async function handleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    if (url.origin !== configuredOrigin(env)) return response({ error: "Origin rejected" }, 403);
    const isCallback = url.pathname === "/api/auth/google/callback" && request.method === "GET";
    // Callback is a cross-site top-level redirect, authenticated by its browser-bound one-use state.
    // Everything else is first-party only; logout additionally requires an explicit Origin (CSRF).
    const origin = request.headers.get("Origin");
    if (!isCallback && ((origin && origin !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site" ||
        (request.method !== "GET" && origin !== url.origin))) return response({ error: "Origin rejected" }, 403);
    if (request.method === "GET" && (isCallback || url.pathname === "/api/auth/google/start")) {
      const { success } = await env.AUTH_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
      if (!success) return response({ error: "Try again later" }, 429, { "Retry-After": "60" });
      return isCallback ? await callback(request, env, url) : await start(request, env, url);
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await readPorenaSession(request, env);
      return response(user ? { authenticated: true, user } : { authenticated: false });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = readCookie(request, "session");
      if (token) await env.ACCOUNT_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
      return response({ authenticated: false }, 200, { "Set-Cookie": cookie(url, "session", "", 0) });
    }
    return response({ error: "Not found" }, 404);
  } catch {
    return response({ error: "Login unavailable" }, 503);
  }
}

export async function purgeExpiredAuth(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM oauth_flows WHERE expires_at <= ?").bind(now),
  ]);
}
