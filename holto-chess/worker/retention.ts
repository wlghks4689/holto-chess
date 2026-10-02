// Data retention promised in the privacy policy (/privacy) and the feedback form's consent text.
// Runs from the daily Cron Trigger in wrangler.jsonc. Every statement is idempotent, so a retried or
// repeated run deletes nothing extra.

import { FEEDBACK_RETENTION_MS } from "../src/shared/retention";

export { FEEDBACK_RETENTION_MS };

export type FeedbackPurge = { deleted: number; emailsCleared: number };

/**
 * Deletes feedback received more than 90 days before `now` (epoch ms, so no timezone is involved) and clears
 * the reply email of every archived ("처리 완료") message. The admin inbox already clears it when a message is
 * archived; this sweep covers anything archived before that rule existed.
 */
export async function purgeFeedback(db: D1Database, now = Date.now()): Promise<FeedbackPurge> {
  const [expired, archived] = await db.batch([
    db.prepare("DELETE FROM feedback WHERE created_at < ?").bind(now - FEEDBACK_RETENTION_MS),
    db.prepare("UPDATE feedback SET contact_email = NULL WHERE status = 'archived' AND contact_email IS NOT NULL"),
  ]);
  return { deleted: expired!.meta.changes, emailsCleared: archived!.meta.changes };
}

/** Scheduled entry point. Logs counts only: never message text, emails or ids. */
export async function runRetention(env: Env, now = Date.now()): Promise<void> {
  try {
    const result = await purgeFeedback(env.FEEDBACK_DB, now);
    console.log(JSON.stringify({ event: "retention.feedback", ...result }));
  } catch (error) {
    console.error(JSON.stringify({ event: "retention.feedback.failed", error: error instanceof Error ? error.name : "unknown" }));
    // Rethrow so the Cron Trigger is recorded as failed in the Cloudflare dashboard.
    throw error;
  }
}
