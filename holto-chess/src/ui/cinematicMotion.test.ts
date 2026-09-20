import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCinematicMotion } from "./useCinematicMotion";

function Probe() {
  const motion = useCinematicMotion();
  return createElement("span", { "data-enabled": motion.enabled });
}

afterEach(() => vi.unstubAllGlobals());

describe("cinematic motion preferences", () => {
  it("restores an explicit disabled preference", () => {
    vi.stubGlobal("localStorage", { getItem: () => "disabled" });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="false"');
  });
  it("enables animations by default", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="true"');
  });
  it("keeps the player's explicit choice across match remounts", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "porena.cinematic-motion" ? "enabled" : null });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="true"');
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="true"');
  });
  it("works when storage is unavailable", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-enabled="true"');
  });
});
