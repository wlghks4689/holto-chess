import type { Card } from "../core/poker/cards";
import type { HandCategory } from "../core/poker/evaluate";
import type { Augment, HighCardDraw, MatchReward, Phase, Round, TiebreakKind } from "../game/types";

export type GameAction =
  | { type: "DRAFT_PICK"; cardId: string }
  | { type: "RUN_LOADOUT"; cardIds: string[] }
  | { type: "LOCK_RUN_LOADOUT" }
  | { type: "READY" }
  | { type: "BUY_CARD"; cardId: string }
  | { type: "SELL_CARD"; cardId: string }
  | { type: "REROLL" }
  | { type: "LOCK_SHOP"; cardId: string }
  | { type: "SELECT_CARDS"; cardIds: string[] }
  | { type: "SELECT_LOADOUT"; slots: (string | null)[] }
  | { type: "SELECT_AUGMENT"; augmentId: string }
  | { type: "END_SHOP_PHASE" }
  | { type: "CANCEL_SHOP_READY" }
  | { type: "REMATCH_READY" }
  | { type: "LEAVE_ROOM" };
export type ClientMessage =
  | { type: "JOIN_ROOM"; token: string; nickname?: string }
  | (GameAction & { requestId: string; turnKey: string });

export type PublicPlayer = { playerId: string; name: string; stackBB: number; points: number; alive: boolean; human: boolean; connected: boolean; ready: boolean; departed: boolean; publicAugments: Augment[] };
export type RevealedHand = { playerId: string; place: number; category: HandCategory; kickers: number[]; displayName: string; usedCardIds: string[] };
export type StreetSnapshotView = { street: "PRE_FLOP" | "FLOP" | "TURN" | "RIVER"; results: RevealedHand[] };
export type MatchView = {
  runCards?: Record<string, Card[][]>;
  runRewards?: MatchReward[][];
  standingsBefore?: Record<string, number>;
  standingsAfterRuns?: Record<string, number>[];
  matchday?: number;
  swissBefore?: Record<string, import("../game/swiss").SwissRecord>;
  swissAfter?: Record<string, import("../game/swiss").SwissRecord>;
  id: string; stage: string; participantIds: string[]; winnerIds: string[];
  round: Round; matchNumber: number; group?: "winner" | "loser"; gameNumber?: 1 | 2;
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
export type PresentationEntry = { matchId: string; offsetMs: number; durationMs: number };
/** Server-clock schedule for the current showdown set: same startsAt/endsAt for every seat. */
export type PresentationView = { version: number; startsAt: number; endsAt: number; matches: PresentationEntry[] };
export type RoundSummaryRow = {
  playerId: string; name: string; cards: Card[]; wins: number; draws: number; losses: number;
  /** Points earned in this round only. */
  points: number;
  /** Tournament totals used by the visible leaderboard ordering. */
  totalPoints: number; stackBB: number; rank: number; previousRank?: number;
  eliminated: boolean; bracket?: "winner" | "loser";
};
export type FinalStandingView = { playerId: string; points: number; handScore: number; augmentScore?: number; stackScore: number; stackBB: number; total: number; displayName: string; finalPlace: number; placement: number; rankPoints: number; eliminatedRound?: Round; cards?: Card[]; usedCardIds?: string[] };
export type PrivatePlayerView = {
  playerId: string; stackBB: number; points: number; alive: boolean;
  ownedCards: Card[]; shopCards: { card: Card; price: number }[];
  selectedCardIds: string[]; augments: Augment[]; augmentChoices: Augment[];
  loadoutSlots?: (string | null)[];
  handLimit: number; shopSize: number; shopLocked: boolean; lockedShopCardIds: string[]; purchases: number;
  purchaseLimit: number; rerollCost: number; sellPercent: number; committed: boolean;
  rerollsUsed: number; rerollLimit: number;
};
export type SpectatorPlayerView = {
  playerId: string;
  me: PrivatePlayerView;
  matches: MatchView[];
  roundHistory: MatchView[];
  presentation?: PresentationView;
};
export type PlayerView = {
  survival?: { playerIds: string[]; eliminateCount: number };
  draft?: { cards: { card: Card; price: number; claimedBy?: string }[]; order: { playerId: string; points: number; stackBB: number }[]; currentPlayerId?: string; publicHands?: Record<string, Card[]> };
  gameId: string; roomId: string; revision: number; turnKey: string;
  /** Server epoch ms when this view was built; clients estimate their clock offset from it. */
  serverNow: number;
  /** Present while showdown matches are visible; drives synchronized cinematic playback. */
  presentation?: PresentationView;
  status: "LOBBY" | "PLAYING"; round: Round; phase: Phase | "LOBBY";
  humanCount: number; capacity: number;
  /** Epoch ms this phase auto-advances without the remaining players, if it is waiting. */
  barrierEndsAt?: number;
  /** Seats this phase is still waiting on. */
  waitingOn: string[];
  me: PrivatePlayerView;
  /** Read-only private perspectives, sent only to an eliminated seat. */
  spectatorViews?: SpectatorPlayerView[];
  players: PublicPlayer[];
  matches: MatchView[];
  roundSummary?: RoundSummaryRow[];
  roundHistory?: MatchView[];
  standings: FinalStandingView[];
};
export type ServerMessage =
  | { type: "PLAYER_VIEW"; payload: PlayerView }
  | { type: "ROOM_JOINED"; roomId: string; playerId: string }
  | { type: "ACK"; requestId: string; revision: number }
  | { type: "ERROR"; code: string; message: string; requestId?: string };
export type SessionCredential = { roomId: string; playerId: string; token: string };

// TypeScript types alone do not validate an untrusted WebSocket frame.
export function parseClientMessage(raw: string): ClientMessage {
  if (raw.length > 4096) throw new Error("메시지가 너무 큽니다.");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("잘못된 메시지입니다.");
  const v = value as Record<string, unknown>;
  const string = (key: string, pattern: RegExp) => typeof v[key] === "string" && pattern.test(v[key] as string);
  if (v.type === "JOIN_ROOM") {
    if (Object.keys(v).some((k) => !["type", "token", "nickname"].includes(k)) || !string("token", /^[a-f0-9]{64}$/)) throw new Error("잘못된 세션입니다.");
    if (v.nickname !== undefined && (typeof v.nickname !== "string" || !/^[\p{L}\p{N} _-]{1,8}$/u.test(v.nickname.trim()))) throw new Error("닉네임은 문자·숫자 1~8자로 입력하세요.");
    return { type: "JOIN_ROOM", token: v.token as string, ...(typeof v.nickname === "string" ? { nickname: v.nickname.trim() } : {}) };
  }
  if (!string("requestId", /^[a-zA-Z0-9_-]{8,64}$/) || !string("turnKey", /^[0-9]+:[A-Z_]+$/)) throw new Error("명령 식별자가 필요합니다.");
  const fields: Record<string, string[]> = {
    DRAFT_PICK: ["cardId"], RUN_LOADOUT: ["cardIds"], LOCK_RUN_LOADOUT: [],
    READY: [], BUY_CARD: ["cardId"], SELL_CARD: ["cardId"], REROLL: [], LOCK_SHOP: ["cardId"],
      SELECT_CARDS: ["cardIds"], SELECT_AUGMENT: ["augmentId"], END_SHOP_PHASE: [], CANCEL_SHOP_READY: [], REMATCH_READY: [], LEAVE_ROOM: [],
      SELECT_LOADOUT: ["slots"],
  };
  if (typeof v.type !== "string" || !Object.hasOwn(fields, v.type)) throw new Error("지원하지 않는 명령입니다.");
  const allowed = ["type", "requestId", "turnKey", ...fields[v.type]];
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw new Error("허용되지 않은 필드입니다.");
  if (["BUY_CARD", "SELL_CARD", "LOCK_SHOP", "DRAFT_PICK"].includes(v.type) && !string("cardId", /^[2-9TJQKA][cdhs]$/)) throw new Error("잘못된 카드입니다.");
  if (v.type === "RUN_LOADOUT" && (!Array.isArray(v.cardIds) || v.cardIds.length !== 3 || new Set(v.cardIds).size !== 3 || v.cardIds.some((id) => typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id)))) throw new Error("서로 다른 카드 3장이 필요합니다.");
  if (v.type === "SELECT_AUGMENT" && !string("augmentId", /^[a-z][a-z0-9_]{0,39}$/)) throw new Error("잘못된 증강입니다.");
  if (v.type === "SELECT_CARDS" && (!Array.isArray(v.cardIds) || ![0, 1, 2, 4].includes(v.cardIds.length) || new Set(v.cardIds).size !== v.cardIds.length || v.cardIds.some((id) => typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id)))) throw new Error("잘못된 출전 카드 선택입니다.");
  if (v.type === "SELECT_LOADOUT" && (!Array.isArray(v.slots) || v.slots.length !== 4 || v.slots.some((id) => id !== null && (typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id))) || new Set(v.slots.filter((id) => id !== null)).size !== v.slots.filter((id) => id !== null).length)) throw new Error("서로 다른 보유 카드를 소켓에 배치하세요.");
  return v as ClientMessage;
}
