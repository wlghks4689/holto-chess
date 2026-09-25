import { useSyncExternalStore } from "react";
import { CATEGORY_RANK, type HandCategory } from "../core/poker/evaluate";
import type { RevealedHand } from "../shared/protocol";

export type MadeSoundId = "straight" | "flush" | "full-house" | "quads" | "straight-flush" | "royal-flush";
export const MADE_SOUND_TRACKS: readonly { id: MadeSoundId; label: string; files: readonly string[] }[] = [
  { id: "straight", label: "스트레이트", files: ["made_straight.wav"] },
  { id: "flush", label: "플러시", files: ["made_flush.wav"] },
  { id: "full-house", label: "풀하우스", files: ["made_full_house.wav"] },
  { id: "quads", label: "포카드", files: ["made_quads.wav"] },
  { id: "straight-flush", label: "스트레이트 플러시 · core + tail", files: ["made_straight_flush_core.wav", "made_straight_flush_tail.wav"] },
  { id: "royal-flush", label: "로열 플러시", files: ["made_royal_flush.wav"] },
];

const PREFERENCES_KEY = "porena.made-sound-preferences";
const CHANGE_EVENT = "porena:made-sound-preferences";
export type MadeSoundPreferences = { enabled: boolean; volume: number };
const DEFAULT_PREFERENCES: MadeSoundPreferences = { enabled: true, volume: 0.48 };
let fallbackPreferences = DEFAULT_PREFERENCES;
let cachedPreferences = DEFAULT_PREFERENCES;
let preferencesInitialized = false;

function loadStoredPreferences(): MadeSoundPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null") as Partial<MadeSoundPreferences> | null;
    if (value && typeof value.enabled === "boolean" && typeof value.volume === "number" && Number.isFinite(value.volume)) {
      return { enabled: value.enabled, volume: Math.max(0, Math.min(1, value.volume)) };
    }
  } catch { /* Storage may be unavailable or contain stale data. */ }
  return fallbackPreferences;
}

export function readMadeSoundPreferences(): MadeSoundPreferences {
  if (!preferencesInitialized) { cachedPreferences = loadStoredPreferences(); preferencesInitialized = true; }
  return cachedPreferences;
}

export function writeMadeSoundPreferences(value: MadeSoundPreferences) {
  fallbackPreferences = { enabled: value.enabled, volume: Math.max(0, Math.min(1, value.volume)) };
  cachedPreferences = fallbackPreferences;
  preferencesInitialized = true;
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(fallbackPreferences)); } catch { /* Keep the current tab functional if storage is blocked. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(notify: () => void) {
  if (typeof window === "undefined") return () => {};
  const onChange = () => { cachedPreferences = loadStoredPreferences(); preferencesInitialized = true; notify(); };
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(CHANGE_EVENT, onChange); };
}

export function useMadeSoundPreferences() {
  return useSyncExternalStore(subscribe, readMadeSoundPreferences, () => DEFAULT_PREFERENCES);
}

const SOUND_FOR_CATEGORY: Partial<Record<HandCategory, MadeSoundId>> = {
  STRAIGHT: "straight", FLUSH: "flush", FULL_HOUSE: "full-house", QUADS: "quads", ROYAL_FLUSH: "royal-flush",
  STRAIGHT_FLUSH: "straight-flush",
};

/** Select one sound from actual contestants' final result rows, using the game's canonical category ranks. */
export function selectMadeSound(results: readonly Pick<RevealedHand, "category" | "displayName">[]): MadeSoundId | null {
  const eligible = results.filter((result) => result.displayName !== "몰수패");
  let highest: HandCategory | undefined;
  for (const result of eligible) {
    if (!highest || CATEGORY_RANK[result.category] > CATEGORY_RANK[highest]) highest = result.category;
  }
  return highest ? SOUND_FOR_CATEGORY[highest] ?? null : null;
}

export type MadeSoundFrame = { scene: string; phase: string };
export function isMadeSoundStart(previous: MadeSoundFrame | null, current: MadeSoundFrame, jumped: boolean): boolean {
  return !!previous && !jumped && current.phase === "BEST5_GLOW"
    && (previous.scene !== current.scene || previous.phase !== current.phase);
}

let context: AudioContext | undefined;
const buffers = new Map<MadeSoundId, AudioBuffer[]>();
const pending = new Map<MadeSoundId, Promise<AudioBuffer[] | undefined>>();
const active = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
let unlocked = false;
let playbackRequest = 0;

export function madeSoundMasterGain(id: MadeSoundId, layered: boolean): number {
  const base = layered ? 0.34 : 0.55;
  return base * (id === "full-house" || id === "quads" ? 1.2 : 1);
}

function audioContext() {
  if (typeof window === "undefined") return undefined;
  const Constructor = window.AudioContext;
  if (!Constructor) return undefined;
  context ??= new Constructor();
  return context;
}

function loadBuffers(id: MadeSoundId): Promise<AudioBuffer[] | undefined> {
  const cached = buffers.get(id);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const current = audioContext();
  const track = MADE_SOUND_TRACKS.find((entry) => entry.id === id);
  if (!current || !track) return Promise.resolve(undefined);
  const request = Promise.all(track.files.map((file) => fetch(`${import.meta.env.BASE_URL}assets/audio/${file}`)
    .then((response) => response.ok ? response.arrayBuffer() : undefined)
    .then((data) => data ? current.decodeAudioData(data) : undefined)))
    .then((decoded) => decoded.every((buffer): buffer is AudioBuffer => !!buffer) ? decoded : undefined)
    .then((decoded) => { if (decoded) buffers.set(id, decoded); return decoded; })
    .catch(() => undefined)
    .finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

/** Call on the first user gesture; audio failures must never affect game progression. */
export function unlockMadeAudio() {
  const current = audioContext();
  if (!current) return;
  unlocked = true;
  void current.resume().catch(() => {});
  for (const track of MADE_SOUND_TRACKS) void loadBuffers(track.id);
}

export function stopMadeAudio() {
  playbackRequest += 1;
  const current = context;
  if (!current) return;
  const now = current.currentTime;
  for (const voice of active) {
    try { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(voice.gain.gain.value, now); voice.gain.gain.linearRampToValueAtTime(0, now + 0.035); voice.source.stop(now + 0.04); } catch { /* Already stopped. */ }
  }
  active.clear();
}

export async function playMadeSound(id: MadeSoundId): Promise<boolean> {
  try {
    const request = ++playbackRequest;
    const preferences = readMadeSoundPreferences();
    if (!preferences.enabled || preferences.volume <= 0) return false;
    const current = audioContext();
    if (!current) return false;
    if (!unlocked) { unlocked = true; await current.resume(); }
    const soundBuffers = await loadBuffers(id);
    if (!soundBuffers || current.state !== "running" || request !== playbackRequest) return false;
    const now = current.currentTime;
    for (const voice of active) {
      try { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(voice.gain.gain.value, now); voice.gain.gain.linearRampToValueAtTime(0, now + 0.035); voice.source.stop(now + 0.04); } catch { /* Already stopped. */ }
    }
    active.clear();
    const when = current.currentTime + 0.005;
    for (const buffer of soundBuffers) {
      const source = current.createBufferSource();
      const gain = current.createGain();
      source.buffer = buffer;
      gain.gain.value = preferences.volume * madeSoundMasterGain(id, soundBuffers.length > 1);
      source.connect(gain).connect(current.destination);
      const voice = { source, gain };
      active.add(voice);
      source.onended = () => active.delete(voice);
      source.start(when);
    }
    return true;
  } catch { return false; }
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockMadeAudio, { once: true, capture: true });
  window.addEventListener("keydown", unlockMadeAudio, { once: true, capture: true });
}
