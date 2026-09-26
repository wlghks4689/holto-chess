# BAL-006 — R4 3인 매치 사전 승률의 정의·산식 검증

상태: 분석 의뢰 준비 / 사용자 요청
분석 ID: `BAL-006`
분석 브랜치: `balance/BAL-006-latest`
분석 기준 코드 커밋(REQUEST 커밋의 부모): `d5e62cb2af4ae0f1dcd3ccccf52e18a2c48052db`

## 분석 목적과 사용자 관찰

R4의 3인 매칭 로딩 화면에는 참가자 핸드는 보이지만 예상 승률이 표시되지 않는다. 사용자는 R4 3-way 승률을 실제 게임 규칙에 맞게 계산할 수 있는 로직과 산식을 마련하고자 한다. 이번 의뢰는 계산 정의·통계 방법·성능·검증안을 분석하는 단계이며, 실제 게임/UI 코드나 승률 표시를 구현하는 단계가 아니다.

사용자 관찰과 측정 사실을 구분한다. 현재 코드에서 다인 로딩 화면이 승률을 표시하지 않는 점은 확인된 구현 사실이다. 사용자가 체감한 승률 부재가 다른 원인에서도 나타나는지는 별도 주장으로 확대하지 않는다.

## 분석 범위와 현재 코드에서 확인된 규칙

- 대상 모드: 현재 `holto-chess/`의 PORENA 게임, Round 4 `BEST FIVE`.
- R4 1차전은 `primaryPairings`의 heads-up 대진이다. 3-way는 R4 `SHOWDOWN_SECONDARY`에서 `winnerGroup` 또는 `loserGroup`이 3명일 때 발생한다.
- 각 플레이어는 R4 홀카드 5장을 보유하고, 규정 보드는 5장 한 개다. 각 플레이어는 본인 홀카드 5장과 공통 보드 5장 중 최고의 5장(`findBestFive`)으로 비교한다.
- 3인 매치의 규정 보드 덱은 그 매치 참가자 3명의 보유 카드 15장을 제외한 덱에서 생성된다. 엔진의 encounter-local 규칙상 다른 매치 참가자의 카드와 상점 예약 카드는 제외 대상이 아니다.
- 규정 보드에서 1위가 단독이면 즉시 승자를 정한다. 1위 동점이면 엔진은 최대 2회의 sudden-death 보드로 동점자만 재비교한다. 각 sudden-death 보드는 참가자 15장을 제외한 새 덱에서 다시 뽑으므로 앞 보드와 카드가 겹칠 수 있다. 그래도 해결되지 않으면 현재 엔진의 rank-only high-card draw로 단독 승자를 정한다.
- 2위 동점만 있는 경우에는 1위 승자를 가리기 위한 sudden death가 발생하지 않는다. 승자조 결과 점수는 현재 설정 기준 10/5/3P이며 동점 2위는 각각 3P를 받는다. 패자조는 최종 1위 한 명이 생존하고 나머지는 탈락하며, 현재 점수는 모두 0P다.
- 위 내용은 구현 근거이며, 이 의뢰에서 새 게임 규칙을 제안하거나 확정하지 않는다. 구현·문서 사이에 불일치가 발견되면 그대로 기록한다.

## 검증할 질문과 가설

1. 사용자에게 표시할 `승률`의 가장 정확한 정의는 무엇인가? 최소한 아래 지표를 구분해 장단점을 비교한다.
   - 규정 보드 종료 시 단독 1위 확률 및 1위 동점 포함 fractional equity.
   - sudden death와 최종 high-card draw까지 현재 엔진 규칙대로 적용한 최종 매치 승리/진출 확률.
   - 승자조의 1·2·3위 확률과 기대 승점, 패자조의 생존 확률.
2. 어느 지표가 R4 로딩 화면의 “예상 승률”로 가장 적합한가? 승자조와 패자조에 같은 라벨을 쓸 수 있는지, 서로 다른 생존/우승 용어가 필요한지 평가한다.
3. 세 명의 확정 핸드를 모두 조건으로 두고 공통 보드를 표본화하는 것이 올바른가? 두 명씩 별도 heads-up 승률을 계산하는 방법이 왜 전체 3-way 승률을 대체할 수 없거나 편향시킬 수 있는지 설명한다.
4. 정확 전수 계산과 Monte Carlo 중 현실적인 기본 방법은 무엇인가? 참가자 홀카드 15장을 제외하면 규정 보드 후보는 `C(37,5)=435,897`개다. 세 명의 BEST5 평가 비용, sudden death, 브라우저 메인 스레드 대기시간과 표본 수 간 trade-off를 실제 측정으로 평가한다.
5. 권고 산식과 추정 불확실성을 명시한다. 예: `p_i = wins_i / N`; regulation-board tie equity라면 `e_i = (1/N) Σ 1[i가 공동 1위] / 공동 1위 인원`; 예상 승점은 placement 확률과 현재 R4 보상표로부터 산출한다. 각 식의 의미·전제가 다름을 구분하고 95% 신뢰구간 또는 오차 표시 방법을 권고한다.
6. 표본 추출은 한 번의 표본마다 동일한 공통 보드를 세 명 모두에게 적용해야 하는가? sudden-death 보드를 엔진처럼 새 덱에서 다시 뽑고, 실제 엔진과 같은 tie-resolution을 적용하는지 검증한다.
7. 3개 핸드 ID의 배열 순서와 좌석/플레이어 순서가 같을 때 항상 같은 결과를 내도록 시드를 canonicalize할 수 있는가? BAL-005에서 적용된 카드 배열 순서 불변성의 원칙을 다인 입력으로 확장하는 방법을 제안한다.
8. 카드 누락, 중복 카드, 불완전 핸드, 다인 수가 3명이 아닌 상황은 계산 불가/forfeit 등 어떻게 명시적으로 처리해야 0% 오표시를 피할 수 있는가?

## 관련 실제 코드·테스트 경로

저장소 루트 기준 경로:

- `holto-chess/src/ui/ShowdownPrepPanel.tsx` — 현재 heads-up일 때만 `showdownEquity`를 호출하며, multiway 렌더링 경로에는 승률을 전달하지 않는다.
- `holto-chess/src/ui/showdownEquity.ts` — 현재 2인 입력/2개 확률 반환 API, 라운드별 샘플 수, 카드 ID canonical seed 및 BEST5 평가.
- `holto-chess/src/shared/protocol.ts` — `ShowdownPrepView`의 viewer/opponent(s) 입력 형태.
- `holto-chess/src/game/playerView.ts`의 `showdownPrepView` — R4 2차 매칭의 참가자·보유 카드 공개 매핑.
- `holto-chess/src/game/engine.ts`의 `handFor`, `encounterBoards`, `resolveParticipants`, `resolveSecondary` — 실제 핸드 평가, 보드 생성/제외, tie-break와 R4 bracket 결과.
- `holto-chess/src/game/showdownDeck.ts` — encounter-local 덱 및 커뮤니티 보드 생성.
- `holto-chess/src/core/poker/evaluate.ts`의 `findBestFive`, `compareHands`, `rankPlayers`, `placeInRanking` — 공용 BEST5 및 순위 판정.
- `holto-chess/src/game/config.ts` — R4 승자조/패자조 점수.
- `holto-chess/src/game/engine.test.ts` R4 three-way board 테스트, `holto-chess/src/game/loserBracketReview.test.ts`의 3-way tie-break 테스트, `holto-chess/src/ui/ShowdownPrepPanel.test.ts`의 3인 로딩 레이아웃 테스트, `holto-chess/src/game/showdownPrepView.test.ts`의 R4 3인 전달 테스트.
- `holto-chess/src/ui/showdownEquity.test.ts` — 현행 heads-up equity 테스트와 카드 순서 불변 테스트.

분석 기준 코드에는 BAL-005의 승인된 순서-불변 seed 수정이 포함되어 있다. 보고서 작성 전 기준 커밋과 현행 개발 브랜치의 관련 파일 diff를 확인하고, 판정·보상 로직이 달라졌으면 범위와 재검증 필요성을 기록한다.

## 기존 시뮬레이터·실행 방법과 한계

- 현재 저장소에 production 승률 도구로 선언된 별도 R4 multiway simulator가 있는지는 실제 경로를 확인해 보고한다. 확인 없이 기존 도구가 있다고 가정하지 않는다.
- BAL-005 산출물은 원격 `balance/BAL-005-latest`의 `product_doc/balance/BAL-005/artifacts/`에 있으며, 2인 R1/R3/R4 승률 검증용이다. 그 결과를 3인 확률로 직접 일반화하지 않는다. 필요하면 스크립트 구조만 참고하고 production evaluator/engine을 사용해 별도로 검증한다.
- 프로젝트 테스트는 `holto-chess/`에서 `npm test -- src/game/engine.test.ts src/game/loserBracketReview.test.ts src/ui/ShowdownPrepPanel.test.ts src/game/showdownPrepView.test.ts src/ui/showdownEquity.test.ts`로 실행할 수 있다. 분석 요청은 게임 테스트를 수정하지 않는다.
- 분석 스크립트가 필요하면 `product_doc/balance/BAL-006/artifacts/` 안에만 작성한다. 기존 evaluator를 복사해 별도 규칙 엔진을 만들지 말고, 가능한 한 실제 production 함수와 엔진 결과를 교차 확인한다.
- 대규모 실행은 먼저 짧은 smoke와 계산시간 benchmark를 한 뒤 수행한다. 사용자/브라우저 지연 허용치가 확인되지 않은 채 대규모 계산을 기본값으로 제안하지 않는다. CPU 시간 또는 실행 환경 제한은 보고서에 기록한다.

## 변경 금지 조건

- 게임 코드, UI, production 테스트, 공유 시뮬레이터, `config.ts`, lockfile, 공용 `TODO.md`/`DECISIONS.md`를 수정하지 않는다.
- R4 판정/승점/보드 생성 규칙을 변경하거나 새로운 게임 규칙을 사실처럼 선언하지 않는다.
- BAL-005 분석 브랜치를 merge/rebase/cherry-pick하지 않는다.
- 사용자 승인 전 승률 표시 방식·추정 표본 수·엔진 로직을 실제 앱에 구현하지 않는다.
- Claude의 쓰기 허용 경로는 이 BAL-006의 `REPORT.md`와 `artifacts/**`뿐이다. REQUEST와 공통 문서는 Codex가 관리한다.

## 필요한 지표와 완료 조건

- 적어도 20개의 결정적 3인 R4 핸드 조합을 준비하고, 카드 중복 없음·자리 순서 permutation·각 좌석 편향 여부를 검증한다.
- 규정 보드 단독 1위/동점, 규정 1위 동점 후 sudden death 해소, 2회 sudden death 후 high-card draw, 2위 동점, 승자조/패자조를 포함한다.
- 보드 표본은 각 표본에서 동일 보드를 세 명 모두에게 공유한다. sudden death 표본은 엔진의 실제 새 덱 규칙을 반영한다.
- Monte Carlo를 권고한다면 표본 수별 총 소요시간, 플레이어별 확률 오차/95% CI, 동일 시드 재현성, 행·열 합계 검증을 보고한다. exact spot-check 또는 독립 참조 계산과의 대조를 포함한다.
- 승리 확률, 공동 1위 fractional equity, R4 placement/생존 확률을 혼용하지 않고 각각 분모·분자·tie 처리 정의를 제시한다.
- 결과를 받는 Codex가 테스트 가능한 계산 계약, edge case, UI 표기 권고를 결정할 수 있도록 REPORT와 재현 가능한 산출물을 제공한다. “정확 계산”을 주장하려면 완전 탐색의 범위와 표본오차 0의 근거를 제시한다.

## Claude에 요청할 산출물

- `product_doc/balance/BAL-006/REPORT.md`: 실제 규칙 확인, 용어/수식 정의, 방법 비교 및 선택 권고, 표본·신뢰구간·런타임, 편향/불확실성, 제한, 구현을 위한 최소 계산 계약과 UI 권고.
- `product_doc/balance/BAL-006/artifacts/manifest.json` 및 필요한 `scripts/`, `results/`, `tests/` 산출물.
- 재현 명령, seed, Node/npm 버전, 각 실행의 표본 수·완료/실패 수·경과시간을 기록한다.
- 보고서 제출과 게임 코드 구현은 별도 TODO 항목이며, 보고서 제출은 구현 승인으로 간주하지 않는다.

## 기준 공유·실행 자원

- 분석 기준 코드 SHA: `d5e62cb2af4ae0f1dcd3ccccf52e18a2c48052db`.
- REQUEST를 포함하는 분석 기준 커밋 SHA는 별도 인계에서 제공한다. Claude는 해당 커밋에서 분기한 독립 `balance/BAL-006-latest` 작업 공간을 사용한다.
- 공유 상태는 기준 commit·REQUEST의 원격 fetch/read 확인 전까지 READY로 표시하지 않는다.
- 별도 사용자 제공 시간/CPU budget은 없다. 저비용 smoke와 benchmark 후 분석 담당자가 실행량·총 소요시간을 보고하고, 더 큰 실행이 필요하면 Codex/사용자 승인 전에 중단한다.
