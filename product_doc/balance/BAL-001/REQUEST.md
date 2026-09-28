# BAL-001 — 현재 밸런스 구조와 검증 가능성 진단

상태: DRAFT / 인계 BLOCKED. 아직 Claude에 실행 의뢰된 상태가 아니다.
DOC_ROOT: `product_doc/`. 계약: [README](../../README.md).
조사 코드 HEAD: `5db158a9bf8495175ebfcbd0da50a06e71f1e109` (이 SHA에는 이 의뢰서가 없음).
BASE_COMMIT: **미정**. 문서 커밋·공유 후 인계 메시지의 전체 SHA로 고정한다.
분석 브랜치: `balance/BAL-001`. 조사 시 로컬·원격에 동일 이름을 찾지 못했으며 생성 전 다시 확인한다.

## 목적·관찰·우선순위

현재 PORENA의 경제·점수·탈락 구조를 코드 근거로 정리하고, 기존 시뮬레이터로 이를 유효하게 측정할 수 있는지 진단한다.
기존 기록에는 밸런스 조정과 AI 전략 개선이 진행 항목으로 남아 있으나, 최신 규칙 기준으로 승인된 단일 최우선 수치 변경 의뢰는 확인하지 못했다.
따라서 사용자 지정 기본 과제인 구조·검증 가능성 진단을 선택한다.

- 사용자 관찰(과거): 단일 R1 매치에서 강한 상대를 만나는 운이 불합리하다는 지적이 있었다. 현재는 R1 Swiss 3경기이므로 과거 관찰을 현재 결함의 증거로 취급하지 않는다.
- 이번 실제 측정: 2026-09-24 시뮬레이터 전용 테스트 6개 중 2 통과·4 실패. `Expected R2 SHOP, found R2 DRAFT_ORDER` 재현.
- 미확인: 현행 인간 플레이의 특정 전략 우위, R5 족보 점수의 적정성, BB 보존 전략의 지배력. 아직 측정된 사실이 아니다.
- 첫 선결 문제: 현재 버전에서 완주하지 못하는 도구로 얻은 이전 통계를 현행 밸런스 근거로 재사용할 수 없음.

## 대상 모드와 변경 금지 조건

대상은 `holto-chess/`의 PORENA, 신규 게임 `createGame(..., rulesVersion=2)`이며 온라인 2~8인 참가 + AI 충원으로 8좌석 시작.
로컬 시뮬레이션과 실제 온라인 인간 플레이를 구분한다. rulesVersion=1 호환 경로는 비교 설명만 하고 v2 측정에 섞지 않는다.

현재 구현의 범위(새 승인 규칙으로 확정하는 문서 아님):

| 라운드 | 조사 코드 구조 |
| --- | --- |
| R1 | 홀 2장, Swiss 3경기, 무탈락 |
| R2 | 공개 드래프트, 앵커+보조 2장 Split Run, 무탈락 |
| R3 | 4장 Omaha Swiss 3경기, 누적 점수 탈락선·생존 타이브레이크, 8→6 |
| R4 | 공개 드래프트+상점, Best Five of Ten, 승자조·생존조, 6→4 |
| R5 | 보유 7장 BEST5, 순위 Point·Hand Score·Stack Score 합산 |

52장 공유 소유 풀, 상대 비공개 정보, 참가자 OWNED 제외 보드 규칙、무늬로 족보 동률을 깨지 않는 판정、Royal Flush 구분、게임 경제·가격·보상·타이브레이크·ICM·최종 점수는 변경하지 않는다.
독립 high-card draw와 포커 족보 판정의 동률 규칙을 혼동하지 않는다.
불일치는 [DECISIONS](../../DECISIONS.md)에 이미 기록했다. Claude는 추가 불일치를 REPORT에 제안하며 원본 문서를 고치지 않는다.

## 질문과 검증 가설

1. 상점·드래프트·R2 RUN 배치·R3 생존전까지 현재 phase 흐름을 시뮬레이터가 모두 처리하는가? 가설: 과거 SHOP 전제 때문에 불가능하다.
2. 생존 인원과 분모, 결승 진출 여부, 탈락 순위 집계가 v2 규칙에 맞는가? `expectedEnd`, `updateTournament`, `reachedR5` 할당을 점검한다.
3. Point와 BB, 라운드 수입·경기 보상·증강·연속 승패 보너스가 분리 집계되는가? 합계만으로 원인을 오해할 위험을 확인한다.
4. seeded 재현성 실패는 난수 때문인가, 실패 stack trace의 호출 위치 차이 때문인가? 정상 trace와 오류 직렬화 차이를 분리한다.
5. 카드 등장률·구매율·R5 족보 분포를 어떤 모집단으로 해석할 수 있는가? 휴리스틱 정책·고정 좌석·생존자 편향을 설명한다.
6. R5 승점/족보/BB 점수 기여와 역전 빈도, R1 강한 시작 패의 최종 성적 연관을 평가하려면 어떤 계측이 부족한가? 상관관계를 인과 효과로 단정하지 않는다.
7. 기존 테스트가 실제 현재 규칙을 보호하는가, 과거 전제를 보호하는가? 수정안은 문서로만 제출한다.

## 실제 경로(저장소 루트 기준)

- `README.md`: 최신 개요·라운드표. `holto-chess/README.md`, 양쪽 `IMPLEMENTATION_REPORT.md`, `holto-chess/SHOWDOWN_CINEMATIC_PROGRESS.md`: 과거 설명 혼재.
- `holto-chess/src/game/config.ts`: 가격·상점/리롤/구매 한도·Point·족보 점수·BB 상수. 실제 호출 경로도 확인해야 하며 상수 존재만으로 적용을 단정하지 않는다.
- `holto-chess/src/game/engine.ts`: createGame, 상점 API, rewardMatch, resolvePrimary/Secondary, Split Run, draft, startNextRound, finalStandings.
- `holto-chess/src/game/types.ts`: rulesVersion·phase·보상 기록 모델.
- `holto-chess/src/game/cardPool.ts`, `shopRules.ts`, `showdownDeck.ts`: 소유/예약·판매 가능성·보드 덱.
- `holto-chess/src/game/swiss.ts`, `icm.ts`, `augments.ts`, `botStrategy.ts`, `preflopStrength.ts`: 매칭·공동 순위 보상·증강·봇 판단.
- `holto-chess/src/core/poker/cards.ts`, `evaluate.ts`, `evaluate.test.ts`: 카드·족보·Omaha 평가기.
- `holto-chess/src/game/room.ts`, `playerView.ts`, `holto-chess/tests/worker/room.test.ts`: 서버 phase와 공개/비공개 경계. 엔진 직접 호출 시뮬레이션은 네트워크·타이머 검증을 대체하지 않는다.
- `holto-chess/src/game/{scoringRules,r4Rewards,omahaSwiss,openDraft,round2Selection,roundLimits,showdownDeck,finalShowdown,swiss,highCardDraw}.test.ts`: 해당 이름별 실제 개별 테스트 파일.
- `holto-chess/tools/balance-simulator/`: simulator.ts(진행), policies.ts(정책), metrics.ts(집계), invariants.ts(불변조건), config.ts(CLI), types.ts, report.ts, index.ts, run.mjs, simulator.test.ts, vitest.config.ts, README.md.

## 실행 방법과 확인된 한계

cwd를 `<독립 작업공간>/holto-chess`로 설정한다. 설치된 의존성이 없다면 기존 lockfile을 유지하여 `npm ci`를 사용한다.

```powershell
npx vitest run --config tools/balance-simulator/vitest.config.ts
node tools/balance-simulator/run.mjs --games 1 --seed 12345 --rerolls 0 --output ../product_doc/balance/BAL-001/artifacts/smoke
```

두 번째 명령은 Claude용 최소 재현 안내이며 이번 준비 작업에서는 실행하지 않았다.
CLI 기본값은 1000게임·seed12345·fixed 배정·라운드별 리롤 최대1. 기본 출력은 gitignored output 폴더이므로 반드시 허용 경로로 바꾼다.
선택 정책은 HIGH_RANK, PAIR_BUILDER, STRAIGHT_BUILDER, FLUSH_BUILDER, ECONOMY.

전용 테스트 실행 증거(조사 HEAD, 소스 수정 없음):

- 총 6개, 통과 2개, 실패 4개, 프로세스 종료코드 1.
- seed100, 12480 등에서 R2 DRAFT_ORDER를 SHOP으로 기대해 중단.
- 5게임 집계 테스트: completed=0, failed=5. 현행 R5 분포 추정치가 아니다.
- seed8080~8082 재현성 비교 실패 출력에는 동일 phase 오류의 stack trace 호출 열 차이가 포함됨. 이를 난수 비결정성으로 단정하지 않는다.
- 생존 인원 기대치가 R2=6으로 남음. 전체 순위를 반환하는 finalStandings에 대한 reachedR5/탈락 순위 후처리도 점검 필요.
- 휴리스틱은 판매·교체·실제 인간 선택을 충분히 모사하지 않음. Worker/네트워크와 온라인 시간제한은 시뮬레이터 범위 밖.

## 지표·산출물·완료 조건

필수 지표는 먼저 측정 가능 여부를 표시한다. 실행 실패로 얻지 못한 값은 0이 아니라 N/A와 차단 원인을 기록한다.

- 완주/실패 수·실패 단계·seed; 라운드별 실제 참가·생존 인원.
- BB 유입/유출 항목, 분포·분위수, 구매·판매·리롤·잠금·드래프트 비용과 카드풀 고갈.
- 라운드별 경기 수, 승/무/패·Swiss 성적과 게임 Point 구분, 탈락 원인.
- 정책별 표본 수·좌석 배정·생존률·최종 순위, R5 진출자만의 족보 분포와 전체 플레이어 점수 구성.
- 비교 가능한 지표의 표본/분모·seed·불확실성. 유효한 반복 표본이 없으면 신뢰구간이나 우위 수치를 꾸며내지 않는다.

Claude 쓰기 허용 경로:

- `product_doc/balance/BAL-001/REPORT.md`
- `product_doc/balance/BAL-001/artifacts/**` (로그·JSON·CSV·재현용 분석 스크립트·측정 manifest)

그 밖의 파일은 수정 금지. 기존 시뮬레이터 패치는 Codex에 개선 계획으로 제출한다. REQUEST도 Claude가 변경하지 않는다.

REPORT에는 BASE_COMMIT·보고서 작성 환경(Node/npm/OS)·명령·seed·표본·실패 처리·측정/가정 구분·코드 근거·도구 보완 우선순위·확정 불가 사항을 포함한다.
산출물 manifest에는 실행 명령·출력 경로·소요 시간·종료코드·표본 수를 기록한다. 토큰·비밀·실사용자 정보는 기록하지 않는다.
보고서 커밋 SHA는 커밋 후 별도 인계 메시지로 제출한다.
완료 조건은 구조/불일치/측정 한계의 근거 있는 진단과 재현 방법 제출이다. 도구가 고장난 상태라면 실패 원인과 Codex용 개선안으로 진단을 완료할 수 있지만, 밸런스 검증이나 게임 변경이 완료된 것은 아니다.

## 자원·범위 제한

사용자가 지정한 실행시간·CPU 예산은 없다. 이번 의뢰는 진단 우선으로 테스트와 1게임 재현부터 시작하고 동일 오류가 확인되면 대규모 반복을 중단한다.
운영 URL 부하 시험·배포·유료 API·기존 worktree 브랜치 전환은 하지 않는다. 대규모 통계 실험은 도구 적합성 검토 후 Codex와 실행 계획을 정한다.
이번 Codex 준비 단계에서는 게임 코드·시뮬레이터·밸런스 수치를 변경하지 않는다.
