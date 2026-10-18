import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";

// Each test file gets isolated storage, so bring the feedback schema up before it runs.
await applyD1Migrations(env.FEEDBACK_DB, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS);
await applyD1Migrations(env.ACCOUNT_DB, (env as unknown as { TEST_ACCOUNT_MIGRATIONS: D1Migration[] }).TEST_ACCOUNT_MIGRATIONS);
const lobby = env as unknown as { PUBLIC_LOBBY_DB: D1Database; TEST_PUBLIC_LOBBY_MIGRATIONS: D1Migration[] };
await applyD1Migrations(lobby.PUBLIC_LOBBY_DB, lobby.TEST_PUBLIC_LOBBY_MIGRATIONS);
