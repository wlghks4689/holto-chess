export type AccountUser = { id: string; displayName: string | null };
export type AccountSnapshot = { status: "loading" | "anonymous" | "authenticated" | "unavailable"; user: AccountUser | null };
export const GUEST_CHOICE_KEY = "porena.guestChoice";

export function parseAccountSnapshot(value: unknown): AccountSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid account response");
  const data = value as { authenticated?: unknown; user?: unknown };
  if (data.authenticated === false) return { status: "anonymous", user: null };
  const user = data.user as Partial<AccountUser> | undefined;
  if (data.authenticated !== true || !user || typeof user.id !== "string" || !user.id || (user.displayName !== null && typeof user.displayName !== "string")) throw new Error("Invalid account response");
  return { status: "authenticated", user: { id: user.id, displayName: user.displayName } };
}

export function canEnterHome(snapshot: AccountSnapshot, guestChosen: boolean) {
  return snapshot.status === "authenticated" ? !!snapshot.user?.displayName : snapshot.status !== "loading" && guestChosen;
}

export function newRoomIdentity(expected: AccountSnapshot, guestChosen: boolean, current: AccountSnapshot) {
  if (current.status === "unavailable" || current.status === "loading") throw new Error("client.accountUnavailable");
  if (expected.status === "authenticated" && expected.user) {
    if (current.status !== "authenticated" || current.user?.id !== expected.user.id) throw new Error("client.accountExpired");
    if (!current.user?.displayName) throw new Error("client.profileRequired");
    return { kind: "account" as const, user: current.user };
  }
  if (current.status === "authenticated") throw new Error("client.accountChanged");
  if (!guestChosen) throw new Error("client.accountExpired");
  return { kind: "guest" as const };
}

export async function fetchAccount(signal?: AbortSignal): Promise<AccountSnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("client.accountUnavailable");
    return parseAccountSnapshot(await response.json());
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}

export async function resolveNewRoomIdentity(expected: AccountSnapshot, guestChosen: boolean, embedded: boolean, fetchCurrent = fetchAccount) {
  // Embedded platforms deliberately do not use first-party Google auth endpoints.
  // Their explicit guest choice still goes through the normal room API security checks.
  if (embedded) {
    if (!guestChosen || expected.status === "authenticated") throw new Error("client.accountExpired");
    return { kind: "guest" as const };
  }
  let current: AccountSnapshot;
  try { current = await fetchCurrent(); } catch { throw new Error("client.accountUnavailable"); }
  return newRoomIdentity(expected, guestChosen, current);
}

// Only an explicit guest choice is persisted. Account identities stay in memory.
export function readGuestChoice(): boolean {
  try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(GUEST_CHOICE_KEY) === "1"; } catch { return false; }
}
export function storeGuestChoice(chosen: boolean) {
  try { if (chosen) sessionStorage.setItem(GUEST_CHOICE_KEY, "1"); else sessionStorage.removeItem(GUEST_CHOICE_KEY); } catch { /* In-memory choice still works when storage is disabled. */ }
}
