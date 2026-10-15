import { afterEach, expect, it, vi } from "vitest";
import { createLocalGameRunner, LOCAL_GAME_TIMEOUT_MS, type LocalGameRequest } from "./localGameRunner";
import type { PorenaGameState } from "../game/types";

afterEach(() => vi.useRealTimers());
const game = { round: 1 } as PorenaGameState;
function setup() {
  vi.useFakeTimers();
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null } as unknown as Worker;
  const factory = vi.fn(() => worker);
  const runner = createLocalGameRunner(factory);
  const publish = vi.fn(); const reject = vi.fn();
  const run = () => runner.run(game, { type: "ADVANCE" }, publish, reject);
  const reply = (data: unknown) => worker.onmessage?.({ data } as MessageEvent);
  const id = () => (vi.mocked(worker.postMessage).mock.lastCall![0] as LocalGameRequest).id;
  return { worker, factory, runner, publish, reject, run, reply, id };
}
it("serializes transactions, ignores stale replies and reuses the worker", () => {
  const s = setup(); expect(s.run()).toBe(true); expect(s.run()).toBe(false);
  s.reply({ id: s.id() - 1, snapshot: { game, view: {} } }); expect(s.publish).not.toHaveBeenCalled();
  s.reply({ id: s.id(), snapshot: { game, view: {} } }); expect(s.publish).toHaveBeenCalledOnce();
  expect(s.run()).toBe(true); expect(s.factory).toHaveBeenCalledOnce();
  s.runner.cancel(); vi.runAllTimers(); expect(s.reject).not.toHaveBeenCalled();
});
it("reset cancels pending work and cannot publish an old game's reply", () => {
  const s = setup(); s.run(); const old = s.id(); const callback = s.worker.onmessage!;
  s.runner.cancel(); s.run(); callback.call(s.worker, { data: { id: old, snapshot: { game, view: {} } } } as MessageEvent);
  expect(s.publish).not.toHaveBeenCalled(); expect(s.worker.terminate).toHaveBeenCalledOnce();
  s.runner.cancel();
});
it.each(["timeout", "error", "messageerror", "malformed", "engine"])("%s releases busy state and permits retry with a fresh worker", reason => {
  const s = setup(); s.run();
  if (reason === "timeout") vi.advanceTimersByTime(LOCAL_GAME_TIMEOUT_MS);
  if (reason === "error") s.worker.onerror?.({} as ErrorEvent);
  if (reason === "messageerror") s.worker.onmessageerror?.({} as MessageEvent);
  if (reason === "malformed") s.reply({ id: s.id(), snapshot: null });
  if (reason === "engine") s.reply({ id: s.id(), error: "unexpected engine error", fatal: true });
  expect(s.reject).toHaveBeenCalledExactlyOnceWith({ kind: "worker" });
  expect(s.worker.terminate).toHaveBeenCalledOnce(); expect(s.run()).toBe(true);
  expect(s.factory).toHaveBeenCalledTimes(2); s.runner.cancel();
});
it("reports a command rejection without discarding the committed state or reusable worker", () => {
  const s = setup(); s.run(); s.reply({ id: s.id(), error: "insufficient funds" });
  expect(s.publish).not.toHaveBeenCalled(); expect(s.reject).toHaveBeenCalledWith({ kind: "command", message: "insufficient funds" });
  expect(s.run()).toBe(true); expect(s.factory).toHaveBeenCalledOnce(); s.runner.cancel();
});
it("construction and postMessage exceptions cannot leave the UI busy", () => {
  const s = setup(); s.factory.mockImplementationOnce(() => { throw Error("unavailable"); });
  s.run(); expect(s.reject).toHaveBeenCalledWith({ kind: "worker" });
  vi.mocked(s.worker.postMessage).mockImplementationOnce(() => { throw Error("clone"); });
  s.run(); expect(s.reject).toHaveBeenCalledTimes(2); expect(s.run()).toBe(true); s.runner.cancel();
});
