import type { Card } from "../core/poker/cards";
import type { HandCategory } from "../core/poker/evaluate";
import type { HighCardDraw, MatchReward, Phase, Round, TiebreakKind } from "../game/types";
import type { AbilityDraftView, AbilityId } from "../game/abilities";
import type { AbilityBenefitView, AbilityCue } from "../game/abilities";

export type GameAction =
  | { type: "FINAL_AUCTION_BID"; cardId: string; expectedHighestAmount: number | null; amount?: number }
  | { type: "FINAL_LOADOUT"; cardIds: string[] }
  | { type: "LOCK_FINAL_LOADOUT" }
  | { type: "DRAFT_PICK"; cardId: string }
  | { type: "RUN_LOADOUT"; cardIds: string[] }
  | { type: "CHOOSE_OPPONENT"; playerId: string }
  | { type: "LOCK_RUN_LOADOUT" }
  | { type: "READY" }
  | { type: "BUY_CARD"; cardId: string }
  | { type: "SELL_CARD"; cardId: string }
  | { type: "REROLL" }
  | { type: "LOCK_SHOP"; cardId: string }
  | { type: "SELECT_CARDS"; cardIds: string[] }
  | { type: "SELECT_LOADOUT"; slots: (string | null)[] }
  | { type: "END_SHOP_PHASE" }
  | { type: "CANCEL_SHOP_READY" }
  | { type: "REMATCH_READY" }
  | { type: "FINAL_RESULTS_VIEWED" }
  | { type: "LEAVE_ROOM" };
export type ClientMessage =
  | { type: "JOIN_ROOM"; token: string; nickname?: string }
  | { type: "SYNC_CLOCK"; nonce: string }
  | (GameAction & { requestId: string; turnKey: string });

export type PublicPlayer = { abilityId?: AbilityId; playerId: string; name: string; stackBB: number; points: number; alive: boolean; human: boolean; connected: boolean; ready: boolean; departed: boolean };
export type RevealedHand = { playerId: string; place: number; category: HandCategory; kickers: number[]; displayName: string; usedCardIds: string[] };
export type StreetSnapshotView = { street: "PRE_FLOP" | "FLOP" | "TURN" | "RIVER"; results: RevealedHand[] };
export type MatchView = {
  blockCards?: Record<string, Card[]>;
  abilityCues?: AbilityCue[];
  /** Only frames already authorized by server time; hold the latest while awaiting the next packet. */
  disclosure?: { frames: import("./presentationTimeline").CinematicFrame[]; elapsedMs: number; frameDurationMs?: number };
  runCards?: Record<string, Card[][]>;
  runRewards?: MatchReward[][];
  standingsBefore?: Record<string, number>;
  standingsAfterRuns?: Record<string, number>[];
  matchday?: number;
  swissBefore?: Record<string, import("../game/swiss").SwissRecord>;
  swissAfter?: Record<string, import("../game/swiss").SwissRecord>;
  id: string; stage: string; participantIds: string[]; winnerIds: string[];
  round: Round; matchNumber: number; group?: "winner" | "loser"; gameNumber?: 1 | 2 | 3;
  /** Played in the game's last round. Views always set it; read it through isFinalMatch. */
  final?: boolean;
  rewards: MatchReward[];
  boards: Card[][]; boardWinnerIds: string[][]; boardResults: RevealedHand[][]; results: RevealedHand[];
  streetSnapshots?: StreetSnapshotView[][];
  runoutCount: number; suddenDeathCount: number;
  highCardDraw?: HighCardDraw;
  tiebreakKind?: TiebreakKind; tiebreakStartIndex?: number; regulationWinnerIds?: string[];
  pointAwards?: Record<string, number>; pointAwardDetails?: Record<string, string>;
  revealedCards: Record<string, Card[]>;
};
/** One match in a seat's playback order, relative to the shared presentation start. */
export type PresentationEntry = { matchId: string; offsetMs: number; durationMs: number; prepMs?: number };
/** Server-clock schedule for the current showdown set: same startsAt/endsAt for every seat. */
export type PresentationView = { version: number; startsAt: number; endsAt: number; matches: PresentationEntry[];
  /** Prefix mode: endsAt is 0 until complete; entry duration is only the disclosed elapsed prefix. */
  disclosureMode?: "prefix"; complete?: boolean; waitingForTables?: boolean };
export type RoundSummaryRow = {
  playerId: string; name: string; cards: Card[]; wins: number; draws: number; losses: number;
  /** Points earned in this round only. */
  points: number;
  /** Tournament totals used by the visible leaderboard ordering. */
  totalPoints: number; stackBB: number; rank: number; previousRank?: number;
  eliminated: boolean; bracket?: "winner" | "loser";
};
export type FinalStandingView = { playerId: string; points: number; handScore: number; stackScore: number; stackBB: number; total: number; displayName: string; finalPlace: number; placement: number; rankPoints: number; eliminatedRound?: Round; cards?: Card[]; usedCardIds?: string[] };
export type PrivatePlayerView = {
  abilityBenefit?: AbilityBenefitView;
  abilityStartingCard?: Card;
  abilityId?: AbilityId;
  playerId: string; stackBB: number; points: number; alive: boolean; lockCost: number;
  ownedCards: Card[]; shopCards: { card: Card; price: number }[];
  selectedCardIds: string[];
  loadoutSlots?: (string | null)[];
  handLimit: number; shopSize: number; shopLocked: boolean; lockedShopCardIds: string[]; purchases: number;
  /** Fewest cards this round needs; equals handLimit except in the six-round R6 (five of up to seven). */
  minHand: number;
  purchaseLimit: number; rerollCost: number; sellPercent: number; committed: boolean;
  rerollsUsed: number; rerollLimit: number;
};
/** Matches are sent once in `PlayerView.spectatorMatches`; a perspective lists their ids in order. */
export type SpectatorPlayerView = {
  playerId: string;
  me: PrivatePlayerView;
  matchIds: string[];
  /** Omitted when it equals `matchIds`. */
  historyIds?: string[];
  presentation?: PresentationView;
};
export type ShowdownPrepSeatView = { playerId: string; name: string; points: number; cards: Card[]; blockCards?: Card[]; equity?: number; abilityId?: AbilityId;
  /** R2: the two RUN hands. R5: the viewer's own three RUN pairs. */
  runCards?: Card[][] };
export type ShowdownPrepView = { matchNumber: number; viewer: ShowdownPrepSeatView; opponent?: ShowdownPrepSeatView; opponents?: ShowdownPrepSeatView[] };
export type FinalAuctionView = {
  cards: { card: Card; basePrice: number; highestAmount: number | null; hasBid: boolean; isMine: boolean; minNextBid: number }[];
  /** Bidding opens at startedAt; a six-round R3 shows its rules intro before then. */
  startedAt: number; endsAt: number; hardEndsAt: number; serverNow: number;
  maxWins: number; minRaiseBB: number;
  publicHands: Record<string, Card[]>;
  mine?: { stackBB: number; reservedBB: number; availableBidBB: number; leadingCount: number };
  outbid?: { cardId: string; amount: number; sequence: number };
  settlement?: { settledAt: number; loadoutStartsAt: number; results: { cardId: string; playerId: string; amount: number }[] };
  loadout?: { startsAt: number; endsAt: number; cardIds?: string[]; locked: boolean; revealed: boolean };
  poolWarning?: string;
};
export type PlayerView = {
  finalAuction?: FinalAuctionView;
  roundAbilityCues?: AbilityCue[];
  abilityDraft?: AbilityDraftView;
  survival?: { playerIds: string[]; eliminateCount: number };
  draft?: { cards: { card: Card; price: number; claimedBy?: string }[]; order: { playerId: string; points: number; stackBB: number }[]; currentPlayerId?: string; publicHands?: Record<string, Card[]>;
    /** Six-round R3 buyback: the fixed multiple of the base price every card costs. */
    priceMultiplier?: number };
  /** Six-round R5 pairing: the standings leader chooses an opponent. Every survivor's cards are public. */
  opponentSelect?: { order: { playerId: string; points: number; stackBB: number; cards: Card[] }[]; chooserId: string; opponentId?: string };
  /** Six-round R5 pairs once the leader has chosen: [leader, chosen], [other two]. */
  pairings?: string[][];
  /** R5 in five-round games, R6 in six-round games. */
  lastRound: Round;
  gameId: string; roomId: string; revision: number; turnKey: string;
  /** Server epoch ms when this view was built; clients estimate their clock offset from it. */
  serverNow: number;
  /** Present while showdown matches are visible; drives synchronized cinematic playback. */
  presentation?: PresentationView;
  status: "LOBBY" | "PLAYING"; round: Round; phase: Phase | "LOBBY";
  /** True only after an eligible player has opened the final standings after the shared end. */
  finalResultsReleased?: boolean;
  humanCount: number; capacity: number;
  /** Epoch ms this phase auto-advances without the remaining players, if it is waiting. */
  barrierEndsAt?: number;
  /** Seats this phase is still waiting on. */
  waitingOn: string[];
  me: PrivatePlayerView;
  /** Present only after hands and seats are locked for a showdown. */
  showdownPrep?: ShowdownPrepView;
  /** Read-only private perspectives, sent only to an eliminated seat. */
  spectatorViews?: SpectatorPlayerView[];
  /** Every match the spectator perspectives refer to, once each. */
  spectatorMatches?: MatchView[];
  players: PublicPlayer[];
  matches: MatchView[];
  roundSummary?: RoundSummaryRow[];
  /** Omitted when it holds the same matches as `matches`; the client numbers them in order. */
  roundHistory?: MatchView[];
  standings: FinalStandingView[];
};
export type ServerMessage =
  | { type: "CLOCK_SYNC"; nonce: string; receivedAt: number; sentAt: number }
  | { type: "PLAYER_VIEW"; payload: PlayerView }
  | { type: "ROOM_JOINED"; roomId: string; playerId: string }
  | { type: "ACK"; requestId: string; revision: number }
  | { type: "ERROR"; code: string; params?: Record<string, string | number>; message: string; requestId?: string };
export type SessionCredential = { roomId: string; playerId: string; token: string };

// TypeScript types alone do not validate an untrusted WebSocket frame.
export function parseClientMessage(raw: string): ClientMessage {
  if (raw.length > 4096) throw new Error("메시지가 너무 큽니다.");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("잘못된 메시지입니다.");
  const v = value as Record<string, unknown>;
  const string = (key: string, pattern: RegExp) => typeof v[key] === "string" && pattern.test(v[key] as string);
  if (v.type === "SYNC_CLOCK") {
    if (Object.keys(v).some((k) => !["type", "nonce"].includes(k)) || !string("nonce", /^[a-zA-Z0-9_-]{8,64}$/)) throw new Error("잘못된 시계 요청입니다.");
    return { type: "SYNC_CLOCK", nonce: v.nonce as string };
  }
  if (v.type === "JOIN_ROOM") {
    if (Object.keys(v).some((k) => !["type", "token", "nickname"].includes(k)) || !string("token", /^[a-f0-9]{64}$/)) throw new Error("잘못된 세션입니다.");
    if (v.nickname !== undefined && (typeof v.nickname !== "string" || !/^[\p{L}\p{N} _-]{1,8}$/u.test(v.nickname.trim()))) throw new Error("닉네임은 문자·숫자 1~8자로 입력하세요.");
    return { type: "JOIN_ROOM", token: v.token as string, ...(typeof v.nickname === "string" ? { nickname: v.nickname.trim() } : {}) };
  }
  if (!string("requestId", /^[a-zA-Z0-9_-]{8,64}$/) || !string("turnKey", /^(?:[a-f0-9]{64}|[0-9]+:[A-Z_]+(?::[0-9]+:[0-9]+)?)$/)) throw new Error("명령 식별자가 필요합니다.");
  const fields: Record<string, string[]> = {
    FINAL_AUCTION_BID: ["cardId", "expectedHighestAmount", "amount"], FINAL_LOADOUT: ["cardIds"], LOCK_FINAL_LOADOUT: [],
    DRAFT_PICK: ["cardId"], RUN_LOADOUT: ["cardIds"], LOCK_RUN_LOADOUT: [], CHOOSE_OPPONENT: ["playerId"],
    READY: [], BUY_CARD: ["cardId"], SELL_CARD: ["cardId"], REROLL: [], LOCK_SHOP: ["cardId"],
      SELECT_CARDS: ["cardIds"], END_SHOP_PHASE: [], CANCEL_SHOP_READY: [], REMATCH_READY: [], FINAL_RESULTS_VIEWED: [], LEAVE_ROOM: [],
      SELECT_LOADOUT: ["slots"],
  };
  if (typeof v.type !== "string" || !Object.hasOwn(fields, v.type)) throw new Error("지원하지 않는 명령입니다.");
  const allowed = ["type", "requestId", "turnKey", ...fields[v.type]];
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw new Error("허용되지 않은 필드입니다.");
  if (v.type === "FINAL_AUCTION_BID") {
    if (!string("cardId", /^[2-9TJQKA][cdhs]$/)) throw new Error("NOT_AUCTION_CARD");
    if (v.expectedHighestAmount !== null && (typeof v.expectedHighestAmount !== "number" || !Number.isSafeInteger(v.expectedHighestAmount) || v.expectedHighestAmount < 0)) throw new Error("INVALID_AMOUNT");
    if (v.amount !== undefined && (typeof v.amount !== "number" || !Number.isSafeInteger(v.amount) || v.amount < 0)) throw new Error("INVALID_AMOUNT");
  }
  if (v.type === "FINAL_LOADOUT" && (!Array.isArray(v.cardIds) || v.cardIds.length !== 5 || new Set(v.cardIds).size !== 5 || v.cardIds.some(id => typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id)))) throw new Error("INVALID_LOADOUT");
  if (["BUY_CARD", "SELL_CARD", "LOCK_SHOP", "DRAFT_PICK"].includes(v.type) && !string("cardId", /^[2-9TJQKA][cdhs]$/)) throw new Error("잘못된 카드입니다.");
  // R2 places three cards, the six-round R5 six.
  if (v.type === "RUN_LOADOUT" && (!Array.isArray(v.cardIds) || ![3, 5, 6].includes(v.cardIds.length) || new Set(v.cardIds).size !== v.cardIds.length || v.cardIds.some((id) => typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id)))) throw new Error("서로 다른 카드 3장이 필요합니다.");
  if (v.type === "CHOOSE_OPPONENT" && !string("playerId", /^p[1-8]$/)) throw new Error("잘못된 상대입니다.");
  if (v.type === "SELECT_CARDS" && (!Array.isArray(v.cardIds) || ![0, 1, 2, 4].includes(v.cardIds.length) || new Set(v.cardIds).size !== v.cardIds.length || v.cardIds.some((id) => typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id)))) throw new Error("잘못된 출전 카드 선택입니다.");
  if (v.type === "SELECT_LOADOUT" && (!Array.isArray(v.slots) || v.slots.length !== 4 || v.slots.some((id) => id !== null && (typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id))) || new Set(v.slots.filter((id) => id !== null)).size !== v.slots.filter((id) => id !== null).length)) throw new Error("서로 다른 보유 카드를 소켓에 배치하세요.");
  return v as ClientMessage;
}
