import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import type { RoomSnapshot } from "../../src/game/room";
import type { SessionCredential } from "../../src/shared/protocol";
import { PRESENTATION_VERSION } from "../../src/shared/presentationTimeline";

it("does not replace a due broadcast alarm while serving another request", async () => {
  const origin = "https://porena.test";
  const response = await exports.default.fetch(`${origin}/api/rooms`, {
    method: "POST", headers: { Origin: origin, "CF-Connecting-IP": "192.0.2.241" },
  });
  const credential = await response.json() as SessionCredential;
  const stub = env.GAME_ROOM.getByName(`room:${credential.roomId}`);
  const result = await runInDurableObject(stub, async (instance, state) => {
    const deadline = Date.now() + 1000;
    await state.storage.setAlarm(deadline);
    const clock = vi.spyOn(Date, "now").mockReturnValue(deadline + 1);
    try {
      // A SYNC_CLOCK/ticket handler may run before the due alarm gets its turn.
      // Rescheduling for that request must not erase other seats' pending reveal.
      await (instance as unknown as { rescheduleAlarm: () => Promise<void> }).rescheduleAlarm();
      return { deadline, next: await state.storage.getAlarm() };
    } finally { clock.mockRestore(); }
  });
  expect(result.next).toBe(result.deadline);
});

it("does not skip the final disclosure alarm if broadcasting crosses the end boundary", async () => {
  const origin = "https://porena.test";
  const response = await exports.default.fetch(`${origin}/api/rooms`, {
    method: "POST", headers: { Origin: origin, "CF-Connecting-IP": "192.0.2.240" },
  });
  expect(response.status).toBe(201);
  const credential = await response.json() as SessionCredential;
  const stub = env.GAME_ROOM.getByName(`room:${credential.roomId}`);
  const result = await runInDurableObject(stub, async (instance, state) => {
    const internal = instance as unknown as { room: RoomSnapshot; broadcast: () => number | undefined };
    let time = Date.now();
    const end = time + 1000;
    internal.room.status = "PLAYING";
    internal.room.game.phase = "ROUND_RESULT";
    internal.room.barrierSince = time;
    internal.room.presentation = { key: "test-boundary", version: PRESENTATION_VERSION,
      startsAt: time - 1000, endsAt: end, perPlayer: { [credential.playerId]: [] } };
    const original = internal.broadcast;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => time);
    internal.broadcast = () => {
      const disclosedAt = original.call(instance);
      time = end + 1; // Serialization/scheduling crosses the last release deadline.
      return disclosedAt;
    };
    try {
      await instance.alarm();
      return { end, nextAlarm: await state.storage.getAlarm() };
    } finally {
      internal.broadcast = original;
      clock.mockRestore();
    }
  });
  // The final prefix must be sent promptly, without depending on a client's
  // next 10-second clock probe or the later result-confirmation barrier. An overdue
  // time is armed 1ms after the frozen clock: the runtime drops an alarm re-armed at its own time.
  expect(result.nextAlarm).toBeGreaterThanOrEqual(result.end);
  expect(result.nextAlarm).toBeLessThanOrEqual(result.end + 2);
});
