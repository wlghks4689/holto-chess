import type { Augment, PlayerState, Round } from "./types";

const EARLY: Augment[] = [
  { id: "suit_discount", name: "검은 시장", description: "스페이드 카드 구매가 3BB 저렴합니다.", suit: "s" },
  { id: "reroll_discount", name: "빠른 탐색", description: "리롤 비용이 2BB 감소합니다." },
  { id: "sell_bonus", name: "회수 전문가", description: "판매 환급률이 80%로 증가합니다." },
  { id: "win_bonus", name: "승자의 배당", description: "승리 보상이 5BB 증가합니다." },
  { id: "pair_points", name: "페어 수집가", description: "최종 족보가 원페어면 증강 보너스 +3점.", category: "PAIR" },
];

const LATE: Augment[] = [
  { id: "rank_discount", name: "로우 카드 계약", description: "2~9 카드 구매가 2BB 저렴합니다." },
  { id: "r5_hand_bonus", name: "마지막 패", description: "최종 총점에 증강 보너스 +4점." },
  ...EARLY,
];

export function augmentPool(round: Round): Augment[] { return round >= 4 ? LATE : EARLY; }

export function applyAugment(player: PlayerState, augment: Augment): void {
  player.augments.push(augment);
  if (augment.id === "shop_plus_one") player.shopSize = Math.min(5, player.shopSize + 1);
  if (augment.id === "shop_plus_two") player.shopSize = Math.min(5, player.shopSize + 2);
}
