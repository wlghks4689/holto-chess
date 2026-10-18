import type { PublicRoomEnv } from "./publicRoomKeys";

/**
 * GET /api/public-rooms (PUBLIC-ROOMS-002 2-E). Anyone may read it; it shows only rooms still recruiting: waiting,
 * not full, someone seated, and a lease the room renewed recently. Full rooms and games in progress never appear.
 * The list is a way to find candidates. Joining asks the room itself, which decides seats and capacity.
 */
export const LIST_PAGE_SIZE = 20;
/** Copies of a page live this long in the Worker cache of one data center. */
export const LIST_CACHE_SECONDS = 5;

export type PublicListRoom = {
  instanceId: string; roomCode: string; capacity: number; openSeats: number; confirmed: number; reserved: number;
  createdAt: number; leaseExpiresAt: number; roomExpiresAt: number; rulesVersion: number; protocolVersion: number;
  language: string | null; regionHint: string | null;
};
export type PublicListPage = { serverNow: number; rooms: PublicListRoom[]; nextCursor: string | null };

type ListRow = {
  instance_id: string; room_code: string; capacity: number; confirmed_count: number; reserved_count: number; created_at: number;
  lease_expires_at: number; room_expires_at: number; rules_version: number; protocol_version: number; language: string | null; region_hint: string | null;
};

const encodeCursor = (createdAt: number, instanceId: string) => btoa(`${createdAt}.${instanceId}`).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
/** A cursor is the last row's (createdAt, instanceId); anything else is refused rather than guessed. */
export function decodeCursor(cursor: string): { createdAt: number; instanceId: string } | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(cursor)) return null;
  let text: string;
  try { text = atob(cursor.replace(/-/g, "+").replace(/_/g, "/")); } catch { return null; }
  const match = /^(\d{1,15})\.([a-f0-9]{32})$/.exec(text);
  return match ? { createdAt: Number(match[1]), instanceId: match[2]! } : null;
}

/** Drops rooms whose lease or lifetime ran out since the page was read. Applied to cached pages too. */
export function freshListing(page: PublicListPage, now: number): PublicListPage {
  return { ...page, serverNow: now, rooms: page.rooms.filter(room => room.leaseExpiresAt > now && room.roomExpiresAt > now) };
}

export async function readPublicList(db: D1Database, now: number, after: { createdAt: number; instanceId: string } | null): Promise<PublicListPage> {
  const rows = (await db.prepare(
    `SELECT instance_id, room_code, capacity, confirmed_count, reserved_count, created_at, lease_expires_at, room_expires_at,
            rules_version, protocol_version, language, region_hint
       FROM public_rooms
      WHERE state = 'WAITING' AND lease_expires_at > ?1 AND room_expires_at > ?1
        AND confirmed_count > 0 AND confirmed_count + reserved_count < capacity
        AND (?2 IS NULL OR created_at > ?2 OR (created_at = ?2 AND instance_id > ?3))
      ORDER BY created_at, instance_id
      LIMIT ?4`,
  ).bind(now, after?.createdAt ?? null, after?.instanceId ?? "", LIST_PAGE_SIZE + 1).all<ListRow>()).results;
  const page = rows.slice(0, LIST_PAGE_SIZE);
  const last = page.at(-1);
  return {
    serverNow: now,
    rooms: page.map(row => ({
      instanceId: row.instance_id, roomCode: row.room_code, capacity: row.capacity, openSeats: row.capacity - row.confirmed_count - row.reserved_count,
      confirmed: row.confirmed_count, reserved: row.reserved_count, createdAt: row.created_at, leaseExpiresAt: row.lease_expires_at,
      roomExpiresAt: row.room_expires_at, rulesVersion: row.rules_version, protocolVersion: row.protocol_version, language: row.language, regionHint: row.region_hint,
    })),
    nextCursor: rows.length > LIST_PAGE_SIZE && last ? encodeCursor(last.created_at, last.instance_id) : null,
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Rate limiting happens in the caller. The response carries no cookie, identity or private room, so it can be shared. */
export async function handlePublicList(request: Request, env: PublicRoomEnv, url: URL): Promise<Response> {
  const db = env.PUBLIC_LOBBY_DB;
  if (!db) return json({ error: "LOBBY_UNAVAILABLE" }, 503);
  const cursorText = url.searchParams.get("cursor");
  const cursor = cursorText === null ? null : decodeCursor(cursorText);
  if (cursorText !== null && !cursor) return json({ error: "INVALID_CURSOR" }, 400);
  // One cache entry per page, whatever else the URL or the cookies say.
  const cacheKey = new Request(`${url.origin}/api/public-rooms${cursorText === null ? "" : `?cursor=${encodeURIComponent(cursorText)}`}`);
  const seconds = env.PUBLIC_LIST_CACHE_SECONDS === undefined ? LIST_CACHE_SECONDS : Number(env.PUBLIC_LIST_CACHE_SECONDS);
  const cache = typeof caches === "undefined" || !(seconds > 0) ? undefined : (caches as unknown as { default: Cache }).default;
  const cached = await cache?.match(cacheKey).catch(() => undefined);
  if (cached) return json(freshListing(await cached.json() as PublicListPage, Date.now()));
  let page: PublicListPage;
  try { page = await readPublicList(db, Date.now(), cursor); } catch { return json({ error: "LOBBY_UNAVAILABLE" }, 503); }
  await cache?.put(cacheKey, Response.json(page, { headers: { "Cache-Control": `public, max-age=${seconds}` } })).catch(() => undefined);
  return json(page);
}
