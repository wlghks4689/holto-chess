import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { FeedbackItem } from "../../src/shared/feedback";

const game = "https://porena.test";
const admin = "https://admin.porena.kr";
const testPassword = (env as unknown as { TEST_ADMIN_PASSWORD: string }).TEST_ADMIN_PASSWORD;
let visitor = 0;

function send(body: unknown, init: RequestInit = {}) {
  return exports.default.fetch(`${game}/api/feedback`, {
    method: "POST",
    headers: { Origin: game, "Content-Type": "application/json", "CF-Connecting-IP": `198.51.100.${++visitor}`, "User-Agent": "vitest" },
    body: JSON.stringify(body),
    ...init,
  });
}
const adminFetch = (path: string, init: RequestInit & { cookie?: string } = {}) => exports.default.fetch(`${admin}${path}`, {
  ...init,
  headers: { Origin: admin, "Content-Type": "application/json", "CF-Connecting-IP": `203.0.113.${++visitor % 250}`, ...(init.cookie ? { Cookie: init.cookie } : {}), ...init.headers },
});
async function signIn(): Promise<string> {
  const res = await adminFetch("/api/admin/login", { method: "POST", body: JSON.stringify({ username: env.ADMIN_USERNAME, password: testPassword }) });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("Set-Cookie")!;
  expect(cookie).toMatch(/^__Host-porena_admin=.+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
  return cookie.split(";")[0]!;
}

describe("feedback submission", () => {
  it("stores a valid message without the sender's IP", async () => {
    const res = await send({ category: "bug", message: "  상점에서 멈춰요  ", locale: "ko-KR", contactEmail: "player@example.com", consent: true });
    expect(res.status).toBe(201);
    const row = await env.FEEDBACK_DB.prepare("SELECT * FROM feedback ORDER BY id DESC LIMIT 1").first<Record<string, unknown>>();
    expect(row).toMatchObject({ category: "bug", message: "상점에서 멈춰요", contact_email: "player@example.com", locale: "ko-KR", user_agent: "vitest", status: "unread" });
    expect(JSON.stringify(row)).not.toContain("198.51.100.");
  });

  it("enforces the 500-character limit, categories and email consent", async () => {
    expect((await send({ category: "feedback", message: "가".repeat(500) })).status).toBe(201);
    expect(await (await send({ category: "feedback", message: "가".repeat(501) })).json()).toEqual({ error: "message" });
    expect(await (await send({ category: "feedback", message: "   " })).json()).toEqual({ error: "message" });
    expect(await (await send({ category: "spam", message: "hi" })).json()).toEqual({ error: "category" });
    expect(await (await send({ category: "inquiry", message: "hi", contactEmail: "not-an-email", consent: true })).json()).toEqual({ error: "email" });
    expect(await (await send({ category: "inquiry", message: "hi", contactEmail: "a@b.co" })).json()).toEqual({ error: "consent" });
  });

  it("drops honeypot submissions while answering as if they worked", async () => {
    const before = await env.FEEDBACK_DB.prepare("SELECT COUNT(*) AS n FROM feedback").first<number>("n");
    expect((await send({ category: "feedback", message: "buy now", website: "http://spam.example" })).status).toBe(201);
    expect(await env.FEEDBACK_DB.prepare("SELECT COUNT(*) AS n FROM feedback").first<number>("n")).toBe(before);
  });

  it("rejects cross-origin posts and rate-limits one visitor", async () => {
    expect((await send({ category: "feedback", message: "hi" }, { headers: { Origin: "https://evil.example", "Content-Type": "application/json" } })).status).toBe(403);
    const headers = { Origin: game, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.250" };
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await send({ category: "feedback", message: `burst ${i}` }, { headers })).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
  });
});

describe("admin inbox", () => {
  it("is invisible from the game host", async () => {
    expect((await exports.default.fetch(`${game}/admin`)).status).toBe(404);
    expect((await exports.default.fetch(`${game}/api/admin/session`, { headers: { Origin: game } })).status).toBe(404);
    // …and the admin host does not expose the game's room API.
    expect((await adminFetch("/api/rooms", { method: "POST" })).status).toBe(404);
  });

  it("refuses wrong credentials and anonymous reads", async () => {
    const wrong = await adminFetch("/api/admin/login", { method: "POST", body: JSON.stringify({ username: env.ADMIN_USERNAME, password: "wrong-password" }) });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("Set-Cookie")).toBeNull();
    expect((await adminFetch("/api/admin/feedback")).status).toBe(401);
    for (const forged of ["forged.value.sig", "zzzzz.dGVzdC1hZG1pbg.AAAA", "...", "a.b"]) {
      expect((await adminFetch("/api/admin/feedback", { cookie: `__Host-porena_admin=${forged}` })).status).toBe(401);
    }
  });

  it("lists, marks, archives and deletes messages for a signed-in admin", async () => {
    await send({ category: "support", message: "후원하고 싶어요" });
    const cookie = await signIn();
    expect(await (await adminFetch("/api/admin/session", { cookie })).json()).toEqual({ username: env.ADMIN_USERNAME });

    const inbox = await (await adminFetch("/api/admin/feedback?box=inbox&category=support", { cookie })).json<{ items: FeedbackItem[]; counts: { category: string; status: string; total: number }[] }>();
    const item = inbox.items.find((entry) => entry.message === "후원하고 싶어요")!;
    expect(item).toMatchObject({ category: "support", status: "unread", contactEmail: null });
    expect(inbox.items.every((entry) => entry.category === "support")).toBe(true);
    expect(inbox.counts.some((row) => row.category === "support" && row.status === "unread" && row.total >= 1)).toBe(true);

    // Writes need a same-origin Origin header, not just the cookie.
    expect((await exports.default.fetch(`${admin}/api/admin/feedback/${item.id}`, { method: "PATCH", headers: { Cookie: cookie }, body: JSON.stringify({ status: "read" }) })).status).toBe(403);
    expect((await adminFetch(`/api/admin/feedback/${item.id}`, { method: "PATCH", cookie, body: JSON.stringify({ status: "archived" }) })).status).toBe(200);
    const archived = await (await adminFetch("/api/admin/feedback?box=archived", { cookie })).json<{ items: FeedbackItem[] }>();
    expect(archived.items.map((entry) => entry.id)).toContain(item.id);
    expect((await adminFetch(`/api/admin/feedback/${item.id}`, { method: "PATCH", cookie, body: JSON.stringify({ status: "deleted" }) })).status).toBe(400);

    expect((await adminFetch(`/api/admin/feedback/${item.id}`, { method: "DELETE", cookie })).status).toBe(200);
    expect((await adminFetch(`/api/admin/feedback/${item.id}`, { method: "DELETE", cookie })).status).toBe(404);

    const logout = await adminFetch("/api/admin/logout", { method: "POST", cookie });
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("pages through the inbox newest first", async () => {
    for (let i = 0; i < 52; i++) await env.FEEDBACK_DB.prepare("INSERT INTO feedback (category, message, status, created_at, updated_at) VALUES ('inquiry', ?, 'read', ?, ?)").bind(`page ${i}`, i, i).run();
    const cookie = await signIn();
    const first = await (await adminFetch("/api/admin/feedback?category=inquiry", { cookie })).json<{ items: FeedbackItem[]; nextBefore: number }>();
    expect(first.items).toHaveLength(50);
    expect(first.items[0]!.id).toBeGreaterThan(first.items[1]!.id);
    const second = await (await adminFetch(`/api/admin/feedback?category=inquiry&before=${first.nextBefore}`, { cookie })).json<{ items: FeedbackItem[]; nextBefore: number | null }>();
    expect(second.items.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...second.items.map((entry) => entry.id))).toBeLessThan(first.nextBefore);
  });
});

describe("admin sessions", () => {
  it("expire after 12 hours and reject another secret's signature", async () => {
    const { readAdminSession, signAdminSession, ADMIN_SESSION_TTL_MS } = await import("../../worker/adminAuth");
    const now = Date.UTC(2026, 8, 30);
    const token = await signAdminSession("secret-a", "관리자", now);
    expect(await readAdminSession("secret-a", token, now + ADMIN_SESSION_TTL_MS - 1)).toBe("관리자");
    expect(await readAdminSession("secret-a", token, now + ADMIN_SESSION_TTL_MS)).toBeNull();
    expect(await readAdminSession("secret-b", token, now)).toBeNull();
  });
});
