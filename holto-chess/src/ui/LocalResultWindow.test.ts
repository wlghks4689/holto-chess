import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalResultWindow } from "./LocalResultWindow";
import { CinematicGate } from "./ShowdownCinematic";
import type { MatchView } from "../shared/protocol";

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useEffect: (effect: () => void | (() => void)) => effects.push(effect) }));
beforeEach(() => { effects.length = 0; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

it("does not mount the viewing window while a cinematic hides the results", () => {
  const match: MatchView = { id: "r1", round: 1, matchNumber: 1, stage: "primary", participantIds: [], winnerIds: [], boards: [], boardResults: [], boardWinnerIds: [], results: [], runoutCount: 0, suddenDeathCount: 0, rewards: [], revealedCards: {} };
  const contents = vi.fn(() => "standings");
  renderToStaticMarkup(createElement(CinematicGate, { matches: [match], profiles: [], viewerId: "p1", children: createElement(LocalResultWindow, { active: true, onExpire: vi.fn(), children: contents }) }));
  expect(contents).not.toHaveBeenCalled();
});

it.each([1, 2, 3, 4])("gives a newly visible R%i result a full 30 seconds", () => {
  vi.advanceTimersByTime(90_000); // Time spent in cinematics cannot consume the window.
  const expire = vi.fn();
  const html = renderToStaticMarkup(createElement(LocalResultWindow, { active: true, onExpire: expire, children: (seconds) => `${seconds}` }));
  expect(html).toBe("30");
  const cleanups = effects.map((effect) => effect());
  vi.advanceTimersByTime(29_999);
  expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expire).toHaveBeenCalledOnce();
  cleanups.forEach((cleanup) => cleanup?.());
});

it("cancels automatic advancement when the result unmounts", () => {
  const expire = vi.fn();
  renderToStaticMarkup(createElement(LocalResultWindow, { active: true, onExpire: expire, children: () => null }));
  const cleanups = effects.map((effect) => effect());
  vi.advanceTimersByTime(5000);
  cleanups.forEach((cleanup) => cleanup?.());
  vi.advanceTimersByTime(30_000);
  expect(expire).not.toHaveBeenCalled();
});

it("keeps the debug pause and non-result phases untimed", () => {
  const expire = vi.fn();
  renderToStaticMarkup(createElement(LocalResultWindow, { active: false, onExpire: expire, children: (seconds) => { expect(seconds).toBeNull(); return null; } }));
  const cleanups = effects.map((effect) => effect());
  vi.advanceTimersByTime(90_000);
  expect(expire).not.toHaveBeenCalled();
  cleanups.forEach((cleanup) => cleanup?.());
});
