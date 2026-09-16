import { BALANCE } from "./config";
import { finalStandings, getCard, getCardPrice } from "./engine";
import { humanIds, turnKey, type RoomSnapshot } from "./room";
import type { PlayerView, RevealedHand } from "../shared/protocol";
import type { Augment, PlayerShowdown } from "./types";

function publicAugment(a: Augment): Augment { return { id: a.id, name: a.name, description: a.description, suit: a.suit, category: a.category }; }

export function createPlayerView(room: RoomSnapshot, viewerPlayerId: string, connectedIds: readonly string[] = []): PlayerView {
  if (!humanIds(room).includes(viewerPlayerId)) throw new Error("Unknown viewer");
  const g = room.game;
  const me = g.players.find((p) => p.id === viewerPlayerId)!;
  const revealed = (r: PlayerShowdown): RevealedHand => ({ playerId: r.playerId, place: r.place, category: r.hand.category, kickers: [...r.hand.kickers], displayName: r.hand.displayName, usedCardIds: [...r.usedCardIds] });
  const visible = room.status === "PLAYING" && ["GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT", "GAME_RESULT"].includes(g.phase);
  // Explicit allowlist: never spread GameState, PlayerState, MatchResult or logs into payloads.
  const view: PlayerView = {
    gameId: room.roomId, roomId: room.roomId, revision: room.revision, turnKey: turnKey(room),
    status: room.status, round: g.round, phase: room.status === "LOBBY" ? "LOBBY" : g.phase,
    humanCount: room.sessions.length, capacity: 8,
    me: {
      playerId: me.id, stackBB: me.stackBB, points: me.points, alive: !me.eliminated,
      ownedCards: me.ownedCardIds.map((id) => getCard(g, id)),
      shopCards: me.shopCardIds.map((id) => ({ card: getCard(g, id), price: getCardPrice(g, me.id, id) })),
      selectedCardIds: [...me.selectedCardIds], augments: me.augments.map(publicAugment),
      augmentChoices: (room.augmentChoices[me.id] ?? []).map(publicAugment),
      handLimit: BALANCE.handLimits[g.round], shopSize: me.shopSize, shopLocked: false, lockedShopCardIds: [...(me.lockedShopCardIds ?? [])],
      purchases: me.purchasesThisRound, purchaseLimit: BALANCE.maxPurchasesPerRound,
      rerollCost: Math.max(0, BALANCE.rerollCostBB - (me.augments.some((a) => a.id === "reroll_discount") ? 2 : 0)),
      sellPercent: me.augments.some((a) => a.id === "sell_bonus") ? 80 : 60,
      committed: room.endedShopIds.includes(me.id),
    },
    players: g.players.map((p) => ({ playerId: p.id, name: p.name, stackBB: p.stackBB, points: p.points, alive: !p.eliminated, human: humanIds(room).includes(p.id), connected: connectedIds.includes(p.id), ready: room.readyIds.includes(p.id), publicAugments: p.augments.map(publicAugment) })),
    matches: visible ? g.roundResults.filter((m) => m.playerIds.includes(me.id)).map((m) => ({
      id: m.id, stage: m.stage, participantIds: [...m.playerIds], winnerIds: [...m.winnerIds],
      boards: m.boards.map((b) => b.map((c) => ({ ...c }))), boardWinnerIds: m.boardWinnerIds.map((ids) => [...ids]),
      results: m.results.map(revealed), boardResults: m.boardResults.map((results) => results.map(revealed)), runoutCount: m.runoutCount, suddenDeathCount: m.suddenDeathCount,
      revealedCards: Object.fromEntries(m.playerIds.map((id) => [id, (m.revealedCardIds[id] ?? []).map((cardId) => getCard(g, cardId))])),
    })) : [],
    standings: g.phase === "GAME_RESULT" ? finalStandings(g).map((s) => ({ playerId: s.playerId, points: s.points, handScore: s.handScore, stackScore: s.stackScore, total: s.total, displayName: s.hand?.displayName ?? "" })) : [],
  };
  return structuredClone(view);
}
