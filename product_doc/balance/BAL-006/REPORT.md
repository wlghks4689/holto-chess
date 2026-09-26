# BAL-006 — R4 3인 매치 사전 승률의 정의·산식 검증

분석 브랜치: `balance/BAL-006-latest` · 기준 커밋: `d5e62cb2af4ae0f1dcd3ccccf52e18a2c48052db` (REQUEST 포함 커밋 `cee690b`)

이 보고서는 승률 표시 방식이나 게임 규칙을 확정하지 않는다. 모든 수치는 `product_doc/balance/BAL-006/artifacts/scripts/`의
스크립트가 **실제 프로덕션 함수**(`resolveSecondary`, `findBestFive`, `compareHands`, `rankPlayers`, `placeInRanking`)를
직접 호출해 얻은 결과다. 게임 소스·UI·공용 테스트는 전혀 수정하지 않았다.

## 0. 요약 (TL;DR)

| # | 발견 | 근거 |
|---|---|---|
| 1 | **표준 8인 게임에서 R4 SHOWDOWN_SECONDARY는 매번(예외 없이) winnerGroup·loserGroup이 각각 정확히 3명이다.** R1/R2는 탈락자가 없고, R3는 `assignSurvivalBoundary`가 항상 정확히 2명을 탈락시켜 8→6명이 R4에 진입한다. R4 primary는 `pair(alive)`로 6명을 3쌍으로 묶어 각 쌍이 승자 1·패자 1을 내므로 winnerGroup.length=loserGroup.length=3이 항상 성립한다. 즉 "3-way"는 REQUEST의 표현("winnerGroup 또는 loserGroup이 3명일 때")처럼 가끔 발생하는 경우가 아니라 **표준 게임의 유일한 경로**다. | §1.1, `engine.ts` 코드 추적 + 기존 `engine.test.ts` "uses separate boards for R4 winner and loser three-way encounters" 테스트로 교차 확인 |
| 2 | 규정 보드에서 2명 이상이 1위 동점이면, sudden death(최대 2회)로 그 **동점자 집합끼리만** 재비교하고, 그래도 안 풀리면 카드와 무관한 순수 난수 rank 추첨으로 단독 승자를 정한다. 그런데 **최종 승자가 아닌 원래 동점자는 이후 몇 라운드를 더 버텼든 관계없이 전부 2위로 묶인다** — 3파전이 1승자+2공동2위로 항상 수렴하며 "동점 탈락자들 사이의 순위"는 애초에 계산되지 않는다. | §1.2 코드 추적(`engine.ts` 402–411행), §5 사례 |
| 3 | R4 승자조 포상표(`r4WinnerGroup`)는 `first=10 / second=5 / tiedSecond=3 / third=3`. **공동 3파전이 sudden death로 풀려도 남은 두 명은 항상 "공동 2위"(각 3P)로 처리되므로, 승자조 총 포상 합계는 시나리오에 따라 18P(1/2/3 클린)일 수도, 16P(1위 동점 후 해소, 2/3위 자리 없음)일 수도 있다** — 승률/기대승점을 계산할 때 이 분기를 무시하면 기대 포상이 체계적으로 틀린다. | §1.3, §5 |
| 4 | `rewardMatch`의 포상표는 place 1/2/3만 정의한다. 실제 8인 표준 게임에서는 그룹 크기가 항상 3이라 문제되지 않지만, **인위적으로 4인 그룹을 구성하면 4위는 포상 0P로 떨어진다**(place 4가 표 밖). 표준 8인 흐름에서는 도달 불가능해 보이는 코드 경로이지만, 그룹 크기가 바뀌는 변형이 생기면 잠재적 공백이다. | §1.4 (엔진 직접 호출로 재현) |
| 5 | 정확 전수 계산은 **"규정 보드 1개 종료 시점의 단독 1위 확률/동점 fractional equity"에 한해서만** 현실적이다(잔여 덱 `C(37,5)=435,897`개, 실측 런타임은 §3). **Sudden death까지 포함한 최종 승률의 완전 전수 계산은 비현실적**이다 — 동점이 발생한 435,897개 보드마다 다시 435,897개의 sudden-death 보드를 전수 순회해야 하므로 사실상 재귀적으로 기하급수 팽창한다. 따라서 최종 승률·기대 승점·생존 확률은 Monte Carlo가 유일한 현실적 방법이다. | §3 |
| 6 | 3인 매치의 "동일 보드 공유"는 엔진 자체 규칙이며(`encounterBoards`가 한 번의 보드를 세 참가자 모두에게 적용), 두 명씩 따로 heads-up 승률을 구해 결합하는 방식은 **같은 보드를 공유하지 않고 서로 다른 덱에서 독립적으로 표본을 뽑으므로** 원리적으로 다른 확률을 준다. 실측 수치로 확인함(§4). | §4 |
| 7 | R1~R4 2인 승률에 적용된 BAL-005의 "카드 배열 순서 불변 시드" 원칙은 N=3(또는 임의의 N)으로 자연스럽게 일반화된다: 시드를 만들 때 "전체 참가 카드 ID의 합집합을 정렬"하면 되고, 이는 손의 내부 순서뿐 아니라 **손들 자체의 배열 순서**에도 불변임을 프로토타입으로 검증했다(§6). | §6 |
| 8 | 카드 부족(불완전 핸드)은 이미 `forfeitHand()`(categoryRank=0)로 처리되어 항상 최하위·0P가 되지만, **몰수패로 인한 0%와 "정상적으로 계산해서 나온 0%에 가까운 확률"은 UI에서 반드시 구분 표기해야 한다** — 그렇지 않으면 REQUEST가 우려한 "0% 오표시"가 실제로 발생한다. | §7 |

## 1. 실제 규칙 확인 (코드 근거)

### 1.1 R4 3-way는 표준 게임의 유일한 경로다

- `BALANCE.playerCount = 8`(`config.ts`), R1·R2는 `eliminate(state, ...)` 호출이 코드 전체에서 R3의 `assignSurvivalBoundary`/`resolveSurvival`와 R4의 loser-group 정리(`resolveSecondary` 764행)에만 존재한다 — R1·R2는 탈락자가 없다.
- `assignSurvivalBoundary`(`engine.ts` 675–684행)는 `alive[1].points`를 경계로 항상 정확히 2명을 탈락시킨다(동점이면 `resolveSurvival`의 추가 sudden death로 경계를 확정하지만, 탈락 인원 자체는 항상 2명 고정).
- 따라서 R3 종료 후 항상 8−2=6명이 R4에 진입한다. R4 primary는 `pair(alive)`(517행, `Math.floor(ids.length/2)`쌍)로 6명을 3쌍으로 나누고, 각 쌍은 `requireSingleWinner=true`로 단독 승자를 낸다(R4 primary도 `resolveParticipants(..., state.round===2||state.round===4, ...)`로 승자 강제).
- 결과: `winnerGroup = matches.flatMap(m => m.winnerIds)` 길이 3, `loserGroup` 길이 3 — **항상**. 기존 테스트 `engine.test.ts`의 "uses separate boards for R4 winner and loser three-way encounters"가 8인 표준 흐름으로 이를 그대로 검증하고 있어 독립적으로 교차 확인된다.
- 단서: `BALANCE.playerCount`를 8이 아닌 값으로 바꾸는 경로는 코드에서 찾지 못했다(REQUEST 범위상 게임 설정 변경 여부까지는 조사하지 않음). 이 결론은 "현재 코드가 구현하는 표준 8인 게임"에 한정된다.

### 1.2 3-way 동점 해소의 정확한 place 배정 규칙

`engine.ts`의 `resolveParticipants`(341–421행)를 그대로 추적한 결과:

1. 규정 보드(보드 1개, 3명 모두 공유)에서 1위가 단독이면 **그 자리에서 종료** — sudden death는 발생하지 않는다. 2위가 동점이어도 그대로 둔다(REQUEST가 말한 "2위 동점만 있는 경우" 그대로).
2. 1위가 동점(2명 또는 3명)이면, **그 동점자 집합만** 새 보드로 재비교한다. 이 sudden-death 보드는 세 참가자 전원(원래 참가자 15장 전체)을 제외한 **새 덱**에서 다시 뽑으므로, 규정 보드와 카드가 겹칠 수 있다(REQUEST 기술과 일치).
3. 최대 2회까지 sudden death를 반복하고, 그래도 안 풀리면 카드와 무관한 2~14 랭크 무작위 추첨(`highCardDraw`)으로 단독 승자를 정한다.
4. **핵심**: 이렇게 몇 라운드가 걸렸든, 최종 결과 배정은 다음 한 줄로 요약된다(407–411행) —
   `place = 최종 승자면 1, (원래 규정 보드에서 1위 동점자였지만) 승자가 아니면 2, 그 외(원래부터 1위가 아니었던 참가자)는 규정 보드에서의 원래 순위`.
   즉 3파전이 규정 보드에서 3명 모두 1위 동점이었다면, 중간에 sudden death를 몇 번 거쳤든 최종 결과는 항상 "1명 1위 + 나머지 2명 공동 2위"이며, **"공동 2위 중 누가 sudden death를 더 오래 버텼는지"는 결과에 전혀 반영되지 않는다.**
   반대로 규정 보드에서 2명만 1위 동점이고 1명은 처음부터 뒤처져 있었다면: 동점 승자→1위, 동점 패자→2위, 원래 뒤처졌던 참가자→(정확히) 3위. 이 경우는 자연스럽게 1/2/3이 나온다.
- 검증: `edgeCases.ts`(4위 그룹 케이스), `sweepBranches.ts`가 실제로 뽑아낸 사례들로 위 규칙이 항상 성립함을 확인했다(§5 표).

### 1.3 R4 승자조 포상 — 동점 분기에 따라 총 포상액이 달라진다

`config.ts`의 `r4WinnerGroup = { first: 10, second: 5, tiedSecond: 3, third: 3 }`, `engine.ts`의 `rewardMatch`(423–430행):

```
prizes = { 1: first, 2: second, 3: third }
if (2위가 2명 이상) prizes[2] = tiedSecond   // 5 -> 3으로 강등
```

| 규정 보드 결과 | 최종 place 분포 | 포상 | 총합 |
|---|---|---|---|
| 단독 1위, 단독 2위, 단독 3위 | 1,2,3 | 10,5,3 | 18P |
| 단독 1위, 2위 동점(2명) | 1,2,2 | 10,3,3 | 16P |
| 3명 모두 1위 동점 → sudden death로 1명 승리 | 1,2,2(항상) | 10,3,3 | 16P |
| (도달 불가로 보임) 1위·2위 모두 동점 등 복합 상황 | placeInRanking 규칙에 따름 | — | — |

**패자조**는 `r4LoserGroup = { survive: 0 }`뿐이라 승/패와 무관하게 포상은 항상 0P다(점수 개념이 없고 생존 여부만 있음). 이는 REQUEST의 관찰과 정확히 일치한다.

### 1.4 그룹 크기가 3이 아닐 때 (합성 케이스, §7 Q8)

`edgeCases.ts`로 4인 승자조를 인위적으로 구성해 직접 호출한 결과, place는 1/2/3/4까지 올바르게 매겨지지만 `prizes[4]`가 정의되어 있지 않아 `?? 0`으로 떨어져 **4위가 0P를 받는다**(§0 #4). 1.1에서 확인했듯 표준 8인 게임에서는 이 경로에 도달하지 못하는 것으로 보이나, 코드 자체의 표 공백은 사실이다.

## 2. 승률 정의 3종과 산식

REQUEST Q1이 요구한 대로 세 지표를 분모·분자·동점 처리까지 명시해 구분한다.

### 2.1 규정 보드 단독 1위 확률 + 1위 동점 포함 fractional equity

- **정의**: 딱 한 장의 규정 보드(5장, 3명 공유)만 뽑았을 때의 결과. Sudden death는 고려하지 않는다.
- `soloWinProbability_i = (i가 단독 1위인 보드 수) / N`
- `fractionalEquity_i = Σ_board [ i가 1위일 때 1/(1위 동점 인원) ] / N` (1위가 아니면 0)
- 항상 `Σ_i fractionalEquity_i = 1`이 성립(전수 계산으로 확인, §3).
- 장점: 정확 계산이 가능하고(§3), sudden death의 무작위성(카드와 무관한 rank 추첨 포함)을 섞지 않아 "카드 자체의 강도"를 가장 순수하게 반영한다.
- 단점: **실제 승자**(누가 최종적으로 그 라운드를 가져가는지)와 다르다 — 1위 동점자가 sudden death에서 지면 규정 보드 fractional equity는 양수였지만 최종 승자는 아니다.

### 2.2 최종 매치 승리 확률 (엔진 규칙 그대로: sudden death + high-card draw 포함)

- **정의**: `resolveSecondary`가 반환하는 `match.winnerIds`(길이 1)가 자신인 비율.
- `finalWinProbability_i = (i가 최종 단독 승자인 시행 수) / N`
- 표본은 `resolveSecondary`를 실제로 호출해 얻는다(Monte Carlo만 가능, §3).
- 장점: "이 라운드를 실제로 이길 확률"이라는 사용자의 직관과 정확히 일치. UI에 "예상 승률"로 쓰기 가장 적합한 후보.
- 단점: 표본오차가 있고(§3 표), 드물게는 카드와 무관한 rank 추첨 결과까지 섞인다(아주 드문 경우 — §5 발생률 참고).

### 2.3 승자조 기대 승점 / 패자조 생존 확률

- **승자조**: `expectedPoints_i = Σ_trial pointAwards_i(trial) / N` — 실제 `rewardMatch`가 계산한 포상표를 그대로 사용(§1.3의 16P/18P 분기가 자동으로 반영됨). 단순 "1위 확률 × 10 + 2위 확률 × 5 + 3위 확률 × 3"으로 근사하면 §1.3의 동점 강등(5→3)을 놓쳐 과대추정된다 — 반드시 실제 포상표 분기를 반영해야 한다.
- **패자조**: `survivalProbability_i = finalWinProbability_i` (패자조는 승자=생존자이므로 정의상 동일하지만, 사용자에게는 "승률"이 아니라 "생존 확률"이라는 별도 라벨이 필요하다 — 이겨서 다음 라운드에 진출하는 것이 아니라 **탈락을 면하는 것**이기 때문. §8).

세 지표는 서로 다른 질문에 답하므로 UI 라벨도 구분해야 한다(§8).

## 3. 정확 계산 vs Monte Carlo — 실측 비용과 선택 권고

### 3.1 규정 보드 단독 계층 — 정확 계산이 현실적이다

REQUEST가 계산한 대로 잔여 덱은 `C(37,5) = 435,897`개다. `exactRegulationEquity()`(`lib/regulationEquity.ts`,
`core/poker/evaluate.ts`의 실제 `findBestFive`/`compareHands`/`rankPlayers`/`placeInRanking`만 사용, 재구현 없음)로
한 손 조합(뚜렷한 강도차 예시: AAKK2 vs 7799x4s vs QQTx3h)을 전수 순회한 실측 결과(`benchExact.log`):

| 항목 | 값 |
|---|---|
| 순회한 보드 수 | 435,897 (전수, 표본오차 0) |
| 실행 시간(단일 코어, Node 22.22.2, 이 세션 환경) | **584.0초 (약 9분 44초)** |
| soloWinProbability | 52.872% / 22.389% / 24.737% |
| tiedFor1st probability | 0.002% / 0.002% / 0.002% (이 손 조합에서는 정확히 동률인 보드가 극히 드묾 — 435,897개 중 약 8~9개) |
| fractionalEquity | 52.873% / 22.389% / 24.738% (합계 100.000%, 검증됨) |

**약 10분/조합**은 서버에서 비동기 배치로 미리 계산해 캐싱하는 용도로는 쓸 수 있지만, 로딩 화면이 뜨는 시점에
그 자리에서 계산하기에는 너무 느리다. 클라이언트 메인 스레드에서는 절대 무리다.

### 3.2 Sudden death까지 포함한 전수 계산은 비현실적이다 — 근거

정확 계산의 범위를 sudden death까지 넓히려면, 위에서 발견된 "동률 보드"(이 예시에서는 435,897개 중 약
8~9개, 즉 약 0.002%) 각각에 대해 **새로운 C(37,5)=435,897개짜리 sudden-death 보드 전수 순회**를 다시
수행해야 한다. 이 손 조합처럼 동률이 극히 드문 경우조차 `8~9 × 584초 ≈ 1.3~1.5시간`이 추가로 필요하고,
sweepBranches.ts로 확인했듯(§5) "near-mirror-pairs"류의 강도가 비슷한 손 조합은 **동률 보드 비율이
20~30%대**에 이른다 — 이 경우 필요한 sudden-death 재귀 전수 계산은 `435,897 × 0.25 ≈ 109,000개 보드 ×
584초 ≈ 17.6일`로 폭발한다. 게다가 이것은 sudden death **1단계**만의 비용이며, 최대 2단계 + 카드와 무관한
rank 추첨까지 완전히 정확하게 계산하려면 이 비용이 다시 곱해진다. **따라서 "정확 계산"을 최종 승률·기대
승점·생존 확률에 대해 주장하는 것은 현실적으로 불가능하며, 이 세 지표는 Monte Carlo가 유일한 방법이다.**

### 3.3 Full-engine Monte Carlo 실측 비용

`resolveSecondary()`를 실제로 호출하는 `lib/fullEngineMC.ts` 기반 실측(같은 AAKK2/7799x/QQTx 손 조합):

| N(시행 수) | 총 소요시간 | 시행당 비용 | 승률 95% CI 반폭(대략) |
|---|---|---|---|
| 300 | 3.6초 | 12.1ms | ±5.6%p (표본이 작아 넓음) |
| 20,000(추정, 벤치마크 외삽) | 약 240초 | ~12ms | ±약 0.7%p |

**시행당 약 11~12ms**로, 규정 보드 전용 exact/MC(계산 자체는 findBestFive 호출 몇 백 번 수준으로 1ms 미만이어야
할 계산량)보다 10배 이상 느리다. 원인은 포커 계산 자체가 아니라 `resolveSecondary`가 매 시행마다 전체
`PorenaGameState`(52장 카드 풀 + 8명 플레이어 + 로그 등)를 두 번 `structuredClone`하고 `assertPoolIntegrity`,
`captureRewards` 등 게임 상태 부기 작업을 전부 수행하기 때문이다. **결론**: 최종 승률/기대 승점을 실시간
UI에서 계산하려면 `resolveSecondary`를 그대로 재사용하지 말고, "규정 보드 + sudden death 카스케이드 +
place 배정 규칙(§1.2)"만 뽑아낸 경량 계산기를 별도로 만들어야 한다(§9 계산 계약 제안 참고). 그 경량
계산기의 실제 성능은 이번 조사에서 측정하지 않았다 — Codex 구현 시 별도 벤치마크가 필요하다.

### 3.4 권고

| 지표 | 방법 | 근거 |
|---|---|---|
| 규정 보드 단독/동점 fractional equity | **정확 계산** (오프라인/서버 사전계산 캐시 전제) 또는 대형 MC | 조합수 435,897개로 전수 가능하되 ~10분/조합이라 실시간 부적합 |
| 최종 매치 승리 확률 | **Monte Carlo만 가능** | §3.2 근거로 전수 불가능 |
| 기대 승점 / 생존 확률 | **Monte Carlo만 가능**, 반드시 실제 포상표 분기(§1.3) 반영 | 위와 동일 + 승점표 자체가 분기를 갖고 있어 산술적 근사 불가 |
| 표본 수 | 위 표의 N=20,000 수준이면 95% CI가 대략 ±1%p대로 좁아짐(정확한 값은 손 조합의 실제 승률에 따라 달라짐 — p(1-p) 분산이 커질수록 넓어짐) | §3.3 실측 |
| 시드 | 동일 카드 구성이면 항상 동일 결과가 나오도록 §6의 canonical seed 사용 권고 | §6 |

## 4. 왜 "두 명씩 heads-up 승률 계산"이 3-way를 대체할 수 없는가 (Q3)

같은 세 손(distinct-strength 풀: AAKK2 / 7799x4s / QQTx3h)에 대해 두 가지를 나란히 계산했다
(`pairwiseVsThreeWay.ts`, `benchExact.ts`):

**(A) 진짜 3-way 규정 보드 fractional equity (전수 계산, §3.1)**: 52.873% / 22.389% / 24.738%

**(B) 순수 2인 heads-up 승률**을 각 쌍마다 **그 쌍만 제외한 별도 덱**에서 독립적으로 표본화(N=200,000, 실제
프로덕션 `findBestFive`/`compareHands` 사용)한 결과:

| 대결 | 승률 |
|---|---|
| P(A beats B) | 67.33% |
| P(A beats C) | 67.86% |
| P(B beats C) | 37.25% |

이 pairwise 승률들을 "독립사건처럼" 결합해 P(3명 중 1등)을 근사하면(`P(A 1등) ≈ P(A>B)×P(A>C)` 식):
A=45.69%, B=12.17%, C=20.17% — **합계가 78.03%로 100%가 안 된다**(그 자체로 이미 잘못된 근사라는 증거).
합이 100%가 되도록 억지로 정규화해도 A=58.55%, B=15.60%, C=25.85%가 되어, **진짜 값(A=52.87%, B=22.39%,
C=24.74%)과 각각 +5.7pp, -6.8pp, +1.1pp 차이**가 난다.

**원인은 두 가지다.** 첫째, pairwise 방식은 각 쌍마다 **서로 다른, 독립적으로 뽑은 보드**를 쓴다 —
A-vs-B 승률을 잴 때의 보드와 A-vs-C 승률을 잴 때의 보드가 다르므로, "그 보드에서 A가 B에게도 C에게도
동시에 이겼는가"라는 결합 사건을 전혀 관측하지 못한다. 실제 R4 3-way는 `encounterBoards`가 **단 한 번
뽑은 보드를 세 명 모두에게 공유**한다(§1.2) — 이 공유 자체가 세 결과를 서로 얽히게 만든다(예: 보드가
플러시를 완성시키면 그 보드를 활용할 수 있는 손들이 동시에 유리해지거나 불리해지는 상관관계가 생긴다).
둘째, pairwise 방식은 **3자 동시 동점**(세 손 모두 1위 동점)이라는, 2인 대결에는 아예 존재하지 않는
사건을 표현할 수 없다.

**결론**: 두 명씩 따로 계산한 heads-up 승률을 결합해 3-way 확률을 만드는 것은 원리적으로 편향되며,
실측으로도 5~7%p 수준의 오차가 확인된다. 3-way 승률은 반드시 §1.2처럼 **하나의 공유 보드**로 세 손을
동시에 비교해야 한다.

## 5. 결정적 사례 매트릭스 (24건)

`sweepBranches.ts`가 5개의 손-조합 풀(§5.1) × winner/loser 그룹 × 최대 4,000개 seed를 스윕해 실제
`resolveSecondary()`가 낸 결과를 6가지 분기로 자동 분류하고(`branch_exemplars.json`), 그중 REQUEST가
요구한 시나리오를 모두 포함하도록 24건을 선정했다(`caseMatrix.ts` → `case_matrix.json`). **손으로 추측해
만든 사례가 아니라, 실제 엔진 호출 결과에서 각 분기의 첫 발생 seed를 그대로 가져온 것**이다.

### 5.1 손-조합 풀

| 풀 ID | 설명 |
|---|---|
| `distinct-strength` | 강도가 뚜렷하게 다른 3명(쿼드/투페어 재료) — 동률이 극히 드묾(§3.1) |
| `near-mirror-pairs` | 서로 다른 슈트의 비슷한 페어 3개 — 동률·sudden death·high-card draw가 20~30%대로 빈발 |
| `weak-disconnected-trio` | 약하고 무관한 로우카드 3명 — 보드가 결과를 지배해 동률이 흔함 |
| `two-strong-one-weak` | 강한 2명 + 약한 1명 — "2위 동점"과 "2명만 tie" 패턴 유도 |
| `all-suited-runup` | 런다운/수티드 위주 3명 — 뚜렷한 서열, sudden death는 가끔 |

### 5.2 사례 표

| # | 풀 | 그룹 | 분기 | seed | place[0,1,2] | suddenDeath | highCardDraw | boards | pointAwards |
|---|---|---|---|---|---|---|---|---|---|
| 1 | distinct-strength | winner | SOLO_1ST | 1 | [1,3,2] | 0 | false | 1 | [10,3,5] |
| 2 | distinct-strength | loser | SOLO_1ST | 1 | [2,3,1] | 0 | false | 1 | [0,0,0] |
| 3 | distinct-strength | winner | TIED_2ND_ONLY | 348 | [2,1,2] | 0 | false | 1 | [3,10,3] |
| 4 | distinct-strength | loser | TIED_2ND_ONLY | 196 | [2,1,2] | 0 | false | 1 | [0,0,0] |
| 5 | near-mirror-pairs | winner | SOLO_1ST | 6 | [1,3,2] | 0 | false | 1 | [10,3,5] |
| 6 | near-mirror-pairs | winner | TIED_2ND_ONLY | 2 | [2,2,1] | 0 | false | 1 | [3,3,10] |
| 7 | near-mirror-pairs | winner | TIE_1ST_1_SUDDEN_DEATH | 5 | [2,1,3] | 1 | false | 2 | [5,10,3] |
| 8 | near-mirror-pairs | winner | TIE_1ST_2_SUDDEN_DEATH | 3 | [2,1,3] | 2 | false | 3 | [5,10,3] |
| 9 | near-mirror-pairs | winner | TIE_1ST_HIGH_CARD_DRAW | 1 | [1,2,3] | 2 | true | 3 | [10,5,3] |
| 10 | near-mirror-pairs | loser | SOLO_1ST | 1 | [3,1,2] | 0 | false | 1 | [0,0,0] |
| 11 | near-mirror-pairs | loser | TIED_2ND_ONLY | 4 | [2,2,1] | 0 | false | 1 | [0,0,0] |
| 12 | near-mirror-pairs | loser | TIE_1ST_1_SUDDEN_DEATH | 9 | [2,1,3] | 1 | false | 2 | [0,0,0] |
| 13 | near-mirror-pairs | loser | TIE_1ST_2_SUDDEN_DEATH | 2 | [2,1,3] | 2 | false | 3 | [0,0,0] |
| 14 | near-mirror-pairs | loser | TIE_1ST_HIGH_CARD_DRAW | 6 | [1,2,3] | 2 | true | 3 | [0,0,0] |
| 15 | weak-disconnected-trio | winner | SOLO_1ST | 6 | [1,2,3] | 0 | false | 1 | [10,5,3] |
| 16 | weak-disconnected-trio | winner | TIED_2ND_ONLY | 2 | [2,1,2] | 0 | false | 1 | [3,10,3] |
| 17 | weak-disconnected-trio | winner | TIE_1ST_HIGH_CARD_DRAW | 1 | [1,3,2] | 2 | true | 3 | [10,3,5] |
| 18 | two-strong-one-weak | winner | SOLO_1ST | 2 | [3,1,2] | 0 | false | 1 | [3,10,5] |
| 19 | two-strong-one-weak | winner | TIED_2ND_ONLY | 5 | [2,2,1] | 0 | false | 1 | [3,3,10] |
| 20 | two-strong-one-weak | winner | TIE_1ST_1_SUDDEN_DEATH | 4 | [2,1,3] | 1 | false | 2 | [5,10,3] |
| 21 | two-strong-one-weak | loser | TIE_1ST_HIGH_CARD_DRAW | 6 | [1,2,3] | 2 | true | 3 | [0,0,0] |
| 22 | all-suited-runup | winner | SOLO_1ST | 2 | [3,2,1] | 0 | false | 1 | [3,5,10] |
| 23 | all-suited-runup | winner | TIE_1ST_1_SUDDEN_DEATH | 1 | [3,2,1] | 1 | false | 2 | [3,5,10] |
| 24 | all-suited-runup | winner | TIE_1ST_2_SUDDEN_DEATH | 65 | [3,2,1] | 2 | false | 3 | [3,5,10] |

관찰: 7·8·9행(near-mirror-pairs, seed 5/3/1)을 나란히 보면, **같은 손 조합(hand1이 항상 최종 승자)이라도
sudden death 라운드 수(1회/2회/high-card draw)는 seed(=보드 운)에 따라 달라지지만 최종 place는 항상
"1위 동점자 중 승자→1, 나머지 동점자→2, 원래 뒤처졌던 3번째→3"으로 수렴**한다 — §1.2에서 코드로 확인한
규칙이 실제 시행에서도 정확히 재현됨을 보여준다. 9·14·17·21행은 2 sudden death 후에도 풀리지 않아
카드와 무관한 rank 추첨으로 넘어간 사례다(REQUEST가 명시한 "2회 sudden death 후 high-card draw" 시나리오).

### 5.3 좌석 순서 permutation / 편향 검증

`case_matrix.ts`의 seat-bias 체크(같은 3개 손, 같은 seed, p1/p2/p3에 배정하는 순서만 4가지로 바꿔봄)
결과(`seat_bias_check.json`): **3개 대표 조합 모두 어느 자리에 앉히든 각 손의 최종 place가 완전히 동일**했다
(`allOrdersAgree: true`). 이는 `resolveParticipants`가 `playerId`별로 분기하는 특수 로직이 없고 순수하게
카드 강도로만 순위를 매긴다는 뜻이며, 좌석 편향은 발견되지 않았다.

### 5.4 "3파전 전원 1위 동점" 붕괴 규칙의 실제 재현

§1.2에서 코드로 추적한 "규정 보드에서 3명 모두 1위 동점이면, sudden death를 몇 번 거치든 최종 승자를
제외한 나머지 둘은 항상 공동 2위로 묶인다"는 규칙을 `findThreeWayCollapse.ts`(near-mirror-pairs 풀,
winner 그룹, seed 1~6000 스윕)로 직접 재현했다:

| seed | place[0,1,2] | suddenDeath | highCardDraw | pointAwards |
|---|---|---|---|---|
| 159 | [1,2,2] | 2 | true | [10,3,3] |
| 53 | [2,1,2] | 2 | true | [3,10,3] |
| 85 | [2,2,1] | 1 | false | [3,3,10] |
| 114 | [2,1,2] | 2 | false | [3,10,3] |
| 134 | [2,1,2] | 2 | true | [3,10,3] |
| 143 | [2,1,2] | 1 | false | [3,10,3] |

seed=159가 REQUEST가 명시적으로 요구한 "2회 sudden death 후 high-card draw"이면서 동시에 **3파전
전원이 원래 1위 동점**이었던 경우를 정확히 보여준다: 2번의 sudden death로도 안 풀려 카드와 무관한 rank
추첨으로 넘어갔고(`highCardDraw=true`), 최종 place는 [1,2,2] — 승자를 뺀 나머지 둘이 몇 라운드를
버텼는지와 무관하게 똑같이 2위(각 3P)로 처리됐다. `pts=[10,3,3]`는 §1.3에서 예측한 대로 "1위 동점 후
해소"의 총 포상 16P(10+3+3)와 정확히 일치한다.

참고로 §5.2의 near-mirror-pairs 7~9행(seed 5/3/1)은 이와 대조되는 "2명만 원래 동점, 3번째는 처음부터
뒤처짐" 케이스로, 최종 결과가 항상 깔끔한 1/2/3(총 18P)이 된다 — 같은 손 풀에서도 **어떤 두 명이 실제로
동점이었는지**에 따라 붕괴 규칙 적용 여부가 갈린다는 것을 보여준다.

## 6. 시드 canonicalization을 N명으로 일반화하는 제안 (Q7)

BAL-005는 `showdownEquity.ts`의 2인 시드를 `known.map(c=>c.id).sort().join(":")`로 고쳐 카드 배열 순서 불변성을
확보했다(현재 이 base 커밋에 이미 반영돼 있음 — `d5e62cb`/`5207f9d`). 이 원칙은 N=3(또는 임의의 N)으로 그대로
확장된다: **"참가하는 모든 손의 카드 ID를 하나의 집합으로 합친 뒤 정렬"** 하면, (a) 각 손 내부의 카드 순서,
(b) 손들 자체가 배열에 나열된 순서 양쪽 모두에 대해 불변인 시드가 만들어진다.

`canonicalSeedProof.ts`로 독립 프로토타입(실제 `showdownEquity.ts`를 수정하지 않음)을 만들어 검증했다:

- 원본 순서, 손 배열 순서를 임의로 뒤바꾼 경우(3가지 순열), 손 내부 카드 순서를 뒤바꾼 경우(각 손), 모든 뒤바꿈을 동시에
  적용한 경우 — **6가지 변형 전부 완전히 동일한 보드가 나왔다**(`artifacts/tests/canonical_seed_proof.md`).
- 서로 다른 카드 구성(D를 추가)에서는 다른 보드가 나와, 상수 함수로 퇴화하지 않았음도 확인했다.

**권고(구현하지 않음)**: N-way 승률 함수를 만들 때 시드를 `hands.flat().map(c=>c.id).sort().join(":")`로
생성하면, 좌석 순서나 배열 구성 방식과 무관하게 "같은 카드 구성이면 항상 같은 표시값"이 보장된다.

## 7. Edge Case 처리 권고 (Q8)

- **카드 부족(불완전 핸드)**: 이미 `handFor`가 `lacksRequiredCards`를 체크해 `forfeitHand()`(`categoryRank=0`)를
  반환하고, `rewardMatch`도 이를 감지해 포상을 0으로 덮어쓴다(`engine.ts` 431–432행). UI 계약에서는 이 경우를
  **"0%"가 아니라 "계산 불가/몰수"로 명시적으로 구분 표기**할 것을 권고한다 — 그렇지 않으면 실제로 약한 손이라서
  0%에 가까운 것과 카드가 아예 없어서 강제로 0%인 것을 사용자가 구분할 수 없다(REQUEST가 명시적으로 우려한 지점).
- **중복 카드**: 카드 소유권 모델(`ownershipCardPool`) 자체가 한 카드를 두 플레이어가 동시에 가질 수 없게
  막고 있어(`assertPoolIntegrity`), 정상적인 게임 상태에서는 구조적으로 발생하지 않는다. `edgeCases.ts`로
  일부러 이중 할당을 시도하면 명확한 예외로 즉시 실패한다(§1.4 근처 로그) — "실패를 조용히 0%로 감추지
  않는다"는 REQUEST의 요구와 일치하는 현재 동작이다. N-way 승률 함수도 같은 방식(카드 ID 집합 크기 검증 후
  불일치 시 null/예외 반환)을 그대로 따르면 된다 — 실제로 2인 `showdownEquity()`가 이미 이렇게 한다
  (`ids.size !== known.length` 체크).
- **참가 인원이 3명이 아닌 경우**: §1.4에서 확인했듯 place 배정 로직(`placeInRanking`) 자체는 인원수에
  무관하게 일반적으로 동작하지만, **포상표(`r4WinnerGroup`)는 3인 고정 전제(1/2/3위)로 짜여 있어 4위 이상은
  0P로 떨어진다.** N-way 승률/기대승점 계산 계약을 설계할 때 "참가 인원이 3이 아니면 이 포상표 기반 기대승점은
  정의되지 않음/별도 처리 필요"라고 명시할 것을 권고한다(§1.1에서 확인했듯 표준 8인 게임에서는 실제로 항상 3명이라
  당장 실사용에는 영향이 없지만, 계산 계약 문서에는 이 전제를 명시해야 한다).

## 8. UI 라벨링 권고 (Q2)

### 8.1 현재 UI 구조 확인

`ShowdownPrepPanel.tsx`를 직접 읽은 결과, **`PrepSeat` 컴포넌트는 이미 `winPercent?: number` prop을 받아
렌더링할 수 있다.** 문제는 `multiway`(opponents.length > 1) 분기에서 이 prop을 아예 넘기지 않는다는
점뿐이다(heads-up 분기만 `showdownEquity()` 호출 결과를 `winPercent`로 넘김). 즉 "승률이 안 보인다"는
사용자 관찰은 계산이 없어서가 아니라 **UI 컴포넌트에 값을 아예 전달하지 않기 때문**이며, 컴포넌트 자체는
이미 N명을 지원할 준비가 되어 있다.

### 8.2 라벨 구분 권고

§2에서 정의한 세 지표는 사용자에게 다른 질문에 답하므로 **하나의 "예상 승률" 문구로 뭉뚱그리지 말 것**을
권고한다:

| 그룹 | 권장 라벨(예시, 실제 문구는 기획 결정) | 근거 지표 |
|---|---|---|
| 승자조(winnerGroup) | "우승 확률" 또는 "1위 확률" | §2.2 최종 매치 승리 확률 |
| 승자조 부가 정보(선택) | "예상 승점" | §2.3 기대 승점(반드시 실제 포상표 분기 반영, §1.3) |
| 패자조(loserGroup) | "생존 확률" (승률이 아님 — 탈락을 면하는 것) | §2.2와 동일한 계산이지만 라벨은 반드시 "생존"으로 구분 |
| (참고용, 굳이 노출한다면) | "규정 보드 기준 우세" | §2.1 규정 보드 fractional equity — sudden death 전 단계만 반영하므로 최종 결과와 다를 수 있음을 별도 표기 |

### 8.3 몰수/계산불가 표기

§7에서 확인한 `forfeitHand()`(categoryRank=0) 케이스는 화면에 "0%"로 표시하지 말고 별도 상태
("카드 부족 · 계산 불가" 등)로 표기할 것을 권고한다 — REQUEST가 명시적으로 우려한 "0% 오표시"를 그대로
피하는 방법이다.

## 9. Codex를 위한 최소 계산 계약 제안 (구현 아님)

아래는 "이런 함수가 있으면 된다"는 계약 제안이며, 실제 시그니처·파일 위치·최적화는 Codex가 결정한다.

```
function threeWayEquity(
  hands: [Card[], Card[], Card[]],   // 각 5장, R4 홀카드 그대로
  group: "winner" | "loser",          // 포상표 분기(§1.3)에 필요
  samples: number,                    // §3.3 실측 기반으로 결정 — resolveSecondary 재사용 시 ~12ms/회 가정
): {
  finalWinProbability: [number, number, number];   // §2.2, 합계 100%
  expectedPoints?: [number, number, number];        // group === "winner"일 때만, §2.3
  regulationSoloWin?: [number, number, number];     // §2.1, 선택적 참고 지표
  sampleSize: number; ci95HalfWidth: [number, number, number];
  status: "OK" | "FORFEIT" | "INVALID_INPUT";        // §7 — 0%와 계산불가를 구분
} | null   // 카드 수 불일치·중복 카드 등 §7의 방어적 케이스
```

핵심 준수 사항:

1. **시드/보드 샘플링은 §6의 canonical(카드 ID 전체 정렬) 방식을 따를 것** — 좌석·배열 순서 불변.
2. **`expectedPoints`는 실제 `r4WinnerGroup` 포상표(§1.3의 16P/18P 분기)를 그대로 반영할 것** — "1위 확률
   ×10 + 2위 확률×5 + 3위확률×3"처럼 단순 가중합으로 근사하지 말 것(공동 2위 강등 규칙을 놓친다).
3. **§3.3에서 확인했듯 `resolveSecondary`를 그대로 매 표본마다 호출하면 시행당 ~12ms로 실시간에는 느리다.**
   실시간 UI용으로 쓰려면 게임 상태 부기(clone/assertPoolIntegrity/captureRewards 등)를 뺀 경량 tie-break
   계산기가 필요하다 — 다만 그 경량 계산기는 §1.2의 place 배정 규칙(특히 "원래 동점자는 모두 2위로 수렴"
   규칙)을 정확히 재현해야 하며, 이 보고서의 `lib/regulationEquity.ts`(규정 보드 계층만) 그대로 재사용하고
   sudden-death 카스케이드 부분만 추가 구현하는 방식을 검토할 만하다.
4. **몰수패(`forfeitHand`)는 `status: "FORFEIT"`로 명시하고 0%와 구분**(§7, §8.3).
5. 참가 인원이 3이 아닌 입력에 대해서는 `expectedPoints`를 `undefined`로 두거나 별도 에러로 처리할 것(§1.4 —
   포상표가 3인 전제로 짜여 있음). `finalWinProbability`(승/패 자체)는 인원수와 무관하게 일반화 가능하다.

## 10. 산출물

- `artifacts/manifest.json`
- `artifacts/scripts/` — `lib/fixture.ts`(엔진 상태 빌더), `lib/fullEngineMC.ts`(실제 엔진 기반 Monte Carlo),
  `lib/regulationEquity.ts`(규정 보드 전용 exact/이론), `lib/cases.ts`(사례 풀), `lib/prng.ts`,
  `benchExact.ts`, `benchmark.ts`, `sweepBranches.ts`, `caseMatrix.ts`, `findThreeWayCollapse.ts`,
  `pairwiseVsThreeWay.ts`, `canonicalSeedProof.ts`, `edgeCases.ts`, `smoke.ts`, `mcSmoke.ts`
- `artifacts/results/` — 위 스크립트들의 raw 로그·JSON
- `artifacts/tests/` — `edge_case_checks.md`(§7 근거), `canonical_seed_proof.md`(§6 근거)

## 11. 한계와 잔여 위험

- **정확 계산 실측은 1개 손 조합에서만 수행**했다(§3.1, 584.0초). 다른 강도의 손 조합은 카드 평가
  비용이 크게 다르지 않아(같은 `findBestFive`/카드 수) 비슷한 시간대일 것으로 예상하지만, 직접 재실측하지
  않았다 — 정확한 숫자가 필요하면 `benchExact.ts`를 원하는 손으로 재실행하면 된다(재현 가능).
- **Full-engine Monte Carlo 벤치마크는 N=300 수준의 소규모 측정에서 외삽**했다(§3.3). REQUEST가
  "저비용 smoke와 benchmark 후 실행량 보고, 더 큰 실행은 승인 전 중단"을 명시했으므로, 이번 조사에서는
  N=20,000 이상의 실측을 의도적으로 수행하지 않았다. 실제 채택 시 원하는 CI 폭에 맞는 N으로 재측정이
  필요하다.
- `sweepBranches.ts`의 분기 비율(%)은 손-조합 풀별 최대 4,000개 seed 기준이며, 그 풀에 국한된 값이다 —
  "R4 3-way에서 sudden death가 발생할 일반적 확률"로 일반화하지 않았다(손의 강도 유사도에 따라 0.2%~30%대까지
  크게 달라짐을 §5.1 다섯 풀로 보였을 뿐이다).
- **§1.1의 "R4는 항상 3-way" 결론은 `BALANCE.playerCount=8`과 R1~R3의 현재 탈락 규칙을 전제**로 한다.
  게임 설정이 바뀌어 플레이어 수가 달라지면 이 전제도 달라질 수 있다 — 코드에서 8인 고정 여부를 확인했을
  뿐, 향후 변경 계획까지는 조사 범위 밖이다.
- **§1.4의 "4인 그룹 포상 공백"은 표준 8인 게임에서 도달 가능한지 별도로 증명하지 않았다** — `pair()`/
  `assignSurvivalBoundary`의 산술로 미도달을 추론했으나, 다른 코드 경로(예: 접속 종료로 인한 특수 처리)가
  그룹 크기를 다르게 만들 가능성까지는 전수 조사하지 않았다.
- 이 보고서는 승률 정의·산식·성능·검증안에 대한 **분석**이며, 어떤 지표를 채택할지, UI 문구를 무엇으로
  할지는 결정하지 않는다 — §9의 계산 계약과 §8의 라벨 권고는 Codex·사용자 승인을 위한 제안일 뿐이다.
