/**
 * Guest identity for public rooms (PUBLIC-ROOMS-002 2-B). A guest gets a random id in a cookie signed by the Worker.
 * The signature only stops forged or borrowed ids: clearing the cookie makes a new guest, so it is no one-person-one-id
 * guarantee. The real limits are per room, per network and per creator (publicRoom.ts, publicLobby.ts).
 * Private rooms never read or set this cookie.
 */
const VERSION = "v1";
/** A guest keeps the same identity this long, so a retry or a second visit finds its own room again. */
export const GUEST_IDENTITY_TTL_MS = 30 * 24 * 60 * 60_000;

export type PublicGuest = { id: string; setCookie?: string };

function cookieName(url: URL): string {
  return `${url.protocol === "https:" ? "__Host-" : ""}porena_guest`;
}
async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`public-guest|${payload}`)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
/** Constant-time comparison of two hex strings of equal length. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The guest this request proves, or null when the cookie is absent, expired, malformed or not signed by us. */
export async function readPublicGuest(request: Request, secret: string, now = Date.now()): Promise<PublicGuest | null> {
  const name = cookieName(new URL(request.url));
  const values = (request.headers.get("Cookie") ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null; // Two copies cannot be told apart safely.
  const [version, id, issued, signature] = values[0]!.slice(name.length + 1).split(".");
  if (version !== VERSION || !id || !/^[a-f0-9]{32}$/.test(id) || !issued || !/^\d{1,15}$/.test(issued) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const issuedAt = Number(issued);
  if (issuedAt > now + 60_000 || now - issuedAt > GUEST_IDENTITY_TTL_MS) return null;
  return sameHex(signature, await sign(secret, `${VERSION}.${id}.${issued}`)) ? { id } : null;
}

/** A new guest and the cookie that remembers it. */
export async function issuePublicGuest(request: Request, secret: string, now = Date.now()): Promise<PublicGuest> {
  const url = new URL(request.url);
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  const value = `${VERSION}.${id}.${now}.${await sign(secret, `${VERSION}.${id}.${now}`)}`;
  const setCookie = `${cookieName(url)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(GUEST_IDENTITY_TTL_MS / 1000)}${url.protocol === "https:" ? "; Secure" : ""}`;
  return { id, setCookie };
}
