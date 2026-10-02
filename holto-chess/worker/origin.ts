/**
 * Who may call /api/* and /ws/*. The game's own origin always; additionally the exact Discord Activity
 * origin https://<application id>.discordsays.com for each configured application id. Inside an Activity
 * the browser sends that origin, and Discord's URL mapping forwards the request here to porena.kr.
 *
 * Exact string comparison only: no wildcard subdomains (any other Discord application also lives on
 * *.discordsays.com), no CORS headers, no "*". An empty or malformed configuration allows nothing extra.
 */
const DISCORD_APPLICATION_ID = /^\d{17,20}$/;

/** Parses the comma-separated DISCORD_ACTIVITY_CLIENT_IDS value; malformed entries are ignored. */
export function discordActivityOrigins(clientIds: string | undefined): string[] {
  return (clientIds ?? "").split(",").map((id) => id.trim()).filter((id) => DISCORD_APPLICATION_ID.test(id)).map((id) => `https://${id}.discordsays.com`);
}

export function isAllowedOrigin(origin: string | null, ownOrigin: string, discordClientIds: string | undefined): boolean {
  if (!origin) return false;
  return origin === ownOrigin || discordActivityOrigins(discordClientIds).includes(origin);
}
