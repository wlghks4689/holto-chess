import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";

// Each test file gets isolated storage, so bring the feedback schema up before it runs.
await applyD1Migrations(env.FEEDBACK_DB, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS);
