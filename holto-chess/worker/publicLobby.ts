import { PUBLIC_LOBBY_TIMING } from "../src/game/publicRoom";

/**
 * Registry of public rooms in PUBLIC_LOBBY_DB (PUBLIC-ROOMS-002). It owns two promises the room itself cannot make:
 * the number of live public rooms never passes the cap, and one create request maps to one room for good.
 * Seats and the game stay in GameRoom; this module never reads or writes them.
 */
/** Live public rooms, in-progress ones included. */
export const PUBLIC_ROOMS_MAX = 100;
/** A room that is not WAITING within this long after its slot was claimed is cancelled by Cron. */
export const PROVISIONING_TIMEOUT_MS = 2 * 60_000;
/**
 * Closed rows stay this long so a late retry of a create still finds its answer instead of making a new room. A create
 * request id carries its own time and is refused after CREATE_REQUEST_MAX_AGE_MS (publicRoomKeys.ts), so no valid retry
 * can outlive its row. Keep this longer than that age plus the allowed clock skew.
 */
export const TERMINAL_RETENTION_MS = 48 * 60 * 60_000;
/** Derived room codes tried for one create request. */
export const CODE_ATTEMPTS = 5;
/** One network (IP) may create this many public rooms per NETWORK_CREATE_WINDOW_MS, whoever it says it is. */
export const NETWORK_CREATES_PER_WINDOW = 5;
export const NETWORK_CREATE_WINDOW_MS = 10 * 60_000;
/** A summary is listable for this long after the room observed it; the room renews it every 30 seconds. */
export const LISTING_LEASE_MS = 90_000;

export type RegistryState = "PROVISIONING" | "WAITING" | "PLAYING" | "FINISHED" | "CLOSED" | "CANCELLED";
export type TerminalState = "FINISHED" | "CLOSED" | "CANCELLED";
export const TERMINAL_STATES: readonly RegistryState[] = ["FINISHED", "CLOSED", "CANCELLED"];

export type RegistryRow = {
  instanceId: string; roomCode: string; state: RegistryState; slotHeld: boolean;
  confirmedCount: number; reservedCount: number; capacity: number; summarySeq: number;
  rulesVersion: number; protocolVersion: number; language: string | null; regionHint: string | null;
  createdAt: number; observedAt: number; leaseExpiresAt: number; roomExpiresAt: number; repairDueAt: number | null; closedAt: number | null;
};
type RawRow = {
  instance_id: string; room_code: string; state: RegistryState; slot_held: number; confirmed_count: number; reserved_count: number;
  capacity: number; summary_seq: number; rules_version: number; protocol_version: number; language: string | null; region_hint: string | null;
  created_at: number; observed_at: number; lease_expires_at: number; room_expires_at: number; repair_due_at: number | null; closed_at: number | null;
};
const COLUMNS = "instance_id, room_code, state, slot_held, confirmed_count, reserved_count, capacity, summary_seq, rules_version, protocol_version, language, region_hint, created_at, observed_at, lease_expires_at, room_expires_at, repair_due_at, closed_at";
const toRow = (r: RawRow): RegistryRow => ({
  instanceId: r.instance_id, roomCode: r.room_code, state: r.state, slotHeld: r.slot_held === 1,
  confirmedCount: r.confirmed_count, reservedCount: r.reserved_count, capacity: r.capacity, summarySeq: r.summary_seq,
  rulesVersion: r.rules_version, protocolVersion: r.protocol_version, language: r.language, regionHint: r.region_hint,
  createdAt: r.created_at, observedAt: r.observed_at, leaseExpiresAt: r.lease_expires_at, roomExpiresAt: r.room_expires_at,
  repairDueAt: r.repair_due_at, closedAt: r.closed_at,
});

export type ClaimInput = {
  instanceId: string; roomCode: string; creatorKey: string; requestId: string; now: number; cap: number;
  rulesVersion: number; protocolVersion: number; language?: string; regionHint?: string;
  /** Derived key of the creating network; enables the per-network create limit. */
  networkKey?: string;
};
export type ClaimResult =
  | { kind: "claimed"; row: RegistryRow }
  /** This creator already made a room with this request id. It may be closed: the caller must not create another. */
  | { kind: "existing"; row: RegistryRow }
  | { kind: "capacity" }
  /** This creator already has a live public room (one at a time, accounts and guests alike). */
  | { kind: "creator_busy" }
  /** The creating network made too many rooms recently. */
  | { kind: "network_rate" }
  /** Another live room holds the code; try the next derived code. */
  | { kind: "code_taken" };

export async function findByRequest(db: D1Database, creatorKey: string, requestId: string): Promise<RegistryRow | null> {
  const raw = await db.prepare(`SELECT ${COLUMNS} FROM public_rooms WHERE creator_key = ? AND request_id = ?`).bind(creatorKey, requestId).first<RawRow>();
  return raw ? toRow(raw) : null;
}
export async function findByInstance(db: D1Database, instanceId: string): Promise<RegistryRow | null> {
  const raw = await db.prepare(`SELECT ${COLUMNS} FROM public_rooms WHERE instance_id = ?`).bind(instanceId).first<RawRow>();
  return raw ? toRow(raw) : null;
}
export async function countLiveRooms(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM public_rooms WHERE slot_held = 1").first<{ n: number }>())?.n ?? 0;
}

/**
 * Takes one of the `cap` slots for a new room. The whole decision is a single INSERT ... SELECT, which D1 runs as one
 * statement, so concurrent creators cannot jointly pass the cap. The unique indexes stay as a second wall.
 */
export async function claimPublicSlot(db: D1Database, input: ClaimInput): Promise<ClaimResult> {
  const { now } = input;
  const existing = await findByRequest(db, input.creatorKey, input.requestId);
  if (existing) return { kind: "existing", row: existing };
  try {
    const result = await db.prepare(
      `INSERT INTO public_rooms (instance_id, room_code, creator_key, request_id, network_key, state, slot_held, rules_version, protocol_version, language, region_hint,
         created_at, observed_at, lease_expires_at, room_expires_at, repair_due_at)
       SELECT ?1, ?2, ?3, ?4, ?14, 'PROVISIONING', 1, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12
       WHERE (SELECT COUNT(*) FROM public_rooms WHERE slot_held = 1) < ?13
         AND NOT EXISTS (SELECT 1 FROM public_rooms WHERE slot_held = 1 AND room_code = ?2)
         AND NOT EXISTS (SELECT 1 FROM public_rooms WHERE creator_key = ?3 AND request_id = ?4)
         AND NOT EXISTS (SELECT 1 FROM public_rooms WHERE slot_held = 1 AND creator_key = ?3)
         AND (?14 IS NULL OR (SELECT COUNT(*) FROM public_rooms WHERE network_key = ?14 AND created_at > ?9 - ?15) < ?16)`,
    ).bind(input.instanceId, input.roomCode, input.creatorKey, input.requestId, input.rulesVersion, input.protocolVersion, input.language ?? null, input.regionHint ?? null,
      now, now + LISTING_LEASE_MS, now + PUBLIC_LOBBY_TIMING.MAX_WAIT_MS, now + PROVISIONING_TIMEOUT_MS, input.cap,
      input.networkKey ?? null, NETWORK_CREATE_WINDOW_MS, NETWORK_CREATES_PER_WINDOW).run();
    if (result.meta.changes === 1) return { kind: "claimed", row: (await findByInstance(db, input.instanceId))! };
  } catch (error) {
    // A concurrent claim won a unique index between the guards and the write. Classify it below like any refusal.
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  const raced = await findByRequest(db, input.creatorKey, input.requestId);
  if (raced) return { kind: "existing", row: raced };
  if (await db.prepare("SELECT 1 AS live FROM public_rooms WHERE slot_held = 1 AND creator_key = ?").bind(input.creatorKey).first()) return { kind: "creator_busy" };
  if (input.networkKey) {
    const recent = (await db.prepare("SELECT COUNT(*) AS n FROM public_rooms WHERE network_key = ? AND created_at > ?").bind(input.networkKey, now - NETWORK_CREATE_WINDOW_MS).first<{ n: number }>())?.n ?? 0;
    if (recent >= NETWORK_CREATES_PER_WINDOW) return { kind: "network_rate" };
  }
  const holder = await db.prepare("SELECT 1 AS held FROM public_rooms WHERE slot_held = 1 AND room_code = ?").bind(input.roomCode).first();
  return holder ? { kind: "code_taken" } : { kind: "capacity" };
}

/**
 * A private room (not in the registry) holds the claimed code: move the claim to another candidate. Only from the code
 * the caller saw, and only before any room was created for it (summary_seq 0), so two retries cannot move one claim
 * apart and a created room can never be moved away from.
 */
export async function moveClaimToCode(db: D1Database, instanceId: string, fromCode: string, roomCode: string): Promise<"moved" | "code_taken" | "gone"> {
  try {
    const result = await db.prepare(
      "UPDATE public_rooms SET room_code = ? WHERE instance_id = ? AND room_code = ? AND state = 'PROVISIONING' AND slot_held = 1 AND summary_seq = 0",
    ).bind(roomCode, instanceId, fromCode).run();
    return result.meta.changes === 1 ? "moved" : "gone";
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) return "code_taken";
    throw error;
  }
}

/**
 * The one moment a public room may come into existence. The room calls this before it creates itself: it succeeds once,
 * for a live claim still being provisioned at exactly this code, by moving summary_seq from 0 to 1 in one statement.
 * Everything that could otherwise make a second room is refused here: a retry that lost the race, a claim that moved to
 * another code ("moved"), a create Cron cancelled, or a room that existed and was deleted ("closed").
 */
export async function fenceRoomCreation(db: D1Database, instanceId: string, roomCode: string): Promise<"won" | "moved" | "closed"> {
  const won = await db.prepare(
    "UPDATE public_rooms SET summary_seq = 1 WHERE instance_id = ? AND room_code = ? AND state = 'PROVISIONING' AND slot_held = 1 AND summary_seq = 0",
  ).bind(instanceId, roomCode).run();
  if (won.meta.changes === 1) return "won";
  const row = await db.prepare("SELECT room_code, state, slot_held, summary_seq FROM public_rooms WHERE instance_id = ?").bind(instanceId)
    .first<{ room_code: string; state: string; slot_held: number; summary_seq: number }>();
  return row && row.slot_held === 1 && row.state === "PROVISIONING" && row.summary_seq === 0 && row.room_code !== roomCode ? "moved" : "closed";
}

/** Ends a room's life in the registry and gives its slot back. Repeating it is harmless. */
export async function releasePublicSlot(db: D1Database, instanceId: string, state: TerminalState, now: number): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE public_rooms SET state = ?, slot_held = 0, closed_at = ?, repair_due_at = NULL WHERE instance_id = ? AND slot_held = 1",
  ).bind(state, now, instanceId).run();
  return result.meta.changes === 1;
}

/** WAITING rooms renew their listing this often; the lease outlives three renewals. */
export const LEASE_RENEW_MS = 30_000;
/** Cron asks a waiting room about itself this long after its lease ran out without renewal. */
export const REPAIR_GRACE_MS = 30_000;
/** Cron asks a playing room about itself this often, so a stalled room cannot hold a slot for a whole day. */
export const PLAYING_REPAIR_MS = 30 * 60_000;
/** Bound on one registry write from inside a room; a slow database must not hold the game up for long. */
export const SYNC_TIMEOUT_MS = 3_000;

export type SummaryState = "WAITING" | "PLAYING" | "FINISHED" | "CLOSED";
/** Everything the registry learns about a room. No card, ruling, name or identity. */
export type PublicSummary = {
  instanceId: string; state: SummaryState; confirmedCount: number; reservedCount: number; seq: number;
  observedAt: number; leaseExpiresAt: number; roomExpiresAt: number; repairDueAt: number | null;
};
type SummarySource = {
  status: "LOBBY" | "PLAYING"; game: { phase: string }; sessions: { reservedUntil?: number }[]; publicLobby?: { instanceId: string };
};

/** How the registry should see the room right now. A finished game no longer holds a public slot. */
export function summaryState(room: SummarySource): Exclude<SummaryState, "CLOSED"> {
  if (room.status === "LOBBY") return "WAITING";
  return room.game.phase === "GAME_RESULT" ? "FINISHED" : "PLAYING";
}
/** The part of a summary whose change must reach the registry at once (not just at the next lease renewal). */
export function summaryKey(room: SummarySource): string {
  const reserved = room.sessions.filter(session => session.reservedUntil !== undefined).length;
  return `${summaryState(room)}|${room.sessions.length - reserved}|${reserved}`;
}
export function buildSummary(room: SummarySource, seq: number, now: number, roomExpiresAt: number, state: SummaryState = summaryState(room)): PublicSummary {
  const reserved = room.sessions.filter(session => session.reservedUntil !== undefined).length;
  const terminal = state === "FINISHED" || state === "CLOSED";
  return {
    instanceId: room.publicLobby!.instanceId, state, confirmedCount: room.sessions.length - reserved, reservedCount: reserved, seq,
    observedAt: now, leaseExpiresAt: now + LISTING_LEASE_MS, roomExpiresAt,
    repairDueAt: terminal ? null : state === "WAITING" ? now + LISTING_LEASE_MS + REPAIR_GRACE_MS : now + PLAYING_REPAIR_MS,
  };
}

/**
 * Applies a room's summary only if it is newer than what the registry holds and the room has not ended there.
 * A repeat of an applied summary changes nothing and counts as delivered; an ended room is never revived.
 * FINISHED and CLOSED give the slot back.
 */
export async function applySummary(db: D1Database, s: PublicSummary): Promise<"applied" | "ignored"> {
  const result = await db.prepare(
    `UPDATE public_rooms SET state = ?2, confirmed_count = ?3, reserved_count = ?4, summary_seq = ?5, observed_at = ?6,
       lease_expires_at = ?7, room_expires_at = ?8, repair_due_at = ?9,
       slot_held = CASE WHEN ?2 IN ('FINISHED', 'CLOSED') THEN 0 ELSE slot_held END,
       closed_at = CASE WHEN ?2 IN ('FINISHED', 'CLOSED') THEN ?6 ELSE closed_at END
     WHERE instance_id = ?1 AND summary_seq < ?5 AND state NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')`,
  ).bind(s.instanceId, s.state, s.confirmedCount, s.reservedCount, s.seq, s.observedAt, s.leaseExpiresAt, s.roomExpiresAt, s.repairDueAt).run();
  return result.meta.changes === 1 ? "applied" : "ignored";
}

/** Retry delay after a failed registry write: 1s doubling to 30s, plus a little jitter so rooms do not retry in step. */
export function syncRetryDelay(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts - 1), 30_000) + Math.floor(Math.random() * 250);
}

/** Runs `work` with a time limit and clears the timer either way, so a finished write leaves nothing pending. */
export async function withTimeout<T>(work: Promise<T>, ms: number, label = "registry timeout"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
