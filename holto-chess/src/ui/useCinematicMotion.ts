import { useState, useSyncExternalStore } from "react";

const KEY = "porena.cinematic-motion";
const query = "(prefers-reduced-motion: reduce)";
const getReduced = () => typeof matchMedia === "function" && matchMedia(query).matches;
function subscribe(notify: () => void) {
  const media = matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

/** Respect the OS by default; an explicit choice applies only to this game's cinematics. */
export function useCinematicMotion() {
  const reduced = useSyncExternalStore(subscribe, getReduced, () => false);
  const [enabled, setEnabled] = useState(() => {
    try { return sessionStorage.getItem(KEY) === "enabled"; } catch { return false; }
  });
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try { sessionStorage.setItem(KEY, next ? "enabled" : "system"); } catch { /* Storage is optional. */ }
  };
  return { reduced, enabled, toggle };
}
