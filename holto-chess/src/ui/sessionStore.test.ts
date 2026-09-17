import { beforeEach, describe, expect, it } from "vitest";
import { activeSession, forgetSession, rememberSession, storedSessions, ACTIVE_ROOM_KEY, LEGACY_SESSION_KEY, SESSION_KEY } from "./sessionStore";
import type { SessionCredential } from "../shared/protocol";

const cred = (roomId: string, playerId = "p1"): SessionCredential => ({ roomId, playerId, token: "a".repeat(64) });

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });
});

describe("session store", () => {
  it("binds the active room to this tab, not the browser", () => {
    rememberSession(cred("ABCDEF"));
    expect(activeSession()?.roomId).toBe("ABCDEF");

    // A second tab shares localStorage but has its own sessionStorage, so it must
    // land in the lobby instead of taking over the seat.
    Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });
    expect(activeSession()).toBeNull();
    expect(storedSessions().map((s) => s.roomId)).toEqual(["ABCDEF"]);
  });

  it("lets a fresh tab resume a stored room explicitly", () => {
    rememberSession(cred("ABCDEF"));
    Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });
    const stored = storedSessions()[0]!;
    rememberSession(stored);
    expect(activeSession()?.roomId).toBe("ABCDEF");
  });

  it("keeps several rooms, newest first, and caps the list", () => {
    for (const id of ["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD", "EEEEEE"]) rememberSession(cred(id));
    expect(storedSessions().map((s) => s.roomId)).toEqual(["EEEEEE", "DDDDDD", "CCCCCC", "BBBBBB"]);
  });

  it("re-remembering a room moves it to the front without duplicating", () => {
    rememberSession(cred("AAAAAA"));
    rememberSession(cred("BBBBBB"));
    rememberSession(cred("AAAAAA"));
    expect(storedSessions().map((s) => s.roomId)).toEqual(["AAAAAA", "BBBBBB"]);
  });

  it("forgetting one room leaves the others and clears only this tab", () => {
    rememberSession(cred("AAAAAA"));
    rememberSession(cred("BBBBBB"));
    forgetSession("BBBBBB");
    expect(storedSessions().map((s) => s.roomId)).toEqual(["AAAAAA"]);
    expect(activeSession()).toBeNull();
  });

  it("migrates the old single-session key once and persists it", () => {
    localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(cred("ZZZZZZ")));
    expect(storedSessions().map((s) => s.roomId)).toEqual(["ZZZZZZ"]);
    expect(localStorage.getItem(LEGACY_SESSION_KEY)).toBeNull();
    // The second read has no legacy key left, so the seat must already be stored.
    expect(storedSessions().map((s) => s.roomId)).toEqual(["ZZZZZZ"]);
  });

  it("ignores corrupt or malformed entries instead of throwing", () => {
    localStorage.setItem(SESSION_KEY, "{not json");
    expect(storedSessions()).toEqual([]);
    localStorage.setItem(SESSION_KEY, JSON.stringify([{ roomId: "nope", token: "short" }, cred("ABCDEF")]));
    expect(storedSessions().map((s) => s.roomId)).toEqual(["ABCDEF"]);
  });

  it("survives storage that throws, as private browsing does", () => {
    const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); }, clear() {}, key: () => null, length: 0 } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", { value: throwing, configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: throwing, configurable: true });
    expect(() => rememberSession(cred("ABCDEF"))).not.toThrow();
    expect(storedSessions()).toEqual([]);
    expect(activeSession()).toBeNull();
    expect(() => forgetSession("ABCDEF")).not.toThrow();
  });

  it("does not resume a room whose credential was removed", () => {
    rememberSession(cred("ABCDEF"));
    localStorage.setItem(SESSION_KEY, JSON.stringify([]));
    expect(sessionStorage.getItem(ACTIVE_ROOM_KEY)).toBe("ABCDEF");
    expect(activeSession()).toBeNull();
  });
});
