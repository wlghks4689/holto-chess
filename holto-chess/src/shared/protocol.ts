import type { Card } from "../core/poker/cards";
import type { HandCategory } from "../core/poker/evaluate";
import type { Augment, MatchReward, Phase, Round, TiebreakKind } from "../game/types";

export type GameAction =
  | { type: "READY" }
  | { type: "BUY_CARD"; cardId: string }
  | { type: "SELL_CARD"; cardId: string }
  | { type: "REROLL" }
  | { type: "LOCK_SHOP"; cardId: string }
  | { type: "SELECT_CARDS"; cardIds: string[] }
  | { type: "SELECT_AUGMENT"; augmentId: string }
  | { type: "END_SHOP_PHASE" };
export type ClientMessage =
  | { type: "JOIN_ROOM"; token: string }
  | (GameAction & { requestId: string; turnKey: string });

export type PublicPlayer = { playerId: string; name: string; stackBB: number; points: number; alive: boolean; human: boolean; connected: boolean; ready: boolean; publicAugments: Augment[] };
export type RevealedHand = { playerId: string; place: number; category: HandCategory; kickers: number[]; displayName: string; usedCardIds: string[] };
export type StreetSnapshotView = { street: "PRE_FLOP" | "FLOP" | "TURN" | "RIVER"; results: RevealedHand[] };
export type MatchView = {
  id: string; stage: string; participantIds: string[]; winnerIds: string[];
  round: Round; matchNumber: number; group?: "winner" | "loser"; gameNumber?: 1 | 2;
  rewards: MatchReward[];
  boards: Card[][]; boardWinnerIds: string[][]; boardResults: RevealedHand[][]; results: RevealedHand[];
  streetSnapshots?: StreetSnapshotView[][];
  runoutCount: number; suddenDeathCount: number;
  tiebreakKind?: TiebreakKind; tiebreakStartIndex?: number; regulationWinnerIds?: string[];
  pointAwards?: Record<string, number>; pointAwardDetails?: Record<string, string>;
  revealedCards: Record<string, Card[]>;
};
export type PlayerView = {
  gameId: string; roomId: string; revision: number; turnKey: string;
  status: "LOBBY" | "PLAYING"; round: Round; phase: Phase | "LOBBY";
  humanCount: number; capacity: number;
  me: {
    playerId: string; stackBB: number; points: number; alive: boolean;
    ownedCards: Card[]; shopCards: { card: Card; price: number }[];
    selectedCardIds: string[]; augments: Augment[]; augmentChoices: Augment[];
    handLimit: number; shopSize: number; shopLocked: boolean; lockedShopCardIds: string[]; purchases: number;
    purchaseLimit: number; rerollCost: number; sellPercent: number; committed: boolean;
    rerollsUsed: number; rerollLimit: number;
  };
  players: PublicPlayer[];
  matches: MatchView[];
  standings: { playerId: string; points: number; handScore: number; stackScore: number; total: number; displayName: string; finalPlace: number }[];
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
    if (Object.keys(v).some((k) => !["type", "token"].includes(k)) || !string("token", /^[a-f0-9]{64}$/)) throw new Error("잘못된 세션입니다.");
    return { type: "JOIN_ROOM", token: v.token as string };
  }
  if (!string("requestId", /^[a-zA-Z0-9_-]{8,64}$/) || !string("turnKey", /^[0-9]+:[A-Z_]+$/)) throw new Error("명령 식별자가 필요합니다.");
  const fields: Record<string, string[]> = {
    READY: [], BUY_CARD: ["cardId"], SELL_CARD: ["cardId"], REROLL: [], LOCK_SHOP: ["cardId"],
    SELECT_CARDS: ["cardIds"], SELECT_AUGMENT: ["augmentId"], END_SHOP_PHASE: [],
  };
  if (typeof v.type !== "string" || !Object.hasOwn(fields, v.type)) throw new Error("지원하지 않는 명령입니다.");
  const allowed = ["type", "requestId", "turnKey", ...fields[v.type]];
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw new Error("허용되지 않은 필드입니다.");
  if (["BUY_CARD", "SELL_CARD", "LOCK_SHOP"].includes(v.type) && !string("cardId", /^[2-9TJQKA][cdhs]$/)) throw new Error("잘못된 카드입니다.");
  if (v.type === "SELECT_AUGMENT" && !string("augmentId", /^[a-z_]{1,40}$/)) throw new Error("잘못된 증강입니다.");
  if (v.type === "SELECT_CARDS" && (!Array.isArray(v.cardIds) || ![2, 4].includes(v.cardIds.length) || new Set(v.cardIds).size !== v.cardIds.length || v.cardIds.some((id) => typeof id !== "string" || !/^[2-9TJQKA][cdhs]$/.test(id)))) throw new Error("서로 다른 카드 2장 또는 4장이 필요합니다.");
  return v as ClientMessage;
}
