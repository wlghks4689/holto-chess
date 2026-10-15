import type { PorenaGameState } from "../game/types";
import type { LocalGameCommand, LocalGameSnapshot } from "./localGameCommand";

export type LocalGameRequest = { id: number; game: PorenaGameState; command: LocalGameCommand };
export type LocalGameResponse = { id: number; snapshot: LocalGameSnapshot } | { id: number; error: string; fatal?: boolean };
type GameWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">;
export const LOCAL_GAME_TIMEOUT_MS = 20_000;

/** One transaction at a time, reusing the worker's engine caches. Failure never falls back to blocking the UI. */
export function createLocalGameRunner(createWorker: () => GameWorker) {
  let worker: GameWorker | undefined;
  let sequence = 0;
  let pending: { id: number; timer: ReturnType<typeof setTimeout> } | undefined;
  const clear = () => { if (pending) clearTimeout(pending.timer); pending = undefined; };
  const cancel = () => { clear(); worker?.terminate(); worker = undefined; sequence++; };
  return {
    cancel,
    run(game: PorenaGameState, command: LocalGameCommand, publish: (snapshot: LocalGameSnapshot) => void,
      reject: (error: { kind: "worker" | "command"; message?: string }) => void): boolean {
      if (pending) return false;
      const id = ++sequence;
      const failed = () => { if (pending?.id !== id) return; cancel(); reject({ kind: "worker" }); };
      pending = { id, timer: setTimeout(failed, LOCAL_GAME_TIMEOUT_MS) };
      try { worker ??= createWorker(); } catch { failed(); return true; }
      worker.onmessage = (event: MessageEvent<LocalGameResponse>) => {
        if (pending?.id !== id || event.data?.id !== id) return;
        const response = event.data;
        if ("snapshot" in response && response.snapshot?.game && response.snapshot?.view) { clear(); publish(response.snapshot); }
        else if ("error" in response && typeof response.error === "string") {
          if (response.fatal) failed();
          else { clear(); reject({ kind: "command", message: response.error }); }
        }
        else failed();
      };
      worker.onerror = worker.onmessageerror = failed;
      try { worker.postMessage({ id, game, command } satisfies LocalGameRequest); } catch { failed(); }
      return true;
    },
  };
}
