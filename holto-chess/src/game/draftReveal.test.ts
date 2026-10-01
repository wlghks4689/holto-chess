import { describe, expect, it } from "vitest";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { practiceState } from "../tutorial/practiceState";
import { autoPickDraft, completeDraft, getCardPrice, isDraftRevealing, openDraft, pickDraftCard } from "./engine";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";

/** A two-human room sitting in an open draft of the given round. */
function draftRoom(round: 2 | 4): RoomSnapshot {
  let room = createRoom("ABCDEF", 303);
  for (let i = 0; i < 2; i++) room = addSession(room, `hash-${i}`).room;
  room.status = "PLAYING";
  room.game = openDraft(practiceState(303, round));
  room.barrierKey = undefined; room.barrierSince = 1_000;
  return room;
}

/** Plays every pick: humans pick the cheapest affordable card, bot turns are forced at their deadline. */
function playAllPicks(source: RoomSnapshot): { room: RoomSnapshot; now: number } {
  let room = source; let now = 1_000;
  while (!isDraftRevealing(room.game)) {
    const draft = room.game.draft!;
    const picker = draft.order[draft.picks.length]!.playerId;
    if (picker === "p1" || picker === "p2") {
      const me = room.game.players.find((player) => player.id === picker)!;
      const card = draft.cardIds.filter((id) => room.game.ownershipCardPool.find((entry) => entry.card.id === id)?.state === "AVAILABLE")
        .find((id) => getCardPrice(room.game, picker, id) <= me.stackBB);
      if (card) { room = applyRoomAction(room, picker, { type: "DRAFT_PICK", cardId: card }, turnKey(room), now); continue; }
    }
    now = barrierDeadline(room)!;
    room = forceBarrier(room, now)!;
  }
  return { room, now };
}

describe("open draft reveal hold", () => {
  it.each([[4, "SHOP"], [2, "RUN_LOADOUT"]] as const)("holds the finished R%s draft on screen before %s", (round, next) => {
    const { room } = playAllPicks(draftRoom(round));
    // Every pick is made and visible, but the round has not moved on.
    expect(room.game.phase).toBe("OPEN_DRAFT");
    expect(room.game.draft!.picks).toHaveLength(room.game.draft!.order.length);
    const deadline = barrierDeadline(room)!;
    expect(deadline - room.barrierSince!).toBe(BARRIER_TIMEOUT_MS.DRAFT_REVEAL);
    // Nobody can act during the reveal; it ends only on the server clock.
    expect(() => applyRoomAction(room, "p1", { type: "READY" }, turnKey(room), deadline - 1)).toThrow();
    expect(forceBarrier(room, deadline - 1)).toBeNull();
    const after = forceBarrier(room, deadline)!;
    expect(after.game.phase).toBe(next);
    // The next phase's own timer starts after the reveal, so no decision time is lost.
    if (next === "SHOP") expect(barrierDeadline(after)).toBe(deadline + BARRIER_TIMEOUT_MS.SHOP);
  });

  it("keeps the immediate transition for callers that do not hold the reveal", () => {
    let game = openDraft(practiceState(303, 4));
    while (game.phase === "OPEN_DRAFT") game = autoPickDraft(game);
    expect(game.phase).toBe("SHOP");
    let held = openDraft(practiceState(303, 4));
    while (!isDraftRevealing(held)) held = autoPickDraft(held, true);
    expect(() => pickDraftCard(held, held.draft!.order[0]!.playerId, held.draft!.cardIds[0]!, true)).toThrow();
    expect(completeDraft(held).phase).toBe("SHOP");
  });
});
