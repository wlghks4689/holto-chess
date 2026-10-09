import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Made-hand FX (the panel bloom and sweep on `.cinema-made-fx`) rely on the seat's `overflow:hidden` to stay
 * inside the seat box. Opening a seat's overflow, or swapping it for a looser clip-path, lets the FX spill
 * past the box (seen in the R6 final once the reward line made the seat taller). Decorations that must sit
 * on a seat's edge belong beside the seat, not in it.
 */
const dir = new URL("./", import.meta.url);
const sheets = readdirSync(dir).filter((file) => file.endsWith(".css"))
  .map((file) => ({ file, css: readFileSync(new URL(file, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));

/** Split a selector list on top-level commas (not the ones inside :is() / :has()). */
function selectors(list: string): string[] {
  const out: string[] = []; let depth = 0; let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { out.push(current); current = ""; } else current += char;
  }
  return [...out, current].map((s) => s.trim()).filter(Boolean);
}

/** The compound the declarations apply to: the part after the last top-level combinator. */
function subject(selector: string): string {
  let depth = 0; let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const char = selector[i]!;
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0 && (char === " " || char === ">" || char === "+" || char === "~")) start = i + 1;
  }
  return selector.slice(start);
}

describe("showdown seat FX clipping", () => {
  it("never opens a seat's overflow or replaces it with a clip-path", () => {
    const offenders: string[] = [];
    for (const { file, css } of sheets) {
      for (const [, list, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/overflow\s*:\s*(visible|clip)|clip-path\s*:/.test(body!)) continue;
        for (const selector of selectors(list!)) {
          const target = subject(selector);
          if (/\.cinema-(seat|made-fx)\b/.test(target) && !target.includes("::")) offenders.push(`${file}: ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
