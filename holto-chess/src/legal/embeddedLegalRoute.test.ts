import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it.each([
  ["https://porena.kr/?platform=crazygames", "crazygames", "/privacy?platform=crazygames"],
  ["https://porena.kr/?other=value", "web", "/privacy"],
  ["https://123456789012345678.discordsays.com/?frame_id=f&instance_id=i&platform=desktop", "web", "/privacy?frame_id=f&instance_id=i&platform=desktop"],
])("keeps the required embedded context from %s", async (url, platform, destination) => {
  vi.resetModules();
  const pushState = vi.fn();
  vi.stubGlobal("location", new URL(url));
  vi.stubGlobal("window", { porenaPlatform: platform, scrollTo: vi.fn() });
  vi.stubGlobal("history", { pushState });
  const { navigate } = await import("./legalRoute");
  navigate("/privacy");
  expect(pushState).toHaveBeenCalledWith(null, "", destination);
});
