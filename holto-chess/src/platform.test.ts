import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCrazyGames } from "./platform";

const bootstrap = readFileSync(new URL("../public/platform.js", import.meta.url), "utf8");
function boot(search: string) {
  const scripts: { src: string; async: boolean }[] = [];
  const window = { location: { search } } as { location: { search: string }; porenaPlatform?: string; dataLayer?: IArguments[]; gtag?: (...args: unknown[]) => void };
  runInNewContext(bootstrap, { window, URLSearchParams, document: { createElement: () => ({ src: "", async: false }), head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) } } });
  return { window, scripts };
}
afterEach(() => vi.unstubAllGlobals());
describe("boot-time platform and analytics", () => {
  it.each(["?platform=crazygames", "?other=x&platform=crazygames", "?platform=crazy%67ames"])("disables all GA initialization for %s", (search) => {
    const { window, scripts } = boot(search);
    expect(window.porenaPlatform).toBe("crazygames");
    expect(scripts).toEqual([]);
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
    vi.stubGlobal("window", window);
    expect(isCrazyGames()).toBe(true);
  });
  it.each(["", "?platform=", "?platform=CrazyGames", "?platform=crazygames-extra", "?platform= crazygames", "?platform=crazygames%20", "?other=crazygames", "?platform=web&platform=crazygames"])("preserves ordinary analytics for %s", (search) => {
    const { window, scripts } = boot(search);
    expect(window.porenaPlatform).toBe("web");
    expect(scripts).toEqual([{ async: true, src: "https://www.googletagmanager.com/gtag/js?id=G-34CRPR69CF" }]);
    expect(window.dataLayer?.map(args => Array.from(args)[0])).toEqual(["js", "config"]);
    vi.stubGlobal("window", window);
    expect(isCrazyGames()).toBe(false);
  });
  it("runs the blocking bootstrap before the app without an unconditional GA URL", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html.indexOf('src="/platform.js"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(html).not.toContain("googletagmanager.com");
    expect(html).not.toContain('async src="/platform.js"');
    expect(html).not.toContain('defer src="/platform.js"');
  });
  it("defaults to ordinary UI without a browser bootstrap", () => { expect(isCrazyGames()).toBe(false); });
});
