/** Development-only presentation fixtures. Never imported by a game or server module. */
import { makeDeck } from "../core/poker/cards";
import { BALANCE } from "../game/config";
import { createGame } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { ABILITY_IDS } from "../game/abilities";
import type { Round } from "../game/types";
import type { MatchView, RoundSummaryRow } from "../shared/protocol";

export const QA_NAMES = ["가나다라마바사아", "LongNicknameWithoutSpaces", "나", "River Fox", "♠ 다이아 바이퍼", "탈락 플레이어", "재접속 대기", "AI 대체"];
export const qaDeck = makeDeck();
export function qaGame(round: Round, count: number) {
  const game = createGame(303);
  game.round = round; game.phase = "SHOP";
  game.players.forEach((player, i) => {
    player.name = QA_NAMES[i]!; player.stackBB = 123456.75; player.points = 98765;
    player.abilityId = ABILITY_IDS[i];
    player.ownedCardIds = qaDeck.slice(i * 6, i * 6 + count).map(card => card.id);
    player.shopCardIds = round === 2 ? [] : qaDeck.slice(48, 50).map(card => card.id);
    player.selectedCardIds = []; player.lockedShopCardIds = [];
  });
  return game;
}
export function qaView(round: Round, count: number) {
  return createPlayerView({ schema:1, roomId:"RESPONSIVE-QA", revision:0, status:"PLAYING", game:qaGame(round, count), sessions:[{ playerId:"p1", tokenHash:"fixture", requests:[] }], readyIds:[], endedShopIds:[] }, "p1");
}
export function qaMatch(round: Round, count: number, multi = round >= 4): MatchView {
  const participantIds = Array.from({ length: multi ? round === 5 ? 4 : 3 : 2 }, (_, i) => `p${i + 1}`);
  const revealedCards = Object.fromEntries(participantIds.map((id, i) => [id, qaDeck.slice(i * 7, i * 7 + count)]));
  const results = participantIds.map((playerId, i) => ({ playerId, place:i + 1, category:"PAIR" as const, kickers:[14, 12, 9, 6], displayName:"원 페어", usedCardIds:revealedCards[playerId]!.slice(0, Math.min(5, count)).map(card => card.id) }));
  const boards = round === 5 ? [] : round === 2 ? [qaDeck.slice(32,37),qaDeck.slice(37,42)] : [qaDeck.slice(32,37)];
  const rewards: MatchView["rewards"] = participantIds.map((playerId,i)=>({playerId,beforeBB:100,afterBB:110,deltaBB:10,beforePoints:20,afterPoints:i === 0 ? 24 : 20,deltaPoints:i === 0 ? 4 : 0,outcome:round === 5 ? "FINAL" : i === 0 ? "WINNER_GROUP" : "LOSER_GROUP"}));
  return { id:`qa-r${round}-${count}-${multi}`, round, matchNumber:1, stage:round === 5 ? "final" : "primary", participantIds, winnerIds:["p1"], revealedCards, results, boards, boardResults:boards.map(() => results), boardWinnerIds:boards.map(() => ["p1"]), runoutCount:boards.length, suddenDeathCount:0, rewards, ...(round === 2 ? { runRewards:[rewards,rewards], runCards:Object.fromEntries(participantIds.map(id => [id, [revealedCards[id]!.slice(0,2), revealedCards[id]!.slice(-2)]])) } : {}) };
}
export function qaRows(round: Round): RoundSummaryRow[] {
  return QA_NAMES.map((name, i) => ({ playerId:`p${i + 1}`, name, cards:qaDeck.slice(i * 5, i * 5 + BALANCE.handLimits[round]), rank:i + 1, wins:12, draws:2, losses:3, points:1234, totalPoints:98765, stackBB:123456.75, eliminated:i >= 6, bracket:i < 4 ? "winner" : "loser" }));
}
