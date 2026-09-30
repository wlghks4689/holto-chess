// Admin credentials and sessions. Uses only Web Crypto so tools/admin/setup-admin.mjs can import it from Node too.
// Stored password format: pbkdf2-sha256$<iterations>$<salt base64url>$<hash base64url>.
// Sessions are stateless signed cookies: <expiry ms base36>.<username base64url>.<HMAC-SHA256 base64url>.

/** The PBKDF2 ceiling the Workers runtime accepts. */
export const ADMIN_PBKDF2_ITERATIONS = 100_000;
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromBase64Url(value: string): Uint8Array | null {
  // Cookies arrive from the client, so malformed input must come back as null rather than throw.
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try { return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)); } catch { return null; }
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashAdminPassword(password: string, iterations = ADMIN_PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, saltText, hashText] = stored.split("$");
  const iterations = Number(rounds);
  const salt = fromBase64Url(saltText ?? "");
  const expected = fromBase64Url(hashText ?? "");
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || iterations > ADMIN_PBKDF2_ITERATIONS || !salt || !expected) return false;
  return sameBytes(await pbkdf2(password, salt, iterations), expected);
}

/** Compares without leaking where the strings differ. */
export const sameText = (a: string, b: string) => sameBytes(encoder.encode(a), encoder.encode(b));

const hmacKey = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signAdminSession(secret: string, username: string, now = Date.now()): Promise<string> {
  const payload = `${(now + ADMIN_SESSION_TTL_MS).toString(36)}.${toBase64Url(encoder.encode(username))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the signed-in username, or null for a missing, forged or expired session. */
export async function readAdminSession(secret: string, token: string, now = Date.now()): Promise<string | null> {
  const [expiry, user, signatureText] = token.split(".");
  const signature = fromBase64Url(signatureText ?? "");
  const userBytes = fromBase64Url(user ?? "");
  if (!expiry || !user || !signature || !userBytes) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signature as BufferSource, encoder.encode(`${expiry}.${user}`));
  if (!valid || parseInt(expiry, 36) <= now) return null;
  return new TextDecoder().decode(userBytes);
}
