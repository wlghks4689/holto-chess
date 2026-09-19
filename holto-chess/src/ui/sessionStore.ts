import type { SessionCredential } from "../shared/protocol";

export const LEGACY_SESSION_KEY = "porena-room-session-v1";
export const SESSION_KEY = "porena-room-sessions-v2";
/** Which room THIS tab is playing. Per-tab, so a second tab never steals the seat. */
export const ACTIVE_ROOM_KEY = "porena-active-room";
const MAX_REMEMBERED = 4;

const isCredential = (value: unknown): value is SessionCredential =>
  !!value && typeof value === "object"
  && /^[A-Z2-9]{6}$/.test((value as SessionCredential).roomId ?? "")
  && /^[a-f0-9]{64}$/.test((value as SessionCredential).token ?? "");

// Private browsing can make either store throw on access, so every call is guarded.
function readLocal(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeLocal(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
function dropLocal(key: string): void { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }

/** Credentials are shared by the whole browser; the active room is per tab. */
export function storedSessions(): SessionCredential[] {
  const out: SessionCredential[] = [];
  try {
    const parsed: unknown = JSON.parse(readLocal(SESSION_KEY) ?? "[]");
    if (Array.isArray(parsed)) out.push(...parsed.filter(isCredential));
  } catch { /* corrupt storage reads as empty */ }
  try {
    // One-time migration from the single-session layout. The merged list must be
    // persisted here, or dropping the legacy key would lose the seat outright.
    const legacyRaw = readLocal(LEGACY_SESSION_KEY);
    if (legacyRaw) {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (isCredential(legacy) && !out.some((s) => s.roomId === legacy.roomId)) {
        out.unshift(legacy);
        writeLocal(SESSION_KEY, JSON.stringify(out.slice(0, MAX_REMEMBERED)));
      }
      dropLocal(LEGACY_SESSION_KEY);
    }
  } catch { dropLocal(LEGACY_SESSION_KEY); }
  return out;
}

export function rememberSession(session: SessionCredential): void {
  const next = [session, ...storedSessions().filter((s) => s.roomId !== session.roomId)].slice(0, MAX_REMEMBERED);
  writeLocal(SESSION_KEY, JSON.stringify(next));
  try { sessionStorage.setItem(ACTIVE_ROOM_KEY, session.roomId); } catch { /* storage unavailable */ }
}

export function forgetSession(roomId: string): void {
  writeLocal(SESSION_KEY, JSON.stringify(storedSessions().filter((s) => s.roomId !== roomId)));
  try { sessionStorage.removeItem(ACTIVE_ROOM_KEY); } catch { /* storage unavailable */ }
}

/** Only auto-connect to the room this tab already had open, so tabs never collide. */
export function activeSession(): SessionCredential | null {
  let active: string | null = null;
  try { active = sessionStorage.getItem(ACTIVE_ROOM_KEY); } catch { return null; }
  if (!active) return null;
  return storedSessions().find((s) => s.roomId === active) ?? null;
}
