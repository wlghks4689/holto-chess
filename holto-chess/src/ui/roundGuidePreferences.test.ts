import { describe, expect, it } from "vitest";
import { markRoundGuideSeen, readAutoRoundGuides, readSeenRoundGuides, resetSeenRoundGuides, setAutoRoundGuides, shouldAutoShowRoundGuide } from "./roundGuidePreferences";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("round guide preferences", () => {
  it("defaults automatic guides on and records each dismissed round once", () => {
    const storage = memoryStorage();
    expect(readAutoRoundGuides(storage)).toBe(true);
    expect(readSeenRoundGuides(storage)).toEqual([]);
    markRoundGuideSeen(2, storage);
    markRoundGuideSeen(1, storage);
    markRoundGuideSeen(2, storage);
    expect(readSeenRoundGuides(storage)).toEqual([1, 2]);
  });

  it("persists the automatic display switch separately from seen history", () => {
    const storage = memoryStorage();
    markRoundGuideSeen(1, storage);
    setAutoRoundGuides(false, storage);
    expect(readAutoRoundGuides(storage)).toBe(false);
    expect(readSeenRoundGuides(storage)).toEqual([1]);
    setAutoRoundGuides(true, storage);
    expect(readAutoRoundGuides(storage)).toBe(true);
  });

  it("resets seen history so the first unseen round can appear again", () => {
    const storage = memoryStorage();
    markRoundGuideSeen(1, storage);
    markRoundGuideSeen(5, storage);
    resetSeenRoundGuides(storage);
    expect(readSeenRoundGuides(storage)).toEqual([]);
  });

  it("ignores invalid stored rounds", () => {
    const storage = memoryStorage();
    storage.setItem("porena.round-guide-seen", JSON.stringify([1, 6, "2", 3]));
    expect(readSeenRoundGuides(storage)).toEqual([1, 3]);
  });

  it("automatically shows only enabled, unseen rounds", () => {
    expect(shouldAutoShowRoundGuide(true, [], 1)).toBe(true);
    expect(shouldAutoShowRoundGuide(true, [1, 2], 1)).toBe(false);
    expect(shouldAutoShowRoundGuide(true, [1, 2], 3)).toBe(true);
    expect(shouldAutoShowRoundGuide(false, [], 3)).toBe(false);
  });
});
