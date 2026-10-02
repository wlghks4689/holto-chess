import { DiscordSDK } from "@discord/embedded-app-sdk";
import { discordLaunchProblem, type DiscordLaunch } from "./runtime";

/** How long to wait for the Discord client's handshake before reporting the SDK as failed. */
export const DISCORD_READY_TIMEOUT_MS = 10_000;

let sdk: DiscordSDK | null = null;
/** The connected SDK, for later integration stages. Null until startDiscordActivity resolves. */
export function discordSdk(): DiscordSDK | null { return sdk; }

/**
 * Loaded only inside a Discord Activity (see startPlatform). Performs the SDK handshake and nothing else:
 * no OAuth, no instance-based rooms, no presence. Rejects with a readable reason on any failure.
 */
export async function startDiscordActivity(launch: DiscordLaunch, timeoutMs = DISCORD_READY_TIMEOUT_MS): Promise<DiscordSDK> {
  const problem = discordLaunchProblem(launch);
  if (problem) throw new Error(`Discord launch context: ${problem}`);
  const instance = new DiscordSDK(launch.clientId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Discord SDK ready() timed out after ${timeoutMs}ms`)), timeoutMs); });
  try {
    await Promise.race([instance.ready(), timeout]);
  } finally {
    clearTimeout(timer);
  }
  sdk = instance;
  return instance;
}
