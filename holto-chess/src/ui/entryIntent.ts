import { useSyncExternalStore } from "react";
const KEY = "porena.entryIntent";
const EVENT = "porena:entry-intent";
let fallback = false;
// Visual intent only: never grants authentication or game access.
export function readEntryIntent() {
  try { const time = Number(sessionStorage.getItem(KEY)); return time > 0 && Date.now() - time < 15 * 60_000; }
  catch { return fallback; }
}
export function requestEntry() {
  fallback = true;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* Memory fallback. */ }
  window.dispatchEvent(new Event(EVENT));
}
export function clearEntryIntent() {
  fallback = false;
  try { sessionStorage.removeItem(KEY); } catch { /* Memory fallback. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}
function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify);
  return () => window.removeEventListener(EVENT, notify);
}
export function useEntryIntent() { return useSyncExternalStore(subscribe, readEntryIntent, () => false); }
export function shouldPlayEntry(canEnter: boolean, requested: boolean) { return canEnter && requested; }
