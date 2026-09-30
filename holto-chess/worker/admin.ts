import { isFeedbackCategory, isFeedbackStatus, type FeedbackItem } from "../src/shared/feedback";
import { ADMIN_SESSION_TTL_MS, readAdminSession, sameText, signAdminSession, verifyAdminPassword } from "./adminAuth";

export const ADMIN_HOST = "admin.porena.kr";
const COOKIE = "__Host-porena_admin";
const PAGE_SIZE = 50;

const isLocalHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");

/**
 * "admin": serve it. "hidden": an admin path on the game host, which must look like it does not exist.
 * null: an ordinary game request. Local dev hosts reach the admin under /admin so it can be tested without DNS.
 */
export function adminRoute(url: URL): "admin" | "hidden" | null {
  if (url.hostname === ADMIN_HOST) return "admin";
  if (!isAdminPath(url.pathname)) return null;
  return isLocalHost(url.hostname) ? "admin" : "hidden";
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function sessionCookie(value: string, maxAgeSeconds: number) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}
function readCookie(request: Request): string | null {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE) return value.join("=");
  }
  return null;
}
const configured = (env: Env) => Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD_HASH && env.ADMIN_SESSION_SECRET);

async function currentAdmin(request: Request, env: Env): Promise<string | null> {
  const token = readCookie(request);
  if (!token || !configured(env)) return null;
  const username = await readAdminSession(env.ADMIN_SESSION_SECRET, token);
  // Renaming the admin account signs the old name out.
  return username !== null && sameText(username, env.ADMIN_USERNAME) ? username : null;
}

// fetch() leaves Origin off same-origin GETs, so reads fall back to Fetch Metadata. Writes always need Origin.
function sameOrigin(request: Request, url: URL): boolean {
  if (request.headers.get("Origin") === url.origin) return true;
  return (request.method === "GET" || request.method === "HEAD") && request.headers.get("Sec-Fetch-Site") === "same-origin";
}

interface FeedbackRow {
  id: number; category: FeedbackItem["category"]; message: string; contact_email: string | null; locale: string | null;
  user_agent: string | null; status: FeedbackItem["status"]; created_at: number; updated_at: number;
}
const toItem = (row: FeedbackRow): FeedbackItem => ({
  id: row.id, category: row.category, message: row.message, contactEmail: row.contact_email, locale: row.locale,
  userAgent: row.user_agent, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
});

async function login(request: Request, env: Env): Promise<Response> {
  const { success } = await env.ADMIN_LOGIN_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
  if (!success) return json({ error: "rate-limited" }, 429, { "Retry-After": "60" });
  if (!configured(env)) return json({ error: "not-configured" }, 503);
  let body: { username?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return json({ error: "json" }, 400); }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 256) : "";
  // Always hash, so a wrong username takes as long as a wrong password.
  const passwordOk = await verifyAdminPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!(sameText(username, env.ADMIN_USERNAME) && passwordOk)) return json({ error: "invalid" }, 401);
  const token = await signAdminSession(env.ADMIN_SESSION_SECRET, env.ADMIN_USERNAME);
  return json({ username: env.ADMIN_USERNAME }, 200, { "Set-Cookie": sessionCookie(token, ADMIN_SESSION_TTL_MS / 1000) });
}

async function listFeedback(url: URL, env: Env): Promise<Response> {
  const box = url.searchParams.get("box") === "archived" ? "archived" : "inbox";
  const category = url.searchParams.get("category");
  const before = Number(url.searchParams.get("before"));
  const where = [box === "archived" ? "status = 'archived'" : "status IN ('unread', 'read')"];
  const params: (string | number)[] = [];
  if (isFeedbackCategory(category)) { where.push("category = ?"); params.push(category); }
  if (Number.isInteger(before) && before > 0) { where.push("id < ?"); params.push(before); }
  const [page, counts] = await env.FEEDBACK_DB.batch<FeedbackRow | { category: string; status: string; total: number }>([
    env.FEEDBACK_DB.prepare(`SELECT * FROM feedback WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${PAGE_SIZE + 1}`).bind(...params),
    env.FEEDBACK_DB.prepare("SELECT category, status, COUNT(*) AS total FROM feedback GROUP BY category, status"),
  ]);
  const rows = (page!.results as FeedbackRow[]);
  const items = rows.slice(0, PAGE_SIZE).map(toItem);
  return json({ items, nextBefore: rows.length > PAGE_SIZE ? items.at(-1)!.id : null, counts: counts!.results });
}

async function adminApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
  const path = url.pathname.slice("/api/admin".length);
  if (path === "/login" && request.method === "POST") return login(request, env);
  if (path === "/logout" && request.method === "POST") return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  const admin = await currentAdmin(request, env);
  if (!admin) return json({ error: "unauthorized" }, 401);
  if (path === "/session" && request.method === "GET") return json({ username: admin });
  if (path === "/feedback" && request.method === "GET") return listFeedback(url, env);
  const item = /^\/feedback\/(\d+)$/.exec(path);
  if (item && request.method === "PATCH") {
    let body: { status?: unknown };
    try { body = await request.json(); } catch { return json({ error: "json" }, 400); }
    if (!isFeedbackStatus(body.status)) return json({ error: "status" }, 400);
    const { meta } = await env.FEEDBACK_DB.prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?").bind(body.status, Date.now(), Number(item[1])).run();
    return meta.changes ? json({ ok: true }) : json({ error: "not-found" }, 404);
  }
  if (item && request.method === "DELETE") {
    const { meta } = await env.FEEDBACK_DB.prepare("DELETE FROM feedback WHERE id = ?").bind(Number(item[1])).run();
    return meta.changes ? json({ ok: true }) : json({ error: "not-found" }, 404);
  }
  return json({ error: "not-found" }, 404);
}

const PAGE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** The admin page shell. Built from admin.html; the asset server may redirect the .html name, so follow it once. */
// Fetched without the browser's conditional headers: the page is no-store, so a 304 would have nothing to revalidate.
async function adminPage(env: Env, url: URL): Promise<Response> {
  let page = await env.ASSETS.fetch(new URL("/admin.html", url));
  const location = page.headers.get("Location");
  if (page.status >= 300 && page.status < 400 && location) page = await env.ASSETS.fetch(new URL(location, url));
  const headers = new Headers(page.headers);
  for (const [name, value] of Object.entries(PAGE_HEADERS)) headers.set(name, value);
  headers.delete("ETag");
  // Vite's dev server injects inline scripts, so the CSP is for the deployed page only.
  if (url.hostname === ADMIN_HOST) headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(page.body, { status: page.status, headers });
}

export async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname.startsWith("/api/admin/")) return adminApi(request, env, url);
  // The admin host only serves its own API; the game's rooms and sockets stay on porena.kr.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return new Response("Not found", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  return adminPage(env, url);
}
