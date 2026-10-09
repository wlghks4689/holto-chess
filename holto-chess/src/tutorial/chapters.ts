import { handLimitFor } from "../game/config";
import { autoChooseOpponent, autoPickDraft, leaveRoundResult, openDraft, resolveSurvival } from "../game/engine";
import type { PorenaGameState } from "../game/types";
import type { TutorialChapter, TutorialStep } from "./tutorialTypes";

const me = (game: PorenaGameState) => game.players[0]!;
const handFull = (game: PorenaGameState) => me(game).ownedCardIds.length >= handLimitFor(game.round, game);
const ready = (game: PorenaGameState) => game.phase !== "SHOP";

function draftUntilMyTurn(game: PorenaGameState): PorenaGameState {
  let state = game.phase === "DRAFT_ORDER" ? openDraft(game) : game;
  for (let step = 0; step < 8; step += 1) {
    const draft = state.draft;
    if (!draft || draft.order[draft.picks.length]?.playerId === "p1" || draft.picks.length >= draft.order.length) break;
    state = autoPickDraft(state);
  }
  return state;
}

function finishDraft(game: PorenaGameState): PorenaGameState {
  let state = game;
  for (let step = 0; step < 16 && state.phase === "OPEN_DRAFT"; step += 1) state = autoPickDraft(state);
  return state;
}

/** Let the shared cinematic play the streets; pause only where the player learns a new concept. */
function showdownSteps(prefix: string): TutorialStep[] {
  return [
    {
      id: `${prefix}-vs`, kind: "REVIEW", hold: { matchIndex: 0, at: "TABLE_ENTER" },
      title: "카드를 골랐다면, 승부는 자동으로", next: "보드 공개 보기",
      body: ["가운데 카드는 두 사람이 함께 쓰는 커뮤니티 보드입니다. 베팅하거나 카드를 누를 필요 없이, 공개되는 카드를 지켜보세요."],
      more: ["보드는 3장(플랍) → 1장(턴) → 1장(리버) 순서로 열립니다."],
    },
    {
      id: `${prefix}-best5`, kind: "REVIEW", hold: { matchIndex: 0, at: "BEST5_GLOW" },
      title: "밝은 다섯 장이 내 족보예요", next: "승부 결과 보기",
      body: ["게임이 가장 강한 다섯 장을 자동으로 골라줍니다. 밝게 표시된 카드와 족보 이름을 확인하세요."],
    },
    {
      id: `${prefix}-result`, kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" },
      title: "승부와 보상을 확인하세요", next: "라운드 순위 보기",
      body: ["족보를 비교해 승패가 정해지고, 아래에 실제로 받은 BB와 승점이 표시됩니다."],
      more: ["족보가 같으면 그 족보의 숫자를 비교하고, 필요하면 남은 높은 카드(키커)를 비교합니다. 문양에는 우열이 없습니다."],
    },
  ];
}

export const TUTORIAL_CHAPTERS: TutorialChapter[] = [
  {
    id: 1, title: "첫 승부 체험", round: 1, summary: "카드 2장 구매 → 준비 완료 → 자동 승부 → 순위",
    steps: [
      {
        id: "r1-buy", kind: "ACT", focus: "shop", goal: "상점에서 카드 2장 구매",
        title: "카드 두 장을 사보세요",
        body: ["R1은 빈손으로 시작합니다. 상점에 놓인 4장 중 2장을 사서 내 핸드를 만드세요. 같은 숫자 두 장이면 원페어로 시작할 수 있어요.", "높은 카드는 강하지만 비쌉니다. 남은 BB는 다음 라운드 구매와 최종 점수에 쓰입니다."],
        more: ["BB는 카드 구매와 리롤에 쓰는 돈입니다. 구매 버튼에서 가격을 확인하세요.", "랭크는 2~10, J, Q, K, A 순서로 높습니다. 같은 문양 두 장만으로 플러시가 완성되지는 않습니다."],
        done: handFull,
      },
      {
        id: "r1-commit", kind: "ACT", focus: "action-bar", goal: "준비 완료 누르기",
        title: "이 두 장으로 승부해 볼까요?",
        body: ["내 카드 2장과 공용 보드 5장 중 가장 강한 5장으로 겨룹니다. 준비 완료를 누르면 자동 승부가 시작됩니다."],
        done: ready,
      },
      ...showdownSteps("r1-m1"),
      {
        id: "r1-round-result", kind: "REVIEW", focus: "round-results", next: "기본 체험 마치기",
        title: "승점은 순위, BB는 다음 준비",
        body: ["이 표는 세 매치의 합산 결과입니다. 승점은 순위 경쟁에, BB는 다음 카드 구매에 쓰입니다."],
        more: ["체험에서는 첫 매치를 자세히 보고, 나머지 두 매치는 자동으로 정산합니다.", "실전은 R1~R6로 이어지며 카드 수와 승부 방식이 달라집니다. 어빌리티 선택은 실전에서 진행합니다."],
      },
    ],
  },
  {
    id: 2, title: "두 번의 승부", round: 2, summary: "공개 카드 선택 · 대표 카드와 RUN 배치",
    steps: [
      {
        id: "r2-wait", kind: "ACT", focus: "draft", goal: "공개 카드 1장 선택",
        title: "이번에는 함께 펼친 카드에서 골라요",
        body: ["내 차례까지 준비해 두었습니다. 남아 있는 카드 한 장을 선택하세요. 연습에는 제한 시간이 없습니다."],
        more: ["실전에서는 누적 승점이 낮은 플레이어부터 선택하고, 동점이면 BB가 많은 순서입니다. First Class 보유자는 우선권을 얻습니다."],
        onEnter: draftUntilMyTurn, done: (game) => me(game).ownedCardIds.length >= handLimitFor(2, game),
      },
      {
        id: "r2-anchor", kind: "ACT", focus: "run-loadout", goal: "대표 카드와 보조 카드를 정하고 준비 완료",
        title: "대표 카드 한 장은 두 번 사용해요",
        body: ["대표 카드 + RUN 1 보조 카드, 대표 카드 + RUN 2 보조 카드로 같은 상대와 두 번 겨룹니다."],
        more: ["보조 카드는 서로 달라야 합니다. 확정 전에는 배치를 바꿀 수 있습니다."],
        onEnter: finishDraft, done: (game) => game.phase === "SHOWDOWN_PRIMARY" || game.roundResults.length > 0,
      },
      { id: "r2-run1", kind: "REVIEW", hold: { matchIndex: 0, at: "RUN_RESULT" }, next: "RUN 2 보기", title: "첫 번째 보드의 결과", body: ["대표 카드와 RUN 1 보조 카드가 쓰였습니다. 다음에는 대표 카드는 그대로, 보조 카드와 보드가 바뀝니다."] },
      { id: "r2-run2", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "라운드 순위 보기", title: "두 RUN의 승점을 합산해요", body: ["RUN 승리는 +2P, Split은 +1P입니다. 한 매치의 RUN 2번을 모두 이기면 완승 보너스 +2P를 더 받습니다.", "같은 배치로 상대를 바꿔 한 매치를 더 치릅니다. 체험에서는 두 번째 매치를 자동으로 정산합니다."] },
      { id: "r2-round-result", kind: "REVIEW", focus: "round-results", next: "연습 마치기", title: "R2는 탈락 없이 마무리", body: ["두 매치, RUN 4번에서 얻은 승점을 확인하세요. 다음 라운드부터는 생존 경쟁도 시작됩니다."] },
    ],
  },
  {
    id: 3, title: "경매와 오마하", round: 3, summary: "카드 옥션 · 2배 가격 구매 · 오마하 2+3 · 생존",
    steps: [
      {
        id: "r3-auction", kind: "ACT", focus: "auction", goal: "입찰해 본 뒤 경매 마감 (입찰 없이도 진행 가능)", title: "상점 대신 카드 옥션",
        body: ["R3에는 개인 상점이 없습니다. 16장 경매에서 한 사람당 1장만 낙찰받아 네 번째 카드를 얻습니다.", "카드를 한 번 눌러 고르고, 다시 누르면 기본가로 입찰합니다. 이미 입찰이 있는 카드는 현재가보다 3BB 이상 높게 입찰하세요."],
        more: ["실전에서는 10초 안내 뒤 40초 동안 경매가 열리고, 마지막 3초의 입찰은 최대 55초까지 연장됩니다. 연습은 버튼으로 마감합니다.", "다른 카드에 입찰하면 기존 입찰은 취소되고 그 카드는 입찰 없는 상태로 돌아갑니다. 낙찰한 카드만 BB를 냅니다."],
        done: (game) => game.phase !== "FINAL_AUCTION",
      },
      {
        id: "r3-buyback", kind: "ACT", focus: "draft", goal: "남은 카드 1장 구매 (낙찰받았다면 자동 진행)", title: "낙찰이 없으면 2배 가격",
        body: (game) => me(game).ownedCardIds.length >= handLimitFor(3, game)
          ? ["경매에서 카드를 얻었습니다. 낙찰받지 못한 플레이어는 남은 카드 1장을 2배 가격에 삽니다."]
          : ["낙찰받지 못한 플레이어는 드래프트 순서대로 남은 카드 1장을 2배 가격에 삽니다. 한 장을 고르세요."],
        more: ["순서는 누적 승점이 낮은 플레이어부터, 같으면 BB가 많은 플레이어부터입니다. 어빌리티 할인은 없고, 나중에 팔 때는 기본 가격으로 계산합니다."],
        onEnter: draftUntilMyTurn, done: (game) => handFull(game) || !["DRAFT_ORDER", "OPEN_DRAFT"].includes(game.phase),
      },
      {
        id: "r3-omaha", kind: "EXPLAIN", next: "승부 보기", title: "네 장을 모으되, 두 장만 사용해요",
        body: ["내 카드 정확히 2장 + 보드 정확히 3장으로 족보를 만듭니다. 사용할 조합은 게임이 자동으로 고릅니다.", "세 매치 결과가 누적 승점에 반영됩니다. 첫 매치에서 어떤 두 장이 선택되는지 확인해 보세요."],
        more: ["보드에 같은 문양이 네 장 있어도, 내 카드에 그 문양이 한 장뿐이면 플러시가 아닙니다."], onEnter: finishDraft,
      },
      ...showdownSteps("r3-m1"),
      {
        id: "r3-survival", kind: "REVIEW", focus: "round-results", next: "연습 마치기",
        title: "누적 승점 하위 두 명이 탈락해요",
        body: ["세 매치와 필요한 생존 추가 승부까지 자동 정산한 결과입니다. 탈락선에서 동점이면 추가 승부로 생존자를 정합니다."],
        onEnter: (game) => game.survival ? resolveSurvival(leaveRoundResult(game)) : game,
      },
    ],
  },
  {
    id: 4, title: "가장 강한 다섯 장", round: 4, summary: "자유로운 BEST 5 · 승자조와 생존조",
    steps: [
      { id: "r4-draft", kind: "ACT", focus: "draft", goal: "공개 카드 1장 선택", title: "공개 카드로 내 패를 보강하세요", body: ["R2와 같은 공개 선택입니다. 이번에는 선택 뒤 상점도 열립니다."], onEnter: draftUntilMyTurn, done: (game) => game.phase === "SHOP" || me(game).ownedCardIds.length >= handLimitFor(4, game) },
      { id: "r4-shop", kind: "EXPLAIN", focus: "shop", next: "이 패로 계속하기", title: "필요하면 상점에서 교체하세요", body: ["마음에 드는 패라면 그대로 진행해도 됩니다. 교체하고 싶으면 내 카드를 팔고 상점에서 구매하세요."], onEnter: finishDraft },
      { id: "r4-rule", kind: "ACT", focus: "action-bar", goal: "내 카드 5장을 준비하고 준비 완료", title: "이제 2+3 제한이 없어요", body: ["내 카드 5장과 보드 5장 중 가장 강한 5장을 자유롭게 사용합니다."], done: ready },
      ...showdownSteps("r4-m1"),
      { id: "r4-enter-secondary", kind: "ACT", focus: "action-bar", goal: "2차전 시작하기", title: "내 그룹을 확인하세요", body: ["승자조는 다음 라운드 진출을 확보한 채 추가 점수를 겨룹니다. 생존조는 남은 한 자리를 두고 겨룹니다."], done: (game) => game.phase !== "GROUP_ASSIGNMENT" },
      // The engine replaces the first-stage results with the group match.
      { id: "r4-secondary", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "연습 마치기", title: "같은 패로 그룹전", body: ["그룹 안에서 다시 겨룬 결과입니다. 생존한 네 명이 다음 라운드로 갑니다."] },
    ],
  },
  {
    id: 5, title: "세 개의 핸드, 세 번의 RUN", round: 5, summary: "1위의 상대 선택 · 카드 6장 · RUN 3회 · 1명 탈락",
    steps: [
      {
        id: "r5-pick", kind: "ACT", focus: "opponent", goal: "매칭을 확인하고 상점 열기", title: "1위가 상대를 고릅니다",
        body: (game) => game.opponentSelect?.chooserId === "p1"
          ? ["지금 1위라서 대결할 상대를 직접 고릅니다. 남은 두 명은 서로 대결합니다."]
          : ["누적 승점 1위가 대결할 상대를 고릅니다. 남은 두 명은 서로 대결합니다."],
        more: ["이 화면에서는 남은 네 명의 카드가 모두 공개됩니다. 실전에서는 15초 안에 고르지 않으면 4위가 자동으로 선택됩니다."],
        onEnter: (game) => game.phase === "OPPONENT_SELECT" && game.opponentSelect && game.opponentSelect.chooserId !== "p1" && !game.opponentSelect.opponentId ? autoChooseOpponent(game) : game,
        done: (game) => game.phase !== "OPPONENT_SELECT",
      },
      {
        id: "r5-shop", kind: "ACT", focus: "shop", goal: "내 카드 6장 채우기", title: "여섯 장을 모으세요",
        body: ["상점에 카드 3장이 놓이고 최대 3장을 살 수 있습니다. 리롤은 2번입니다.", "R5에는 정확히 6장이 필요합니다. 실전에서 시간이 끝나면 부족한 장수를 내 상점에서 자동으로 삽니다."],
        done: handFull,
      },
      { id: "r5-commit", kind: "ACT", focus: "action-bar", goal: "준비 완료 누르기", title: "이제 세 핸드로 나눕니다", body: ["준비 완료를 누르면 6장을 2장씩 RUN 1·2·3에 배치하는 단계로 넘어갑니다."], done: ready },
      {
        id: "r5-loadout", kind: "ACT", focus: "run-loadout", goal: "RUN 1·2·3 배치 확정", title: "어느 RUN에 어떤 두 장을 낼까요",
        body: ["추천 배치가 미리 채워져 있습니다. 카드를 누른 뒤 바꿀 카드를 누르면 두 장의 자리가 바뀝니다.", "각 RUN의 카드는 그 RUN이 시작될 때 공개됩니다. 강한 핸드를 한곳에 모을지, 고르게 나눌지가 이 라운드의 전략입니다."],
        more: ["RUN 승리 +5P, Split +2P입니다. Split 없이 세 RUN을 모두 이기면 +15P를 더 받습니다."],
        done: (game) => game.phase === "SHOWDOWN_PRIMARY" || game.roundResults.length > 0,
      },
      { id: "r5-run1", kind: "REVIEW", hold: { matchIndex: 0, at: "RUN_RESULT" }, next: "다음 RUN 보기", title: "RUN마다 새 보드", body: ["RUN 1의 두 장과 새 보드 5장으로 겨뤘습니다. 다음 RUN에서는 두 장이 모두 바뀌고 보드도 새로 열립니다."] },
      { id: "r5-runs", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "라운드 순위 보기", title: "세 RUN의 승점을 더해요", body: ["RUN 승리 +5P, Split +2P입니다. Split 없이 세 RUN을 모두 이기면 +15P를 더 받습니다."] },
      {
        id: "r5-elimination", kind: "REVIEW", focus: "round-results", next: "연습 마치기", title: "누적 승점 최하위 한 명이 탈락해요",
        body: ["승점이 같으면 BB가 적은 쪽이 탈락합니다. BB까지 같으면 RUN 1→2→3 카드로 추가 승부를 하고, 끝까지 같으면 하이카드로 정합니다."],
        onEnter: (game) => game.survival ? resolveSurvival(leaveRoundResult(game)) : game,
      },
    ],
  },
  {
    id: 6, title: "마지막 3인 결승", round: 6, summary: "출전 5장 + 커뮤니티 보드 · BURN · 최종 점수",
    steps: [
      { id: "r6-shop", kind: "EXPLAIN", focus: "shop", next: "이 패로 계속하기", title: "5~7장을 모으고 5장을 출전시켜요",
        body: ["R6에서는 보유한 5~7장 중 5장을 출전시키고, 커뮤니티 보드 5장과 합친 10장 중 가장 강한 5장으로 겨룹니다.", "상점에는 카드 4장이 놓이고 최대 5번 살 수 있습니다. 필요하면 판매하고 교체하세요."],
        more: ["5장보다 적으면 몰수패입니다. 실전에서 시간이 끝나면 5장까지 자동으로 삽니다."] },
      { id: "r6-commit", kind: "ACT", focus: "action-bar", goal: "준비 완료 누르기", title: "출전할 5장을 확인하러 가요", body: ["준비 완료를 누르면 출전 5장 확인 단계로 넘어갑니다. 정확히 5장이면 그대로 출전합니다."], done: ready },
      {
        id: "r6-lineup", kind: "ACT", focus: "run-loadout", goal: "출전 5장 확정", title: "출전 5장과 BURN",
        body: ["가장 강한 5장이 출전 칸에 미리 놓여 있습니다. BURN 카드와 출전 카드를 차례로 누르면 서로 바뀝니다.", "실전에서는 10초 안에 정하고, 시간이 끝나면 놓인 그대로 출전합니다."],
        more: ["출전하지 않는 BURN 카드는 준비 화면부터 모든 플레이어에게 공개됩니다. 출전 5장은 쇼다운에서 공개됩니다."],
        done: (game) => game.phase === "SHOWDOWN_PRIMARY" || game.roundResults.length > 0,
      },
      { id: "r6-best5", kind: "REVIEW", hold: { matchIndex: 0, at: "BEST5_GLOW" }, next: "승부 결과 보기", title: "출전 5장과 보드 중 BEST 5", body: ["출전 5장과 커뮤니티 보드 5장, 모두 10장 중 가장 강한 5장이 족보입니다. 밝게 표시된 카드가 내 족보입니다."] },
      { id: "r6-result", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "총점 보기", title: "마지막 패의 순위", body: ["세 명의 족보를 비교해 순위와 결승 승점을 정합니다. 이제 전체 게임의 총점을 확인하세요."] },
      { id: "r6-score", kind: "REVIEW", focus: "final-score", next: "연습 마치기", title: "마지막 승부와 종합 우승은 달라요", body: ["누적 승점 + 족보 점수 + BB 환산 점수가 최종 총점입니다."], more: ["BB는 10BB당 1점으로 환산하며 나머지는 버립니다. 결승 승점은 이미 누적 승점에 포함되어 다시 더하지 않습니다."] },
    ],
  },
];

/** A continued practice keeps the player's own cards. */
// 2634: the practice seat survives every cut through the six-round R6 final.
export const TUTORIAL_SEED = 2634;
