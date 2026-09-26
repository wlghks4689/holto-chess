/** Stable wire identifiers. Existing Korean Error.message remains a legacy compatibility field. */
export const GAME_ERROR_CODES = [
  "SESSION_INVALID", "SESSION_REQUIRED", "ROOM_UNAVAILABLE", "SEAT_DEPARTED", "STALE_TURN", "ACTION_EXPIRED",
  "GAME_NOT_STARTED", "RESULTS_NOT_RELEASED", "REMATCH_UNAVAILABLE", "REMATCH_NEEDS_PLAYERS",
  "READY_NOT_CANCELLABLE", "SPECTATOR_CANNOT_READY", "SHOWDOWN_IN_PROGRESS", "PHASE_ACTION_REQUIRED",
  "PRESENTATION_IN_PROGRESS", "ALREADY_READY", "WRONG_PHASE", "SHOP_ACTION_UNAVAILABLE",
  "CARD_NOT_IN_SHOP", "CARD_NOT_OWNED", "HAND_LIMIT", "PURCHASE_LIMIT", "INSUFFICIENT_BB",
  "CANNOT_SELL", "SELL_BLOCKS_HAND", "REROLL_UNAVAILABLE", "REROLL_LIMIT", "ALL_SHOP_CARDS_LOCKED",
  "LOCK_UNAVAILABLE", "LOCK_INSUFFICIENT_BB", "CARD_SELECTION_INVALID", "LOADOUT_INVALID",
  "DRAFT_NOT_YOUR_TURN", "DRAFT_CARD_UNAVAILABLE", "DRAFT_POOL_EMPTY", "DRAFT_UNAVAILABLE",
  "INVALID_REQUEST", "ACTION_REJECTED",
] as const;
export type GameErrorCode = typeof GAME_ERROR_CODES[number];
export type StructuredGameError = { code: GameErrorCode; params?: Record<string, string | number> };

const exact: Record<string, GameErrorCode> = {
  "세션을 복원할 수 없습니다.": "SESSION_INVALID", "먼저 세션을 연결하세요.": "SESSION_REQUIRED",
  "입장할 수 없는 방입니다.": "ROOM_UNAVAILABLE", "세션이 없습니다.": "SESSION_INVALID",
  "이미 방에서 나갔습니다. 관전만 가능합니다.": "SEAT_DEPARTED",
  "단계가 변경되었습니다. 현재 화면에서 다시 시도하세요.": "STALE_TURN",
  "선택 시간이 끝났습니다. 자동 진행을 기다려 주세요.": "ACTION_EXPIRED", "선택 시간이 끝났습니다.": "ACTION_EXPIRED", "배치 시간이 끝났습니다.": "ACTION_EXPIRED",
  "아직 게임이 시작되지 않았습니다.": "GAME_NOT_STARTED",
  "최종 순위표 공개 이후에만 기록을 열 수 있습니다.": "RESULTS_NOT_RELEASED",
  "진행 중인 플레이어의 최종 순위표 공개를 기다려 주세요.": "RESULTS_NOT_RELEASED",
  "최종 결과 이후에만 새 게임을 시작할 수 있습니다.": "REMATCH_UNAVAILABLE",
  "최종 순위표 공개를 기다려 주세요.": "RESULTS_NOT_RELEASED",
  "같은 방 새 게임에는 실제 플레이어 2명이 필요합니다.": "REMATCH_NEEDS_PLAYERS",
  "취소할 덱 준비가 없습니다.": "READY_NOT_CANCELLABLE",
  "관전자는 READY를 대신할 수 없습니다.": "SPECTATOR_CANNOT_READY",
  "쇼다운 연출이 끝난 뒤 확인해 주세요.": "SHOWDOWN_IN_PROGRESS",
  "현재 단계의 행동을 완료하세요.": "PHASE_ACTION_REQUIRED",
  "공통 연출이 끝나면 자동으로 진행됩니다.": "PRESENTATION_IN_PROGRESS",
  "이미 구성을 확정했습니다.": "ALREADY_READY",
  "RUN 배치 단계가 아닙니다.": "WRONG_PHASE", "상점 단계가 아닙니다.": "WRONG_PHASE",
  "상점 행동을 할 수 없습니다.": "SHOP_ACTION_UNAVAILABLE", "지금은 구매할 수 없습니다.": "SHOP_ACTION_UNAVAILABLE",
  "내 상점에 예약된 카드가 아닙니다.": "CARD_NOT_IN_SHOP", "내 상점 카드만 잠글 수 있습니다.": "CARD_NOT_IN_SHOP",
  "내 소유 카드가 아닙니다.": "CARD_NOT_OWNED", "보유 카드만 선택할 수 있습니다.": "CARD_NOT_OWNED",
  "이번 라운드 보유 한도에 도달했습니다.": "HAND_LIMIT", "드래프트 보유 장수가 올바르지 않습니다.": "HAND_LIMIT",
  "이번 라운드 구매 횟수를 모두 사용했습니다.": "PURCHASE_LIMIT", "BB가 부족합니다.": "INSUFFICIENT_BB",
  "판매할 수 없는 카드입니다.": "CANNOT_SELL", "남은 구매 횟수로 필수 보유 카드를 채울 수 없어 판매할 수 없습니다.": "SELL_BLOCKS_HAND",
  "리롤할 수 없습니다.": "REROLL_UNAVAILABLE", "이번 라운드 리롤 횟수를 모두 사용했습니다.": "REROLL_LIMIT",
  "모든 상점 카드가 잠겨 있어 리롤할 수 없습니다.": "ALL_SHOP_CARDS_LOCKED",
  "카드 잠금에 3BB가 필요합니다.": "LOCK_INSUFFICIENT_BB",
  "카드 선택은 R2에서만 사용합니다.": "WRONG_PHASE", "출전 카드 2장을 선택하세요.": "CARD_SELECTION_INVALID",
  "R3는 보유 4장을 모두 사용합니다. 분할 배치는 지원하지 않습니다.": "LOADOUT_INVALID",
  "RUN 구성은 시작 전에만 변경할 수 있습니다.": "WRONG_PHASE", "보유한 서로 다른 카드 3장을 배치하세요.": "LOADOUT_INVALID",
  "내 드래프트 차례가 아닙니다.": "DRAFT_NOT_YOUR_TURN", "선택할 수 없는 카드입니다.": "DRAFT_CARD_UNAVAILABLE",
  "공개 드래프트 카드 풀이 부족합니다.": "DRAFT_POOL_EMPTY", "드래프트 차례가 없습니다.": "DRAFT_UNAVAILABLE",
  "JSON 메시지가 필요합니다.": "INVALID_REQUEST", "메시지가 너무 큽니다.": "INVALID_REQUEST",
  "잘못된 메시지입니다.": "INVALID_REQUEST", "잘못된 시계 요청입니다.": "INVALID_REQUEST",
  "잘못된 세션입니다.": "SESSION_INVALID", "닉네임은 문자·숫자 1~8자로 입력하세요.": "INVALID_REQUEST",
  "명령 식별자가 필요합니다.": "INVALID_REQUEST", "지원하지 않는 명령입니다.": "INVALID_REQUEST",
  "허용되지 않은 필드입니다.": "INVALID_REQUEST", "잘못된 카드입니다.": "INVALID_REQUEST",
  "서로 다른 카드 3장이 필요합니다.": "LOADOUT_INVALID", "잘못된 출전 카드 선택입니다.": "CARD_SELECTION_INVALID",
  "서로 다른 보유 카드를 소켓에 배치하세요.": "LOADOUT_INVALID",
};

export function classifyGameError(message: string): StructuredGameError {
  const code = exact[message];
  if (code) return { code };
  if (/^보유 카드 \d+장을 선택하세요\.$/.test(message) || /^R\d+ 출전 카드를 올바르게 나누세요\.$/.test(message)) return { code: "CARD_SELECTION_INVALID" };
  if (/^(R\d+은 보유 카드 \d+장이 필요합니다|카드 \d+장이 필요합니다|R2 보유 카드 3장이 필요합니다)\.$/.test(message)) return { code: "HAND_LIMIT" };
  if (/^(1차|2차) 쇼다운 단계가 아닙니다\.$/.test(message) || /^.+단계가 아닙니다\.$/.test(message)) return { code: "WRONG_PHASE" };
  return { code: "ACTION_REJECTED" };
}
