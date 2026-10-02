import { describe, expect, it } from "vitest";
import { detectPlatform, discordLaunchProblem, PUBLIC_WEB_ORIGIN, shareOrigin } from "./runtime";

const page = (url: string) => { const u = new URL(url); return { hostname: u.hostname, search: u.search, origin: u.origin }; };
const launchUrl = "https://123456789012345678.discordsays.com/?instance_id=i-1&frame_id=f-1&platform=desktop&guild_id=1";

describe("platform runtime detection", () => {
  it("treats porena.kr, previews and local development as the web", () => {
    for (const url of ["https://porena.kr/", "https://www.porena.kr/?room=ABC234", "http://localhost:5173/", "https://porena.kr/?frame_id=x&instance_id=y&platform=desktop"]) {
      expect(detectPlatform(page(url)), url).toEqual({ kind: "web" });
    }
  });

  it("recognises only <application id>.discordsays.com as a Discord Activity", () => {
    for (const url of ["https://discordsays.com/", "https://abc.discordsays.com/", "https://123456789012345678.discordsays.com.evil.test/", "https://x.123456789012345678.discordsays.com/", "https://1234.discordsays.com/"]) {
      expect(detectPlatform(page(url)).kind, url).toBe("web");
    }
    expect(detectPlatform(page(launchUrl))).toEqual({ kind: "discord", launch: { clientId: "123456789012345678", frameId: "f-1", instanceId: "i-1", platform: "desktop" } });
  });

  it("reports an incomplete Discord launch context instead of guessing", () => {
    const launch = (url: string) => { const runtime = detectPlatform(page(url)); if (runtime.kind !== "discord") throw new Error("expected discord"); return runtime.launch; };
    expect(discordLaunchProblem(launch(launchUrl))).toBeNull();
    expect(discordLaunchProblem(launch(launchUrl.replace("platform=desktop", "platform=mobile")))).toBeNull();
    expect(discordLaunchProblem(launch("https://123456789012345678.discordsays.com/"))).toMatch(/frame_id/);
    expect(discordLaunchProblem(launch("https://123456789012345678.discordsays.com/?frame_id=f"))).toMatch(/instance_id/);
    expect(discordLaunchProblem(launch("https://123456789012345678.discordsays.com/?frame_id=f&instance_id=i&platform=web"))).toMatch(/platform/);
  });

  it("shares porena.kr links from Discord and the current origin elsewhere", () => {
    expect(shareOrigin({ kind: "web" }, page("https://porena.kr/"))).toBe("https://porena.kr");
    expect(shareOrigin({ kind: "web" }, page("http://localhost:5173/"))).toBe("http://localhost:5173");
    const discord = page(launchUrl);
    expect(shareOrigin(detectPlatform(discord), discord)).toBe(PUBLIC_WEB_ORIGIN);
  });
});
