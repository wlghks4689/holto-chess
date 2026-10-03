import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameViewportReset } from "./GameViewportReset";
import { restoreGameViewport } from "./viewportTransition";

function screenWithDialog(dialog: boolean) {
  const scrollTo = vi.fn();
  const focus = vi.fn();
  const screen = { ownerDocument: { defaultView: { scrollTo }, querySelector: () => dialog ? {} : null }, focus, tabIndex: 0 };
  return { screen, scrollTo, focus };
}

describe("game screen viewport restoration", () => {
  it("restores both axes instantly and focuses the new screen without another scroll", () => {
    const { screen, scrollTo, focus } = screenWithDialog(false);
    restoreGameViewport(screen as unknown as HTMLElement);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: "instant" });
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(screen.tabIndex).toBe(-1);
  });
  it("preserves modal focus during a round guide or exit dialog", () => {
    const { screen, scrollTo, focus } = screenWithDialog(true);
    restoreGameViewport(screen as unknown as HTMLElement);
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
    expect(screen.tabIndex).toBe(0);
  });
  it("does nothing without a mounted game screen", () => {
    expect(() => restoreGameViewport(null)).not.toThrow();
    expect(() => restoreGameViewport(undefined)).not.toThrow();
  });
  it("emits only a hidden screen identity marker during server rendering", () => {
    expect(renderToStaticMarkup(createElement(GameViewportReset, { screenKey: "local:0:2:OPEN_DRAFT" })))
      .toBe('<span hidden="" data-viewport-screen="local:0:2:OPEN_DRAFT"></span>');
  });
});
