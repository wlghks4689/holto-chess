import { applyAugment } from "./augments";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE } from "./config";
import { beginSecondary, buyCard, choicesFor, createGame, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, sellCard, startNextRound, toggleShopLock } from "./engine";
import type { Augment, HoltoChessGameState } from "./types";
import type { GameAction } from "../shared/protocol";

// Server-only snapshot. Never use this type as a network payload.
export type RoomSnapshot = {
  schema: 1; roomId: string; revision: number; status: "LOBBY" | "PLAYING";
  game: HoltoChessGameState;
  sessions: { playerId: string; tokenHash: string; requests: string[] }[];
  readyIds: string[]; endedShopIds: string[];
  augmentChoices: Record<string, Augment[]>;
};
export function createRoom(roomId: string, seed: number, randomMode: "seeded" | "secure" = "seeded"): RoomSnapshot {
  const game = createGame(seed, randomMode);
  game.players.forEach((p, i) => { p.name = `Player ${i + 1}`; });
  return { schema: 1, roomId, revision: 0, status: "LOBBY", game, sessions: [], readyIds: [], endedShopIds: [], augmentChoices: {} };
}
export function turnKey(room: RoomSnapshot): string {
  return `${room.game.round}:${room.status === "LOBBY" ? "LOBBY" : room.game.phase}`;
}
export function humanIds(room: RoomSnapshot): string[] { return room.sessions.map((s) => s.playerId); }
function activeHumans(room: RoomSnapshot): string[] {
  return humanIds(room).filter((id) => !room.game.players.find((p) => p.id === id)!.eliminated);
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
export function applyRoomAction(source: RoomSnapshot, playerId: string, action: GameAction, expectedTurn: string): RoomSnapshot {
  if (!source.sessions.some((s) => s.playerId === playerId)) throw new Error("세션이 없습니다.");
  if (expectedTurn !== turnKey(source)) throw new Error("단계가 변경되었습니다. 현재 화면에서 다시 시도하세요.");
  const room = structuredClone(source);
  const me = room.game.players.find((p) => p.id === playerId)!;
  const allReady = (ids: string[]) => ids.every((id) => room.readyIds.includes(id));
  if (room.status === "LOBBY") {
    if (action.type !== "READY") throw new Error("아직 게임이 시작되지 않았습니다.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    if (room.sessions.length >= 2 && allReady(humanIds(room))) { room.status = "PLAYING"; room.readyIds = []; }
  } else if (action.type === "READY") {
    const eligible = activeHumans(room);
    const voters = eligible.length ? eligible : humanIds(room);
    if (!voters.includes(playerId)) throw new Error("생존자의 진행을 기다리세요.");
    if (["SHOP", "AUGMENT", "GAME_RESULT", "DECK_SELECT"].includes(room.game.phase)) throw new Error("현재 단계의 행동을 완료하세요.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    if (allReady(voters)) {
      switch (room.game.phase) {
        case "SHOWDOWN_PRIMARY": room.game = resolvePrimary(room.game); break;
        case "GROUP_ASSIGNMENT": room.game = beginSecondary(room.game); break;
        case "SHOWDOWN_SECONDARY": room.game = resolveSecondary(room.game); break;
        case "ROUND_RESULT": {
          if (room.game.round === 2 || room.game.round === 4) {
            room.game.phase = "AUGMENT";
            for (const p of room.game.players.filter((p) => !p.eliminated)) {
              const choices = choicesFor(room.game);
              if (humanIds(room).includes(p.id)) room.augmentChoices[p.id] = choices;
              else applyAugment(p, choices[0]!);
            }
            if (!Object.keys(room.augmentChoices).length) room.game.phase = "NEXT_ROUND";
          } else room.game.phase = "NEXT_ROUND";
          break;
        }
        case "NEXT_ROUND": room.game = startNextRound(room.game); room.endedShopIds = []; break;
      }
      room.readyIds = [];
      // With no surviving humans, the existing AI preparation can complete the shop.
      if (room.game.phase === "SHOP" && !activeHumans(room).length) room.game = prepareShowdown(room.game, humanIds(room));
    }
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
      case "LOCK_SHOP": room.game = toggleShopLock(room.game, playerId); break;
      case "SELECT_CARDS":
        if (room.game.round !== 2 || action.cardIds.length !== 2 || new Set(action.cardIds).size !== 2 || action.cardIds.some((id) => !me.ownedCardIds.includes(id))) throw new Error("보유 카드 2장을 선택하세요.");
        me.selectedCardIds = [...action.cardIds]; break;
      case "END_SHOP_PHASE":
        if (me.ownedCardIds.length !== BALANCE.handLimits[room.game.round]) throw new Error(`카드 ${BALANCE.handLimits[room.game.round]}장이 필요합니다.`);
        if (room.game.round === 2 && me.selectedCardIds.length !== 2) throw new Error("출전 카드 2장을 선택하세요.");
        room.endedShopIds.push(playerId);
        if (activeHumans(room).every((id) => room.endedShopIds.includes(id))) room.game = prepareShowdown(room.game, humanIds(room));
        break;
    }
  }
  assertPoolIntegrity(room.game);
  room.revision++;
  return room;
}
