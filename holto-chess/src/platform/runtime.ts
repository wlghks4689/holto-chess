/**
 * Which host the page runs in. This is the only place that decides "web" vs "Discord Activity";
 * the rest of the app asks this module instead of checking hostnames itself.
 *
 * Discord serves an Activity from https://<application id>.discordsays.com and passes its launch
 * context in the query string (frame_id, instance_id, platform). The hostname alone decides the
 * platform; missing launch parameters are reported as a launch error, never treated as the web.
 */
export type DiscordLaunch = { clientId: string; frameId: string | null; instanceId: string | null; platform: string | null };
export type PlatformRuntime = { kind: "web" } | { kind: "discord"; launch: DiscordLaunch };
type PageLocation = Pick<Location, "hostname" | "search" | "origin">;

/** Discord application ids are snowflakes: 17-20 digits. */
export const DISCORD_ACTIVITY_HOST = /^(\d{17,20})\.discordsays\.com$/;
/** The public web build. Invite links shared from inside Discord point here so anyone can open them. */
export const PUBLIC_WEB_ORIGIN = "https://porena.kr";

export function detectPlatform(page: PageLocation): PlatformRuntime {
  const host = DISCORD_ACTIVITY_HOST.exec(page.hostname.toLowerCase());
  if (!host) return { kind: "web" };
  const query = new URLSearchParams(page.search);
  return { kind: "discord", launch: { clientId: host[1]!, frameId: query.get("frame_id"), instanceId: query.get("instance_id"), platform: query.get("platform") } };
}

/** Why the Discord SDK cannot start from this URL, or null when the launch context is complete. */
export function discordLaunchProblem(launch: DiscordLaunch): string | null {
  if (!launch.frameId) return "missing frame_id (page was not opened by the Discord client)";
  if (!launch.instanceId) return "missing instance_id";
  if (launch.platform !== "desktop" && launch.platform !== "mobile") return `invalid platform "${launch.platform ?? ""}"`;
  return null;
}

/** Origin used for links meant to be opened outside the current page (room invites). */
export function shareOrigin(runtime: PlatformRuntime, page: PageLocation): string {
  return runtime.kind === "discord" ? PUBLIC_WEB_ORIGIN : page.origin;
}

let current: PlatformRuntime | undefined;
/** Detected once per page load; server-side and test environments without `location` are the web. */
export function currentPlatform(): PlatformRuntime {
  current ??= typeof location === "undefined" ? { kind: "web" } : detectPlatform(location);
  return current;
}

export type PlatformStatus = "web" | "starting" | "ready" | "failed";
let status: PlatformStatus = "web";
const listeners = new Set<() => void>();
function setStatus(next: PlatformStatus) {
  status = next;
  if (typeof document !== "undefined") document.documentElement.dataset.platformStatus = next;
  for (const listener of listeners) listener();
}
export function platformStatus(): PlatformStatus { return status; }
export function subscribePlatformStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Starts the host integration without blocking the game. On the web this does nothing and the Discord SDK
 * is never downloaded: it lives in a separate chunk that only the Discord branch imports. If the SDK fails,
 * the game keeps running (it talks to the server through the URL mapping, not the SDK) and the status
 * becomes "failed" so the UI can say so.
 */
export async function startPlatform(): Promise<void> {
  const runtime = currentPlatform();
  if (runtime.kind !== "discord") return;
  if (typeof document !== "undefined") document.documentElement.dataset.platform = "discord";
  setStatus("starting");
  try {
    const { startDiscordActivity } = await import("./discord");
    await startDiscordActivity(runtime.launch);
    setStatus("ready");
  } catch (error) {
    console.error("[PORENA] Discord Activity SDK failed to start; continuing without it.", error);
    setStatus("failed");
  }
}
