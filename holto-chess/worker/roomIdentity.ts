import { normalizeNickname } from "../src/shared/nickname";
import type { RoomAccountIdentity } from "../src/game/room";

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
