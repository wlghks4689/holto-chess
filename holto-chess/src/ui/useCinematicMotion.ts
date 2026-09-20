import { useSyncExternalStore } from "react";

const KEY = "porena.cinematic-motion";
const CHANGE = "porena:cinematic-motion";
let fallback = true;
function getEnabled() {
  try { return localStorage.getItem(KEY) !== "disabled"; } catch { return fallback; }
}
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE, notify);
  };
}

export function setCinematicMotion(enabled: boolean) {
  fallback = enabled;
  try { localStorage.setItem(KEY, enabled ? "enabled" : "disabled"); } catch { /* Keep the choice in memory if storage is blocked. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE));
}

/** Game preference, enabled by default. Does not change the OS motion setting. */
export function useCinematicMotion() {
  const enabled = useSyncExternalStore(subscribe, getEnabled, getEnabled);
  return { enabled, setEnabled: setCinematicMotion };
}
