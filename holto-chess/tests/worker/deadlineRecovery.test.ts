import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { createGame, startNextRound } from "../../src/game/engine";
import { barrierDeadline, type RoomSnapshot } from "../../src/game/room";
import type { ServerMessage, SessionCredential } from "../../src/shared/protocol";
import { PRESENTATION_VERSION } from "../../src/shared/presentationTimeline";

it.each([false, true])("recovers an overdue R4 barrier on authenticated sync, once, with a full broadcast (presentation=%s)", async presentation => {
  const origin = "https://porena.test";
  const response = await exports.default.fetch(`${origin}/api/rooms`, {
    method: "POST", headers: { Origin: origin, "CF-Connecting-IP": presentation ? "192.0.2.246" : "192.0.2.245" },
  });
  const credential = await response.json() as SessionCredential;
  const stub = env.GAME_ROOM.getByName(`room:${credential.roomId}`);
  await runInDurableObject(stub, async (instance, state) => {
    const internal = instance as unknown as { room: RoomSnapshot; commit(next: RoomSnapshot): Promise<void> };
    const base = Date.now() + 100_000; // Keep the real runtime alarm out of this deterministic delayed-delivery test.
    let now = base;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const pairs = [new WebSocketPair(), new WebSocketPair()];
    pairs.forEach(pair => { state.acceptWebSocket(pair[1]); pair[0].accept(); });
    const sent: ServerMessage[][] = [[], []];
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    try {
      const next = structuredClone(internal.room);
      const game = createGame(900); game.round = 3; game.phase = "NEXT_ROUND";
      next.game = startNextRound(game, base); next.status = "PLAYING"; next.barrierSince = base;
      next.sessions.push({ playerId: "p2", tokenHash: "test-only", requests: [] });
      if (presentation) next.presentation = { key: "previous-showdown", version: PRESENTATION_VERSION,
        startsAt: base - 1000, endsAt: base + 10_000, perPlayer: {} };
      await internal.commit(next);
      pairs.forEach((pair, index) => {
        pair[1].serializeAttachment({ roomId: credential.roomId, playerId: `p${index + 1}`, joinedAt: base });
        spies.push(vi.spyOn(pair[1], "send").mockImplementation(raw => { sent[index]!.push(JSON.parse(String(raw))); }));
      });
      const deadline = barrierDeadline(internal.room)!;
      await state.storage.setAlarm(deadline);
      const sync = (index: number) => instance.webSocketMessage(pairs[index]![1], JSON.stringify({ type: "SYNC_CLOCK", nonce: "deadline-test" }));
      const revision = internal.room.revision;
      now = deadline - 1;
      await sync(0);
      expect(internal.room.game.phase).toBe("DRAFT_ORDER");
      expect(internal.room.revision).toBe(revision);
      now = deadline + 1200; // Stored alarm exists but its delivery never arrives, as in the incident.
      const put = vi.spyOn(state.storage, "put").mockRejectedValueOnce(new Error("test storage failure"));
      try {
        await sync(0);
        expect(internal.room.game.phase).toBe("DRAFT_ORDER");
        expect(internal.room.revision).toBe(revision);
        expect(sent[1]).toHaveLength(0); // A failed durable commit must never be broadcast.
      } finally { put.mockRestore(); }
      await sync(0);
      expect(internal.room.game.phase).toBe("OPEN_DRAFT");
      expect(internal.room.revision).toBe(revision + 1);
      expect((await state.storage.get<RoomSnapshot>("snapshot:v1"))!.game.phase).toBe("OPEN_DRAFT");
      for (const messages of sent) expect(messages).toContainEqual(expect.objectContaining({ type: "PLAYER_VIEW",
        payload: expect.objectContaining({ revision: revision + 1, phase: "OPEN_DRAFT" }) }));
      expect(await state.storage.getAlarm()).toBeGreaterThan(now);
      await sync(1); // A second player and a late alarm must not replay this transition.
      await state.storage.deleteAlarm();
      await instance.alarm({ scheduledTime: deadline, isRetry: false, retryCount: 0 });
      expect(internal.room.revision).toBe(revision + 1);
      expect(internal.room.game.draft!.picks).toHaveLength(0);
    } finally {
      spies.forEach(spy => spy.mockRestore()); clock.mockRestore();
      pairs.forEach(pair => { if (pair[0].readyState === WebSocket.OPEN) pair[0].close(); }); await state.storage.deleteAlarm();
    }
  });
});
