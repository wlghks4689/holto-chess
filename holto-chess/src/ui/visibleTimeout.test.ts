import { afterEach, expect, it, vi } from "vitest";
import { visibleTimeout } from "./visibleTimeout";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("honors the entire prep interval and completes exactly once", () => {
  vi.useFakeTimers(); const done = vi.fn(); visibleTimeout(done, 3500, undefined, () => true);
  vi.advanceTimersByTime(3480); expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(40); expect(done).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(10000); expect(done).toHaveBeenCalledOnce();
});
it("a background tab cannot consume the remaining reveal", () => {
  vi.useFakeTimers(); let visible = true; const done = vi.fn(); visibleTimeout(done, 3500, undefined, () => visible);
  vi.advanceTimersByTime(1000); visible = false; vi.advanceTimersByTime(30000);
  expect(done).not.toHaveBeenCalled(); visible = true;
  vi.advanceTimersByTime(2480); expect(done).not.toHaveBeenCalled(); vi.advanceTimersByTime(40); expect(done).toHaveBeenCalledOnce();
});
it("a stalled frame does not consume seconds of unpainted presentation", () => {
  vi.useFakeTimers(); let now = 0; vi.spyOn(performance, "now").mockImplementation(() => now);
  const done = vi.fn(); const tick = vi.fn(); const cancel = visibleTimeout(done, 3500, tick, () => true);
  now = 10000; vi.advanceTimersByTime(40); expect(tick).toHaveBeenLastCalledWith(3400); expect(done).not.toHaveBeenCalled();
  cancel(); now = 20000; vi.advanceTimersByTime(4000); expect(tick).toHaveBeenCalledOnce();
});
