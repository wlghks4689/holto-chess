import { adminRoute, handleAdmin } from "./admin";
import { handleAuth, purgeExpiredAuth } from "./auth";
import { submitFeedback } from "./feedback";
import { isAllowedOrigin } from "./origin";
import { runRetention } from "./retention";
export { GameRoom } from "./GameRoom";

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => alphabet[n % alphabet.length]).join("");
}
/**
 * Static files as-is; unknown page paths (client-side routes) get the app shell. A request for a missing *file*
 * - typically an old bundle chunk from a tab opened before a deploy - stays a 404 that nobody may cache, so the
 * client can reload onto the new build instead of executing HTML as JavaScript.
 */
async function serveApp(request: Request, env: Env, url: URL): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return response;
  const isFile = url.pathname.startsWith("/assets/") || /\.[a-z0-9]{1,8}$/i.test(url.pathname);
  if (isFile || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
  return env.ASSETS.fetch(new Request(new URL("/", url), { method: request.method, headers: request.headers }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.porena.kr") {
      url.protocol = "https:";
      url.hostname = "porena.kr";
      return Response.redirect(url.toString(), 301);
    }
    const admin = adminRoute(url);
    if (admin === "admin") return handleAdmin(request, env, url);
    if (admin === "hidden") return new Response("Not found", { status: 404 });
    if (url.pathname.startsWith("/api/auth/")) return handleAuth(request, env, url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, runtime: "cloudflare-workers" });
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/ws/")) return serveApp(request, env, url);
    // Same-origin browser credentials. No token in a query string, cookie or routing header.
    // The only other caller is our own Discord Activity origin, matched exactly (worker/origin.ts).
    if (!isAllowedOrigin(request.headers.get("Origin"), url.origin, env.DISCORD_ACTIVITY_CLIENT_IDS)) return new Response("Origin rejected", { status: 403 });
    // Game rooms still use guest seats: use the Cloudflare-provided IP as a coarse abuse
    // guard, with a generous shared-network connection budget. Never log it.
    const limiter = url.pathname === "/api/feedback" ? env.FEEDBACK_LIMITER : url.pathname === "/api/rooms" ? env.ROOM_CREATE_LIMITER : env.ROOM_CONNECT_LIMITER;
    const { success } = await limiter.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
    if (!success) return new Response("요청이 너무 많습니다. 잠시 후 다시 시도하세요.", {
      status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
    if (url.pathname === "/api/feedback" && request.method === "POST") return submitFeedback(request, env);
    const forward = (roomId: string, path: string) => {
      const target = new URL(request.url); target.pathname = path; target.search = "";
      const headers = new Headers(request.headers); headers.set("X-Room-Id", roomId);
      return env.GAME_ROOM.getByName(`room:${roomId}`).fetch(new Request(target, { method: request.method, headers }));
    };
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await forward(code(), "/internal/create");
        if (response.status !== 409) return response;
      }
      return new Response("Please retry", { status: 503 });
    }
    const join = /^\/api\/rooms\/([A-Z2-9]{6})\/join$/.exec(url.pathname);
    if (join && request.method === "POST") return forward(join[1], "/internal/join");
    const savedSession = /^\/api\/rooms\/([A-Z2-9]{6})\/session$/.exec(url.pathname);
    if (savedSession && request.method === "POST") return forward(savedSession[1], "/internal/session");
    const connectionTicket = /^\/api\/rooms\/([A-Z2-9]{6})\/connection-ticket$/.exec(url.pathname);
    if (connectionTicket && request.method === "POST") return forward(connectionTicket[1], "/internal/connection-ticket");
    const socket = /^\/ws\/rooms\/([A-Z2-9]{6})$/.exec(url.pathname);
    if (socket && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") return forward(socket[1], "/internal/ws");
    return new Response("Not found", { status: 404 });
  },
  // Daily Cron Trigger (wrangler.jsonc): feedback retention from the privacy policy.
  async scheduled(_controller, env): Promise<void> {
    await Promise.all([runRetention(env), purgeExpiredAuth(env.ACCOUNT_DB)]);
  },
} satisfies ExportedHandler<Env>;
