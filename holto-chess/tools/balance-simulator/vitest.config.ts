import { defineConfig } from "vitest/config";

// A full game with the engine's own bot brain takes seconds, so the default five-second deadline is too tight.
export default defineConfig({ test: { include: ["tools/balance-simulator/**/*.test.ts"], testTimeout: 120_000 } });
