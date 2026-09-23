import { SUIT_SYMBOL, type Card } from "../core/poker/cards";
import { rankWord, withParticle } from "./rankWord";
import { BALANCE } from "../game/config";
import { autoPickDraft, getCard, leaveRoundResult, openDraft } from "../game/engine";
import type { PorenaGameState } from "../game/types";
import type { TutorialChapter, TutorialStep } from "./tutorialTypes";

const SUIT_NAME = { s: "스페이드", h: "하트", d: "다이아몬드", c: "클럽" } as const;

const me = (game: PorenaGameState) => game.players[0]!;
const owned = (game: PorenaGameState): Card[] => me(game).ownedCardIds.map((id) => getCard(game, id));
const shop = (game: PorenaGameState): Card[] => me(game).shopCardIds.map((id) => getCard(game, id));
const label = (card: Card) => `${rankWord(card.rank)}${SUIT_SYMBOL[card.suit]}`;
const handFull = (game: PorenaGameState) => me(game).ownedCardIds.length >= BALANCE.handLimits[game.round];

/** Advances the draft until the practice seat is on the clock, so reading never costs a pick. */
function draftUntilMyTurn(game: PorenaGameState): PorenaGameState {
  let state = game.phase === "DRAFT_ORDER" ? openDraft(game) : game;
  for (let step = 0; step < 8; step += 1) {
    const draft = state.draft;
    if (!draft || draft.order[draft.picks.length]?.playerId === "p1") break;
    if (draft.picks.length >= draft.order.length) break;
    state = autoPickDraft(state);
  }
  return state;
}

/** Lets the remaining seats finish their picks once the player has taken theirs. */
function finishDraft(game: PorenaGameState): PorenaGameState {
  let state = game;
  for (let step = 0; step < 16 && state.phase === "OPEN_DRAFT"; step += 1) state = autoPickDraft(state);
  return state;
}

/** Closes a finished round so the next beat (an augment draft) can actually be shown. */
function openAugments(game: PorenaGameState): PorenaGameState {
  return game.phase === "ROUND_RESULT" ? leaveRoundResult(game) : game;
}

const startingCard: TutorialStep = {
  id: "r1-start-card", kind: "EXPLAIN", focus: "owned-cards", next: "카드 살펴봤어요",
  title: "이 카드가 출발점이에요",
  body: (game) => {
    const card = owned(game)[0];
    if (!card) return ["이번 라운드에 사용할 카드를 여기에서 모읍니다."];
    return [
      `지금 가진 카드는 ${label(card)} 한 장이에요.`,
      `숫자는 ${rankWord(card.rank)}, 무늬는 ${SUIT_NAME[card.suit]}입니다.`,
      "이 카드와 어울리는 카드를 한 장 더 골라 두 장의 패를 만듭니다.",
    ];
  },
  more: [
    "숫자는 2부터 시작해 10 다음 J, Q, K, A 순서로 높아집니다.",
    "무늬(♠ ♥ ♦ ♣)끼리는 높낮이가 없습니다. 같은 무늬를 모으는 것이 의미를 갖는 경우가 따로 있을 뿐입니다.",
  ],
};

const shopFocus: TutorialStep = {
  id: "r1-shop", kind: "EXPLAIN", focus: "shop", next: "상점 살펴보기",
  title: "상점에서 한 장을 더 고릅니다",
  body: (game) => [
    `상점에는 지금 ${shop(game).map(label).join(", ") || "카드가 없습니다"} 나와 있어요.`,
    "내 카드와 어떻게 어울리는지 보고 한 장을 삽니다.",
  ],
};

const comboHint: TutorialStep = {
  id: "r1-combos", kind: "EXPLAIN", focus: "shop", next: "알겠어요",
  title: "어울리는 카드를 찾는 두 가지 방향",
  body: (game) => {
    const mine = owned(game)[0];
    const offers = shop(game);
    const pair = mine && offers.find((card) => card.rank === mine.rank);
    const suited = mine && offers.find((card) => card.suit === mine.suit && Math.abs(card.rank - mine.rank) <= 2);
    const lines = [
      "같은 숫자 두 장은 그 자리에서 원페어가 됩니다.",
      "같은 무늬로 이어지는 숫자는 아직 완성된 족보가 아니고, 보드의 도움을 받아 발전할 수 있는 형태입니다.",
    ];
    if (pair && mine) lines.push(`지금은 ${withParticle(label(pair), "을", "를")} 사면 가진 ${withParticle(label(mine), "과", "와")} 원페어가 됩니다.`);
    if (suited && mine) lines.push(`${withParticle(label(suited), "은", "는")} ${withParticle(label(mine), "과", "와")} 같은 무늬로 이어지는 방향이에요.`);
    return lines;
  },
  more: [
    "높은 페어가 좋은 출발인 것은 맞지만, 반드시 이긴다는 뜻은 아닙니다.",
    "같은 무늬 두 장은 플러시가 아니고, 이어지는 두 장도 아직 스트레이트가 아닙니다. 다섯 장이 모여야 족보가 됩니다.",
  ],
};

const buyStep: TutorialStep = {
  id: "r1-buy", kind: "ACT", focus: "shop", goal: "상점에서 카드 한 장 사기",
  title: "마음에 드는 카드를 한 장 사보세요",
  body: ["추천한 카드가 아니어도 괜찮아요. 지금 상점의 어떤 카드든 살 수 있습니다."],
  more: (game) => [
    `원하는 카드가 없다면 리롤로 상점을 바꿀 수 있어요. 지금 비용은 ${Math.max(0, BALANCE.rerollCostBB - (me(game).augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0))}BB이고, 이번 라운드에 ${BALANCE.rerollLimits[game.round] - (me(game).rerollsUsed ?? 0)}번 남았습니다.`,
    "BB가 모자라거나 횟수를 다 쓰면 실제 규칙대로 막힙니다.",
  ],
  done: handFull,
};

const reviewHand: TutorialStep = {
  id: "r1-hand", kind: "REVIEW", focus: "owned-cards", next: "이 패로 시작하기",
  title: "이제 두 장이 되었어요",
  body: (game) => {
    const cards = owned(game);
    const [a, b] = cards;
    if (!a || !b) return ["카드를 모으는 중입니다."];
    const lines = [`내 패는 ${cards.map(label).join(" ")}입니다.`];
    if (a.rank === b.rank) lines.push(`같은 숫자 두 장이라 이미 ${rankWord(a.rank)} 원페어입니다.`);
    else if (a.suit === b.suit && Math.abs(a.rank - b.rank) <= 4) lines.push("같은 무늬로 가까운 숫자라, 보드에 따라 스트레이트나 플러시로 발전할 수 있는 형태예요.");
    else if (a.suit === b.suit) lines.push("같은 무늬라 플러시 방향의 가능성이 있습니다.");
    else if (Math.abs(a.rank - b.rank) <= 4) lines.push("숫자가 가까워 스트레이트 방향의 가능성이 있습니다.");
    else lines.push("아직 짝도 연결도 없는 형태예요. 보드 카드가 도와주면 높은 카드 한 장으로 겨루게 됩니다.");
    lines.push("완성 여부는 가운데 보드가 열려야 정해집니다.");
    return lines;
  },
};

const bbStep: TutorialStep = {
  id: "r1-bb", kind: "EXPLAIN", focus: "stack", next: "이해했어요",
  title: "BB와 Point는 다른 자원입니다",
  body: (game) => [
    `BB는 카드를 사고 상점을 바꾸는 데 쓰는 자원이에요. 지금 ${me(game).stackBB}BB 남아 있습니다.`,
    "Point는 경기에서 얻는 점수이고, 최종 순위를 정하는 데 쓰입니다.",
  ],
};

const commitStep: TutorialStep = {
  id: "r1-commit", kind: "ACT", focus: "action-bar", goal: "구성 확정 누르기",
  title: "준비가 되면 구성을 확정하세요",
  body: ["확정을 누르면 상대들도 카드를 정하고, 첫 승부가 시작됩니다."],
  done: (game) => game.phase !== "SHOP",
};

function showdownSteps(prefix: string, matchIndex: number, options: { boardIntro?: boolean } = {}): TutorialStep[] {
  return [
    {
      id: `${prefix}-vs`, kind: "REVIEW", hold: { matchIndex, at: "VS_INTRO" }, next: "보드 열기",
      title: "내 카드와 상대 카드",
      body: options.boardIntro
        ? ["가운데 놓이는 카드는 나와 이번 상대가 함께 쓰는 카드예요.", "내 카드 두 장과 보드 다섯 장 중 가장 강한 다섯 장으로 승부합니다."]
        : ["이번 상대의 카드가 함께 공개됩니다."],
    },
    {
      id: `${prefix}-flop`, kind: "REVIEW", hold: { matchIndex, at: "FLOP_HAND" }, next: "턴 보기",
      title: "처음 공개되는 3장 · 플랍",
      body: ["보드의 첫 세 장이 열렸어요. 지금 보이는 카드만으로 내 패를 읽어봅니다."],
    },
    {
      id: `${prefix}-turn`, kind: "REVIEW", hold: { matchIndex, at: "TURN_HAND" }, next: "리버 보기",
      title: "추가되는 1장 · 턴",
      body: ["네 번째 카드가 열렸습니다."],
    },
    {
      id: `${prefix}-river`, kind: "REVIEW", hold: { matchIndex, at: "RIVER_SETTLE" }, next: "가장 강한 다섯 장 보기",
      title: "마지막 1장 · 리버",
      body: ["다섯 장이 모두 열렸어요. 이제 비교할 다섯 장이 정해집니다."],
    },
    {
      id: `${prefix}-best5`, kind: "REVIEW", hold: { matchIndex, at: "BEST5_GLOW" }, next: "결과 보기",
      title: "실제로 쓰인 다섯 장",
      body: ["밝게 표시된 다섯 장이 이번 비교에 쓰인 카드입니다."],
    },
    {
      id: `${prefix}-result`, kind: "REVIEW", hold: { matchIndex, at: "COMPLETE" }, next: "다음으로",
      title: "왜 이렇게 되었는지 보기",
      body: ["내 족보가 만들어진 이유, 상대와 갈린 지점, 그리고 결과를 함께 확인하세요."],
    },
  ];
}

const CHAPTER_ONE: TutorialChapter = {
  id: 1, title: "내 패 만들기", round: 1, summary: "R1 상점과 포커의 기초",
  steps: [
    startingCard, shopFocus, comboHint, buyStep, reviewHand, bbStep, commitStep,
    ...showdownSteps("r1-m1", 0, { boardIntro: true }),
    { id: "r1-rest", kind: "REVIEW", hold: { matchIndex: 1, at: "COMPLETE" }, next: "다음 경기 보기", title: "나머지 경기", body: ["이번 라운드의 남은 경기는 같은 규칙으로 진행됩니다. 결과만 확인하고 넘어가요."] },
    { id: "r1-rest2", kind: "REVIEW", hold: { matchIndex: 2, at: "COMPLETE" }, next: "라운드 결과 보기", title: "마지막 경기", body: ["경기마다 보드는 새로 만들어집니다. 같은 카드로도 결과가 달라지는 이유예요."] },
    {
      id: "r1-round-result", kind: "REVIEW", focus: "round-results", next: "기본 학습 마치기",
      title: "라운드 결과", body: ["경기에서 얻은 Point와 BB가 합산됩니다.", "여기까지가 포레나의 기본 조작입니다."],
    },
  ],
};

const CHAPTER_TWO: TutorialChapter = {
  id: 2, title: "두 번의 승부", round: 2, summary: "R2 공개 드래프트와 앵커 배치",
  steps: [
    {
      id: "r2-draft", kind: "EXPLAIN", focus: "draft", next: "내 차례까지 보기",
      title: "모두가 같은 목록에서 고릅니다",
      body: ["이번에는 상점 대신 공개 드래프트예요. 모두가 같은 카드 목록에서 한 장씩 가져갑니다.", "다른 사람이 먼저 가져간 카드는 고를 수 없습니다."],
      more: ["순서는 승점이 낮은 사람부터입니다. 동점이면 BB가 많은 쪽이 먼저 고릅니다."],
    },
    {
      id: "r2-wait", kind: "ACT", focus: "draft", goal: "공개 카드 한 장 고르기",
      title: "내 차례에 한 장을 고르세요",
      body: ["앞 순서의 선택이 끝나면 내 차례가 옵니다. 제한 시간은 없습니다."],
      onEnter: draftUntilMyTurn,
      done: (game) => game.players[0]!.ownedCardIds.length >= BALANCE.handLimits[2],
    },
    {
      id: "r2-anchor", kind: "ACT", focus: "run-loadout", goal: "대표 카드와 두 RUN 배치하기",
      title: "두 승부에 모두 나가는 카드",
      onEnter: finishDraft,
      body: ["대표 카드 한 장은 두 번의 승부에 모두 사용합니다.", "나머지 두 장은 각각 RUN 1과 RUN 2에 한 번씩 나갑니다."],
      more: ["대표 카드를 바꾸면 두 RUN의 조합이 함께 바뀝니다. 확정 전에는 몇 번이든 바꿀 수 있어요."],
      done: (game) => game.phase === "SHOWDOWN_PRIMARY" || game.roundResults.length > 0,
    },
    { id: "r2-run1", kind: "REVIEW", hold: { matchIndex: 0, at: "RUN_RESULT" }, next: "RUN 2 보기", title: "RUN 1 결과", body: ["첫 번째 보드의 승부가 끝났습니다. 대표 카드와 첫 보조 카드가 쓰였어요."] },
    { id: "r2-run2", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "다음으로", title: "RUN 2 결과", body: ["대표 카드는 그대로, 보조 카드만 바뀌어 다시 겨뤘습니다.", "두 승부에서 얻은 점수가 함께 누적됩니다."] },
    { id: "r2-round-result", kind: "REVIEW", focus: "round-results", next: "증강 선택으로", title: "라운드 결과", body: ["두 번의 승부에서 얻은 점수가 함께 합산되었습니다."] },
    {
      id: "r2-augment", kind: "ACT", focus: "augment", goal: "증강 하나 선택하기",
      title: "첫 증강 선택",
      body: ["증강은 이후 카드 선택과 운영에 도움을 주는 효과예요.", "설명을 읽고 지금 내 패에 맞는 것을 고르세요."],
      onEnter: openAugments,
      done: (game) => game.players[0]!.augments.length > 0 || game.round > 2,
    },
  ],
};

const CHAPTER_THREE: TutorialChapter = {
  id: 3, title: "반드시 두 장", round: 3, summary: "R3 오마하와 생존선",
  steps: [
    {
      id: "r3-rule", kind: "EXPLAIN", focus: "owned-cards", next: "상점 열기",
      title: "네 장을 갖지만, 쓰는 건 두 장",
      body: ["이번 라운드는 카드를 네 장 모읍니다.", "족보에는 그중 내 카드 두 장과 보드 세 장, 정확히 다섯 장만 사용합니다."],
      more: ["보드에 같은 무늬가 네 장 있어도, 내 카드에 그 무늬가 한 장뿐이면 플러시가 되지 않습니다. 내 카드는 반드시 두 장을 써야 하기 때문이에요.", "어떤 두 장을 쓸지는 직접 고르지 않아도 됩니다. 가능한 조합 중 가장 좋은 것을 자동으로 계산합니다."],
    },
    { id: "r3-shop", kind: "ACT", focus: "shop", goal: "보유 카드 4장 채우기", title: "카드를 네 장까지 모으세요", body: ["상점과 리롤은 R1과 같습니다. 남은 구매 횟수와 BB를 보고 고르세요."], done: handFull },
    { id: "r3-commit", kind: "ACT", focus: "action-bar", goal: "구성 확정 누르기", title: "준비되면 확정하세요", body: ["이번 라운드는 세 경기를 치르고, 누적 승점으로 생존이 갈립니다."], done: (game) => game.phase !== "SHOP" },
    ...showdownSteps("r3-m1", 0),
    { id: "r3-rest", kind: "REVIEW", hold: { matchIndex: 1, at: "COMPLETE" }, next: "다음 경기 보기", title: "두 번째 경기", body: ["같은 네 장으로 다른 상대와 다시 겨룹니다."] },
    { id: "r3-rest2", kind: "REVIEW", hold: { matchIndex: 2, at: "COMPLETE" }, next: "라운드 결과 보기", title: "세 번째 경기", body: ["세 경기의 결과가 모두 누적됩니다."] },
    {
      id: "r3-survival", kind: "REVIEW", focus: "round-results", next: "다음 규칙 배우기",
      title: "승패가 아니라 누적 승점", body: ["이번 라운드 탈락은 한 경기의 승패가 아니라 누적 승점으로 정해집니다.", "탈락선에서 점수가 같으면 추가 승부로 가립니다."],
    },
  ],
};

const CHAPTER_FOUR: TutorialChapter = {
  id: 4, title: "가장 강한 다섯 장", round: 4, summary: "R4 BEST 5와 그룹전",
  steps: [
    {
      id: "r4-draft", kind: "ACT", focus: "draft", goal: "공개 카드 한 장 고르기",
      title: "다시 공개 드래프트",
      body: ["R2에서 배운 방식과 같습니다. 이번에는 드래프트가 끝난 뒤 상점도 한 번 더 열립니다."],
      onEnter: draftUntilMyTurn,
      done: (game) => game.phase === "SHOP" || game.players[0]!.ownedCardIds.length >= BALANCE.handLimits[4],
    },
    {
      // Read, not gated on buying: after a draft pick the hand can already be full, and the shop
      // round still matters even then (selling and swapping stay open).
      id: "r4-shop", kind: "EXPLAIN", focus: "shop", next: "확정 단계로", title: "드래프트 뒤에도 상점이 열립니다",
      body: (game) => [
        `이번 라운드의 보유 한도는 ${BALANCE.handLimits[4]}장이고, 지금 ${me(game).ownedCardIds.length}장을 들고 있어요.`,
        "드래프트로 가져온 카드에 더해, 상점에서 사고팔아 다섯 장을 마무리합니다.",
      ],
      onEnter: finishDraft,
    },
    {
      id: "r4-rule", kind: "ACT", focus: "action-bar", goal: "구성 확정 누르기",
      title: "이번엔 두 장 제한이 없습니다",
      body: ["내 카드 다섯 장과 보드 다섯 장 중에서 가장 강한 다섯 장을 자유롭게 사용합니다.", "R3의 '반드시 내 카드 두 장' 제한이 사라졌어요."],
      done: (game) => game.phase !== "SHOP",
    },
    ...showdownSteps("r4-m1", 0),
    {
      id: "r4-group", kind: "REVIEW", focus: "round-results", next: "2차전 보기",
      title: "1차전 결과와 그룹", body: ["1차전 결과에 따라 승자조와 생존조로 나뉩니다.", "승자조는 다음 라운드 진출을 확보한 채 추가 점수를 겨루고, 생존조는 한 자리를 두고 겨룹니다."],
    },
    {
      id: "r4-enter-secondary", kind: "ACT", focus: "action-bar", goal: "2차전 시작하기",
      title: "내 그룹을 확인했다면",
      body: ["준비가 되면 2차전을 시작하세요. 눌러야 진행되고, 기다린다고 넘어가지 않습니다."],
      done: (game) => game.phase !== "GROUP_ASSIGNMENT",
    },
    // The engine replaces the round results with the group match, so the second match is index 0 again.
    { id: "r4-secondary", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "라운드 결과 보기", title: "2차전", body: ["같은 다섯 장으로 그룹 안에서 다시 겨룹니다."] },
  ],
};

const CHAPTER_FIVE: TutorialChapter = {
  id: 5, title: "내가 만든 패의 결산", round: 5, summary: "R5 최종 쇼다운과 점수",
  steps: [
    {
      id: "r5-rule", kind: "EXPLAIN", focus: "owned-cards", next: "상점 열기",
      title: "이번에는 가운데 보드가 없습니다",
      body: ["마지막 라운드는 공용 보드 없이, 내가 모은 일곱 장만으로 승부합니다.", "그 일곱 장 중 가장 강한 다섯 장이 내 최종 족보가 됩니다."],
    },
    { id: "r5-shop", kind: "ACT", focus: "shop", goal: "보유 카드 7장 채우기", title: "마지막 카드를 모으세요", body: ["여기서 사는 카드가 최종 족보에 그대로 들어갑니다."], done: handFull },
    { id: "r5-commit", kind: "ACT", focus: "action-bar", goal: "구성 확정 누르기", title: "최종 승부를 시작합니다", body: ["네 명이 함께 카드를 공개합니다."], done: (game) => game.phase !== "SHOP" },
    { id: "r5-three", kind: "REVIEW", hold: { matchIndex: 0, at: "FINAL_FIRST_HAND" }, next: "2장 더 보기", title: "먼저 3장", body: ["아직 세 장뿐이라 족보는 정해지지 않았습니다. 지금 보이는 조합만 확인하세요."] },
    { id: "r5-five", kind: "REVIEW", hold: { matchIndex: 0, at: "FINAL_SECOND_HAND" }, next: "마지막 2장 보기", title: "다섯 장까지", body: ["다섯 장이 되었지만 아직 두 장이 남아 있습니다."] },
    { id: "r5-seven", kind: "REVIEW", hold: { matchIndex: 0, at: "FINAL_SEVEN_SETTLE" }, next: "가장 강한 다섯 장 보기", title: "일곱 장 공개", body: ["이제 일곱 장이 모두 공개되었습니다."] },
    { id: "r5-best5", kind: "REVIEW", hold: { matchIndex: 0, at: "BEST5_GLOW" }, next: "결과 보기", title: "쓰인 다섯 장과 남은 두 장", body: ["밝은 다섯 장이 내 최종 족보이고, 어두운 두 장은 비교에서 빠집니다."] },
    { id: "r5-result", kind: "REVIEW", hold: { matchIndex: 0, at: "COMPLETE" }, next: "총점 보기", title: "최종 패 비교", body: ["네 명의 최종 족보를 비교해 순위와 배치 점수가 정해집니다."] },
    {
      id: "r5-score", kind: "REVIEW", focus: "final-score", next: "길라잡이 마치기",
      title: "총점은 이렇게 계산됩니다",
      body: ["누적 Point + 족보 점수 + BB 환산 점수를 더해 최종 총점이 나옵니다. 표의 세 칸이 그대로 더해진 값이에요.", "그래서 마지막 패에서 1위를 한 사람과 총점 우승자가 다를 수 있습니다."],
      more: [
        "증강 보너스는 따로 있는 칸이 아니라 족보 점수 안에 함께 계산되어 있습니다.",
        "R5 배치 점수는 이미 누적 Point에 들어가 있습니다. 따로 다시 더하지 않습니다.",
      ],
    },
  ],
};

export const TUTORIAL_CHAPTERS: TutorialChapter[] = [CHAPTER_ONE, CHAPTER_TWO, CHAPTER_THREE, CHAPTER_FOUR, CHAPTER_FIVE];

/** One seeded practice game carries all five chapters, so a continued run keeps the player's own cards. */
export const TUTORIAL_SEED = 2628;
