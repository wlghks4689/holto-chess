import { useEffect, useState } from "react";
import type { Round } from "../game/types";

const AUTO_KEY = "porena.round-guide-auto";
const SEEN_KEY = "porena.round-guide-seen";
const CHANGE_EVENT = "porena:round-guide-preferences";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let fallbackAuto = true;
let fallbackSeen: Round[] = [];

function browserStorage(): StorageLike | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch { return null; }
}

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readAutoRoundGuides(storage = browserStorage()): boolean {
  try {
    if (!storage) return fallbackAuto;
    const value = storage?.getItem(AUTO_KEY);
    return value === null || value === undefined ? true : value !== "disabled";
  } catch { return fallbackAuto; }
}

export function readSeenRoundGuides(storage = browserStorage()): Round[] {
  try {
    if (!storage) return [...fallbackSeen];
    const value = storage?.getItem(SEEN_KEY);
    if (value === null || value === undefined) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((round): round is Round => [1, 2, 3, 4, 5].includes(round)))].sort() : [];
  } catch { return [...fallbackSeen]; }
}

export function setAutoRoundGuides(enabled: boolean, storage = browserStorage()) {
  try {
    if (!storage) fallbackAuto = enabled;
    else storage.setItem(AUTO_KEY, enabled ? "enabled" : "disabled");
  } catch { fallbackAuto = enabled; /* Preserve the in-memory preference when storage is blocked. */ }
  notifyChanged();
}

export function markRoundGuideSeen(round: Round, storage = browserStorage()) {
  const seen = [...new Set([...readSeenRoundGuides(storage), round])].sort();
  try {
    if (!storage) fallbackSeen = seen;
    else storage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { fallbackSeen = seen; /* Preserve the in-memory record when storage is blocked. */ }
  notifyChanged();
}

export function resetSeenRoundGuides(storage = browserStorage()) {
  try {
    if (!storage) fallbackSeen = [];
    else storage.removeItem(SEEN_KEY);
  } catch { fallbackSeen = []; /* The in-memory history is reset even when storage is blocked. */ }
  notifyChanged();
}

export function shouldAutoShowRoundGuide(enabled: boolean, seenRounds: readonly Round[], round: Round): boolean {
  return enabled && !seenRounds.includes(round);
}

export function useRoundGuidePreferences() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((revision) => revision + 1);
    const updateStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === AUTO_KEY || event.key === SEEN_KEY) update();
    };
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", updateStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", updateStorage);
    };
  }, []);
  return { autoEnabled: readAutoRoundGuides(), seenRounds: readSeenRoundGuides() };
}
