import type { RoomAccountIdentity, RoomSnapshot } from "./room";

/**
 * Public lobby seat lifecycle (PUBLIC-ROOMS phase 1). Only a room created as public carries `visibility` and
 * `publicLobby`; private and solo rooms never reach these functions. Once the game starts the room plays exactly
 * like a private one: departures, bots, forfeits and RP are unchanged.
 *
 * Seat: FREE -> RESERVED (HTTP join) -> CONFIRMED (authenticated WebSocket) -> DISCONNECTED_GRACE -> FREE.
 * A released seat leaves `sessions`, so `sessions.length` is always reserved + confirmed + grace and never exceeds 8.
 */
export const PUBLIC_LOBBY_TIMING = {
  /** An HTTP join that never authenticates a WebSocket gives the seat back. */
  RESERVATION_MS: 30_000,
  /** A confirmed seat with no live connection is kept this long (READY is dropped at once), then reclaimed. */
  RECONNECT_GRACE_MS: 90_000,
  /** A public lobby nobody holds a seat in closes after this. */
  EMPTY_CLOSE_MS: 60_000,
  /** A public lobby never recruits for longer than this from creation, whatever the activity. */
  MAX_WAIT_MS: 60 * 60_000,
  /** How often the room re-checks presence while confirmed seats wait in the lobby. */
  PRESENCE_SWEEP_MS: 30_000,
  /** A socket that opted into heartbeats and has not answered for this long counts as gone. */
  HEARTBEAT_STALE_MS: 90_000,
  /** How long a released join key keeps answering a retry with its outcome instead of seating anew. */
  RELEASED_KEY_MS: 10 * 60_000,
} as const;

export const PUBLIC_CAPACITY = 8;

export type PublicSeatRelease = "RESERVATION_EXPIRED" | "SEAT_RELEASED";
export type PublicLobby = {
  /** Opaque per-creation id. A reused room code never answers for an older instance. */
  instanceId: string;
  createdAt: number;
  /** The bot name each seat gets back when a person releases it. */
  botNames: Record<string, string>;
  nextSeatEpoch: number;
  /** Set while no seat is held; the lobby closes EMPTY_CLOSE_MS later. */
  emptySince?: number;
  /** Token digests of released seats, so a retried join reports the outcome instead of taking a new seat. */
  releasedKeys: { digest: string; until: number; reason: PublicSeatRelease }[];
};
export type PublicSeat = RoomSnapshot["sessions"][number];

export function isPublicLobby(room: RoomSnapshot): boolean {
  return room.visibility === "PUBLIC" && room.status === "LOBBY" && !!room.publicLobby;
}

/** Turns a freshly created, unseated room into a public lobby. */
export function makePublicRoom(source: RoomSnapshot, instanceId: string, now: number): RoomSnapshot {
  if (source.sessions.length || source.status !== "LOBBY") throw new Error("A public room starts empty");
  const room = structuredClone(source);
  room.visibility = "PUBLIC";
  room.publicLobby = {
    instanceId, createdAt: now, nextSeatEpoch: 1, emptySince: now, releasedKeys: [],
    botNames: Object.fromEntries(room.game.players.map(player => [player.id, player.name])),
  };
  return room;
}

/** Epoch ms after which the lobby accepts nothing and is deleted. */
export function publicLobbyClosesAt(room: RoomSnapshot): number | undefined {
  if (!isPublicLobby(room)) return undefined;
  const lobby = room.publicLobby!;
  const limit = lobby.createdAt + PUBLIC_LOBBY_TIMING.MAX_WAIT_MS;
  return lobby.emptySince === undefined ? limit : Math.min(limit, lobby.emptySince + PUBLIC_LOBBY_TIMING.EMPTY_CLOSE_MS);
}

export function releasedKey(room: RoomSnapshot, digest: string, now: number): PublicSeatRelease | undefined {
  return room.publicLobby?.releasedKeys.find(key => key.digest === digest && key.until > now)?.reason;
}

/** Seats one network (IP) may hold in one public room. Kept above 1 so a family, school or PC-bang can still play. */
export const PUBLIC_SEATS_PER_NETWORK = 3;

/**
 * Who takes a public seat: an account (accountUserId) or a guest (guestKey), never both. A guest's name is optional:
 * without one the seat keeps its bot name until the guest sends a nickname on the WebSocket, as in private rooms.
 */
export type PublicSeatIdentity =
  | (RoomAccountIdentity & { guestKey?: undefined; networkKey?: string })
  | { accountUserId?: undefined; guestKey: string; displayName?: string; networkKey?: string };

export type PublicReserveError = "ROOM_STARTED" | "ROOM_FULL" | "ACCOUNT_ALREADY_SEATED" | "GUEST_ALREADY_SEATED" | "NETWORK_SEAT_LIMIT";
export function reservePublicSeat(source: RoomSnapshot, tokenHash: string, identity: PublicSeatIdentity, now: number):
  { room: RoomSnapshot; playerId: string } | { error: PublicReserveError } {
  if (!isPublicLobby(source)) return { error: "ROOM_STARTED" };
  if (identity.accountUserId && source.sessions.some(session => session.accountUserId === identity.accountUserId)) return { error: "ACCOUNT_ALREADY_SEATED" };
  if (identity.guestKey && source.sessions.some(session => session.guestKey === identity.guestKey)) return { error: "GUEST_ALREADY_SEATED" };
  if (source.sessions.length >= PUBLIC_CAPACITY) return { error: "ROOM_FULL" };
  if (identity.networkKey && source.sessions.filter(session => session.networkKey === identity.networkKey).length >= PUBLIC_SEATS_PER_NETWORK) return { error: "NETWORK_SEAT_LIMIT" };
  const room = structuredClone(source);
  const lobby = room.publicLobby!;
  const taken = new Set(room.sessions.map(session => session.playerId));
  const playerId = room.game.players.map(player => player.id).find(id => !taken.has(id))!;
  room.sessions.push({ playerId, tokenHash, requests: [],
    ...(identity.accountUserId ? { accountUserId: identity.accountUserId } : { guestKey: identity.guestKey }),
    ...(identity.networkKey ? { networkKey: identity.networkKey } : {}),
    seatEpoch: lobby.nextSeatEpoch++, reservedUntil: now + PUBLIC_LOBBY_TIMING.RESERVATION_MS });
  if (identity.displayName) room.game.players.find(player => player.id === playerId)!.name = identity.displayName;
  delete lobby.emptySince;
  room.readyIds = []; // Membership changed: consent must apply to the current lobby.
  room.revision++;
  return { room, playerId };
}

/**
 * The seat's owner authenticated a WebSocket. Confirms a reservation (a membership change, so READY resets) or
 * ends a reconnect grace (READY stays dropped). Returns null when nothing changes.
 */
export function confirmPublicSeat(source: RoomSnapshot, playerId: string): { room: RoomSnapshot; activity: boolean } | null {
  const seat = source.sessions.find(session => session.playerId === playerId);
  if (!isPublicLobby(source) || !seat || (seat.reservedUntil === undefined && seat.disconnectedAt === undefined)) return null;
  const room = structuredClone(source);
  const next = room.sessions.find(session => session.playerId === playerId)!;
  const activity = next.reservedUntil !== undefined;
  delete next.reservedUntil; delete next.disconnectedAt;
  if (activity) room.readyIds = [];
  room.revision++;
  return { room, activity };
}

/** The last live connection of a confirmed seat went away: READY is dropped and the grace starts. */
export function markPublicSeatDisconnected(source: RoomSnapshot, playerIds: readonly string[], now: number): RoomSnapshot | null {
  if (!isPublicLobby(source)) return null;
  const targets = source.sessions.filter(session => playerIds.includes(session.playerId) && session.reservedUntil === undefined && session.disconnectedAt === undefined);
  if (!targets.length) return null;
  const room = structuredClone(source);
  for (const target of targets) room.sessions.find(session => session.playerId === target.playerId)!.disconnectedAt = now;
  room.readyIds = room.readyIds.filter(id => !targets.some(target => target.playerId === id));
  room.revision++;
  return room;
}

function release(room: RoomSnapshot, playerId: string, reason: PublicSeatRelease, now: number): void {
  const lobby = room.publicLobby!;
  const seat = room.sessions.find(session => session.playerId === playerId)!;
  room.sessions = room.sessions.filter(session => session !== seat);
  lobby.releasedKeys = [...lobby.releasedKeys.filter(key => key.until > now), { digest: seat.tokenHash, until: now + PUBLIC_LOBBY_TIMING.RELEASED_KEY_MS, reason }];
  room.game.players.find(player => player.id === playerId)!.name = lobby.botNames[playerId]!;
  room.readyIds = [];
  if (!room.sessions.length) lobby.emptySince = now;
}

/** An explicit leave in a public lobby frees the seat; it never becomes a bot-played departure. */
export function releasePublicSeat(source: RoomSnapshot, playerId: string, now: number): RoomSnapshot {
  if (!isPublicLobby(source) || !source.sessions.some(session => session.playerId === playerId)) throw new Error("세션이 없습니다.");
  const room = structuredClone(source);
  release(room, playerId, "SEAT_RELEASED", now);
  room.revision++;
  return room;
}

/** Gives back expired reservations and seats whose reconnect grace ran out. Returns null when nothing changes. */
export function sweepPublicLobby(source: RoomSnapshot, now: number): RoomSnapshot | null {
  if (!isPublicLobby(source)) return null;
  const expired = source.sessions.filter(session => session.reservedUntil !== undefined && session.reservedUntil <= now);
  const lapsed = source.sessions.filter(session => session.disconnectedAt !== undefined && session.disconnectedAt + PUBLIC_LOBBY_TIMING.RECONNECT_GRACE_MS <= now);
  const staleKeys = source.publicLobby!.releasedKeys.some(key => key.until <= now);
  if (!expired.length && !lapsed.length && !staleKeys) return null;
  const room = structuredClone(source);
  for (const seat of expired) release(room, seat.playerId, "RESERVATION_EXPIRED", now);
  for (const seat of lapsed) release(room, seat.playerId, "SEAT_RELEASED", now);
  room.publicLobby!.releasedKeys = room.publicLobby!.releasedKeys.filter(key => key.until > now);
  room.revision++;
  return room;
}

/** Earliest moment the lobby's seats or lifetime change on their own. */
export function publicLobbyDeadline(room: RoomSnapshot): number | undefined {
  if (!isPublicLobby(room)) return undefined;
  const times = [publicLobbyClosesAt(room)!];
  for (const session of room.sessions) {
    if (session.reservedUntil !== undefined) times.push(session.reservedUntil);
    if (session.disconnectedAt !== undefined) times.push(session.disconnectedAt + PUBLIC_LOBBY_TIMING.RECONNECT_GRACE_MS);
  }
  return Math.min(...times);
}

/** Seats whose owner must hold a live connection: confirmed and not already in grace. */
export function publicSeatsAwaitingPresence(room: RoomSnapshot): string[] {
  if (!isPublicLobby(room)) return [];
  return room.sessions.filter(session => session.reservedUntil === undefined && session.disconnectedAt === undefined).map(session => session.playerId);
}
