import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ability artwork loading", () => {
  const images: { onload: () => void; onerror: () => void; decode: () => Promise<void> }[] = [];
  beforeEach(() => {
    vi.resetModules();
    images.length = 0;
    vi.stubGlobal("Image", class {
      onload = () => {};
      onerror = () => {};
      src = "";
      decode = vi.fn(() => Promise.resolve());
      constructor() { images.push(this); }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shares one decoded image request across thumbnails and dialogs", async () => {
    const { decodeAbilityImage } = await import("./abilityArtworkLoader");
    const first = decodeAbilityImage("icon.png");
    expect(decodeAbilityImage("icon.png")).toBe(first);
    expect(images).toHaveLength(1);
    images[0]!.onload();
    await first;
    expect(images[0]!.decode).toHaveBeenCalledOnce();
  });

  it("does not finish the artwork until both images are decoded", async () => {
    const { decodeAbilityImage } = await import("./abilityArtworkLoader");
    let ready = false;
    const pair = Promise.all([decodeAbilityImage("frame.png"), decodeAbilityImage("icon.png")]).then(() => { ready = true; });
    images[0]!.onload();
    await Promise.resolve();
    await Promise.resolve();
    expect(ready).toBe(false);
    images[1]!.onload();
    await pair;
    expect(ready).toBe(true);
  });

  it("allows a failed request to be retried", async () => {
    const { decodeAbilityImage } = await import("./abilityArtworkLoader");
    const failed = decodeAbilityImage("icon.png");
    images[0]!.onerror();
    await expect(failed).rejects.toThrow("Unable to load ability artwork");
    const retry = decodeAbilityImage("icon.png");
    expect(images).toHaveLength(2);
    images[1]!.onload();
    await retry;
  });
});
