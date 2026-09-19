import { applyAugment } from "./augments";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE } from "./config";
import { beginSecondary, buyCard, choicesFor, createGame, getCard, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, sellCard, startNextRound, toggleShopLock } from "./engine";
import { pickBotAugment } from "./botStrategy";
import { syncPresentation, type PresentationSchedule } from "./presentation";
import { BARRIER_TIMEOUT_MS, barrierTimeoutMs } from "../shared/barrierTimeouts";
import type { Augment, PorenaGameState } from "./types";
import type { GameAction } from "../shared/protocol";

// Server-only snapshot. Never use this type as a network payload.
export type RoomSnapshot = {
  schema: 1; roomId: string; revision: number; status: "LOBBY" | "PLAYING";
  game: PorenaGameState;
  sessions: { playerId: string; tokenHash: string; requests: string[]; departed?: boolean }[];
  readyIds: string[]; endedShopIds: string[];
  augmentChoices: Record<string, Augment[]>;
  /** Epoch ms the current barrier began waiting; drives the auto-ready alarm. */
  barrierSince?: number;
  barrierKey?: string;
  /** Shared cinematic schedule for the visible showdown set (server clock). */
  presentation?: PresentationSchedule;
};

// Re-exported so existing server and test imports keep working.
export { BARRIER_TIMEOUT_MS, barrierTimeoutMs };
export function createRoom(roomId: string, seed: number, randomMode: "seeded" | "secure" = "seeded"): RoomSnapshot {
  const game = createGame(seed, randomMode);
  return { schema: 1, roomId, revision: 0, status: "LOBBY", game, sessions: [], readyIds: [], endedShopIds: [], augmentChoices: {} };
}
export function turnKey(room: RoomSnapshot): string {
  return `${room.game.round}:${room.status === "LOBBY" ? "LOBBY" : room.game.phase}`;
}
export function humanIds(room: RoomSnapshot): string[] { return room.sessions.map((s) => s.playerId); }
function activeHumans(room: RoomSnapshot): string[] {
  return room.sessions.filter((s) => !s.departed && !room.game.players.find((p) => p.id === s.playerId)!.eliminated)
    .map((s) => s.playerId);
}

/** Seats a real person still controls. A departed seat is played out by the bot. */
function controlledHumanIds(room: RoomSnapshot): string[] {
  return room.sessions.filter((s) => !s.departed).map((s) => s.playerId);
}

/** Phases that hold every surviving human at a barrier before the game advances. */
const BARRIER_PHASES = ["SHOP", "AUGMENT", "SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT", "NEXT_ROUND"];

/** Who the current barrier is still waiting on. Empty means nothing is blocked. */
export function pendingBarrierIds(room: RoomSnapshot): string[] {
  if (room.status !== "PLAYING" || !BARRIER_PHASES.includes(room.game.phase)) return [];
  const waiting = activeHumans(room);
  if (room.game.phase === "SHOP") return waiting.filter((id) => !room.endedShopIds.includes(id));
  if (room.game.phase === "AUGMENT") return waiting.filter((id) => room.augmentChoices[id]?.length);
  return waiting.filter((id) => !room.readyIds.includes(id));
}

/** Restart the countdown whenever the set of blockers changes. */
function refreshBarrier(room: RoomSnapshot, now: number): void {
  const key = `${turnKey(room)}|${pendingBarrierIds(room).join(",")}`;
  if (room.barrierKey === key) return;
  room.barrierKey = key;
  room.barrierSince = pendingBarrierIds(room).length ? now : undefined;
}

/**
 * Epoch ms the barrier may be forced past, or undefined when nothing is waiting. The clock never
 * runs during the shared cinematic: it counts from whichever is later, the barrier or its end.
 */
export function barrierDeadline(room: RoomSnapshot): number | undefined {
  if (room.barrierSince === undefined) return undefined;
  return Math.max(room.barrierSince, room.presentation?.endsAt ?? 0) + barrierTimeoutMs(room.game.phase);
}
export function addSession(source: RoomSnapshot, tokenHash: string): { room: RoomSnapshot; playerId: string } {
  if (source.status !== "LOBBY" || source.sessions.length >= 8) throw new Error("입장할 수 없는 방입니다.");
  const room = structuredClone(source);
  const playerId = `p${room.sessions.length + 1}`;
  room.sessions.push({ playerId, tokenHash, requests: [] });
  room.readyIds = []; // Membership changed: consent must apply to the current lobby.
  room.revision++;
  return { room, playerId };
}

/** Runs the transition a fully-satisfied READY barrier triggers. */
function advanceReadyBarrier(room: RoomSnapshot): void {
  switch (room.game.phase) {
    case "SHOWDOWN_PRIMARY": room.game = resolvePrimary(room.game); break;
    case "GROUP_ASSIGNMENT": room.game = beginSecondary(room.game); break;
    case "SHOWDOWN_SECONDARY": room.game = resolveSecondary(room.game); break;
    case "ROUND_RESULT": {
      if (room.game.round === 2 || room.game.round === 4) {
        room.game.phase = "AUGMENT";
        for (const p of room.game.players.filter((p) => !p.eliminated)) {
          const choices = choicesFor(room.game);
          // A departed seat picks like a bot so it never holds the augment barrier.
          if (activeHumans(room).includes(p.id)) room.augmentChoices[p.id] = choices;
          else applyAugment(p, pickBotAugment(p, choices, room.game.round, p.ownedCardIds.map((id) => getCard(room.game, id))));
        }
        if (!Object.keys(room.augmentChoices).length) room.game.phase = "NEXT_ROUND";
      } else room.game.phase = "NEXT_ROUND";
      break;
    }
    case "NEXT_ROUND": room.game = startNextRound(room.game); room.endedShopIds = []; break;
  }
  room.readyIds = [];
  if (room.game.phase === "SHOP" && !activeHumans(room).length) room.game = prepareShowdown(room.game, controlledHumanIds(room));
}

/**
 * Completes whichever barrier just became unblocked. Advancing can unblock the
 * next one too - with every human gone there is nobody left to wait for - so it
 * keeps stepping while nothing is pending and the phase still moves.
 */
function settleBarrier(room: RoomSnapshot): void {
  for (let guard = 0; guard < 64; guard += 1) {
    if (room.status !== "PLAYING" || pendingBarrierIds(room).length) return;
    const before = `${room.game.round}:${room.game.phase}`;
    if (room.game.phase === "SHOP") room.game = prepareShowdown(room.game, controlledHumanIds(room));
    else if (room.game.phase === "AUGMENT") {
      if (Object.keys(room.augmentChoices).length) return;
      room.game.phase = "NEXT_ROUND";
    } else if (BARRIER_PHASES.includes(room.game.phase)) advanceReadyBarrier(room);
    else return;
    if (`${room.game.round}:${room.game.phase}` === before) return;
  }
}

export function applyRoomAction(source: RoomSnapshot, playerId: string, action: GameAction, expectedTurn: string, now = Date.now()): RoomSnapshot {
  const current = source.sessions.find((s) => s.playerId === playerId);
  if (!current) throw new Error("세션이 없습니다.");
  if (current.departed && action.type !== "LEAVE_ROOM") throw new Error("이미 방에서 나갔습니다. 관전만 가능합니다.");
  if (expectedTurn !== turnKey(source)) throw new Error("단계가 변경되었습니다. 현재 화면에서 다시 시도하세요.");
  const room = structuredClone(source);
  const me = room.game.players.find((p) => p.id === playerId)!;
  const allReady = (ids: string[]) => ids.every((id) => room.readyIds.includes(id));
  if (action.type === "LEAVE_ROOM") {
    // The seat stays in the game and is played out by the bot. Nobody waits on
    // this person again, so leaving can never strand the remaining players.
    room.sessions.find((s) => s.playerId === playerId)!.departed = true;
    room.readyIds = room.readyIds.filter((id) => id !== playerId);
    delete room.augmentChoices[playerId];
    if (room.status === "LOBBY") {
      const remaining = controlledHumanIds(room);
      if (remaining.length >= 2 && allReady(remaining)) { room.status = "PLAYING"; room.readyIds = []; }
    } else settleBarrier(room);
  } else if (room.status === "LOBBY") {
    if (action.type !== "READY") throw new Error("아직 게임이 시작되지 않았습니다.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    const remaining = controlledHumanIds(room);
    if (remaining.length >= 2 && allReady(remaining)) { room.status = "PLAYING"; room.readyIds = []; }
  } else if (action.type === "READY") {
    const eligible = activeHumans(room);
    const voters = eligible.length ? eligible : controlledHumanIds(room);
    if (!voters.includes(playerId)) throw new Error("생존자의 진행을 기다리세요.");
    if (["SHOP", "AUGMENT", "GAME_RESULT", "DECK_SELECT"].includes(room.game.phase)) throw new Error("현재 단계의 행동을 완료하세요.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    if (allReady(voters)) advanceReadyBarrier(room);
  } else if (action.type === "SELECT_AUGMENT") {
    const choice = room.augmentChoices[playerId]?.find((a) => a.id === action.augmentId);
    if (room.game.phase !== "AUGMENT" || me.eliminated || !choice) throw new Error("선택할 수 없는 증강입니다.");
    applyAugment(me, choice); delete room.augmentChoices[playerId];
    if (!Object.keys(room.augmentChoices).length) room.game.phase = "NEXT_ROUND";
  } else {
    if (room.game.phase !== "SHOP" || me.eliminated || room.endedShopIds.includes(playerId)) throw new Error("상점 행동을 할 수 없습니다.");
    switch (action.type) {
      case "BUY_CARD": {
        const entry = room.game.ownershipCardPool.find((e) => e.card.id === action.cardId);
        if (!entry || entry.state !== "RESERVED_IN_SHOP" || entry.reservedPlayerId !== playerId) throw new Error("내 상점에 예약된 카드가 아닙니다.");
        room.game = buyCard(room.game, playerId, action.cardId); break;
      }
      case "SELL_CARD": {
        const entry = room.game.ownershipCardPool.find((e) => e.card.id === action.cardId);
        if (!entry || entry.state !== "OWNED" || entry.ownerPlayerId !== playerId) throw new Error("내 소유 카드가 아닙니다.");
        room.game = sellCard(room.game, playerId, action.cardId); break;
      }
      case "REROLL": room.game = rerollShop(room.game, playerId); break;
      case "LOCK_SHOP": room.game = toggleShopLock(room.game, playerId, action.cardId); break;
      case "SELECT_CARDS":
        { const required = room.game.round === 2 ? 2 : room.game.round === 3 ? 4 : 0;
        if (!required || action.cardIds.length !== required || new Set(action.cardIds).size !== required || action.cardIds.some((id) => !me.ownedCardIds.includes(id))) throw new Error(`보유 카드 ${required || 2}장을 선택하세요.`); }
        me.selectedCardIds = [...action.cardIds]; break;
      case "END_SHOP_PHASE":
        if (me.ownedCardIds.length !== BALANCE.handLimits[room.game.round]) throw new Error(`카드 ${BALANCE.handLimits[room.game.round]}장이 필요합니다.`);
        if (room.game.round === 2 && me.selectedCardIds.length !== 2) throw new Error("출전 카드 2장을 선택하세요.");
        if (room.game.round === 3 && me.selectedCardIds.length !== 4) throw new Error("Game 1·2용 카드 4장을 나누세요.");
        room.endedShopIds.push(playerId);
        if (activeHumans(room).every((id) => room.endedShopIds.includes(id))) room.game = prepareShowdown(room.game, controlledHumanIds(room));
        break;
    }
  }
  settleBarrier(room);
  syncPresentation(room, now);
  refreshBarrier(room, now);
  assertPoolIntegrity(room.game);
  room.revision++;
  return room;
}

/**
 * Forces a barrier that has waited past its deadline. Timed-out seats are played
 * out by the bot for this step only; the person keeps their seat and can return.
 */
export function forceBarrier(source: RoomSnapshot, now = Date.now()): RoomSnapshot | null {
  const deadline = barrierDeadline(source);
  if (deadline === undefined || now < deadline) return null;
  const pending = pendingBarrierIds(source);
  if (!pending.length) return null;
  const room = structuredClone(source);
  if (room.game.phase === "SHOP") {
    // Excluding them from the human list hands their shop to the existing bot.
    room.game = prepareShowdown(room.game, controlledHumanIds(room).filter((id) => !pending.includes(id)));
    for (const id of pending) if (!room.endedShopIds.includes(id)) room.endedShopIds.push(id);
  } else if (room.game.phase === "AUGMENT") {
    for (const id of pending) {
      const choices = room.augmentChoices[id];
      const player = room.game.players.find((p) => p.id === id)!;
      if (choices?.length) applyAugment(player, pickBotAugment(player, choices, room.game.round, player.ownedCardIds.map((c) => getCard(room.game, c))));
      delete room.augmentChoices[id];
    }
    if (!Object.keys(room.augmentChoices).length) room.game.phase = "NEXT_ROUND";
  } else {
    room.readyIds = [...new Set([...room.readyIds, ...pending])];
    advanceReadyBarrier(room);
  }
  settleBarrier(room);
  syncPresentation(room, now);
  refreshBarrier(room, now);
  assertPoolIntegrity(room.game);
  room.revision++;
  return room;
}
