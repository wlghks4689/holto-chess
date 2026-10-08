import { handLimitFor, isAuctionRound, isFinalRound, isLineupFinal, isTripleRunRound, lastRoundFor, minHandFor, purchaseLimitFor } from "./config";
import { burnCardIds, draftPrice, finalStandings, getCard } from "./engine";
import { barrierDeadline, humanIds, pendingBarrierIds, turnKey, type RoomSnapshot } from "./room";
import type { MatchView, PlayerView, PrivatePlayerView, ShowdownPrepView } from "../shared/protocol";
import { createMatchView, normalizeMatchStandings } from "./matchView";
import { matchesVisible, presentationViewFor, visibleMatchesFor } from "./presentation";
import { createRoundSummary, roundMatches } from "./roundSummary";
import { concealedCard, discloseMatch, DISCLOSURE_LEAD_MS, presentationComplete } from "./disclosure";
import { abilityLockCost, abilityPrice, abilityRerollCost, abilityRerollLimit, abilitySellRate, abilityShopSize } from "./abilities";
import { isRoundAbilityEvent } from "./abilities";
import { abilityBenefit, abilityCue, personalAbilityCues, visibleAbilityEvents } from "./abilityVisibility";
import { auctionBudget, auctionMaxWins, auctionMinRaise } from "./finalAuction";
import { cardPrice } from "./config";
import type { Card } from "../core/poker/cards";

function privatePlayerView(room: RoomSnapshot, playerId: string, privateViewNow: number): PrivatePlayerView {
  const g = room.game;
  const frozen = room.presentation && !presentationComplete(room, privateViewNow) && room.presentationPlayers?.round === g.round
    ? room.presentationPlayers.players : undefined;
  let player = (frozen ?? g.players).find((candidate) => candidate.id === playerId)!;
  // Old persisted rooms have no pre-resolution snapshot. Recover the known hand
  // from the match; omit cleared shop/selection fields consistently for every seat.
  if (!frozen && room.presentation && !presentationComplete(room, privateViewNow)) {
    const shown = g.roundResults.flatMap(match => match.runCards?.[playerId]?.flat() ?? match.revealedCardIds[playerId] ?? []);
    player = { ...player, ownedCardIds: player.ownedCardIds.length ? player.ownedCardIds : [...new Set(shown)],
      shopCardIds: [], selectedCardIds: [], lockedShopCardIds: [] };
  }
  return {
    abilityId: player.abilityId,
    ...(player.abilityId === "target-sniper" && player.firstCardId ? { abilityStartingCard: getCard(g, player.firstCardId) } : {}),
    playerId: player.id, stackBB: player.stackBB, points: player.points, alive: !player.eliminated,
    ownedCards: player.ownedCardIds.map((id) => getCard(g, id)),
    shopCards: player.shopCardIds.map((id) => ({ card: getCard(g, id), price: abilityPrice(player, getCard(g, id).rank) })),
    selectedCardIds: [...player.selectedCardIds],
    handLimit: handLimitFor(g.round, g), minHand: minHandFor(g.round, g), shopSize: abilityShopSize(player, g.round, g),
    shopLocked: false, lockedShopCardIds: [...(player.lockedShopCardIds ?? [])],
    purchases: player.purchasesThisRound, purchaseLimit: purchaseLimitFor(g.round, g),
    rerollsUsed: player.rerollsUsed ?? 0, rerollLimit: abilityRerollLimit(player, g.round, g),
    rerollCost: abilityRerollCost(player), lockCost: abilityLockCost(player),
    sellPercent: Math.round(abilitySellRate(player) * 100),
    committed: room.endedShopIds.includes(player.id),
  };
}

function showdownPrepView(room: RoomSnapshot, viewerPlayerId: string): ShowdownPrepView | undefined {
  const game = room.game;
  if (game.round === 5 && game.finalAuction?.loadoutsRevealed && game.phase === "SHOWDOWN_PRIMARY") {
    const seats = game.players.filter(p => !p.eliminated).map(p => ({ playerId: p.id, name: p.name, points: p.points, abilityId: p.abilityId,
      cards: (p.finalLoadoutCardIds ?? []).map(id => getCard(game, id)),
      blockCards: p.ownedCardIds.filter(id => !p.finalLoadoutCardIds?.includes(id)).map(id => getCard(game, id)), equity: game.finalAuction!.equities?.[p.id] }));
    const viewer = seats.find(p => p.playerId === viewerPlayerId) ?? seats[0]!;
    return { matchNumber: 1, viewer, opponents: seats.filter(p => p.playerId !== viewer.playerId) };
  }
  if (isLineupFinal(game.round, game) && game.phase === "SHOWDOWN_PRIMARY") {
    // R6: the viewer sees their own five, an opponent only card backs; every seat's burn cards are public.
    const seats = game.players.filter(p => !p.eliminated).map(p => {
      const burned = burnCardIds(game, p.id);
      // In lineup order when the saved five is the one played.
      const fromLineup = p.selectedCardIds.filter(id => p.ownedCardIds.includes(id) && !burned.includes(id));
      const played = fromLineup.length === p.ownedCardIds.length - burned.length ? fromLineup : p.ownedCardIds.filter(id => !burned.includes(id));
      return { playerId: p.id, name: p.name, points: p.points, abilityId: p.abilityId,
        cards: p.id === viewerPlayerId ? played.map(id => getCard(game, id)) : played.map((_, index): Card => concealedCard(`prep:${p.id}:${index}`)),
        blockCards: burned.map(id => getCard(game, id)) };
    });
    const viewer = seats.find(p => p.playerId === viewerPlayerId) ?? seats[0]!;
    return { matchNumber: 1, viewer, opponents: seats.filter(p => p.playerId !== viewer.playerId) };
  }
  if (isFinalRound(game.round, game) || game.round === 5 && !game.sixRounds || !["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(game.phase)) return undefined;
  const tripleRun = isTripleRunRound(game.round, game);
  const pairIds = (ids: string[]) => Array.from({ length: Math.floor(ids.length / 2) }, (_, index) => ids.slice(index * 2, index * 2 + 2));
  const groups = game.phase === "SHOWDOWN_PRIMARY" ? game.primaryPairings ?? []
    : game.round === 2 ? [...pairIds(game.winnerGroup), ...pairIds(game.loserGroup)]
      : [game.winnerGroup, game.loserGroup];
  const group = groups.find((ids) => ids.includes(viewerPlayerId));
  if (!group) return undefined;
  const seat = (playerId: string) => {
    const player = game.players.find((candidate) => candidate.id === playerId)!;
    const cards = player.ownedCardIds.map((id) => getCard(game, id));
    const selected = player.selectedCardIds;
    // Locked R5 RUN pairs are public to both seats in the match loading screen.
    if (tripleRun) return { playerId, name: player.name, points: player.points, abilityId: player.abilityId,
      cards, runCards: Array.from({ length: Math.floor(selected.length / 2) }, (_, run) => selected.slice(run * 2, run * 2 + 2).map((id) => getCard(game, id))) };
    const runIds = game.round !== 2 ? undefined : game.rulesVersion === 2 && selected.length === 3
      ? [[selected[0]!, selected[1]!], [selected[0]!, selected[2]!]] as [string[], string[]]
      : selected.length === 2 ? [selected, selected] as [string[], string[]] : undefined;
    return { playerId, name: player.name, points: player.points, cards: (game.round === 2 ? cards : cards.slice(0, 7)), abilityId: player.abilityId,
      ...(runIds ? { runCards: runIds.map((ids) => ids.map((id) => getCard(game, id))) } : {}) };
  };
  const opponents = group.filter((id) => id !== viewerPlayerId).map(seat);
  return { matchNumber: game.phase === "SHOWDOWN_SECONDARY" ? 2 : 1, viewer: seat(viewerPlayerId),
    ...(opponents.length === 1 ? { opponent: opponents[0] } : opponents.length > 1 ? { opponents } : {}) };
}

export function createPlayerView(room: RoomSnapshot, viewerPlayerId: string, connectedIds: readonly string[] = [], now = Date.now()): PlayerView {
  if (!humanIds(room).includes(viewerPlayerId)) throw new Error("Unknown viewer");
  const g = room.game;
  const me = g.players.find((p) => p.id === viewerPlayerId)!;
  const ownAbilityPick = g.abilityDraft?.picks.find((pick) => pick.playerId === viewerPlayerId);
  // The shop barrier is tracked by endedShopIds, every other barrier by readyIds.
  // Without this the shop shows nobody as ready even once they have committed.
  const readyInPhase = (playerId: string): boolean =>
    room.status === "PLAYING" && g.phase === "SHOP" ? room.endedShopIds.includes(playerId) : room.readyIds.includes(playerId);
  const visible = matchesVisible(room);
  const complete = presentationComplete(room, now);
  const matchForViewer = (match: Parameters<typeof createMatchView>[1]) => {
    const full = createMatchView(g, match);
    full.abilityCues = personalAbilityCues(full.abilityCues ?? [], viewerPlayerId);
    return full;
  };
  const publicMatches = (id: string) => visibleMatchesFor(room, id).flatMap(match => {
    const full = createMatchView(g, match);
    if (!complete) normalizeMatchStandings(g, full);
    full.abilityCues = personalAbilityCues(full.abilityCues ?? [], viewerPlayerId);
    if (complete) return [full];
    const entry = room.presentation?.perPlayer[id]?.find(entry => entry.matchId === match.id);
    const disclosed = entry && discloseMatch(full, entry, room.presentation!.startsAt, now + DISCLOSURE_LEAD_MS);
    return disclosed ? [disclosed] : [];
  });
  const isEliminated = (id: string) => {
    const player = g.players.find(player => player.id === id)!;
    return player.eliminated && (complete || player.eliminatedRound !== g.round);
  };
  const publicTotals = (id: string) => {
    const player = g.players.find(player => player.id === id)!;
    const before = g.roundResults.flatMap(match => match.rewards ?? []).find(reward => reward.playerId === id);
    if (g.phase === "SHOP" && id !== viewerPlayerId && room.shopPublicBB?.round === g.round) {
      return { points: player.points, stackBB: room.shopPublicBB.values[id] ?? player.stackBB };
    }
    return { points: !complete ? before?.beforePoints ?? g.roundResults[0]?.standingsBefore?.[id] ?? player.points : player.points,
      stackBB: !complete ? before?.beforeBB ?? player.stackBB : player.stackBB };
  };
  const privateView = (id: string, spectator = false): PrivatePlayerView => {
    const value = privatePlayerView(room, id, now);
    // A spectator may follow public play, never inspect everyone's private next hand/shop.
    if (spectator) {
      value.ownedCards = value.ownedCards.map((_, i) => concealedCard(`spectator:${id}:${i}`));
      value.shopCards = []; value.selectedCardIds = []; value.lockedShopCardIds = [];
    }
    return { ...value, ...publicTotals(id), alive: !isEliminated(id),
      ...(!spectator && value.abilityId ? { abilityBenefit: abilityBenefit(visibleAbilityEvents(g.abilityEvents ?? [], g.round, complete,
        new Set(g.roundResults.map(match => match.id)), publicMatches(id)), id) } : {}) };
  };
  const historyFor = (id: string) => visible && complete ? roundMatches(g).filter((match) => match.playerIds.includes(id)).map((match, index) => ({ ...matchForViewer(match), matchNumber: index + 1 })) : [];
  const sameIds = (a: readonly MatchView[], b: readonly MatchView[]) => a.length === b.length && a.every((match, i) => match.id === b[i]!.id);
  const myMatches = visible ? publicMatches(me.id) : [];
  const myHistory = historyFor(me.id);
  // Eliminated seats follow every survivor; each match goes out once and perspectives list ids.
  const spectatorPool = new Map<string, MatchView>();
  const spectatorViews = isEliminated(me.id) ? g.players.filter((player) => !isEliminated(player.id)).map((player) => {
    const matches = visible ? publicMatches(player.id) : [];
    const history = historyFor(player.id);
    for (const match of [...matches, ...history]) if (!spectatorPool.has(match.id)) spectatorPool.set(match.id, match);
    return { playerId: player.id, me: privateView(player.id, true), matchIds: matches.map((match) => match.id),
      ...(sameIds(history, matches) ? {} : { historyIds: history.map((match) => match.id) }),
      ...(presentationViewFor(room, player.id, now) ? { presentation: presentationViewFor(room, player.id, now) } : {}) };
  }) : undefined;
  // Explicit allowlist: never spread GameState, PlayerState, MatchResult or logs into payloads.
  const view: PlayerView = {
    ...(g.finalAuction ? { finalAuction: {
      startedAt: g.finalAuction.startedAt, endsAt: g.finalAuction.endsAt, hardEndsAt: g.finalAuction.hardEndsAt, serverNow: now,
      cards: g.finalAuction.settledAt === null ? g.finalAuction.cardIds.map(id => {
        const card = getCard(g, id), bid = g.finalAuction!.bids[id];
        return { card, basePrice: cardPrice(card.rank), highestAmount: bid?.amount ?? null, hasBid: !!bid,
          isMine: !me.eliminated && bid?.playerId === me.id, minNextBid: bid ? bid.amount + auctionMinRaise(g.finalAuction!) : cardPrice(card.rank) };
      }) : [],
      maxWins: auctionMaxWins(g.finalAuction), minRaiseBB: auctionMinRaise(g.finalAuction),
      publicHands: Object.fromEntries(g.players.filter(p => !p.eliminated).map(p => [p.id, p.ownedCardIds.map(id => getCard(g, id))])),
      ...(!me.eliminated && g.finalAuction.settledAt === null ? { mine: auctionBudget(g, me.id),
        ...(g.finalAuction.outbid[me.id] ? { outbid: { ...g.finalAuction.outbid[me.id]! } } : {}) } : {}),
      ...(g.finalAuction.settledAt !== null ? {
        settlement: { settledAt: g.finalAuction.settledAt, loadoutStartsAt: g.finalAuction.loadoutStartsAt!, results: g.finalAuction.results!.map(r => ({ ...r })) },
        loadout: { startsAt: g.finalAuction.loadoutStartsAt!, endsAt: g.finalAuction.loadoutEndsAt!, locked: !!me.finalLoadoutLocked,
          revealed: !!g.finalAuction.loadoutsRevealed, ...(!me.eliminated ? { cardIds: [...(me.finalLoadoutCardIds ?? [])] } : {}) },
      } : {}),
      ...(g.finalAuction.poolWarning ? { poolWarning: g.finalAuction.poolWarning } : {}),
    } } : {}),
    ...(complete && ["ROUND_RESULT", "GAME_RESULT"].includes(g.phase) && !g.survival ? { roundAbilityCues:
      personalAbilityCues((g.abilityEvents ?? []).filter(event => event.round === g.round && isRoundAbilityEvent(event)).flatMap(event => {
        const cue = abilityCue(event); return cue ? [cue] : [];
      }), viewerPlayerId) } : {}),
    ...(room.status === "PLAYING" && g.abilityDraft && g.phase.startsWith("ABILITY_") ? { abilityDraft: {
      order: [...g.abilityDraft.order], pickedCount: g.abilityDraft.picks.length, slotCount: g.abilityDraft.deck.length,
      availableSlots: g.abilityDraft.deck.flatMap((_, slot) => g.abilityDraft!.picks.some(pick => pick.slot === slot) ? [] : [slot]),
      currentPlayerId: g.phase === "ABILITY_PICK" ? g.abilityDraft.order[g.abilityDraft.picks.length] : undefined,
      ...(ownAbilityPick ? { myPick: { slot: ownAbilityPick.slot, abilityId: me.abilityId! } } : {}),
      abilities: g.abilityDraft.picks.map(pick => ({ playerId: pick.playerId, slot: pick.slot, abilityId: g.players.find(player => player.id === pick.playerId)!.abilityId! })),
    } } : {}),
    gameId: room.gameGeneration ? `${room.roomId}:${room.gameGeneration}` : room.roomId,
    roomId: room.roomId, revision: room.revision, turnKey: room.publicTurnKey?.key ?? turnKey(room),
    serverNow: now, presentation: presentationViewFor(room, viewerPlayerId, now),
    finalResultsReleased: g.phase === "GAME_RESULT" && complete && !!room.finalResultsReleasedAt,
    status: room.status, round: g.round, phase: room.status === "LOBBY" ? "LOBBY" : g.phase,
    ...(g.survival && complete ? { survival: structuredClone(g.survival) } : {}),
    ...(g.draft && ["DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT"].includes(g.phase) ? { draft: {
      cards: g.draft.cardIds.map((id) => ({ card: getCard(g, id), price: g.draft!.picks.find((p) => p.cardId === id)?.price ?? draftPrice(g, g.draft!.order[g.draft!.picks.length]?.playerId ?? me.id, id), claimedBy: g.draft!.picks.find((p) => p.cardId === id)?.playerId })),
      order: g.draft.order.map((p) => ({ ...p })), currentPlayerId: g.draft.order[g.draft.picks.length]?.playerId,
      ...(g.round === 2 || isAuctionRound(g.round, g) ? { publicHands: Object.fromEntries(g.players.filter((p) => !p.eliminated).map((p) => [p.id, p.ownedCardIds.map((id) => getCard(g, id))])) } : {}),
      ...(g.draft.priceMultiplier ? { priceMultiplier: g.draft.priceMultiplier } : {}),
    } } : {}),
    ...(g.opponentSelect && g.phase === "OPPONENT_SELECT" ? { opponentSelect: {
      order: g.opponentSelect.order.map((id) => { const p = g.players.find((player) => player.id === id)!;
        return { playerId: id, points: p.points, stackBB: p.stackBB, cards: p.ownedCardIds.map((cardId) => getCard(g, cardId)) }; }),
      chooserId: g.opponentSelect.chooserId, ...(g.opponentSelect.opponentId ? { opponentId: g.opponentSelect.opponentId } : {}),
    } } : {}),
    // The R5 pairing stays public through the shop and placement; never the other seats' new cards.
    ...(g.opponentSelect?.opponentId && ["SHOP", "RUN_LOADOUT", "SHOWDOWN_PRIMARY"].includes(g.phase) ? { pairings: [[g.opponentSelect.chooserId, g.opponentSelect.opponentId],
      g.opponentSelect.order.filter((id) => id !== g.opponentSelect!.chooserId && id !== g.opponentSelect!.opponentId)] } : {}),
    lastRound: lastRoundFor(g),
    humanCount: room.sessions.length, capacity: 8,
    barrierEndsAt: complete ? barrierDeadline(room) : undefined, waitingOn: complete ? pendingBarrierIds(room) : [],
    me: privateView(me.id),
    ...(showdownPrepView(room, me.id) ? { showdownPrep: showdownPrepView(room, me.id) } : {}),
    ...(spectatorViews ? { spectatorViews, spectatorMatches: [...spectatorPool.values()] } : {}),
    players: g.players.map((p) => ({ abilityId: p.abilityId, playerId: p.id, name: p.name, ...publicTotals(p.id), alive: !isEliminated(p.id), human: humanIds(room).includes(p.id), connected: connectedIds.includes(p.id), ready: readyInPhase(p.id), departed: !!room.sessions.find((s) => s.playerId === p.id)?.departed })),
    matches: myMatches,
    roundSummary: visible && complete ? createRoundSummary(g) : [],
    ...(sameIds(myHistory, myMatches) ? {} : { roundHistory: myHistory }),
    standings: g.phase === "GAME_RESULT" && complete ? finalStandings(g).map((s) => ({ playerId: s.playerId, points: s.points, handScore: s.handScore, stackScore: s.stackScore, stackBB: s.stackBB, total: s.total, displayName: s.hand?.displayName ?? "", finalPlace: s.finalPlace, placement: s.placement, rankPoints: s.rankPoints, eliminatedRound: s.eliminatedRound, cards: s.cards, usedCardIds: s.usedCardIds })) : [],
  };
  return structuredClone(view);
}
