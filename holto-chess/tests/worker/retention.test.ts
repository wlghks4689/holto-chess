import { env } from "cloudflare:workers";
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../worker/index";
import { FEEDBACK_RETENTION_MS, purgeFeedback } from "../../worker/retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 18);

async function insert(message: string, createdAt: number, status = "read", email: string | null = null) {
  await env.FEEDBACK_DB.prepare("INSERT INTO feedback (category, message, contact_email, status, created_at, updated_at) VALUES ('feedback', ?, ?, ?, ?, ?)")
    .bind(message, email, status, createdAt, createdAt).run();
}
const messages = async () => (await env.FEEDBACK_DB.prepare("SELECT message FROM feedback ORDER BY id").all<{ message: string }>()).results.map((row) => row.message);
const migrationsApplied = () => env.FEEDBACK_DB.prepare("SELECT COUNT(*) AS n FROM d1_migrations").first<number>("n");

describe("feedback retention", () => {
  beforeEach(async () => { await env.FEEDBACK_DB.prepare("DELETE FROM feedback").run(); });

  it("deletes only messages older than 90 days", async () => {
    await insert("new", NOW);
    await insert("89 days", NOW - 89 * DAY);
    await insert("exactly 90 days", NOW - FEEDBACK_RETENTION_MS);
    await insert("90 days + 1ms", NOW - FEEDBACK_RETENTION_MS - 1);
    await insert("120 days", NOW - 120 * DAY, "unread", "old@example.com");
    expect(FEEDBACK_RETENTION_MS).toBe(90 * DAY);

    expect(await purgeFeedback(env.FEEDBACK_DB, NOW)).toEqual({ deleted: 2, emailsCleared: 0 });
    // The cutoff is exclusive: a message exactly 90 days old goes in the next daily run.
    expect(await messages()).toEqual(["new", "89 days", "exactly 90 days"]);
  });

  it("clears reply emails of archived messages and keeps the rest", async () => {
    await insert("handled", NOW - DAY, "archived", "done@example.com");
    await insert("waiting", NOW - DAY, "read", "waiting@example.com");
    expect(await purgeFeedback(env.FEEDBACK_DB, NOW)).toEqual({ deleted: 0, emailsCleared: 1 });
    const rows = (await env.FEEDBACK_DB.prepare("SELECT message, contact_email FROM feedback ORDER BY id").all()).results;
    expect(rows).toEqual([{ message: "handled", contact_email: null }, { message: "waiting", contact_email: "waiting@example.com" }]);
  });

  it("is safe to run repeatedly and touches no other table", async () => {
    await insert("old", NOW - 100 * DAY, "archived", "x@example.com");
    await insert("recent", NOW - DAY, "archived", "y@example.com");
    const migrations = await migrationsApplied();
    expect(await purgeFeedback(env.FEEDBACK_DB, NOW)).toEqual({ deleted: 1, emailsCleared: 1 });
    expect(await purgeFeedback(env.FEEDBACK_DB, NOW)).toEqual({ deleted: 0, emailsCleared: 0 });
    expect(await messages()).toEqual(["recent"]);
    expect(await migrationsApplied()).toBe(migrations);
  });

  it("runs from the Worker's scheduled handler", async () => {
    await insert("stale", Date.now() - 91 * DAY);
    await insert("fresh", Date.now() - DAY);
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ scheduledTime: Date.now(), cron: "0 18 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await messages()).toEqual(["fresh"]);
  });
});
