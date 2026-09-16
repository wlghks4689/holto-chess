import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RunItTwiceResult } from "./RunItTwiceResult";

const match = { runoutCount: 2, boardWinnerIds: [["a"], ["b"], ["b"]], winnerIds: ["b"] };
const render = (completedBoards: number, showFinal: boolean) => renderToStaticMarkup(createElement(RunItTwiceResult, { match, players: ["a", "b"], name: (id) => id === "a" ? "Alice" : "Bob", completedBoards, showFinal }));
it("does not reveal future runs or the final winner during the first run", () => {
  const html = render(1, false);
  expect(html).toContain("Alice WIN");
  expect(html).not.toContain("Bob WIN");
  expect(html).not.toContain("SUDDEN DEATH");
  expect(html).not.toContain("MATCH WINNER");
});
it("shows the tied score before SD and keeps 1:1 after SD", () => {
  const tied = render(2, false);
  expect(tied).toContain("1 : 1");
  expect(tied).toContain("런 잇 트와이스 동률");
  expect(tied).not.toContain("#1");
  const final = render(3, true);
  expect(final).toContain("1 : 1");
  expect(final).not.toContain("1 : 2");
  expect(final).toContain("#1 · Bob WIN");
  expect(final).toContain("MATCH WINNER");
});
