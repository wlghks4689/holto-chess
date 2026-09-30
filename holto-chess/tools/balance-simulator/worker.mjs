import { parentPort, workerData } from "node:worker_threads";
import { createServer } from "vite";

const { config, shard, root } = workerData;
const server = await createServer({ root, configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const simulator = await server.ssrLoadModule("/tools/balance-simulator/index.ts");
  parentPort.postMessage(simulator.runShard(config, shard, () => parentPort.postMessage("game")));
} finally {
  await server.close();
}
