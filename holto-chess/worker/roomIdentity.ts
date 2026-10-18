import { normalizeNickname } from "../src/shared/nickname";
import type { RoomAccountIdentity } from "../src/game/room";
import type { PublicSeatIdentity } from "../src/game/publicRoom";

const USER_HEADER = "X-Internal-Porena-User-Id";
const NAME_HEADER = "X-Internal-Porena-Display-Name";

/** Only the public Worker can reach the DO; never forward a client's claimed account identity. */
export function roomForwardHeaders(source: Headers, identity?: RoomAccountIdentity): Headers {
  const headers = new Headers(source);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("x-internal-porena-") || name.toLowerCase() === "x-porena-user-id" ||
        name.toLowerCase() === "x-porena-display-name" || name.toLowerCase() === "x-porena-identity") headers.delete(name);
  }
  headers.delete("Cookie"); // Account cookies have no role in room-token reconnects.
  headers.delete("Authorization");
  if (identity) {
    headers.set(USER_HEADER, identity.accountUserId);
    headers.set(NAME_HEADER, encodeURIComponent(identity.displayName)); // Headers cannot carry raw Korean text.
  }
  return headers;
}

/** Validation is defense in depth; authentication happens before the Worker overwrites these headers. */
export function roomAccountIdentity(headers: Headers): RoomAccountIdentity | undefined {
  const accountUserId = headers.get(USER_HEADER), encodedName = headers.get(NAME_HEADER);
  if (accountUserId === null && encodedName === null) return undefined;
  if (!accountUserId || !/^[a-zA-Z0-9_-]{1,128}$/.test(accountUserId) || !encodedName) throw new Error("Invalid room identity");
  const displayName = decodeURIComponent(encodedName);
  if (normalizeNickname(displayName) !== displayName) throw new Error("Invalid room identity");
  return { accountUserId, displayName };
}

const GUEST_HEADER = "X-Internal-Porena-Guest-Key";
const GUEST_NAME_HEADER = "X-Internal-Porena-Guest-Name";
const NETWORK_HEADER = "X-Internal-Porena-Network-Key";

/**
 * Public seats only. The Worker derives these keys from a verified guest cookie and the connecting IP and adds them
 * after roomForwardHeaders has removed every client-sent internal header, so a client cannot claim them.
 */
export function publicSeatHeaders(guest?: { key: string; displayName?: string }, networkKey?: string): Record<string, string> {
  return {
    ...(guest ? { [GUEST_HEADER]: guest.key, ...(guest.displayName ? { [GUEST_NAME_HEADER]: encodeURIComponent(guest.displayName) } : {}) } : {}),
    ...(networkKey ? { [NETWORK_HEADER]: networkKey } : {}),
  };
}

/** Account first (Worker-verified session), then a Worker-verified guest. Undefined when neither came with the request. */
export function publicSeatIdentity(headers: Headers): PublicSeatIdentity | undefined {
  const networkKey = headers.get(NETWORK_HEADER) ?? undefined;
  if (networkKey !== undefined && !/^[a-f0-9]{64}$/.test(networkKey)) throw new Error("Invalid room identity");
  const account = roomAccountIdentity(headers);
  if (account) return { ...account, ...(networkKey ? { networkKey } : {}) };
  const guestKey = headers.get(GUEST_HEADER);
  if (guestKey === null) return undefined;
  if (!/^[a-f0-9]{64}$/.test(guestKey)) throw new Error("Invalid room identity");
  const encodedName = headers.get(GUEST_NAME_HEADER);
  const displayName = encodedName === null ? undefined : decodeURIComponent(encodedName);
  if (displayName !== undefined && normalizeNickname(displayName) !== displayName) throw new Error("Invalid room identity");
  return { guestKey, ...(displayName ? { displayName } : {}), ...(networkKey ? { networkKey } : {}) };
}

/** The identity part of a public seat token, so an account and a guest can never derive the same token. */
export function publicSeatOwner(identity: PublicSeatIdentity): string {
  return identity.accountUserId ?? `guest:${identity.guestKey}`;
}
