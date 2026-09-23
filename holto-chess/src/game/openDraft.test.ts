import { describe, expect, it, vi } from "vitest";
import { assertPoolIntegrity } from "./cardPool";
import * as poker from "../core/poker/evaluate";
import { autoPickDraft, beginSecondary, buyCard, createGame, getCardPrice, leaveRoundResult, lockRunLoadouts, openDraft, pickDraftCard, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, sellCard, setRunLoadout, startNextRound } from "./engine";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";
import { createPlayerView } from "./playerView";
import { parseClientMessage } from "../shared/protocol";
import { createMatchView } from "./matchView";
import { cinematicTimeline } from "../shared/presentationTimeline";

function r2(seed = 789) {
  let g = resolvePrimary(prepareShowdown(createGame(seed), []));
  g = startNextRound(leaveRoundResult(g)); return g;
}
function drafted(g = r2()) { g = openDraft(g); while (g.phase === "OPEN_DRAFT") g = autoPickDraft(g); return g; }
function next(g: ReturnType<typeof createGame>) {
  g = leaveRoundResult(g);
  if (g.phase === "SURVIVAL_READY") g = leaveRoundResult(resolveSurvival(g));
  return startNextRound(g);
}

describe("open draft rules v2", () => {
  it("awards Split +2 per run with no BB reward and resets both streak counters", () => {
    const g = lockRunLoadouts(drafted());
    g.players.forEach((p) => { p.winStreak = 3; p.loseStreak = 2; });
    const fixed = poker.findBestFive(g.ownershipCardPool.slice(0,5).map((e)=>e.card));
    const spy = vi.spyOn(poker,"findBestFive").mockReturnValue(fixed);
    try {
      const result=resolvePrimary(g);
      result.players.forEach((p,i)=>{ expect(p.points-g.players[i]!.points).toBe(4); expect(p.stackBB).toBe(g.players[i]!.stackBB); expect(p.winStreak).toBe(0); expect(p.loseStreak).toBe(0); });
    } finally { spy.mockRestore(); }
  });
  it.each([[3,2],[4,2],[8,2],[3,1]])("bounds a %i-way survival tie for %i elimination places using Omaha and multi-survivor high-card draw", (count,eliminateCount) => {
    let g=next(resolvePrimary(lockRunLoadouts(drafted()))); g=prepareShowdown(g,[]);
    g.phase="SURVIVAL_READY"; g.survival={playerIds:g.players.slice(0,count).map((p)=>p.id),eliminateCount};
    const fixed=poker.findBestOmaha(g.players[0]!.ownedCardIds.map((id)=>g.ownershipCardPool.find((e)=>e.card.id===id)!.card),g.ownershipCardPool.filter((e)=>!g.players[0]!.ownedCardIds.includes(e.card.id)).slice(0,5).map((e)=>e.card));
    const spy=vi.spyOn(poker,"findBestOmaha").mockReturnValue(fixed);
    try {
      const result=resolveSurvival(g); const match=result.roundResults[0]!;
      expect(match.boards).toHaveLength(3); expect(match.highCardDraw!.survivorIds).toHaveLength(count-eliminateCount);
      expect(result.players.filter((p)=>p.eliminated)).toHaveLength(eliminateCount);
      const owned=g.players.slice(0,count).flatMap((p)=>p.ownedCardIds);
      expect(match.boards.flat().some((c)=>owned.includes(c.id))).toBe(false);
      expect(match.rewards!.every((r)=>r.deltaBB===0 && r.deltaPoints===0)).toBe(true);
      expect(resolveSurvival(structuredClone(g)).roundResults[0]!.highCardDraw).toEqual(match.highCardDraw);
      expect(assertPoolIntegrity(result)).toBe(true);
    } finally { spy.mockRestore(); }
  });
  it("creates eight AVAILABLE cards, shows the synchronized deal-in, then allows picking", () => {
    const g = r2(); expect(g.phase).toBe("DRAFT_ORDER"); expect(g.draft!.cardIds).toHaveLength(8);
    expect(new Set(g.draft!.cardIds).size).toBe(8);
    for (const id of g.draft!.cardIds) expect(g.ownershipCardPool.find((e) => e.card.id === id)!.state).toBe("AVAILABLE");
    expect(g.players.flatMap((p) => p.shopCardIds)).toHaveLength(0);
    expect(() => pickDraftCard(g, g.draft!.order[0]!.playerId, g.draft!.cardIds[0]!)).toThrow();
    const opened = openDraft(g);
    const picked = pickDraftCard(opened, opened.draft!.order[0]!.playerId, opened.draft!.cardIds[0]!);
    expect(picked.draft!.picks).toHaveLength(1);
    expect(assertPoolIntegrity(picked)).toBe(true);
    expect(assertPoolIntegrity(g)).toBe(true);
  });
  it("orders actual points ascending, BB descending only within ties; seed reproduces full ties", () => {
    const g = r2(); g.round = 1; g.phase = "NEXT_ROUND";
    g.players.forEach((p, i) => { p.points = i < 4 ? 1 : 0; p.stackBB = i === 0 ? 900 : 20 + i; });
    const result = startNextRound(g);
    expect(result.draft!.order.map((p) => p.playerId)).toEqual(["p8", "p7", "p6", "p5", "p1", "p4", "p3", "p2"]);
    g.players.forEach((p) => { p.points = 0; p.stackBB = 50; });
    expect(startNextRound(g).draft!.order).toEqual(startNextRound(structuredClone(g)).draft!.order);
  });
  it("charges once, rejects wrong turn/duplicate/unaffordable picks and gives each player one card", () => {
    let g = openDraft(r2()); const id = g.draft!.order[0]!.playerId; const card = g.draft!.cardIds[0]!;
    expect(() => pickDraftCard(g, g.draft!.order[1]!.playerId, card)).toThrow();
    const broke = structuredClone(g); broke.players.find((p) => p.id === id)!.stackBB = 0;
    expect(() => pickDraftCard(broke, id, card)).toThrow(/BB/);
    const before = g.players.find((p) => p.id === id)!.stackBB; const price = getCardPrice(g, id, card);
    g = pickDraftCard(g, id, card); expect(g.players.find((p) => p.id === id)!.stackBB).toBe(before - price);
    expect(() => pickDraftCard(g, g.draft!.order[1]!.playerId, card)).toThrow();
    while (g.phase === "OPEN_DRAFT") g = autoPickDraft(g);
    expect(g.players.every((p) => p.ownedCardIds.length === 3)).toBe(true);
    expect(g.phase).toBe("RUN_LOADOUT"); expect(assertPoolIntegrity(g)).toBe(true);
  });
  it("locks three distinct owned identities, permits swapping secondaries and rejects later changes", () => {
    let g = drafted(); const [a,b,c] = g.players[0]!.ownedCardIds;
    g = setRunLoadout(g, "p1", [a!,b!,c!]); g = setRunLoadout(g, "p1", [a!,c!,b!]);
    expect(g.players[0]!.selectedCardIds).toEqual([a,c,b]);
    expect(() => setRunLoadout(g, "p1", [a!,b!,b!])).toThrow();
    expect(() => setRunLoadout(g, "p1", [a!,b!,g.players[1]!.ownedCardIds[0]!])).toThrow();
    g = lockRunLoadouts(g); expect(g.players.every((p) => p.selectedCardIds.length === 3)).toBe(true);
    expect(() => setRunLoadout(g, "p1", [a!,b!,c!])).toThrow();
  });
  it("accepts AAA identities rather than banning matching ranks", () => {
    let g = drafted(); const aces = g.ownershipCardPool.filter((e) => e.card.rank === 14).slice(0,3);
    for (const p of g.players) { p.ownedCardIds = []; p.selectedCardIds = []; }
    for (const e of g.ownershipCardPool) { e.state = "AVAILABLE"; delete e.ownerPlayerId; delete e.reservedPlayerId; }
    for (const e of aces) { e.state = "OWNED"; e.ownerPlayerId = "p1"; g.players[0]!.ownedCardIds.push(e.card.id); }
    g = setRunLoadout(g, "p1", aces.map((e) => e.card.id)); expect(g.players[0]!.selectedCardIds).toHaveLength(3);
    expect(assertPoolIntegrity(g)).toBe(true);
  });
  it("uses AB / AC, excludes all six owned identities, shares ten unique board cards and awards each RUN", () => {
    const prepared = lockRunLoadouts(drafted()); const g = resolvePrimary(prepared);
    expect(g.phase).toBe("ROUND_RESULT"); expect(g.players.every((p) => !p.eliminated)).toBe(true);
    for (const m of g.roundResults) {
      expect(m.boards).toHaveLength(2); expect(m.suddenDeathCount).toBe(0); expect(m.highCardDraw).toBeUndefined();
      expect(new Set(m.boards.flat().map((c) => c.id)).size).toBe(10);
      const owned = m.playerIds.flatMap((id) => g.players.find((p) => p.id === id)!.ownedCardIds);
      expect(m.boards.flat().some((c) => owned.includes(c.id))).toBe(false);
      for (const id of m.playerIds) {
        const runs = m.runCards![id]!; expect(runs[0]![0]).toBe(runs[1]![0]); expect(runs[0]![1]).not.toBe(runs[1]![1]);
        expect(new Set(runs.flat()).size).toBe(3);
        for (let i=0;i<2;i++) { const reward = m.runRewards![i]!.find((r) => r.playerId === id)!;
          expect(reward.deltaPoints).toBe(m.boardWinnerIds[i]!.includes(id) ? m.boardWinnerIds[i]!.length > 1 ? 2 : 4 : 0);
          if (m.boardWinnerIds[i]!.length > 1) expect(reward.deltaBB).toBe(0);
        }
      }
      const phases = cinematicTimeline(createMatchView(g,m)).map((f) => f.phase);
      expect(phases).toContain("CARD_SWITCH_OUT"); expect(phases).toContain("CARD_SWITCH_IN");
    }
  });
  it("marks direct R3 points-cut eliminations in their showdown reward", () => {
    let g = resolvePrimary(lockRunLoadouts(drafted()));
    g = next(g);
    g.players.forEach((player, index) => { player.points = index < 2 ? -100 + index : 100 + index; });
    g = resolvePrimary(prepareShowdown(g, []));
    const eliminated = g.players.filter((player) => player.eliminated);
    expect(eliminated).toHaveLength(2);
    for (const player of eliminated) {
      const match = g.roundResults.find((candidate) => candidate.matchday === 3 && candidate.playerIds.includes(player.id));
      expect(match?.rewards?.find((reward) => reward.playerId === player.id)).toMatchObject({
        outcome: "ELIMINATED",
      });
      expect(g.roundResults.filter((m) => m.matchday! < 3).flatMap((m) => m.rewards ?? []).every((r) => r.outcome !== "ELIMINATED")).toBe(true);
    }
  });
  it.each([1,17,303,707,9001])("completes new 8→8→6→4 flow with viable R3 shops and 16-card R4 draft (seed %i)", (seed) => {
    let g = resolvePrimary(lockRunLoadouts(drafted(r2(seed))));
    g = next(g); expect(g.round).toBe(3);
    expect(g.players.filter((p) => !p.eliminated)).toHaveLength(8);
    expect(g.players.every((p) => p.shopCardIds.length === 2)).toBe(true);
    expect(g.ownershipCardPool.filter((e) => e.state === "AVAILABLE")).toHaveLength(12);
    g = resolvePrimary(prepareShowdown(g, []));
    if (g.survival) { g = leaveRoundResult(g); g = resolveSurvival(g); }
    expect(g.players.filter((p) => !p.eliminated)).toHaveLength(6);
    g = next(g); expect(g.phase).toBe("DRAFT_ORDER"); expect(g.draft!.cardIds).toHaveLength(16);
    expect(g.ownershipCardPool.filter((e) => e.state === "AVAILABLE")).toHaveLength(28);
    g = drafted(g); expect(g.phase).toBe("SHOP");
    const alive = g.players.filter((p) => !p.eliminated);
    expect(alive.every((p) => p.ownedCardIds.length === 5 && p.shopCardIds.length === 2 && p.purchasesThisRound === 0)).toBe(true);
    expect(g.ownershipCardPool.filter((e) => e.state === "AVAILABLE")).toHaveLength(10);
    const p = alive[0]!;
    expect(() => buyCard(g,p.id,p.shopCardIds[0]!)).toThrow(/한도/);
    g = sellCard(g,p.id,p.ownedCardIds[0]!); g = buyCard(g,p.id,p.shopCardIds[0]!);
    expect(g.players.find((x) => x.id === p.id)!.purchasesThisRound).toBe(1);
    g = rerollShop(rerollShop(g,p.id),p.id); expect(() => rerollShop(g,p.id)).toThrow(/리롤 횟수/);
    g = resolveSecondary(beginSecondary(resolvePrimary(prepareShowdown(g, []))));
    expect(g.players.filter((p) => !p.eliminated)).toHaveLength(4);
    g = next(g); g = resolvePrimary(prepareShowdown(g, []));
    expect(g.phase).toBe("GAME_RESULT");
    expect(g.roundResults[0]!.standingsBefore).toBeDefined();
    expect(g.roundResults[0]!.standingsAfterRuns?.[0]).toBeDefined();
    expect(assertPoolIntegrity(g)).toBe(true);
  });
});

function roomAtDraft() {
  let room = addSession(createRoom("ABCDEF",303),"one").room;
  room = addSession(room,"two").room; room.status="PLAYING"; room.game=r2();
  room.game = openDraft(room.game); room.barrierSince=1000;
  return room;
}
describe("draft authority, timeouts and privacy", () => {
  it("holds every client on the shared three-second deal-in before opening picks", () => {
    let room = addSession(createRoom("DEALIN", 303), "one").room;
    room = addSession(room, "two").room;
    room.status = "PLAYING";
    room.game = r2();
    room.barrierSince = 1_000;
    expect(room.game.phase).toBe("DRAFT_ORDER");
    expect(barrierDeadline(room)).toBe(4_000);
    expect(() => applyRoomAction(room, "p1", { type: "READY" }, turnKey(room), 2_000)).toThrow(/자동/);
    expect(forceBarrier(room, 3_999)).toBeNull();
    room = forceBarrier(room, 4_000)!;
    expect(room.game.phase).toBe("OPEN_DRAFT");
    expect(room.game.draft!.picks).toHaveLength(0);
  });
  it("keeps the human 20-second deadline and advances bot picks after a short beat", () => {
    let room = roomAtDraft(); expect(barrierDeadline(room)).toBe(21000);
    expect(forceBarrier(room,20999)).toBeNull();
    room = forceBarrier(room,21000)!; expect(room.game.draft!.picks).toHaveLength(1);
    expect(barrierDeadline(room)).toBe(22800); expect(forceBarrier(room,22799)).toBeNull();
    room = structuredClone(room);
    while(room.game.phase==="OPEN_DRAFT") room=forceBarrier(room,barrierDeadline(room)!)!;
    expect(room.game.phase).toBe("RUN_LOADOUT");
    expect(barrierDeadline(room)!-room.barrierSince!).toBe(30000);
    room=forceBarrier(room,barrierDeadline(room)!)!; expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(room.game.players.every((p)=>p.selectedCardIds.length===3)).toBe(true);
  });
  it("R2 exposes owned cards; R4 never exposes opponents' old hands, ledger, seed or private sockets", () => {
    const room=roomAtDraft(); const view=createPlayerView(room,"p1");
    expect(view.draft!.publicHands!.p2).toHaveLength(2);
    room.game.round=4; const hidden=createPlayerView(room,"p1");
    expect(hidden.draft!.publicHands).toBeUndefined();
    const json=JSON.stringify(hidden);
    for(const id of room.game.players[1]!.ownedCardIds) expect(json).not.toContain(`"${id}"`);
    for(const word of ["tokenHash","ownershipCardPool","seed"]) expect(json).not.toContain(word);
  });
  it("validates network commands and prevents changes after loadout commit", () => {
    expect(()=>parseClientMessage(JSON.stringify({type:"RUN_LOADOUT",requestId:"test-12345",turnKey:"2:RUN_LOADOUT",cardIds:["As","As","Ah"]}))).toThrow();
    const room=roomAtDraft();room.game=drafted();
    let locked=applyRoomAction(room,"p1",{type:"LOCK_RUN_LOADOUT"},turnKey(room),1000);
    expect(()=>applyRoomAction(locked,"p1",{type:"RUN_LOADOUT",cardIds:locked.game.players[0]!.ownedCardIds},turnKey(locked),1001)).toThrow();
    locked=applyRoomAction(locked,"p2",{type:"LOCK_RUN_LOADOUT"},turnKey(locked),1002);
    expect(locked.game.phase).toBe("SHOWDOWN_PRIMARY");
  });
  it("runs a full room on deadlines without a disconnected human blocking progress", () => {
    let room: RoomSnapshot = roomAtDraft(); let time=21000;
    for(let step=0;step<100 && room.game.phase!=="GAME_RESULT";step++) {
      const end=barrierDeadline(room); expect(end).toBeDefined(); time=Math.max(time,end!);
      room=forceBarrier(room,time)!; expect(room).not.toBeNull(); assertPoolIntegrity(room.game);
    }
    expect(room.game.phase).toBe("GAME_RESULT");
    expect(room.game.players.filter((p)=>!p.eliminated)).toHaveLength(4);
  });
});
