import type { GuideCopy } from "./guideCopy";
import { ABILITY_DECK_SIZE, ABILITY_NUMBERS as A, GUIDE_RULES as R } from "./guideRules";

const P = R.points;
const [f1, f2, f3, f4] = R.finalPlacement;

export const guideCopyKo: GuideCopy = {
  title: "게임 설명", close: "닫기", home: "가이드 처음으로",
  chooser: {
    kicker: "GAME GUIDE", title: "PORENA가 처음인가요?", lead: "필요한 만큼만 골라 읽으세요.",
    beginner: { title: "처음부터 알아보기", lead: "포커를 몰라도 괜찮습니다. 카드 구매부터 최종 점수까지 한 장면씩 설명합니다.", cta: "초보자 가이드" },
    rules: { title: "전체 규칙 보기", lead: "포커는 이미 알고 있습니다. PORENA의 라운드·점수·경제·어빌리티 규칙을 바로 찾아봅니다.", cta: "규칙서" },
  },
  tabs: { beginner: "초보자 가이드", rules: "규칙서" },
  beginner: {
    identity: {
      kicker: "01 · PORENA", title: "좋은 카드를 기다리지 않습니다.\n필요한 카드를 직접 모읍니다.",
      lead: "PORENA는 패를 설계하는 전략 포커 게임입니다.",
      pillars: [
        { title: `${R.players}명이 함께`, body: "빈 자리는 AI가 채워 항상 8명이 겨룹니다." },
        { title: `${R.poolSize}장 하나를 나눠 씀`, body: "모두가 같은 카드 묶음에서 카드를 가져갑니다." },
        { title: "사고, 팔고, 고른다", body: "상점과 드래프트로 내 패를 직접 만듭니다." },
        { title: "라운드마다 새 규칙", body: "5라운드 동안 승점을 모아 1위를 노립니다." },
      ],
    },
    pool: {
      kicker: "02 · SHARED POOL", title: "카드는 모두가 함께 사용합니다", lead: "트럼프 한 벌, 52장이 전부입니다. 누군가 가진 카드는 다른 사람이 가질 수 없습니다.",
      mine: "내 카드", other: "다른 플레이어", shop: "내 상점", blocked: "9♥는 이미 다른 사람이 가지고 있어 내 상점에 나오지 않습니다.",
      takeaway: "상대가 무엇을 가져갔는지 읽는 것도 전략입니다.",
    },
    shop: {
      kicker: "03 · SHOP", title: "상점에서 패를 만듭니다", lead: "라운드마다 상점에 카드가 놓입니다. BB를 내고 사서 내 패에 더합니다.",
      current: "지금 가진 카드", offer: "상점",
      tags: ["가장 높은 카드", "페어 완성", "스트레이트·플러시 연결"],
      actions: [["구매", "BB를 내고 카드를 가져옵니다."], ["판매", "가진 카드를 팔아 BB 일부를 돌려받습니다."], ["리롤", "BB를 내고 상점 카드를 새로 뽑습니다."], ["잠금", "마음에 드는 카드를 다음 리롤에서 지킵니다."]],
      takeaway: "A가 항상 정답은 아닙니다. 어떤 패를 만들지에 따라 좋은 카드가 달라집니다.",
    },
    bb: {
      kicker: "04 · BB", title: "BB는 게임 속 돈입니다", lead: "카드를 사고 상점을 다루는 데 쓰고, 경기에서 이기거나 라운드를 넘기면 들어옵니다.",
      uses: [["쓰는 곳", "카드 구매 · 리롤 · 잠금"], ["들어오는 곳", "라운드 수입 · 경기 보상 · 카드 판매"], ["마지막에", "남은 BB 일부가 최종 점수가 됩니다"]],
      takeaway: "지금 강한 카드를 살지, BB를 남길지도 전략입니다.",
    },
    hands: { kicker: "05 · HAND RANKING", title: "포커 족보", lead: "카드 5장으로 만드는 조합입니다. 아래로 갈수록 강합니다.", low: "약함", high: "강함", note: "숫자는 마지막 라운드에서 받는 족보 점수입니다." },
    rounds: {
      kicker: "06 · ROUNDS", title: "라운드마다 규칙이 바뀝니다", lead: "다섯 라운드가 모두 다른 포커입니다. 한 번에 하나씩 보세요.",
      r1: { name: "TWO HAND", tagline: "가장 익숙한 홀덤으로 시작합니다.", bullets: ["내 카드 2장으로 싸웁니다.", "가운데 보드 카드 5장이 열립니다.", "7장 중 가장 좋은 5장(BEST 5)으로 승부합니다.", "3번 겨루고, 아직 아무도 탈락하지 않습니다."] },
      r2: { name: "RUN IT TWICE", tagline: "카드 3장으로 두 번 싸웁니다.", bullets: ["공개 드래프트에서 카드 1장을 골라 3장이 됩니다.", "한 장은 두 판 모두 쓰는 중심 카드입니다.", "나머지 두 장은 RUN 1과 RUN 2에 하나씩 씁니다.", "두 판의 결과가 각각 승점이 됩니다."] },
      r3: { name: "OMAHA", tagline: "4장을 가지지만 마음대로 고르지 못합니다.", bullets: ["반드시 내 카드 2장 + 보드 3장으로 5장을 만듭니다.", "3번 겨룹니다.", "이 라운드부터 탈락이 있습니다. 승점 하위 2명이 떠납니다."] },
      r4: { name: "BEST FIVE", tagline: "내 카드 5장과 보드 5장, 10장 중 BEST 5.", bullets: ["첫 경기 결과로 승자조와 생존조가 나뉩니다.", "승자조는 추가 승점을 두고 겨룹니다.", "생존조는 3명 중 1명만 살아남습니다."] },
      r5: { name: "THE LAST HAND", tagline: "보드 없이, 내 카드 7장만으로.", bullets: ["남은 4명이 한 번에 겨룹니다.", "7장 중 가장 좋은 5장이 자동으로 골라집니다.", "끝나면 최종 점수를 계산합니다."] },
      labels: { hole: "내 카드", board: "보드", best: "BEST 5", anchor: "중심 카드", run: "RUN", mine: "내 카드 7장", players: "명", noBoard: "커뮤니티 카드 없음",
        primary: "첫 경기 · 1:1 ×3", winnerGroup: "승자조 3명", survivalGroup: "생존조 3명", winnerNote: "추가 승점 경쟁", survivalNote: "1명 생존 · 2명 탈락", draft: "공개 드래프트로 시작" },
    },
    survival: {
      kicker: "07 · SURVIVAL", title: "언제 탈락하나요?", lead: "R1·R2는 모두 살아남습니다. R3와 R4에서 2명씩 떠납니다.",
      placements: ["R5까지 간 4명: 최종 점수로 1~4위", "R4에서 탈락: 5~6위", "R3에서 탈락: 7~8위"],
    },
    score: {
      kicker: "08 · FINAL SCORE", title: "최종 점수는 세 가지를 더합니다", lead: "R5가 끝나면 아래를 더해 순위를 정합니다.",
      blocks: { points: "누적 승점", pointsNote: "R1~R5에서 모은 승점", hand: "족보 점수", handNote: "R5 BEST 5의 족보", bb: "남은 BB", bbNote: `${R.stackScoreUnitBB}BB마다 1점` },
      abilityNote: "어빌리티로 받은 승점과 BB도 이 안에 그대로 더해집니다.",
      formula: `최종 점수 = 누적 승점 + R5 족보 점수 + ⌊남은 BB ÷ ${R.stackScoreUnitBB}⌋`,
    },
    abilities: { kicker: "09 · ABILITY", title: "나만의 어빌리티", lead: "게임을 시작할 때 뒷면 카드를 골라 어빌리티 하나를 얻습니다. 어빌리티에 따라 카드 구매, 돈 관리, 노리는 족보가 달라집니다.", note: "8명이 서로 다른 어빌리티를 가집니다." },
    toRules: { text: "정확한 수치와 세부 규칙이 궁금하다면", cta: "전체 규칙서 보기" },
  },
  rules: {
    kicker: "RULE BOOK", title: "PORENA 규칙서", lead: "포커 족보와 BEST 5를 안다는 전제로, PORENA만의 규칙과 수치를 정리했습니다.", toBeginner: "게임 흐름부터 배우고 싶다면 초보자 가이드 보기",
    nav: ["기본", "카드 풀", "경제", "라운드", "드래프트", "승점", "탈락", "최종 점수", "어빌리티", "동률·예외"],
    basics: {
      title: "기본 규칙",
      rows: [["플레이어", `${R.players}명 · 빈 좌석은 AI`], ["카드 풀", `고유 카드 ${R.poolSize}장 공유`], ["시작 BB", `${R.startBB} BB · 시작 카드 1장`], ["라운드 수입", `R2~R5 시작 시 생존자 +${R.roundIncomeBB} BB`], ["상점 카드", `${R.shopSize}장`], ["리롤 / 잠금", `${R.rerollCostBB} BB / ${R.lockCostBB} BB`], ["판매", `기본 가격의 ${R.sellPercent}% (소수점 버림)`], ["제한 시간", `상점 ${R.timers.shop}초 · 드래프트 1픽 ${R.timers.draftPick}초 · R2 배치 ${R.timers.runLoadout}초`]],
      perRound: { title: "라운드별 한도", round: "라운드", hand: "보유 장수", buys: "구매", rerolls: "리롤", noShop: "상점 없음" },
      prices: "카드 가격 (BB)",
    },
    pool: {
      title: "카드 풀",
      items: ["52장은 모두 한 장씩만 존재합니다. 누군가 보유한 카드는 다른 플레이어의 상점이나 드래프트에 나오지 않습니다.", "내 상점에 놓인 카드도 그동안 다른 플레이어에게 나오지 않습니다.", "판매한 카드와 탈락한 플레이어의 카드는 풀로 돌아갑니다.", "상대 카드는 쇼다운에서 공개되기 전까지 보이지 않습니다.", "보드 카드는 그 경기 참가자가 보유한 카드와 겹치지 않습니다."],
    },
    economy: {
      title: "경제",
      income: [["시작", `${R.startBB} BB`], ["라운드 수입", `+${R.roundIncomeBB} BB (R2~R5)`], ["남은 BB 점수", `⌊BB ÷ ${R.stackScoreUnitBB}⌋`]],
      matchTitle: "정규 경기 BB 보상", matchHead: ["라운드", "승리", "패배"],
      matchRows: [
        ["R1", `+${R.matchBB.r1.win}`, `+${R.matchBB.r1.loss} (+${R.matchBB.r1.lossStep} × 연패)`],
        ["R2 RUN · R4 1차전 · R4 승자조", `+${R.matchBB.r2.win} (+${R.matchBB.r2.winStep} × 연승)`, `+${R.matchBB.r2.lossStep} × 연패`],
        ["R3", `+${R.matchBB.r3.win}`, `+${R.matchBB.r3.loss} (+${R.matchBB.r3.lossStep} × 연패)`],
        ["R4 생존조 · R5", "—", "—"],
      ],
      notes: ["연승·연패는 이번 경기 전까지 이어진 횟수입니다.", "카드가 부족해 몰수패하면 BB와 승점을 받지 않습니다.", "구매 한도와 리롤 한도는 라운드마다 초기화됩니다."],
    },
    rounds: {
      title: "라운드",
      r1: { name: "HOLD'EM SWISS", tagline: "홀덤 · 스위스 3경기", specs: [["인원", "8"], ["카드", "2"], ["경기", "1:1 스위스 ×3"], ["승점", `승 +${P.r1.win}P · Split +${P.r1.split}P`], ["규칙", "홀 2 + 보드 5 중 BEST 5"], ["탈락", "없음"]],
        details: ["같은 2장으로 3경기를 치릅니다. 2·3경기는 전적이 비슷한 상대와 붙습니다."] },
      r2: { name: "RUN IT TWICE", tagline: `공개 드래프트 ${R.draftCards[2]}장 → 스플릿 런`, specs: [["인원", "8"], ["카드", "3"], ["경기", "1:1 · RUN ×2"], ["승점", `RUN당 승 +${P.r2Run.win}P · Split +${P.r2Run.split}P`], ["규칙", "앵커 1 + 보조 1 + 보드 5"], ["탈락", "없음"]],
        details: ["개인 상점이 없습니다. 드래프트로 3장째를 얻습니다.", "RUN 1 = 앵커 + 보조 1, RUN 2 = 앵커 + 보조 2. 두 RUN은 서로 다른 보드입니다.", `배치하지 않으면 ${R.timers.runLoadout}초 뒤 자동으로 완성됩니다.`] },
      r3: { name: "OMAHA SWISS", tagline: "오마하 · 스위스 3경기", specs: [["인원", "8"], ["카드", "4"], ["경기", "1:1 스위스 ×3"], ["승점", `승 +${P.r3.gameWin}P · Split +${P.r3.gameSplit}P`], ["규칙", "홀 정확히 2 + 보드 정확히 3"], ["탈락", "누적 승점 하위 2명"]],
        details: ["1경기 대진은 누적 승점(동점이면 BB) 순서로 정해집니다."] },
      r4: { name: "BEST FIVE OF TEN", tagline: "공개 드래프트 → 상점 → 브래킷", specs: [["인원", "6"], ["카드", "5"], ["경기", "1:1 ×3 → 3인 그룹 ×2"], ["승점", `1차전 승 +${P.r4Primary.win}P · Split +${P.r4Primary.split}P`], ["규칙", "홀 5 + 보드 5 중 BEST 5"], ["탈락", "생존조 2명"]],
        details: [`드래프트(${R.draftCards[4]}장 공개)로 1장을 얻은 뒤 개인 상점이 열립니다.`, "1차전 승자 3명은 승자조, 패자 3명은 생존조로 갑니다.", `승자조: 1위 +${P.r4WinnerGroup.first}P · 2위 +${P.r4WinnerGroup.second}P · 3위 +${P.r4WinnerGroup.third}P. 2위가 공동이면 각 +${P.r4WinnerGroup.tiedSecond}P.`, `생존조: 1위 1명만 생존 (+${P.r4LoserGroup.survive}P), 2명 탈락.`] },
      r5: { name: "THE LAST HAND", tagline: "보드 없는 결승", specs: [["인원", "4"], ["카드", "7"], ["경기", "4인 동시"], ["승점", `+${f1} / +${f2} / +${f3} / +${f4}P`], ["규칙", "보유 7장 중 BEST 5 (자동)"], ["탈락", "최종 순위 결정"]],
        details: ["커뮤니티 보드가 없습니다.", "공동 순위는 해당 순위들의 승점을 합쳐 남은 BB가 많은 쪽에 더 많이 나눕니다."] },
    },
    draft: {
      title: "공개 드래프트",
      order: ["퍼스트 클래스 보유자", "누적 승점이 낮은 플레이어", "승점이 같으면 BB가 많은 플레이어", "그래도 같으면 무작위"],
      items: [`R2는 ${R.draftCards[2]}장, R4는 ${R.draftCards[4]}장이 공개되고 한 사람당 1장씩 가져갑니다.`, "드래프트 카드도 가격만큼 BB를 냅니다. 살 수 있는 카드가 없으면 건너뜁니다.", `차례마다 ${R.timers.draftPick}초이며, 시간이 지나면 자동으로 선택됩니다.`],
    },
    points: {
      title: "승점", head: ["라운드", "경기", "승점"],
      rows: [
        ["R1", "스위스 경기", `승 +${P.r1.win} · Split +${P.r1.split}`],
        ["R2", "RUN 1 · RUN 2 각각", `승 +${P.r2Run.win} · Split +${P.r2Run.split}`],
        ["R3", "스위스 경기", `승 +${P.r3.gameWin} · Split +${P.r3.gameSplit}`],
        ["R4", "1차전", `승 +${P.r4Primary.win} · Split 각 +${P.r4Primary.split}`],
        ["R4", "승자조", `+${P.r4WinnerGroup.first} / +${P.r4WinnerGroup.second} / +${P.r4WinnerGroup.third} (공동 2위 각 +${P.r4WinnerGroup.tiedSecond})`],
        ["R4", "생존조", `생존 +${P.r4LoserGroup.survive}`],
        ["R5", "결승 순위", `+${f1} / +${f2} / +${f3} / +${f4}`],
      ],
    },
    elimination: {
      title: "탈락",
      items: [`생존 인원: ${R.alive.join(" → ")}`, "R3: 3경기가 끝난 뒤 누적 승점 하위 2명이 탈락합니다.", "탈락선에 동점자가 걸리면 생존 타이브레이크를 합니다. 새 보드로 겨루고, 승점·BB는 주지 않으며 생존자만 정합니다. BB는 동점을 가르지 않습니다.", `타이브레이크 보드가 ${R.maxSuddenDeathBoards + 1}번 모두 동률이면 무작위 랭크 추첨으로 정합니다.`, "R4: 생존조 3명 중 1위 1명만 남고 2명이 탈락합니다.", "탈락하면 보유 카드는 풀로 돌아가고, 그때의 승점으로 순위가 고정됩니다."],
    },
    final: {
      title: "최종 점수", formula: `누적 승점 + R5 족보 점수 + ⌊남은 BB ÷ ${R.stackScoreUnitBB}⌋`, handTitle: "족보 점수", placementTitle: "최종 순위",
      items: ["R5 진출자 4명은 최종 점수로 1~4위를 정합니다. 점수가 같으면 R5 결승 순위가 높은 쪽이 앞섭니다.", "R4 탈락자는 5~6위, R3 탈락자는 7~8위이며 탈락 당시 승점 순입니다. BB와 족보는 이 순위를 바꾸지 않습니다.", "어빌리티 보상은 따로 더하지 않습니다. 받은 승점과 BB가 위 식에 이미 들어 있습니다.", `결과 화면의 랭크 점수(${R.rankPoints.map((v) => (v > 0 ? `+${v}` : `${v}`)).join(" / ")})는 1~8위 표시용이며 최종 점수에 더해지지 않습니다.`],
    },
    abilities: {
      title: "어빌리티",
      intro: [`게임 시작 전, 순서대로 ${ABILITY_DECK_SIZE}장의 뒷면 카드 중 1장을 고릅니다. ${R.players}명이 서로 다른 어빌리티를 받습니다.`, "시간이 지나면 남은 카드 중 하나가 자동으로 선택됩니다.", "매치 보상형 어빌리티는 정규 경기에만 발동합니다. 타이브레이크 보드는 보상을 만들지 않습니다."],
      effect: "효과", timing: "발동 시점", notes: "주의",
    },
    ties: {
      title: "동률 · 예외",
      items: ["족보가 같으면 키커까지 비교합니다. 무늬로는 승패를 가리지 않으며, 완전히 같으면 Split입니다.", `R4 1차전이 Split이면 두 명 모두 +${P.r4Primary.split}P를 받고, 조 배정만 새 보드로 가립니다(최대 ${R.maxSuddenDeathBoards}번, 이후 무작위 랭크 추첨). 이 결정전에는 추가 승점이 없습니다.`, "R4 승자조 동률은 1위만 새 보드로 가립니다. 공동 2위는 각각 공동 2위 승점을 받습니다.", "R5 공동 순위는 해당 순위 승점을 남은 BB 비율로 나눕니다(ICM 방식).", "필요한 카드 수를 채우지 못하면 그 경기는 몰수패이며 승점·BB를 받지 않습니다. 무료 카드나 빚은 생기지 않습니다.", "제한 시간이 끝나면 미완료 행동은 자동으로 처리되어 게임이 멈추지 않습니다."],
    },
  },
  abilities: {
    "royal-blood": { style: "처음부터 높은 카드를 쥐고 비싼 카드를 싸게 모으는 빌드.", effect: `시작 카드 1장을 A·K·Q·J·T 중에서 받습니다. 이 랭크의 카드는 상점과 드래프트에서 ${A["royal-blood"].discountPercent}% 가격(소수점 버림)에 삽니다.`, timing: "게임 시작 · 매 구매", notes: ["예: Q 15BB → 7BB, A 20BB → 10BB."] },
    "target-sniper": { style: "시작 카드를 끝까지 지키며 메이드를 노리는 빌드.", effect: `처음 받은 카드가 BEST 5에 들어간 스트레이트 이상을 만들면 경기마다 +${A["target-sniper"].bb}BB.`, timing: "정규 경기마다 · 승패 무관 · R2는 RUN마다", notes: ["처음 받은 카드를 팔면 발동하지 않고, 다시 사면 다시 발동합니다.", "같은 족보를 만드는 5장 조합이 여러 개면 시작 카드가 들어간 조합으로 인정합니다."] },
    underdog: { style: "가장 싼 2를 모아 마지막 한 방을 노리는 빌드.", effect: `R5에서 2가 포함된 BEST 5로 스트레이트 이상을 만들면 +${A.underdog.points}P.`, timing: "R5 결승 · 승패 무관", notes: ["R1~R4에서는 발동하지 않습니다."] },
    "first-class": { style: "드래프트에서 원하는 카드를 먼저 가져가는 빌드.", effect: "R2·R4 공개 드래프트에서 순위와 관계없이 가장 먼저 고릅니다.", timing: "R2·R4 드래프트", notes: ["나머지 플레이어의 순서는 원래 규칙을 따릅니다."] },
    "golden-hand": { style: "카드를 자주 바꾸며 패를 유연하게 다듬는 빌드.", effect: `개인 상점 카드 +${A["golden-hand"].extraShop}장. 카드를 팔면 기본 가격의 ${A["golden-hand"].refundPercent}%를 돌려받습니다.`, timing: "개인 상점이 있는 라운드 · 판매할 때", notes: ["R2에는 개인 상점이 없어 상점 카드 추가가 없습니다.", "시작 카드도 100%로 팔립니다."] },
    trader: { style: "리롤을 마음껏 돌려 원하는 카드를 찾는 빌드.", effect: `개인 상점의 리롤과 잠금이 무료입니다. 상점 단계마다 리롤 +${A.trader.extraRerolls}회.`, timing: "개인 상점 단계", notes: ["R2에는 개인 상점이 없어 적용되지 않습니다."] },
    predator: { style: "연승을 이어 갈수록 BB가 쌓이는 빌드.", effect: `정규 경기에서 단독 승리하면 연승이 1 오르고, ${A.predator.fromStreak}연승부터 승리마다 +${A.predator.bb}BB.`, timing: "정규 경기 승리마다", notes: ["연승은 라운드를 넘어 이어집니다.", "Split이나 패배하면 0으로 돌아갑니다.", "타이브레이크 승리는 연승에 들어가지 않습니다."] },
    architect: { style: "트리플과 페어를 겹쳐 풀하우스를 설계하는 빌드.", effect: `정규 경기의 최종 족보가 정확히 풀하우스이면 +${A.architect.bb}BB.`, timing: "정규 경기마다 · 승패 무관 · R2는 RUN마다", notes: ["포카드 이상의 상위 족보는 해당하지 않습니다."] },
    capitalism: { style: "BB를 쌓아 두고 이자로 불리는 빌드.", effect: `살아남은 라운드가 끝날 때 보유 BB의 ${A.capitalism.percent}%(소수점 버림)를 받습니다.`, timing: "라운드 종료 · 한 라운드에 1번", notes: ["탈락한 라운드에는 받지 않습니다.", "R5를 마친 뒤에도 받습니다."] },
    "quad-core": { style: "시작 카드로 포카드를 완성해 결승 순위 점수를 두 배로 노리는 빌드.", effect: `R5에서 처음 받은 카드가 포함된 포카드를 만들면 R5 순위 승점을 ${A["quad-core"].multiplier}배로 받습니다.`, timing: "R5 결승 · 순위 승점 정산", notes: ["처음 받은 카드가 포카드를 이루는 4장 중 하나여야 합니다. 키커로만 쓰이면 발동하지 않습니다.", "공동 순위라면 나눠 받은 순위 승점만 2배가 됩니다. 누적 승점·족보 점수·BB 점수는 늘지 않습니다.", "처음 받은 카드를 팔면 발동하지 않고, 같은 카드를 다시 사면 다시 발동합니다."] },
    "front-runner": { style: "매 라운드 1위를 지켜 승점 차이를 벌리는 빌드.", effect: `라운드가 끝났을 때 1위라면 추가 승점: ${[1, 2, 3, 4, 5].map((n) => `R${n} +${A["front-runner"][`r${n}`]}P`).join(" · ")}.`, timing: "라운드 종료 · 한 라운드에 1번", notes: ["R1~R4는 생존자 순위표(누적 승점 → BB → 좌석 순서) 1명만 대상입니다.", "R5는 최종 총점이 아니라 결승 1위 기준이며, 공동 1위면 모두 받습니다."] },
    "zero-risk": { style: "유리한 싸움에서 지더라도 손해를 줄이는 빌드.", effect: `R1~R4의 1:1 정규 경기에서 경기 전 예상 승률이 ${A["zero-risk"].equity}% 이상인데 지면 +${A["zero-risk"].bb}BB.`, timing: "R1~R4 정규 1:1 경기 패배", notes: ["예상 승률은 경기 화면에 표시되는 값입니다.", "Split, R5, 타이브레이크에는 적용되지 않습니다."] },
  },
};
