import { PUBLIC_INSTANCE_HEADER } from "./GameRoom";
import { applySummary, TERMINAL_RETENTION_MS, withTimeout, type PublicSummary } from "./publicLobby";
import { publicRoomsEnabled, type PublicRoomEnv } from "./publicRoomKeys";

/**
 * Minute Cron for the public registry (PUBLIC-ROOMS-002 2-F). The registry and the rooms cannot share one transaction,
 * so this pass finds the places they disagree and asks the room, which is always the authority:
 *  - a room that stopped renewing its listing, a game due for its 30-minute check, or a create that never finished;
 *  - if the room is gone (or never came to exist) the listing is closed and its slot returned;
 *  - if it is alive, its fresh summary is applied and its alarm re-armed.
 * It also deletes ended rows after 24 hours. It reads only due rows through an index, a bounded batch per minute.
 */
export const PUBLIC_REPAIR_CRON = "* * * * *";
export const REPAIR_BATCH = 100;
/** One room's answer must come quickly; a silent room is asked again next minute. */
export const REPAIR_TIMEOUT_MS = 5_000;

export type RepairReport = { checked: number; closed: number; refreshed: number; unanswered: number; purged: number };
type DueRow = { instance_id: string; room_code: string; state: string; summary_seq: number };

export async function runPublicLobbyRepair(env: PublicRoomEnv, now = Date.now()): Promise<RepairReport> {
  const report: RepairReport = { checked: 0, closed: 0, refreshed: 0, unanswered: 0, purged: 0 };
  const db = env.PUBLIC_LOBBY_DB;
  if (!db || !publicRoomsEnabled(env)) return report;
  const due = (await db.prepare(
    "SELECT instance_id, room_code, state, summary_seq FROM public_rooms WHERE slot_held = 1 AND repair_due_at <= ? ORDER BY repair_due_at LIMIT ?",
  ).bind(now, REPAIR_BATCH).all<DueRow>()).results;
  for (const row of due) {
    report.checked++;
    let response: Response;
    try {
      response = await withTimeout(env.GAME_ROOM.getByName(`room:${row.room_code}`).fetch(new Request("https://room/internal/public-repair", {
        method: "POST", headers: { "X-Room-Id": row.room_code, [PUBLIC_INSTANCE_HEADER]: row.instance_id },
      })), REPAIR_TIMEOUT_MS, "room did not answer");
    } catch {
      report.unanswered++; continue; // Still due: asked again next minute.
    }
    if (response.status === 404 || response.status === 410) {
      // Gone, expired, or never created. Close only the row as it was read: a create that just moved the claim to
      // another code, or a room that reported in meanwhile, is left alone.
      const closed = await db.prepare(
        `UPDATE public_rooms SET state = CASE WHEN state = 'PROVISIONING' THEN 'CANCELLED' ELSE 'CLOSED' END, slot_held = 0, closed_at = ?, repair_due_at = NULL
          WHERE instance_id = ? AND slot_held = 1 AND room_code = ? AND summary_seq = ?`,
      ).bind(now, row.instance_id, row.room_code, row.summary_seq).run();
      if (closed.meta.changes === 1) report.closed++;
      continue;
    }
    if (!response.ok) { report.unanswered++; continue; }
    await applySummary(db, await response.json() as PublicSummary);
    report.refreshed++;
  }
  const purged = await db.prepare(
    "DELETE FROM public_rooms WHERE instance_id IN (SELECT instance_id FROM public_rooms WHERE slot_held = 0 AND closed_at < ? LIMIT ?)",
  ).bind(now - TERMINAL_RETENTION_MS, REPAIR_BATCH).run();
  report.purged = purged.meta.changes;
  if (report.checked || report.purged) console.log(JSON.stringify({ event: "lobby.repair", ...report }));
  return report;
}
