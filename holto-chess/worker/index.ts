import { searchFile, withSearchMetadata } from "./search";
import { adminRoute, handleAdmin } from "./admin";
import { configuredOrigin, handleAuth, purgeExpiredAuth, readPorenaSession } from "./auth";
import { accountsEnabled, closedAccountResponse } from "./accountGate";
import { roomForwardHeaders } from "./roomIdentity";
import { normalizeNickname } from "../src/shared/nickname";
import type { RoomAccountIdentity } from "../src/game/room";
import { submitFeedback } from "./feedback";
import { isAllowedOrigin } from "./origin";
import { runRetention } from "./retention";
import { handleRankings } from "./rank";
import { PUBLIC_INSTANCE_HEADER, PUBLIC_PROBE_HEADER, PUBLIC_REQUEST_HEADER, ROOM_TAKEN_HEADER, ROOM_VACANT_HEADER } from "./GameRoom";
import { PUBLIC_CREATE_ATTEMPTS, PUBLIC_INSTANCE_ID, PUBLIC_REQUEST_ID, publicCreateCandidate, publicRoomsEnabled, type PublicRoomEnv } from "./publicRoomKeys";
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
    // Handle on the main host only; never expose public SEO files on the admin subdomain.
    if (url.hostname === "porena.kr" || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      const search = searchFile(request, url);
      if (search) return search;
    }
    const admin = adminRoute(url);
    if (admin === "admin") return handleAdmin(request, env, url);
    if (admin === "hidden") return new Response("Not found", { status: 404 });
    // Login and profiles are closed for now (worker/accountGate.ts); /me still answers "not signed in".
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/profile") return accountsEnabled(env) ? handleAuth(request, env, url) : closedAccountResponse(request, url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, runtime: "cloudflare-workers" });
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/ws/")) return withSearchMetadata(await serveApp(request, env, url), url);
    // Public rooms stay unreachable until PUBLIC_ROOMS_ENABLED is set; the private room API is unaffected either way.
    const publicRoute = url.pathname === "/api/public-rooms" || url.pathname.startsWith("/api/public-rooms/");
    if (publicRoute && !publicRoomsEnabled(env as PublicRoomEnv)) return new Response("Not found", { status: 404 });
    // Read-only and public: a same-origin GET carries no Origin header, so it is rate-limited instead of origin-checked.
    // The JSON has no CORS headers, so another site can never read /me even with the visitor's cookie.
    if (url.pathname === "/api/rankings" || url.pathname === "/api/rankings/me") {
      if (!accountsEnabled(env)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
      const { success } = await env.ROOM_CONNECT_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
      if (!success) return new Response("요청이 너무 많습니다. 잠시 후 다시 시도하세요.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
      return handleRankings(request, env, url);
    }
    // Same-origin browser credentials. No token in a query string, cookie or routing header.
    // The only other caller is our own Discord Activity origin, matched exactly (worker/origin.ts).
    if (!isAllowedOrigin(request.headers.get("Origin"), url.origin, env.DISCORD_ACTIVITY_CLIENT_IDS)) return new Response("Origin rejected", { status: 403 });
    // All room seats use the Cloudflare-provided IP as a coarse abuse
    // guard, with a generous shared-network connection budget. Never log it.
    const limiter = url.pathname === "/api/feedback" ? env.FEEDBACK_LIMITER
      : url.pathname === "/api/rooms" || url.pathname === "/api/public-rooms" ? env.ROOM_CREATE_LIMITER : env.ROOM_CONNECT_LIMITER;
    const { success } = await limiter.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
    if (!success) return new Response("요청이 너무 많습니다. 잠시 후 다시 시도하세요.", {
      status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
    if (url.pathname === "/api/feedback" && request.method === "POST") return submitFeedback(request, env);
    let identity: RoomAccountIdentity | undefined;
    const solo = url.pathname === "/api/rooms" && request.headers.get("X-Porena-Mode") === "solo";
    const publicJoin = /^\/api\/public-rooms\/([A-Z2-9]{6})\/join$/.exec(url.pathname);
    const publicSeat = request.method === "POST" && (url.pathname === "/api/public-rooms" || !!publicJoin);
    const isNewSeat = publicSeat || request.method === "POST" && (url.pathname === "/api/rooms" || /^\/api\/rooms\/[A-Z2-9]{6}\/join$/.test(url.pathname));
    const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie" } });
    if (isNewSeat) {
      try {
        // While accounts are closed a leftover sign-in cookie is ignored: everyone takes a guest seat.
        const user = accountsEnabled(env) ? await readPorenaSession(request, env) : null;
        if (!user && request.headers.get("X-Porena-Identity") === "account") return fail("ACCOUNT_REQUIRED", 401);
        // Ranked solo is server-authoritative and account-only; guests practise locally.
        if (!user && solo) return fail("ACCOUNT_REQUIRED", 401);
        // Public rooms seat accounts only; guests keep private invite rooms.
        if (!user && publicSeat) return fail("ACCOUNT_REQUIRED", 401);
        if (user) {
          if (url.origin !== configuredOrigin(env) || request.headers.get("Origin") !== url.origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return fail("Origin rejected", 403);
          if (request.headers.get("X-Porena-Identity") === "guest") return fail("ACCOUNT_CHANGED", 409);
          const displayName = normalizeNickname(user.displayName);
          if (!displayName || displayName !== user.displayName) return fail("PROFILE_REQUIRED", 403);
          identity = { accountUserId: user.id, displayName };
        }
      } catch { return fail("ACCOUNT_UNAVAILABLE", 503); }
    }
    const forward = (roomId: string, path: string, internal: Record<string, string> = {}) => {
      const target = new URL(request.url); target.pathname = path; target.search = "";
      const headers = roomForwardHeaders(request.headers, identity); headers.set("X-Room-Id", roomId);
      if (solo && identity) headers.set("X-Internal-Porena-Solo", "1");
      // A public seat's JSON body is read here; the room only receives these headers.
      for (const [name, value] of Object.entries(internal)) { headers.set(name, value); headers.delete("Content-Length"); headers.delete("Content-Type"); }
      return env.GAME_ROOM.getByName(`room:${roomId}`).fetch(new Request(target, { method: request.method, headers }));
    };
    if (publicSeat) {
      const secret = (env as PublicRoomEnv).PUBLIC_ROOM_SECRET;
      if (!secret) return fail("LOBBY_UNAVAILABLE", 503);
      const body = await request.json().catch(() => null) as { requestId?: unknown; instanceId?: unknown } | null;
      const requestId = typeof body?.requestId === "string" ? body.requestId : "";
      if (!PUBLIC_REQUEST_ID.test(requestId)) return fail("INVALID_REQUEST", 400);
      if (publicJoin) {
        const instanceId = typeof body?.instanceId === "string" ? body.instanceId : "";
        if (!PUBLIC_INSTANCE_ID.test(instanceId)) return fail("INVALID_REQUEST", 400);
        return forward(publicJoin[1]!, "/internal/public-join", { [PUBLIC_REQUEST_HEADER]: requestId, [PUBLIC_INSTANCE_HEADER]: instanceId });
      }
      // Codes derive from the request, so a retry walks the same candidates. Every candidate is asked first: an earlier
      // code that was taken at creation may be free now, and creating there would split the creator from their room.
      const candidates = await Promise.all(Array.from({ length: PUBLIC_CREATE_ATTEMPTS }, (_, attempt) => publicCreateCandidate(secret, identity!.accountUserId, requestId, attempt)));
      const createAt = (candidate: typeof candidates[number], probe: boolean) => forward(candidate.roomId, "/internal/public-create",
        { [PUBLIC_REQUEST_HEADER]: requestId, [PUBLIC_INSTANCE_HEADER]: candidate.instanceId, ...(probe ? { [PUBLIC_PROBE_HEADER]: "1" } : {}) });
      const vacant: typeof candidates = [];
      for (const candidate of candidates) {
        const response = await createAt(candidate, true);
        if (response.headers.get(ROOM_VACANT_HEADER) === "1") vacant.push(candidate);
        else if (response.headers.get(ROOM_TAKEN_HEADER) !== "1") return response; // This request's room: its credential or expiry.
      }
      for (const candidate of vacant) {
        // A concurrent copy of this request lands in the same room and gets the same credential.
        const response = await createAt(candidate, false);
        if (response.headers.get(ROOM_TAKEN_HEADER) !== "1") return response;
      }
      return fail("LOBBY_UNAVAILABLE", 503);
    }
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
