import { BALANCE, purchaseLimitFor, regularShopSizeFor, rerollLimitFor } from "./config";
import { finalStandings, getCard, getCardPrice } from "./engine";
import { barrierDeadline, humanIds, pendingBarrierIds, turnKey, type RoomSnapshot } from "./room";
import type { PlayerView, PrivatePlayerView } from "../shared/protocol";
import type { Augment } from "./types";
import { createMatchView } from "./matchView";
import { matchesVisible, presentationViewFor, visibleMatchesFor } from "./presentation";
import { createRoundSummary, roundMatches } from "./roundSummary";

function publicAugment(a: Augment): Augment { return { id: a.id, name: a.name, description: a.description, suit: a.suit, category: a.category }; }

function privatePlayerView(room: RoomSnapshot, playerId: string): PrivatePlayerView {
  const g = room.game;
  const player = g.players.find((candidate) => candidate.id === playerId)!;
  return {
    playerId: player.id, stackBB: player.stackBB, points: player.points, alive: !player.eliminated,
    ownedCards: player.ownedCardIds.map((id) => getCard(g, id)),
    shopCards: player.shopCardIds.map((id) => ({ card: getCard(g, id), price: getCardPrice(g, player.id, id) })),
    selectedCardIds: [...player.selectedCardIds], augments: player.augments.map(publicAugment),
    augmentChoices: (room.augmentChoices[player.id] ?? []).map(publicAugment),
    handLimit: BALANCE.handLimits[g.round], shopSize: g.rulesVersion === 2 ? regularShopSizeFor(g.round) : player.shopSize,
    shopLocked: false, lockedShopCardIds: [...(player.lockedShopCardIds ?? [])],
    purchases: player.purchasesThisRound, purchaseLimit: purchaseLimitFor(g.round, g.rulesVersion ?? 1),
    rerollsUsed: player.rerollsUsed ?? 0, rerollLimit: rerollLimitFor(g.round, g.rulesVersion ?? 1),
    rerollCost: Math.max(0, BALANCE.rerollCostBB - (player.augments.some((a) => a.id === "reroll_discount") ? 2 : 0)),
    sellPercent: player.augments.some((a) => a.id === "sell_bonus") ? 80 : 60,
    committed: room.endedShopIds.includes(player.id),
  };
}

export function createPlayerView(room: RoomSnapshot, viewerPlayerId: string, connectedIds: readonly string[] = [], now = Date.now()): PlayerView {
  if (!humanIds(room).includes(viewerPlayerId)) throw new Error("Unknown viewer");
  const g = room.game;
  const me = g.players.find((p) => p.id === viewerPlayerId)!;
  // The shop barrier is tracked by endedShopIds, every other barrier by readyIds.
  // Without this the shop shows nobody as ready even once they have committed.
  const readyInPhase = (playerId: string): boolean =>
    room.status === "PLAYING" && g.phase === "SHOP" ? room.endedShopIds.includes(playerId) : room.readyIds.includes(playerId);
  const visible = matchesVisible(room);
  // Explicit allowlist: never spread GameState, PlayerState, MatchResult or logs into payloads.
  const view: PlayerView = {
    gameId: room.roomId, roomId: room.roomId, revision: room.revision, turnKey: turnKey(room),
    serverNow: now, presentation: presentationViewFor(room, viewerPlayerId),
    status: room.status, round: g.round, phase: room.status === "LOBBY" ? "LOBBY" : g.phase,
    ...(g.survival ? { survival: structuredClone(g.survival) } : {}),
    ...(g.draft && ["DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT"].includes(g.phase) ? { draft: {
      cards: g.draft.cardIds.map((id) => ({ card: getCard(g, id), price: g.draft!.picks.find((p) => p.cardId === id)?.price ?? getCardPrice(g, g.draft!.order[g.draft!.picks.length]?.playerId ?? me.id, id), claimedBy: g.draft!.picks.find((p) => p.cardId === id)?.playerId })),
      order: g.draft.order.map((p) => ({ ...p })), currentPlayerId: g.draft.order[g.draft.picks.length]?.playerId,
      ...(g.round === 2 ? { publicHands: Object.fromEntries(g.players.map((p) => [p.id, p.ownedCardIds.map((id) => getCard(g, id))])) } : {}),
    } } : {}),
    humanCount: room.sessions.length, capacity: 8,
    barrierEndsAt: barrierDeadline(room), waitingOn: pendingBarrierIds(room),
    me: privatePlayerView(room, me.id),
    ...(me.eliminated ? { spectatorViews: g.players.filter((player) => !player.eliminated).map((player) => ({
      playerId: player.id,
      me: privatePlayerView(room, player.id),
      matches: visible ? visibleMatchesFor(room, player.id).map((match) => createMatchView(g, match)) : [],
      roundHistory: visible ? roundMatches(g).filter((match) => match.playerIds.includes(player.id)).map((match, index) => ({ ...createMatchView(g, match), matchNumber: index + 1 })) : [],
      ...(presentationViewFor(room, player.id) ? { presentation: presentationViewFor(room, player.id) } : {}),
    })) } : {}),
    players: g.players.map((p) => ({ playerId: p.id, name: p.name, stackBB: p.stackBB, points: p.points, alive: !p.eliminated, human: humanIds(room).includes(p.id), connected: connectedIds.includes(p.id), ready: readyInPhase(p.id), departed: !!room.sessions.find((s) => s.playerId === p.id)?.departed, publicAugments: p.augments.map(publicAugment) })),
    matches: visible ? visibleMatchesFor(room, me.id).map((m) => createMatchView(g, m)) : [],
    roundSummary: visible ? createRoundSummary(g) : [],
    roundHistory: visible ? roundMatches(g).filter((m) => m.playerIds.includes(me.id)).map((m, index) => ({ ...createMatchView(g, m), matchNumber: index + 1 })) : [],
    standings: g.phase === "GAME_RESULT" ? finalStandings(g).map((s) => ({ playerId: s.playerId, points: s.points, handScore: s.handScore, stackScore: s.stackScore, stackBB: s.stackBB, total: s.total, displayName: s.hand?.displayName ?? "", finalPlace: s.finalPlace, placement: s.placement, rankPoints: s.rankPoints, eliminatedRound: s.eliminatedRound, cards: s.cards, usedCardIds: s.usedCardIds })) : [],
  };
  return structuredClone(view);
}
