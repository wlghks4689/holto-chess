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
/** Closed rows stay this long so a late retry of a create still finds its answer instead of making a new room. */
export const TERMINAL_RETENTION_MS = 24 * 60 * 60_000;
/** Derived room codes tried for one create request. */
export const CODE_ATTEMPTS = 5;
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
};
export type ClaimResult =
  | { kind: "claimed"; row: RegistryRow }
  /** This creator already made a room with this request id. It may be closed: the caller must not create another. */
  | { kind: "existing"; row: RegistryRow }
  | { kind: "capacity" }
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
      `INSERT INTO public_rooms (instance_id, room_code, creator_key, request_id, state, slot_held, rules_version, protocol_version, language, region_hint,
         created_at, observed_at, lease_expires_at, room_expires_at, repair_due_at)
       SELECT ?1, ?2, ?3, ?4, 'PROVISIONING', 1, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12
       WHERE (SELECT COUNT(*) FROM public_rooms WHERE slot_held = 1) < ?13
         AND NOT EXISTS (SELECT 1 FROM public_rooms WHERE slot_held = 1 AND room_code = ?2)
         AND NOT EXISTS (SELECT 1 FROM public_rooms WHERE creator_key = ?3 AND request_id = ?4)`,
    ).bind(input.instanceId, input.roomCode, input.creatorKey, input.requestId, input.rulesVersion, input.protocolVersion, input.language ?? null, input.regionHint ?? null,
      now, now + LISTING_LEASE_MS, now + PUBLIC_LOBBY_TIMING.MAX_WAIT_MS, now + PROVISIONING_TIMEOUT_MS, input.cap).run();
    if (result.meta.changes === 1) return { kind: "claimed", row: (await findByInstance(db, input.instanceId))! };
  } catch (error) {
    // A concurrent claim won a unique index between the guards and the write. Classify it below like any refusal.
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  const raced = await findByRequest(db, input.creatorKey, input.requestId);
  if (raced) return { kind: "existing", row: raced };
  const holder = await db.prepare("SELECT 1 AS held FROM public_rooms WHERE slot_held = 1 AND room_code = ?").bind(input.roomCode).first();
  return holder ? { kind: "code_taken" } : { kind: "capacity" };
}

/** A DO created at another code than the claimed one (a private room held it): move the claim to the next candidate. */
export async function moveClaimToCode(db: D1Database, instanceId: string, roomCode: string): Promise<"moved" | "code_taken" | "gone"> {
  try {
    const result = await db.prepare("UPDATE public_rooms SET room_code = ? WHERE instance_id = ? AND state = 'PROVISIONING' AND slot_held = 1").bind(roomCode, instanceId).run();
    return result.meta.changes === 1 ? "moved" : "gone";
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) return "code_taken";
    throw error;
  }
}

/** Ends a room's life in the registry and gives its slot back. Repeating it is harmless. */
export async function releasePublicSlot(db: D1Database, instanceId: string, state: TerminalState, now: number): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE public_rooms SET state = ?, slot_held = 0, closed_at = ?, repair_due_at = NULL WHERE instance_id = ? AND slot_held = 1",
  ).bind(state, now, instanceId).run();
  return result.meta.changes === 1;
}
