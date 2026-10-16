import type { Phase } from '../game/types';

export type GameMode = 'local_practice' | 'ranked_solo' | 'multiplayer';
type EventParams = {
  landing_view: Record<string, never>;
  play_cta_click: { selected_mode: 'single' | 'multi' };
  game_start: { game_mode: GameMode };
  round_1_complete: { game_mode: GameMode };
  game_complete: { game_mode: GameMode };
};
type Gtag = (command: 'event', name: string, params: object) => void;
type Runtime = { enabled: () => boolean; send: () => Gtag | undefined; storage: () => Pick<Storage, 'getItem' | 'setItem'> };
const STORAGE_KEY = 'porena.analytics.milestones.v1';
const MAX_KEYS = 128;

/** Dedupe keys stay in this tab. They are never sent to Google; a blocked tag cannot block play. */
export function createAnalytics(runtime: Runtime) {
  const seen = new Set<string>();
  const track = <E extends keyof EventParams>(name: E, params: EventParams[E], onceKey?: string): boolean => {
    try {
      if (!runtime.enabled()) return false;
      const send = runtime.send();
      if (!send) return false;
      const key = onceKey === undefined ? undefined : `${name}:${onceKey}`;
      let saved: string[] = [];
      if (key) {
        if (seen.has(key)) return false;
        try {
          const parsed: unknown = JSON.parse(runtime.storage().getItem(STORAGE_KEY) ?? '[]');
          if (Array.isArray(parsed)) saved = parsed.filter((value): value is string => typeof value === 'string').slice(-MAX_KEYS);
        } catch { /* Memory dedupe still works when storage is disabled. */ }
        if (saved.includes(key)) { seen.add(key); return false; }
      }
      // Copy only the declared public fields, even if a caller accidentally passes extra data.
      const safe: Record<string, string | number> = {};
      if ('game_mode' in params) safe.game_mode = String(params.game_mode);
      if ('selected_mode' in params) safe.selected_mode = String(params.selected_mode);
      send('event', name, safe);
      if (key) {
        seen.add(key);
        if (seen.size > MAX_KEYS) seen.delete(seen.values().next().value!);
        try { runtime.storage().setItem(STORAGE_KEY, JSON.stringify([...saved, key].slice(-MAX_KEYS))); } catch { /* Optional. */ }
      }
      return true;
    } catch { return false; }
  };
  return { track };
}

export const analytics = createAnalytics({
  enabled: () => !import.meta.env.DEV && typeof window !== 'undefined' && location.hostname === 'porena.kr',
  send: () => (window as Window & { gtag?: Gtag }).gtag,
  storage: () => window.sessionStorage,
});

/** A restored later round is not a new start; an R1 result is not a completed tournament. */
export function gameMilestones(round: number, phase: Phase | 'LOBBY', resultsReleased = true) {
  const events: ('game_start' | 'round_1_complete' | 'game_complete')[] = [];
  if (round === 1 && phase !== 'LOBBY' && phase !== 'GAME_RESULT') events.push('game_start');
  if (round === 1 && phase === 'ROUND_RESULT') events.push('round_1_complete');
  if (phase === 'GAME_RESULT' && resultsReleased) events.push('game_complete');
  return events;
}
