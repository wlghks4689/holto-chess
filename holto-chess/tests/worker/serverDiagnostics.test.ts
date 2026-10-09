import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import type { SessionCredential } from "../../src/shared/protocol";

async function createRoomStub(ip: string) {
  const origin = "https://porena.test";
  const response = await exports.default.fetch(`${origin}/api/rooms`, { method: "POST", headers: { Origin: origin, "CF-Connecting-IP": ip } });
  const credential = await response.json() as SessionCredential;
  return { credential, stub: env.GAME_ROOM.getByName(`room:${credential.roomId}`) };
}
const events = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

it("logs why the alarm was armed", async () => {
  const { credential, stub } = await createRoomStub("192.0.2.230");
  const logged = await runInDurableObject(stub, async (instance, state) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await state.storage.deleteAlarm();
      await (instance as unknown as { rescheduleAlarm: () => Promise<void> }).rescheduleAlarm();
      return events(log);
    } finally { log.mockRestore(); }
  });
  expect(logged).toContainEqual(expect.objectContaining({ event: "alarm.set", roomId: credential.roomId, reason: "expiry", phase: "LOBBY" }));
});

it("logs a failing alarm with its stack and still throws so the runtime retries", async () => {
  const { credential, stub } = await createRoomStub("192.0.2.231");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    // A throw inside blockConcurrencyWhile breaks the object, as in production, so it surfaces here.
    await expect(runInDurableObject(stub, async (instance) => {
      const internal = instance as unknown as { broadcast: () => number | undefined; alarm: (info?: AlarmInvocationInfo) => Promise<void> };
      internal.broadcast = () => { throw new Error("projection failed"); };
      await internal.alarm({ isRetry: true, retryCount: 2, scheduledTime: Date.now() });
    })).rejects.toThrow("projection failed");
    const logged = events(error).find((entry) => entry.event === "alarm.error");
    expect(logged).toMatchObject({ roomId: credential.roomId, retryCount: 2, message: "projection failed" });
    expect(String(logged?.stack)).toContain("projection failed");
  } finally { error.mockRestore(); }
});
