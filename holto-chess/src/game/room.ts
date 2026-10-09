import { assertPoolIntegrity } from "./cardPool";
import { BALANCE, FINAL_LOADOUT_SIZE, handLimitFor, isLineupFinal, minHandFor } from "./config";
import { assistsShortHands, beginSecondary, buyCard, createGame, createAbilityGame, finishAbilityDeal, finishAbilitySelection, completeLegacyAbilityDraft, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, sellCard, startNextRound, toggleShopLock } from "./engine";
import { autoChooseOpponent, chooseOpponent, completeOpponentSelect, finishCardAuctionReveal, isOpponentRevealing } from "./engine";
import { syncPresentation, type PresentationSchedule } from "./presentation";
import { BARRIER_TIMEOUT_MS, barrierTimeoutMs } from "../shared/barrierTimeouts";
import { PRESENTATION_LEAD_MS, PRESENTATION_VERSION } from "../shared/presentationTimeline";
import type { PorenaGameState } from "./types";
import type { GameAction } from "../shared/protocol";
import { openDraft, autoPickDraft, pickDraftCard, completeDraft, isDraftRevealing, setRunLoadout, lockRunLoadouts, resolveSurvival } from "./engine";
import { finishFinalLoadouts } from "./engine";
import { bidFinalAuction, setFinalLoadout, settleFinalAuction } from "./finalAuction";
import { tickAuctionBots } from "./finalAuctionBot";

// Server-only snapshot. Never use this type as a network payload.
export type RoomSnapshot = {
  schema: 1; roomId: string; revision: number; status: "LOBBY" | "PLAYING";
  /** Rules migration marker; schema 1 storage remains readable. */
  rulesRevision?: 2;
  /** Distinguishes rematches without invalidating persisted pre-audit snapshots. */
  gameGeneration?: number;
  game: PorenaGameState;
  sessions: { playerId: string; tokenHash: string; requests: string[]; departed?: boolean }[];
  readyIds: string[]; endedShopIds: string[];
  loadoutDrafts?: Record<string, (string | null)[]>;
  /** Epoch ms the current barrier began waiting; drives the auto-ready alarm. */
  barrierSince?: number;
  barrierKey?: string;
  /** Shared cinematic schedule for the visible showdown set (server clock). */
  presentation?: PresentationSchedule;
  /** Private pre-resolution state, retained only for the matching round's disclosure. */
  presentationPlayers?: { round: number; players: PorenaGameState["players"] };
  /** Opponents see the entry balance until the shop barrier closes. */
  shopPublicBB?: { round: number; values: Record<string, number> };
  /** Worker-issued opaque action epoch; internal encounter counts never cross the network. */
  publicTurnKey?: { turn: string; key: string };
  finalResultsReleasedAt?: number;
};

// Re-exported so existing server and test imports keep working.
export { BARRIER_TIMEOUT_MS, barrierTimeoutMs };
/** New rooms play six rounds; `sixRounds = false` builds the five-round game rooms saved before it still play. */
export function createRoom(roomId: string, seed: number, randomMode: "seeded" | "secure" = "seeded", rulesVersion: 1 | 2 = 2, abilities = false, sixRounds = true): RoomSnapshot {
  const game = abilities ? createAbilityGame(seed, randomMode, sixRounds) : createGame(seed, randomMode, rulesVersion, false, sixRounds);
  return { schema: 1, rulesRevision: 2, roomId, revision: 0, status: "LOBBY", game, sessions: [], readyIds: [], endedShopIds: [] };
}

/** Remove retired rule data from a persisted room without changing earned points, BB or cards. */
export function migrateRoomSnapshot(source: RoomSnapshot): RoomSnapshot {
  if (source.schema !== 1) throw new Error("Unsupported room snapshot version");
  // ABILITY-DEAL-001 removed the pick order and the pick itself. A room saved in either finishes the deal.
  if (["ABILITY_ORDER", "ABILITY_PICK"].includes(source.game.phase as string) && source.game.abilityDraft) {
    const room = structuredClone(source);
    room.game = completeLegacyAbilityDraft(room.game, room.status !== "LOBBY");
    room.readyIds = []; room.barrierKey = undefined;
    // The reveal gets its full viewing time from the moment the room comes back.
    refreshBarrier(room, Date.now());
    return migrateRoomSnapshot(room);
  }
  const outdatedPresentation = source.presentation && source.presentation.version !== PRESENTATION_VERSION;
  if (source.status === "PLAYING" && source.game.phase === "SHOP" && source.shopPublicBB?.round !== source.game.round) {
    const room = structuredClone(source);
    captureShopBalances(room);
    return migrateRoomSnapshot(room);
  }
  if (source.rulesRevision === 2 && !outdatedPresentation) return source;
  const room = structuredClone(source);
  if (room.rulesRevision === 2) {
    // Preserve the original epoch on deployment/reconnect, not a fresh cinematic.
    syncPresentation(room, room.presentation!.startsAt - PRESENTATION_LEAD_MS);
    return room;
  }
  const legacyRoom = room as RoomSnapshot & { augmentChoices?: unknown };
  const legacyGame = room.game as Omit<PorenaGameState, "phase"> & { augmentChoices?: unknown; phase: string };
  delete legacyRoom.augmentChoices;
  delete legacyGame.augmentChoices;
  for (const player of room.game.players) {
    delete (player as typeof player & { augments?: unknown }).augments;
    player.shopSize = BALANCE.baseShopSize;
  }
  room.game.logs = room.game.logs.filter((entry) => !entry.message.includes("증강"));
  for (const match of room.game.matches) {
    if (!match.pointAwardDetails) continue;
    for (const [playerId, detail] of Object.entries(match.pointAwardDetails)) {
      match.pointAwardDetails[playerId] = detail.replace(/ \+ 증강 \d+/g, "");
    }
  }
  if (legacyGame.phase === "AUGMENT") {
    legacyGame.phase = "NEXT_ROUND";
    room.readyIds = [];
    room.barrierSince = undefined;
    room.barrierKey = undefined;
    room.presentation = undefined;
    refreshBarrier(room, Date.now());
  }
  room.rulesRevision = 2;
  return migrateRoomSnapshot(room);
}

function captureShopBalances(room: RoomSnapshot): void {
  if (room.status === "PLAYING" && room.game.phase === "SHOP" && room.shopPublicBB?.round !== room.game.round) {
    room.shopPublicBB = { round: room.game.round, values: Object.fromEntries(room.game.players.map(player => [player.id, player.stackBB])) };
  } else if (room.game.phase !== "SHOP") delete room.shopPublicBB;
}
export function turnKey(room: RoomSnapshot): string {
  return `${room.game.round}:${room.status === "LOBBY" ? "LOBBY" : room.game.phase}:${room.gameGeneration ?? 0}:${room.game.encounterSequence}`;
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
const BARRIER_PHASES = ["ABILITY_DEAL", "ABILITY_REVEAL", "DRAFT_ORDER", "OPEN_DRAFT", "OPPONENT_SELECT", "RUN_LOADOUT", "SURVIVAL_READY", "SHOP", "SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT", "NEXT_ROUND"];
const AUTOMATIC_PRESENTATION_PHASES = ["ABILITY_DEAL", "DRAFT_ORDER", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"];
const SPECTATOR_TIMER_PHASES = ["ABILITY_DEAL", "ABILITY_REVEAL", "DRAFT_ORDER", "RUN_LOADOUT", "SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT"];

/** No human vote exists here; the server clock preserves viewing time and advances the game. */
function waitingForSpectatorTimer(room: RoomSnapshot): boolean {
  return room.status === "PLAYING" && SPECTATOR_TIMER_PHASES.includes(room.game.phase)
    && activeHumans(room).length === 0 && controlledHumanIds(room).length > 0;
}

/** Every seated human is eliminated (seats that left don't count): only bots are still playing. */
function humansAllOut(room: RoomSnapshot): boolean {
  return room.status === "PLAYING" && room.game.phase !== "GAME_RESULT" && !activeHumans(room).length
    && room.sessions.some((s) => room.game.players.find((p) => p.id === s.playerId)!.eliminated);
}

/**
 * Plays the bots' remaining rounds instantly and opens the final standings without a cinematic,
 * so eliminated humans can start a new game instead of spectating bots.
 */
function finishForBots(room: RoomSnapshot, now: number): void {
  for (let guard = 0; guard < 400 && room.game.phase !== "GAME_RESULT"; guard += 1) {
    if (room.game.phase === "SHOP") room.game = prepareShowdown(room.game, controlledHumanIds(room));
    else if (room.game.phase === "OPEN_DRAFT") room.game = isDraftRevealing(room.game) ? completeDraft(room.game) : autoPickDraft(room.game, true);
    else if (room.game.phase === "FINAL_AUCTION") {
      const auction = room.game.finalAuction!;
      room.game = auction.settledAt === null ? settleFinalAuction(room.game, auction.endsAt) : finishCardAuctionReveal(room.game, auction.loadoutStartsAt ?? auction.settledAt);
    }
    else if (room.game.phase === "OPPONENT_SELECT") room.game = isOpponentRevealing(room.game) ? completeOpponentSelect(room.game) : autoChooseOpponent(room.game);
    else if (room.game.phase === "FINAL_LOADOUT") room.game = finishFinalLoadouts(room.game, room.game.finalAuction!.loadoutEndsAt!, []);
    else advanceReadyBarrier(room, now);
  }
  syncPresentation(room, now);
  if (room.presentation) room.presentation.endsAt = now;
}

/**
 * Screens nobody acts on, ended by the server clock: the finished draft, the chosen R5 pairing,
 * and a bot leader's opponent choice.
 */
function waitingForDraftReveal(room: RoomSnapshot): boolean {
  if (room.status !== "PLAYING") return false;
  if (room.game.phase === "OPPONENT_SELECT") return isOpponentRevealing(room.game) || !activeHumans(room).includes(room.game.opponentSelect?.chooserId ?? "");
  return isDraftRevealing(room.game);
}

/** Who the current barrier is still waiting on. Empty means nothing is blocked. */
export function pendingBarrierIds(room: RoomSnapshot): string[] {
  if (room.status !== "PLAYING" || !BARRIER_PHASES.includes(room.game.phase)) return [];
  const waiting = activeHumans(room);
  if (room.game.phase === "OPEN_DRAFT") {
    const picker = room.game.draft?.order[room.game.draft.picks.length]?.playerId;
    return picker ? [picker] : [];
  }
  if (room.game.phase === "OPPONENT_SELECT") {
    const chooser = room.game.opponentSelect?.chooserId;
    return chooser && !isOpponentRevealing(room.game) && waiting.includes(chooser) ? [chooser] : [];
  }
  if (room.game.phase === "SURVIVAL_READY") return waiting.filter((id) => room.game.survival?.playerIds.includes(id) && !room.readyIds.includes(id));
  if (room.game.phase === "SHOP") return waiting.filter((id) => !room.endedShopIds.includes(id));
  // R6 lineup: only a seat holding more than five cards has a choice to make.
  if (room.game.phase === "RUN_LOADOUT" && isLineupFinal(room.game.round, room.game)) return waiting.filter((id) => !room.readyIds.includes(id)
    && (room.game.players.find((p) => p.id === id)?.ownedCardIds.length ?? 0) > FINAL_LOADOUT_SIZE);
  return waiting.filter((id) => !room.readyIds.includes(id));
}

/** A phase has one deadline; another player's confirmation never restarts it. */
function refreshBarrier(room: RoomSnapshot, now: number): void {
  const pending = pendingBarrierIds(room);
  const blocked = pending.length > 0 || waitingForSpectatorTimer(room) || waitingForDraftReveal(room);
  const step = room.game.phase === "OPEN_DRAFT" ? room.game.draft?.picks.length
    : room.game.phase === "OPPONENT_SELECT" ? room.game.opponentSelect?.opponentId ?? "" : "";
  const key = `${turnKey(room)}|${step}|${blocked ? "waiting" : "done"}`;
  if (room.barrierKey === key) return;
  room.barrierKey = key;
  room.barrierSince = blocked ? now : undefined;
}

/**
 * Epoch ms the barrier may be forced past, or undefined when nothing is waiting. The clock never
 * runs during the shared cinematic: it counts from whichever is later, the barrier or its end.
 */
export function barrierDeadline(room: RoomSnapshot): number | undefined {
  const a = room.game.finalAuction;
  // A settled six-round R3 auction holds its result reveal until loadoutStartsAt.
  if (room.game.phase === "FINAL_AUCTION" && a?.settledAt != null) return a.loadoutStartsAt ?? a.settledAt;
  if (room.game.phase === "FINAL_AUCTION" && a) return Math.min(a.endsAt, ...room.game.players.filter(p => !p.eliminated && !controlledHumanIds(room).includes(p.id)).map(p => a.botNextAt[p.id] ?? a.endsAt));
  if (room.game.phase === "FINAL_LOADOUT" && a) return a.loadoutStartsAt! > (room.barrierSince ?? 0) ? a.loadoutStartsAt : a.loadoutEndsAt;
  if (room.barrierSince === undefined) return undefined;
  // The last human's elimination result gets a short look, then the game ends for the bots.
  if (room.game.phase === "ROUND_RESULT" && humansAllOut(room)) return Math.max(room.barrierSince, room.presentation?.endsAt ?? 0) + BARRIER_TIMEOUT_MS.ALL_OUT_RESULT;
  if (room.game.phase === "OPPONENT_SELECT" && waitingForDraftReveal(room)) return room.barrierSince
    + (isOpponentRevealing(room.game) ? BARRIER_TIMEOUT_MS.OPPONENT_REVEAL : BARRIER_TIMEOUT_MS.BOT_OPPONENT_SELECT);
  if (waitingForDraftReveal(room)) return Math.max(room.barrierSince, room.presentation?.endsAt ?? 0) + BARRIER_TIMEOUT_MS.DRAFT_REVEAL;
  const draftPicker = room.game.phase === "OPEN_DRAFT" ? room.game.draft?.order[room.game.draft.picks.length]?.playerId : undefined;
  const botDraftTurn = !!draftPicker && !activeHumans(room).includes(draftPicker);
  const lineup = room.game.phase === "RUN_LOADOUT" && isLineupFinal(room.game.round, room.game);
  const buyback = room.game.phase === "OPEN_DRAFT" && !!room.game.draft?.priceMultiplier;
  return Math.max(room.barrierSince, room.presentation?.endsAt ?? 0)
    + (botDraftTurn ? BARRIER_TIMEOUT_MS.BOT_DRAFT_PICK : lineup ? BARRIER_TIMEOUT_MS.FINAL_LINEUP : buyback ? BARRIER_TIMEOUT_MS.BUYBACK_PICK : barrierTimeoutMs(room.game.phase));
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
function advanceReadyBarrier(room: RoomSnapshot, now = Date.now()): void {
  if (["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY", "SURVIVAL_READY"].includes(room.game.phase)) {
    room.presentationPlayers = { round: room.game.round, players: structuredClone(room.game.players) };
  }
  switch (room.game.phase) {
    case "ABILITY_DEAL": room.game = finishAbilityDeal(room.game); break;
    case "ABILITY_REVEAL": room.game = finishAbilitySelection(room.game); break;
    case "DRAFT_ORDER": room.game = openDraft(room.game); break;
    case "RUN_LOADOUT": room.game = lockRunLoadouts(room.game, activeHumans(room)); break;
    case "SURVIVAL_READY": room.game = resolveSurvival(room.game); break;
    case "SHOWDOWN_PRIMARY": room.game = resolvePrimary(room.game); break;
    case "GROUP_ASSIGNMENT": room.game = beginSecondary(room.game); break;
    case "SHOWDOWN_SECONDARY": room.game = resolveSecondary(room.game); break;
    case "ROUND_RESULT": {
      if (room.game.survival) { room.game.phase = "SURVIVAL_READY"; break; }
      room.game.phase = "NEXT_ROUND";
      break;
    }
    case "NEXT_ROUND": room.game = startNextRound(room.game, now); room.endedShopIds = []; room.loadoutDrafts = {}; break;
  }
  room.readyIds = [];
  if (room.game.phase === "SHOP" && !activeHumans(room).length) room.game = prepareShowdown(room.game, controlledHumanIds(room));
}

/**
 * Completes whichever barrier just became unblocked. Advancing can unblock the
 * next one too - with every human gone there is nobody left to wait for - so it
 * keeps stepping while nothing is pending and the phase still moves.
 */
function settleBarrier(room: RoomSnapshot, now: number): void {
  if (room.game.phase === "FINAL_AUCTION") return;
  if (room.game.phase === "FINAL_LOADOUT") {
    room.game = finishFinalLoadouts(room.game, now, controlledHumanIds(room));
    if (room.game.phase === "FINAL_LOADOUT") return;
  }
  // Keep the elimination result on screen; anything after it is bots only.
  if (humansAllOut(room) && room.game.phase !== "ROUND_RESULT") { finishForBots(room, now); return; }
  for (let guard = 0; guard < 64; guard += 1) {
    if (room.status === "PLAYING" && room.game.phase === "NEXT_ROUND") { advanceReadyBarrier(room, now); continue; }
    if (room.status !== "PLAYING" || pendingBarrierIds(room).length || waitingForSpectatorTimer(room) || waitingForDraftReveal(room)) return;
    const before = `${room.game.round}:${room.game.phase}`;
    if (room.game.phase === "SHOP") room.game = prepareShowdown(room.game, controlledHumanIds(room));
    else if (BARRIER_PHASES.includes(room.game.phase)) advanceReadyBarrier(room, now);
    else return;
    if (`${room.game.round}:${room.game.phase}` === before) return;
  }
}

function startRematch(room: RoomSnapshot): void {
  room.gameGeneration = (room.gameGeneration ?? 0) + 1;
  const names = Object.fromEntries(room.game.players.map((player) => [player.id, player.name]));
  const seed = (room.game.seed + room.revision + 1) >>> 0 || 1;
  room.game = createAbilityGame(seed, room.game.randomMode);
  for (const session of room.sessions) room.game.players.find((player) => player.id === session.playerId)!.name = names[session.playerId]!;
  room.status = "PLAYING";
  room.readyIds = [];
  room.endedShopIds = [];
  room.loadoutDrafts = {};
  room.barrierSince = undefined;
  room.barrierKey = undefined;
  room.presentation = undefined;
  delete room.finalResultsReleasedAt;
}

/**
 * A seat that left keeps playing through the bot. Reconnecting with the same session hands control
 * back from the round in progress, and whatever the bot did while they were away stands. Returns
 * null when the seat never left, so callers can skip the commit.
 */
export function resumeSession(source: RoomSnapshot, playerId: string, now = Date.now()): RoomSnapshot | null {
  if (!source.sessions.find((session) => session.playerId === playerId)?.departed) return null;
  const room = structuredClone(source);
  room.sessions.find((session) => session.playerId === playerId)!.departed = false;
  refreshBarrier(room, now);
  room.revision++;
  return room;
}

export function applyRoomAction(source: RoomSnapshot, playerId: string, action: GameAction, expectedTurn: string, now = Date.now()): RoomSnapshot {
  const current = source.sessions.find((s) => s.playerId === playerId);
  if (!current) throw new Error("세션이 없습니다.");
  if (current.departed && action.type !== "LEAVE_ROOM") throw new Error("이미 방에서 나갔습니다. 관전만 가능합니다.");
  if (expectedTurn !== turnKey(source)) throw new Error("단계가 변경되었습니다. 현재 화면에서 다시 시도하세요.");
  const deadline = barrierDeadline(source);
  if (source.status === "PLAYING" && source.game.phase === "SHOP"
    && action.type !== "LEAVE_ROOM" && deadline !== undefined && now >= deadline) {
    throw new Error("선택 시간이 끝났습니다. 자동 진행을 기다려 주세요.");
  }
  const room = structuredClone(source);
  const me = room.game.players.find((p) => p.id === playerId)!;
  const allReady = (ids: string[]) => ids.every((id) => room.readyIds.includes(id));
  if (action.type === "LEAVE_ROOM") {
    // The seat stays in the game and is played out by the bot. Nobody waits on
    // this person again, so leaving can never strand the remaining players.
    room.sessions.find((s) => s.playerId === playerId)!.departed = true;
    room.readyIds = room.readyIds.filter((id) => id !== playerId);
    if (room.status === "LOBBY") {
      const remaining = controlledHumanIds(room);
      if (remaining.length >= 2 && allReady(remaining)) { room.status = "PLAYING"; room.readyIds = []; }
    } else settleBarrier(room, now);
  } else if (room.status === "LOBBY") {
    if (action.type !== "READY") throw new Error("아직 게임이 시작되지 않았습니다.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    const remaining = controlledHumanIds(room);
    if (remaining.length >= 2 && allReady(remaining)) { room.status = "PLAYING"; room.readyIds = []; }
  } else if (action.type === "FINAL_RESULTS_VIEWED") {
    if (room.game.phase !== "GAME_RESULT" || !room.presentation || now < room.presentation.endsAt)
      throw new Error("최종 순위표 공개 이후에만 기록을 열 수 있습니다.");
    if (activeHumans(room).length && !activeHumans(room).includes(playerId))
      throw new Error("진행 중인 플레이어의 최종 순위표 공개를 기다려 주세요.");
    room.finalResultsReleasedAt ??= now;
  } else if (action.type === "REMATCH_READY") {
    if (room.game.phase !== "GAME_RESULT") throw new Error("최종 결과 이후에만 새 게임을 시작할 수 있습니다.");
    if (room.presentation && !room.finalResultsReleasedAt) throw new Error("최종 순위표 공개를 기다려 주세요.");
    const players = controlledHumanIds(room);
    if (players.length < 2) throw new Error("같은 방 새 게임에는 실제 플레이어 2명이 필요합니다.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    if (allReady(players)) startRematch(room);
  } else if (action.type === "CANCEL_SHOP_READY") {
    if (room.game.phase !== "SHOP" || me.eliminated || !room.endedShopIds.includes(playerId)) throw new Error("취소할 덱 준비가 없습니다.");
    room.endedShopIds = room.endedShopIds.filter((id) => id !== playerId);
  } else if (action.type === "READY") {
    const eligible = activeHumans(room);
    if (!eligible.includes(playerId)) throw new Error("관전자는 READY를 대신할 수 없습니다.");
    if (room.presentation && now < room.presentation.endsAt) throw new Error("쇼다운 연출이 끝난 뒤 확인해 주세요.");
    if (["FINAL_AUCTION", "FINAL_LOADOUT", "OPEN_DRAFT", "OPPONENT_SELECT", "RUN_LOADOUT", "SHOP", "GAME_RESULT", "DECK_SELECT"].includes(room.game.phase)) throw new Error("현재 단계의 행동을 완료하세요.");
    if (AUTOMATIC_PRESENTATION_PHASES.includes(room.game.phase)) throw new Error("공통 연출이 끝나면 자동으로 진행됩니다.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
    if (allReady(eligible)) advanceReadyBarrier(room, now);
  } else if (action.type === "FINAL_AUCTION_BID") {
    room.game = bidFinalAuction(room.game, playerId, action, now);
  } else if (action.type === "FINAL_LOADOUT" || action.type === "LOCK_FINAL_LOADOUT") {
    room.game = setFinalLoadout(room.game, playerId, action.type === "FINAL_LOADOUT" ? action.cardIds : me.finalLoadoutCardIds ?? [], now, action.type === "LOCK_FINAL_LOADOUT");
  } else if (action.type === "DRAFT_PICK") {
    if (barrierDeadline(source) !== undefined && now >= barrierDeadline(source)!) throw new Error("선택 시간이 끝났습니다.");
    room.game = pickDraftCard(room.game, playerId, action.cardId, true);
  } else if (action.type === "CHOOSE_OPPONENT") {
    if (barrierDeadline(source) !== undefined && now >= barrierDeadline(source)!) throw new Error("선택 시간이 끝났습니다.");
    room.game = chooseOpponent(room.game, playerId, action.playerId);
  } else if (action.type === "RUN_LOADOUT") {
    if (barrierDeadline(source) !== undefined && now >= barrierDeadline(source)!) throw new Error("배치 시간이 끝났습니다.");
    if (room.readyIds.includes(playerId)) throw new Error("이미 구성을 확정했습니다.");
    room.game = setRunLoadout(room.game, playerId, action.cardIds);
  } else if (action.type === "LOCK_RUN_LOADOUT") {
    if (barrierDeadline(source) !== undefined && now >= barrierDeadline(source)!) throw new Error("배치 시간이 끝났습니다.");
    if (room.game.phase !== "RUN_LOADOUT" || me.eliminated) throw new Error("RUN 배치 단계가 아닙니다.");
    room.readyIds = [...new Set([...room.readyIds, playerId])];
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
        { const required = room.game.round === 2 ? 2 : 0;
        if (!required || (room.game.round === 2 ? action.cardIds.length > required : action.cardIds.length !== required) || new Set(action.cardIds).size !== action.cardIds.length || action.cardIds.some((id) => !me.ownedCardIds.includes(id))) throw new Error(`보유 카드 ${required || 2}장을 선택하세요.`); }
        me.selectedCardIds = [...action.cardIds];
        break;
      case "SELECT_LOADOUT": throw new Error("R3는 보유 4장을 모두 사용합니다. 분할 배치는 지원하지 않습니다.");
      case "END_SHOP_PHASE":
        if (me.ownedCardIds.length < minHandFor(room.game.round, room.game) || me.ownedCardIds.length > handLimitFor(room.game.round, room.game)) throw new Error(`카드 ${minHandFor(room.game.round, room.game)}장이 필요합니다.`);
        if (room.game.round === 2 && me.selectedCardIds.length !== 2) throw new Error("출전 카드 2장을 선택하세요.");
        room.endedShopIds.push(playerId);
        if (activeHumans(room).every((id) => room.endedShopIds.includes(id))) room.game = prepareShowdown(room.game, controlledHumanIds(room));
        break;
    }
  }
  settleBarrier(room, now);
  captureShopBalances(room);
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
  if (source.game.phase === "FINAL_AUCTION" || source.game.phase === "FINAL_LOADOUT") {
    const room = structuredClone(source);
    if (room.game.phase === "FINAL_AUCTION") room.game = room.game.finalAuction!.settledAt !== null ? finishCardAuctionReveal(room.game, now)
      : now >= room.game.finalAuction!.endsAt ? settleFinalAuction(room.game, now) : tickAuctionBots(room.game, controlledHumanIds(room), now);
    settleBarrier(room, now); captureShopBalances(room); syncPresentation(room, now); refreshBarrier(room, now);
    // Reveal wake-up has occurred. The next alarm is the fixed loadout deadline.
    if (room.game.phase === "FINAL_LOADOUT") room.barrierSince = now;
    room.revision++; assertPoolIntegrity(room.game); return room;
  }
  const pending = pendingBarrierIds(source);
  const spectatorTimer = waitingForSpectatorTimer(source);
  const draftReveal = waitingForDraftReveal(source);
  if (!pending.length && !spectatorTimer && !draftReveal) return null;
  const room = structuredClone(source);
  if (room.game.phase === "OPEN_DRAFT") {
    room.game = draftReveal ? completeDraft(room.game) : autoPickDraft(room.game, true);
  } else if (room.game.phase === "OPPONENT_SELECT") {
    room.game = isOpponentRevealing(room.game) ? completeOpponentSelect(room.game) : autoChooseOpponent(room.game);
  } else if (room.game.phase === "SHOP") {
    // Preserve complete human Omaha hands when the shop timer expires. Six-round R5/R6 keep every
    // timed-out seat human: the engine only tops up a short hand from that seat's own shop.
    const keep = assistsShortHands(room.game) ? pending
      : room.game.round === 3 ? pending.filter((id) => room.game.players.find((p) => p.id === id)!.ownedCardIds.length === handLimitFor(3, room.game)) : [];
    // Excluding them from the human list hands their shop to the existing bot.
    room.game = prepareShowdown(room.game, controlledHumanIds(room).filter((id) => !pending.includes(id) || keep.includes(id)));
    for (const id of pending) if (!room.endedShopIds.includes(id)) room.endedShopIds.push(id);
  } else {
    room.readyIds = [...new Set([...room.readyIds, ...pending])];
    advanceReadyBarrier(room);
  }
  settleBarrier(room, now);
  captureShopBalances(room);
  syncPresentation(room, now);
  refreshBarrier(room, now);
  assertPoolIntegrity(room.game);
  room.revision++;
  return room;
}
