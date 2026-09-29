import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("made sound loading", () => {
  const fetched: string[] = [];
  beforeEach(() => {
    vi.resetModules();
    fetched.length = 0;
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      AudioContext: class { state = "suspended"; resume = () => Promise.resolve(); decodeAudioData = () => Promise.resolve({}); },
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: () => {}, dispatchEvent: () => true,
    });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.stubGlobal("fetch", vi.fn((url: string) => { fetched.push(url); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("unlocks audio on the first gesture without downloading any cue", async () => {
    const { unlockMadeAudio } = await import("./madeSound");
    unlockMadeAudio();
    await Promise.resolve();
    expect(fetched).toEqual([]);
  });

  it("prefetches only the requested cue, once, and reuses it", async () => {
    const { prefetchMadeSound } = await import("./madeSound");
    prefetchMadeSound("flush");
    prefetchMadeSound("flush");
    prefetchMadeSound("straight-flush");
    await new Promise((resolve) => setTimeout(resolve, 0));
    prefetchMadeSound("flush");
    expect(fetched.map((url) => url.split("/").pop())).toEqual(["made_flush.mp3", "made_straight_flush_core.mp3", "made_straight_flush_tail.mp3"]);
  });

  it("downloads nothing while sound is turned off", async () => {
    const { prefetchMadeSound, writeMadeSoundPreferences } = await import("./madeSound");
    writeMadeSoundPreferences({ enabled: false, volume: 0.5 });
    prefetchMadeSound("quads");
    expect(fetched).toEqual([]);
  });
});
