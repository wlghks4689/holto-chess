import { afterEach, expect, it, vi } from "vitest";
import { clearEntryIntent, readEntryIntent, requestEntry, shouldPlayEntry } from "./entryIntent";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("requires both a deliberate entry and completed account/guest verification", () => {
  expect(shouldPlayEntry(false, true)).toBe(false); // Google click / incomplete profile.
  expect(shouldPlayEntry(true, false)).toBe(false); // Returning valid session.
  expect(shouldPlayEntry(true, true)).toBe(true); // Successful new entry.
});
it("survives an OAuth redirect, clears on completion/failure, and expires old intent", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
  requestEntry(); expect(readEntryIntent()).toBe(true);
  vi.advanceTimersByTime(15 * 60_000); expect(readEntryIntent()).toBe(false);
  requestEntry(); clearEntryIntent(); expect(readEntryIntent()).toBe(false);
});
