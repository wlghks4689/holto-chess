import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tools/balance-simulator/**/*.test.ts"] } });
