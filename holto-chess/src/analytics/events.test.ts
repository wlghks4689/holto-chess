import { describe, expect, it, vi } from 'vitest';
import { createAnalytics, gameMilestones } from './events';

function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const send = vi.fn();
  const runtime = { enabled: () => true, send: () => send, storage: () => storage };
  return { runtime, send, storage };
}

describe('actual play analytics', () => {
  it('does not call joining a lobby or restoring R2 a game start', () => {
    expect(gameMilestones(1, 'LOBBY')).toEqual([]);
    expect(gameMilestones(1, 'ABILITY_DEAL')).toEqual(['game_start']);
    expect(gameMilestones(2, 'SHOP')).toEqual([]);
  });
  it('distinguishes R1 completion from full-game completion and waits for online final results', () => {
    expect(gameMilestones(1, 'ROUND_RESULT')).toEqual(['game_start', 'round_1_complete']);
    expect(gameMilestones(6, 'GAME_RESULT', false)).toEqual([]);
    expect(gameMilestones(6, 'GAME_RESULT', true)).toEqual(['game_complete']);
  });
  it('deduplicates rerenders and a reloaded tab but counts a new match', () => {
    const { runtime, send } = fixture();
    const first = createAnalytics(runtime);
    first.track('game_start', { game_mode: 'multiplayer' }, 'private-room:1');
    first.track('game_start', { game_mode: 'multiplayer' }, 'private-room:1');
    const restored = createAnalytics(runtime);
    restored.track('game_start', { game_mode: 'multiplayer' }, 'private-room:1');
    restored.track('round_1_complete', { game_mode: 'multiplayer' }, 'private-room:1');
    restored.track('game_start', { game_mode: 'multiplayer' }, 'private-room:2');
    expect(send.mock.calls).toEqual([
      ['event', 'game_start', { game_mode: 'multiplayer' }],
      ['event', 'round_1_complete', { game_mode: 'multiplayer' }],
      ['event', 'game_start', { game_mode: 'multiplayer' }],
    ]);
    expect(JSON.stringify(send.mock.calls)).not.toContain('private-room');
  });
  it('drops undeclared payload fields instead of forwarding identity or cards', () => {
    const { runtime, send } = fixture();
    createAnalytics(runtime).track('game_start', { game_mode: 'local_practice', nickname: 'private-name', cards: ['As'] } as { game_mode: 'local_practice' });
    expect(send).toHaveBeenCalledWith('event', 'game_start', { game_mode: 'local_practice' });
  });
  it('keeps working with denied storage or malformed saved data', () => {
    const { runtime, send, storage } = fixture();
    storage.getItem = () => 'invalid json';
    const a = createAnalytics(runtime);
    a.track('game_start', { game_mode: 'ranked_solo' }, 'one');
    a.track('game_start', { game_mode: 'ranked_solo' }, 'one');
    storage.getItem = () => { throw new Error('Storage denied'); };
    storage.setItem = () => { throw new Error('Storage denied'); };
    a.track('game_start', { game_mode: 'ranked_solo' }, 'two');
    a.track('game_start', { game_mode: 'ranked_solo' }, 'two');
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not block the game when analytics is disabled, missing or throws', () => {
    const { runtime, send } = fixture();
    expect(createAnalytics({ ...runtime, enabled: () => false }).track('landing_view', {})).toBe(false);
    const holder: { tag?: typeof send } = {};
    const a = createAnalytics({ ...runtime, send: () => holder.tag });
    expect(a.track('game_start', { game_mode: 'multiplayer' }, 'one')).toBe(false);
    holder.tag = send;
    expect(a.track('game_start', { game_mode: 'multiplayer' }, 'one')).toBe(true);
    send.mockImplementation(() => { throw new Error('Tag blocked'); });
    expect(() => a.track('game_complete', { game_mode: 'multiplayer' }, 'one')).not.toThrow();
  });
});
