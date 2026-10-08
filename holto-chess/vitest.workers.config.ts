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
        AUTH_ORIGIN: "https://porena.kr",
        GOOGLE_CLIENT_ID: "test-google-client",
        GOOGLE_CLIENT_SECRET: "test-google-secret",
        TEST_ADMIN_PASSWORD,
        ADMIN_USERNAME: TEST_ADMIN_USERNAME,
        ADMIN_PASSWORD_HASH: await hashAdminPassword(TEST_ADMIN_PASSWORD, 1000),
        ADMIN_SESSION_SECRET: "test-session-secret",
        // A made-up Discord application id: lets the suite exercise the Activity origin allowlist.
        DISCORD_ACTIVITY_CLIENT_IDS: "123456789012345678",
      },
    },
  })],
  test: { include: ["tests/worker/**/*.test.ts"], setupFiles: ["./tests/worker/applyMigrations.ts"], testTimeout: 20000 },
}));
