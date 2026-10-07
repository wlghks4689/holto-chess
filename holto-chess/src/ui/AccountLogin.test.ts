import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StartScreen } from "./StartScreen";

it("keeps guest play and tutorial available while the independent account status loads", () => {
  const html = renderToStaticMarkup(createElement(StartScreen, { onStart: () => {} }));
  expect(html).toContain('aria-label="계정"');
  expect(html).toContain('role="status"');
  expect(html).toContain("시작하기");
  expect(html).toContain("체험 · 길라잡이");
  expect(html).not.toContain("disabled");
  expect(html).not.toContain("client_secret");
});
