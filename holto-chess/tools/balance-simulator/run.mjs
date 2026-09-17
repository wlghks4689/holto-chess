import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false } });
try {
  const simulator = await server.ssrLoadModule("/tools/balance-simulator/index.ts");
  await simulator.main(process.argv.slice(2));
} finally {
  await server.close();
}
