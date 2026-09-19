import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCinematicMotion } from "./useCinematicMotion";

function Probe() {
  const motion = useCinematicMotion();
  return createElement("span", { "data-enabled": motion.enabled });
}

afterEach(() => vi.unstubAllGlobals());

describe("cinematic motion opt-in", () => {
  it("respects system settings by default", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="false"');
  });
  it("keeps the player's explicit choice across match remounts", () => {
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => key === "porena.cinematic-motion" ? "enabled" : null });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="true"');
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="true"');
  });
  it("works when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="false"');
  });
});
