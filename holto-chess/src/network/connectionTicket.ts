import type { SessionCredential } from "../shared/protocol";
import { endpoints } from "./endpoints";

/** Short-lived proof stays out of URL/storage; the durable seat token is POST-only. */
export async function connectionProtocols(session: SessionCredential, request: typeof fetch = fetch): Promise<string[]> {
  const response = await request(endpoints.connectionTicket(session.roomId), {
    method: "POST", headers: { "X-Porena-Session": session.token }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Connection ticket unavailable");
  const value: unknown = await response.json();
  const ticket = value && typeof value === "object" ? (value as { ticket?: unknown }).ticket : undefined;
  if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) throw new Error("Invalid connection ticket");
  return ["porena-v1", `porena-ticket-${ticket}`];
}
