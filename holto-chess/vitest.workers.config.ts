import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { hashAdminPassword } from "./worker/adminAuth";

// Test-only admin login. Real values live in Worker secrets (tools/admin/setup-admin.mjs).
const TEST_ADMIN_USERNAME = "test-admin";
const TEST_ADMIN_PASSWORD = "test-password-for-worker-suite";

export default defineConfig(async () => ({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: {
      bindings: {
        TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        TEST_ACCOUNT_MIGRATIONS: await readD1Migrations("./account-migrations"),
        TEST_PUBLIC_LOBBY_MIGRATIONS: await readD1Migrations("./public-lobby-migrations"),
        AUTH_ORIGIN: "https://porena.kr",
        GOOGLE_CLIENT_ID: "test-google-client",
        GOOGLE_CLIENT_SECRET: "test-google-secret",
        TEST_ADMIN_PASSWORD,
        ADMIN_USERNAME: TEST_ADMIN_USERNAME,
        ADMIN_PASSWORD_HASH: await hashAdminPassword(TEST_ADMIN_PASSWORD, 1000),
        ADMIN_SESSION_SECRET: "test-session-secret",
        // A made-up Discord application id: lets the suite exercise the Activity origin allowlist.
        DISCORD_ACTIVITY_CLIENT_IDS: "123456789012345678",
        // Public rooms are off in production until they ship; the suite exercises them with a test-only secret.
        PUBLIC_ROOMS_ENABLED: "1",
        PUBLIC_ROOM_SECRET: "test-public-room-secret",
      },
      // The public lobby database is bound here only. wrangler.jsonc gets the binding when the production database
      // is created at release, so merging this code changes nothing in production.
      d1Databases: { PUBLIC_LOBBY_DB: "public-lobby-test" },
    },
  })],
  test: { include: ["tests/worker/**/*.test.ts"], setupFiles: ["./tests/worker/applyMigrations.ts"], testTimeout: 20000 },
}));
