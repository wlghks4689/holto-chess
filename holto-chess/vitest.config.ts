import { defineConfig } from "vitest/config";
// Bot planning is Monte Carlo and several suites play whole eight-player games
// through, so the five-second default is not a useful deadline for them.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], testTimeout: 30_000 } });
