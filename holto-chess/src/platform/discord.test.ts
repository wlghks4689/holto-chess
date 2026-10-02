import { describe, expect, it } from "vitest";
import { discordSdk, startDiscordActivity } from "./discord";

const launch = { clientId: "123456789012345678", frameId: "f-1", instanceId: "i-1", platform: "desktop" };

describe("Discord Activity start", () => {
  it("refuses to construct the SDK without a complete launch context", async () => {
    await expect(startDiscordActivity({ ...launch, frameId: null })).rejects.toThrow(/frame_id/);
    expect(discordSdk()).toBeNull();
  });

  it("fails with a readable timeout when no Discord client answers the handshake", async () => {
    await expect(startDiscordActivity(launch, 50)).rejects.toThrow(/timed out after 50ms/);
    expect(discordSdk()).toBeNull();
  });
});
