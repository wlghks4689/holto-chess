/**
 * Public rooms (phase 1). Retries of the same create/join must get the same answer, but the server keeps only token
 * digests. Every value a retry needs is therefore derived from PUBLIC_ROOM_SECRET instead of stored: the room code
 * and instance id of a create, and the seat token of a join. Without the secret none of them can be predicted.
 */
export type PublicRoomEnv = Env & {
  /** "1" exposes /api/public-rooms. Unset in production until the public lobby ships. */
  PUBLIC_ROOMS_ENABLED?: string;
  /** Worker secret for the derivations below. Rotating it ends retry recovery for requests already in flight. */
  PUBLIC_ROOM_SECRET?: string;
};

export const PUBLIC_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PUBLIC_INSTANCE_ID = /^[a-f0-9]{32}$/;
/** Up to this many derived codes are tried when another room already holds one. */
export const PUBLIC_CREATE_ATTEMPTS = 5;

export function publicRoomsEnabled(env: PublicRoomEnv): boolean {
  return env.PUBLIC_ROOMS_ENABLED === "1";
}

async function hmac(secret: string, label: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(label)));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

/** Room code and instance id of the `attempt`-th candidate of one create request. */
export async function publicCreateCandidate(secret: string, accountUserId: string, requestId: string, attempt: number): Promise<{ roomId: string; instanceId: string }> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = await hmac(secret, `public-code|${accountUserId}|${requestId}|${attempt}`);
  const instance = await hmac(secret, `public-instance|${accountUserId}|${requestId}|${attempt}`);
  return { roomId: Array.from(code.slice(0, 6), n => alphabet[n % alphabet.length]).join(""), instanceId: hex(instance.slice(0, 16)) };
}

/** Seat token of one join request (create included); 64 hex characters like every other room token. */
export async function publicSeatToken(secret: string, instanceId: string, accountUserId: string, requestId: string): Promise<string> {
  return hex(await hmac(secret, `public-seat|${instanceId}|${accountUserId}|${requestId}`));
}
