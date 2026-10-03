import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey } from "./room";
import { createPlayerView } from "./playerView";

function started() {
  let room = createRoom("ABCDEF", 815);
  for (let i = 0; i < 8; i++) room = addSession(room, `hash-${i}`).room;
  for (const s of room.sessions) room = applyRoomAction(room, s.playerId, { type: "READY" }, turnKey(room), 1000);
  return room;
}

describe("private outcome projection", () => {
  it("preserves the private snapshot across serialization and reveals only the current table ledger through R1/R3", () => {
    let room = started();
    for (let step = 0; step < 70 && room.game.round <= 3; step++) {
      if (room.presentation && [1, 3].includes(room.game.round)) {
        for (const session of room.sessions) {
          const restored = JSON.parse(JSON.stringify(room));
          for (const entry of room.presentation.perPlayer[session.playerId] ?? []) {
            const time = room.presentation.startsAt + entry.offsetMs;
            const view = createPlayerView(room, session.playerId, [], time);
            expect(createPlayerView(restored, session.playerId, [], time)).toEqual(view);
            for (const match of view.matches) for (const snapshot of match.standingsAfterRuns ?? []) {
              for (const id of Object.keys(snapshot)) if (!match.participantIds.includes(id)) {
                expect(snapshot[id]).toBe(match.standingsBefore?.[id]);
              }
            }
          }
        }
      }
      room = forceBarrier(room, barrierDeadline(room)!)!;
    }
  });
  it("does not include another simultaneous table's reward in before/after standings", () => {
    let room = started();
    while (!room.presentation) room = forceBarrier(room, barrierDeadline(room)!)!;
    for (const session of room.sessions) {
      const view = createPlayerView(room, session.playerId, [], room.presentation.startsAt);
      const match = view.matches[0]!;
      expect(match.standingsBefore).toEqual(Object.fromEntries(view.players.map(p => [p.playerId, 0])));
      const changed = structuredClone(room);
      for (const result of changed.game.roundResults) {
        if (result.playerIds.includes(session.playerId)) continue;
        for (const reward of result.rewards ?? []) {
          reward.deltaPoints += 9; reward.afterPoints += 9;
        }
        if (result.standingsBefore) for (const id of result.playerIds) result.standingsBefore[id] += 9;
      }
      expect(createPlayerView(changed, session.playerId, [], room.presentation.startsAt)).toEqual(view);
    }
  });

  it("keeps the same private hand across hidden elimination and releases it at the shared end", () => {
    let room = started();
    while (!(room.game.round === 3 && room.presentation && room.game.players.some(p => p.eliminatedRound === 3))) {
      room = forceBarrier(room, barrierDeadline(room)!)!;
    }
    const id = room.game.players.find(p => p.eliminatedRound === 3)!.id;
    const now = room.presentation!.startsAt;
    const before = createPlayerView(room, id, [], now);
    expect(before.me.alive).toBe(true);
    expect(before.me.ownedCards).toHaveLength(4);
    const alternate = structuredClone(room);
    const player = alternate.game.players.find(p => p.id === id)!;
    player.eliminated = false;
    delete player.eliminatedRound;
    player.ownedCardIds = before.me.ownedCards.map(card => card.id);
    player.selectedCardIds = [...before.me.selectedCardIds];
    expect(createPlayerView(alternate, id, [], now).me).toEqual(before.me);
    expect(createPlayerView(room, id, [], room.presentation!.endsAt - 1).me.ownedCards).toEqual(before.me.ownedCards);
    expect(createPlayerView(room, id, [], room.presentation!.endsAt).me.ownedCards).toEqual([]);
    expect(room.game.players.find(p => p.id === id)!.ownedCardIds).toEqual([]);
    const legacy = structuredClone(room);
    delete legacy.presentationPlayers;
    const legacyView = createPlayerView(legacy, id, [], now);
    expect(legacyView.me.ownedCards).toEqual(before.me.ownedCards);
    const legacyAlternate = structuredClone(alternate);
    delete legacyAlternate.presentationPlayers;
    expect(createPlayerView(legacyAlternate, id, [], now).me).toEqual(legacyView.me);
  });
});
