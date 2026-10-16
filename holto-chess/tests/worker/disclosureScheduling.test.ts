import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import type { RoomSnapshot } from "../../src/game/room";
import type { SessionCredential } from "../../src/shared/protocol";
import { PRESENTATION_VERSION } from "../../src/shared/presentationTimeline";
import { barrierDeadline } from "../../src/game/room";
import { MATCH_PREP_MS, PRESENTATION_LEAD_MS } from "../../src/shared/presentationTimeline";
import { createGame } from "../../src/game/engine";
import { createPlayerView } from "../../src/game/playerView";

it.each([false, true])("advances R6 from matching through every board reveal and final release (recover initial alarm=%s)", async recoverInitial => {
  const origin = "https://porena.test";
  const response = await exports.default.fetch(`${origin}/api/rooms`, {
    method: "POST", headers: { Origin: origin, "CF-Connecting-IP": recoverInitial ? "192.0.2.247" : "192.0.2.238" },
  });
  expect(response.status).toBe(201);
  const credential = await response.json() as SessionCredential;
  const stub = env.GAME_ROOM.getByName(`room:${credential.roomId}`);
  const result = await runInDurableObject(stub, async (instance, storageState) => {
    const internal = instance as unknown as { room: RoomSnapshot; commit: (next: RoomSnapshot) => Promise<void>; recoverOverdueBarrier(now: number): Promise<boolean> };
    const next = structuredClone(internal.room);
    next.game = createGame(900); next.status = "PLAYING";
    const game = next.game; game.round = 6; game.phase = "SHOWDOWN_PRIMARY";
    game.ownershipCardPool.forEach(entry => { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; });
    game.players.forEach((player, i) => {
      player.eliminated = i >= 3; player.ownedCardIds = []; player.shopCardIds = []; player.lockedShopCardIds = []; player.selectedCardIds = [];
      if (i >= 3) return;
      for (const entry of game.ownershipCardPool.slice(i * 7, i * 7 + 5 + i)) {
        entry.state = "OWNED"; entry.ownerPlayerId = player.id; player.ownedCardIds.push(entry.card.id);
      }
      player.selectedCardIds = player.ownedCardIds.slice(0, 5);
    });
    next.barrierSince = Date.now();
    await internal.commit(next);
    const setupDeadline = barrierDeadline(internal.room)!;
    const prep = createPlayerView(internal.room, credential.playerId).showdownPrep!;
    const burns = [prep.viewer, ...prep.opponents!].map(seat => seat.blockCards!.length);
    let now = setupDeadline;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const phases: string[] = [];
    try {
      if (recoverInitial) {
        now = setupDeadline - 1;
        expect(await internal.recoverOverdueBarrier(now)).toBe(false);
        expect(internal.room.game.phase).toBe("SHOWDOWN_PRIMARY");
        now = setupDeadline + 1200;
        expect(await internal.recoverOverdueBarrier(now)).toBe(true);
        expect(internal.room.presentation!.startsAt).toBeGreaterThanOrEqual(now + PRESENTATION_LEAD_MS);
      }
      for (let step = 0; step < 80; step++) {
        await storageState.storage.deleteAlarm(); // Simulate the runtime consuming the queued alarm.
        await instance.alarm();
        const view = createPlayerView(internal.room, credential.playerId, [], now);
        phases.push(view.matches[0]?.disclosure?.frames.at(-1)?.phase ?? "WAITING");
        if (view.presentation?.complete) return { burns, phases, complete: true };
        const wake = await storageState.storage.getAlarm();
        if (wake === null || wake <= now || wake - now > 5000) return { burns, phases, complete: false };
        now = wake;
      }
      return { burns, phases, complete: false };
    } finally { clock.mockRestore(); }
  });
  expect(result.burns).toEqual([0, 1, 2]);
  expect(result.complete).toBe(true);
  for (const phase of ["FLOP_1", "FLOP_2", "FLOP_3", "TURN", "RIVER", "FINAL_WINNER", "COMPLETE"]) expect(result.phases).toContain(phase);
});

it("commits a full setup window after slow calculation, stores it, and preserves it on later commits", async () => {
  const origin = "https://porena.test";
  const response = await exports.default.fetch(`${origin}/api/rooms`, {
    method: "POST", headers: { Origin: origin, "CF-Connecting-IP": "192.0.2.239" },
  });
  expect(response.status).toBe(201);
  const credential = await response.json() as SessionCredential;
  const stub = env.GAME_ROOM.getByName(`room:${credential.roomId}`);
  const result = await runInDurableObject(stub, async (instance, state) => {
    const internal = instance as unknown as { room: RoomSnapshot; commit: (next: RoomSnapshot) => Promise<void> };
    internal.room.status = "PLAYING"; internal.room.game.phase = "SHOP";
    const next = structuredClone(internal.room); next.game.phase = "SHOWDOWN_PRIMARY";
    next.barrierSince = Date.now() - 8000; // Clock sampled before an expensive engine transaction.
    const before = Date.now(); await internal.commit(next);
    const saved = await state.storage.get<RoomSnapshot>("snapshot:v1");
    const first = internal.room.barrierSince;
    await internal.commit(structuredClone(internal.room));
    return { before, deadline: barrierDeadline(saved!), first, again: internal.room.barrierSince };
  });
  expect(result.deadline! - result.before).toBeGreaterThanOrEqual(MATCH_PREP_MS + PRESENTATION_LEAD_MS);
  expect(result.again).toBe(result.first);
});

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
