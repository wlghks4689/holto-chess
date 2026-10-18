import { searchFile, withSearchMetadata } from "./search";
import { adminRoute, handleAdmin } from "./admin";
import { configuredOrigin, handleAuth, purgeExpiredAuth, readPorenaSession } from "./auth";
import { publicSeatHeaders, roomForwardHeaders } from "./roomIdentity";
import { issuePublicGuest, readPublicGuest, type PublicGuest } from "./publicGuest";
import { normalizeNickname } from "../src/shared/nickname";
import type { RoomAccountIdentity } from "../src/game/room";
import { submitFeedback } from "./feedback";
import { isAllowedOrigin } from "./origin";
import { runRetention } from "./retention";
import { handleRankings } from "./rank";
import { PUBLIC_INSTANCE_HEADER, PUBLIC_REQUEST_HEADER, ROOM_TAKEN_HEADER } from "./GameRoom";
import { handlePublicList } from "./publicList";
import { PUBLIC_REPAIR_CRON, runPublicLobbyRepair } from "./publicRepair";
import { claimPublicSlot, findByInstance, moveClaimToCode, PUBLIC_ROOMS_MAX, type RegistryRow } from "./publicLobby";
import { PRESENTATION_VERSION } from "../src/shared/presentationTimeline";
import { CREATE_REQUEST_MAX_AGE_MS, createRequestAge, PUBLIC_CREATE_ATTEMPTS, PUBLIC_INSTANCE_ID, PUBLIC_REQUEST_ID, publicCreateCandidate, publicCreatorKey, publicGuestKey, publicNetworkKey, publicRoomsEnabled, type PublicRoomEnv } from "./publicRoomKeys";
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
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/profile") return handleAuth(request, env, url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, runtime: "cloudflare-workers" });
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/ws/")) return withSearchMetadata(await serveApp(request, env, url), url);
    // Public rooms stay unreachable until PUBLIC_ROOMS_ENABLED is set; the private room API is unaffected either way.
    const publicRoute = url.pathname === "/api/public-rooms" || url.pathname.startsWith("/api/public-rooms/");
    if (publicRoute && !publicRoomsEnabled(env as PublicRoomEnv)) return new Response("Not found", { status: 404 });
    // Public and read-only like the rankings: a same-origin GET carries no Origin header, so it is rate-limited instead.
    // Its own limiter key keeps browsing from spending the budget a player needs to reconnect.
    if (url.pathname === "/api/public-rooms" && request.method === "GET") {
      const { success } = await env.ROOM_CONNECT_LIMITER.limit({ key: `public-browse:${request.headers.get("CF-Connecting-IP") ?? "local"}` });
      if (!success) return new Response("요청이 너무 많습니다. 잠시 후 다시 시도하세요.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
      return handlePublicList(request, env as PublicRoomEnv, url);
    }
    // Read-only and public: a same-origin GET carries no Origin header, so it is rate-limited instead of origin-checked.
    // The JSON has no CORS headers, so another site can never read /me even with the visitor's cookie.
    if (url.pathname === "/api/rankings" || url.pathname === "/api/rankings/me") {
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
        const user = await readPorenaSession(request, env);
        if (!user && request.headers.get("X-Porena-Identity") === "account") return fail("ACCOUNT_REQUIRED", 401);
        // Ranked solo is server-authoritative and account-only; guests practise locally.
        if (!user && solo) return fail("ACCOUNT_REQUIRED", 401);
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
      const body = await request.json().catch(() => null) as { requestId?: unknown; instanceId?: unknown; nickname?: unknown } | null;
      const requestId = typeof body?.requestId === "string" ? body.requestId : "";
      if (!PUBLIC_REQUEST_ID.test(requestId)) return fail("INVALID_REQUEST", 400);
      if (!publicJoin) {
        // Creates carry their own time (UUIDv7): a retry older than a day is refused, so it can never outlive the
        // registry row that remembers its room.
        const age = createRequestAge(requestId, Date.now());
        if (age === null) return fail("INVALID_REQUEST", 400);
        if (age > CREATE_REQUEST_MAX_AGE_MS) return fail("REQUEST_EXPIRED", 410);
      }
      // Without an account the visitor plays as a guest: the signed guest cookie is reused, or a new one is issued.
      let guest: (PublicGuest & { key: string; displayName: string }) | undefined;
      if (!identity) {
        const displayName = normalizeNickname(body?.nickname);
        if (!displayName) return fail("NICKNAME_REQUIRED", 400);
        const found = await readPublicGuest(request, secret) ?? await issuePublicGuest(request, secret);
        guest = { ...found, key: await publicGuestKey(secret, found.id), displayName };
      }
      const networkKey = await publicNetworkKey(secret, request.headers.get("CF-Connecting-IP") ?? "local");
      const seat = publicSeatHeaders(guest, networkKey);
      const owner = identity ? identity.accountUserId : `guest:${guest!.key}`;
      // A newly issued guest cookie rides on whatever the room answers, so a retry after a lost reply is the same guest.
      const answer = (response: Response) => {
        if (!guest?.setCookie) return response;
        const headers = new Headers(response.headers); headers.append("Set-Cookie", guest.setCookie); headers.set("Vary", "Cookie");
        return new Response(response.body, { status: response.status, headers });
      };
      if (publicJoin) {
        const instanceId = typeof body?.instanceId === "string" ? body.instanceId : "";
        if (!PUBLIC_INSTANCE_ID.test(instanceId)) return fail("INVALID_REQUEST", 400);
        return answer(await forward(publicJoin[1]!, "/internal/public-join", { [PUBLIC_REQUEST_HEADER]: requestId, [PUBLIC_INSTANCE_HEADER]: instanceId, ...seat }));
      }
      // The registry decides which room a create request means, keeps live public rooms under the cap and allows each
      // creator one live room. Codes still derive from the request; the registry remembers the one that was used.
      const db = (env as PublicRoomEnv).PUBLIC_LOBBY_DB;
      if (!db) return answer(fail("LOBBY_UNAVAILABLE", 503));
      const creatorKey = await publicCreatorKey(secret, identity ? "account" : "guest", identity ? identity.accountUserId : guest!.key);
      const candidates = await Promise.all(Array.from({ length: PUBLIC_CREATE_ATTEMPTS }, (_, attempt) => publicCreateCandidate(secret, owner, requestId, attempt)));
      const retryLater = (error: string, status: number, seconds: number) => {
        const response = fail(error, status); response.headers.set("Retry-After", String(seconds)); return response;
      };
      let row: RegistryRow | undefined;
      for (const candidate of candidates) {
        const claim = await claimPublicSlot(db, { instanceId: candidate.instanceId, roomCode: candidate.roomId, creatorKey, requestId, networkKey,
          now: Date.now(), cap: PUBLIC_ROOMS_MAX, rulesVersion: 2, protocolVersion: PRESENTATION_VERSION });
        if (claim.kind === "claimed" || claim.kind === "existing") { row = claim.row; break; }
        if (claim.kind === "capacity") return answer(retryLater("PUBLIC_CAPACITY_REACHED", 503, 30));
        if (claim.kind === "creator_busy") return answer(fail("CREATOR_HAS_ROOM", 409));
        if (claim.kind === "network_rate") return answer(retryLater("RATE_LIMITED", 429, 600));
        // code_taken: another live public room holds this code; try the next one.
      }
      if (!row) return answer(fail("LOBBY_UNAVAILABLE", 503));
      // A retry that arrives after its room ended never makes a new room.
      if (!row.slotHeld) return answer(fail("ROOM_CLOSED", 410));
      const createIn = (roomCode: string) => forward(roomCode, "/internal/public-create", { [PUBLIC_REQUEST_HEADER]: requestId, [PUBLIC_INSTANCE_HEADER]: row!.instanceId, ...seat });
      let response = await createIn(row.roomCode);
      const tried = new Set([row.roomCode]);
      // A private room (not in the registry) may hold the code: move the claim to the next free code and try there. If
      // another copy of this request moved it first, follow the registry instead of moving it again.
      for (let step = 0; step < candidates.length * 2; step++) {
        const taken = response.headers.get(ROOM_TAKEN_HEADER) === "1";
        const moved = !taken && response.status === 409 && (await response.clone().json().catch(() => null) as { error?: string } | null)?.error === "CLAIM_MOVED";
        if (!taken && !moved) break;
        const target = moved ? undefined : candidates.find(candidate => !tried.has(candidate.roomId));
        if (!moved && !target) break;
        const outcome = target ? await moveClaimToCode(db, row.instanceId, row.roomCode, target.roomId) : "gone";
        if (target) tried.add(target.roomId);
        if (outcome === "code_taken") continue;
        if (outcome === "moved") { row = { ...row, roomCode: target!.roomId }; response = await createIn(row.roomCode); continue; }
        const current = await findByInstance(db, row.instanceId);
        if (!current?.slotHeld) return answer(fail("ROOM_CLOSED", 410));
        row = current; tried.add(row.roomCode); response = await createIn(row.roomCode);
      }
      return answer(response.headers.get(ROOM_TAKEN_HEADER) === "1" ? fail("LOBBY_UNAVAILABLE", 503) : response);
    }
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await forward(code(), "/internal/create");
        if (response.status !== 409) return response;
      }
      return new Response("Please retry", { status: 503 });
    }
    const join = /^\/api\/rooms\/([A-Z2-9]{6})\/join$/.exec(url.pathname);
    if (join && request.method === "POST") {
      // Private rooms answer at once. Only a public room asks for IDENTITY_REQUIRED; then the network key is derived
      // (accounts too) and, for a guest, the guest cookie is read. A private join never touches the guest cookie.
      const plain = await forward(join[1], "/internal/join");
      const secret = (env as PublicRoomEnv).PUBLIC_ROOM_SECRET;
      if (plain.status !== 401 || !secret || !publicRoomsEnabled(env as PublicRoomEnv)) return plain;
      if ((await plain.clone().json().catch(() => null) as { error?: string } | null)?.error !== "IDENTITY_REQUIRED") return plain;
      const found = identity ? null : await readPublicGuest(request, secret);
      return forward(join[1], "/internal/join", publicSeatHeaders(found ? { key: await publicGuestKey(secret, found.id) } : undefined,
        await publicNetworkKey(secret, request.headers.get("CF-Connecting-IP") ?? "local")));
    }
    const savedSession = /^\/api\/rooms\/([A-Z2-9]{6})\/session$/.exec(url.pathname);
    if (savedSession && request.method === "POST") return forward(savedSession[1], "/internal/session");
    const connectionTicket = /^\/api\/rooms\/([A-Z2-9]{6})\/connection-ticket$/.exec(url.pathname);
    if (connectionTicket && request.method === "POST") return forward(connectionTicket[1], "/internal/connection-ticket");
    const socket = /^\/ws\/rooms\/([A-Z2-9]{6})$/.exec(url.pathname);
    if (socket && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") return forward(socket[1], "/internal/ws");
    return new Response("Not found", { status: 404 });
  },
  // Daily Cron Trigger (wrangler.jsonc): feedback retention from the privacy policy.
  async scheduled(controller, env): Promise<void> {
    // The minute trigger only repairs the public room registry (added to wrangler.jsonc when public rooms ship);
    // any other trigger runs the daily retention exactly as before.
    if (controller.cron === PUBLIC_REPAIR_CRON) { await runPublicLobbyRepair(env as PublicRoomEnv); return; }
    await Promise.all([runRetention(env), purgeExpiredAuth(env.ACCOUNT_DB)]);
  },
} satisfies ExportedHandler<Env>;
