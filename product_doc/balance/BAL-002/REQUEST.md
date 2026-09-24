# BAL-002 — R1 3패 플레이어의 역전 가능성

상태: 분석 요청 준비 완료 / 사용자 승인 대기
분석 기준 커밋: `d7254d2`
분석 브랜치: `balance/BAL-002`
분석 대상 복구 브랜치: `codex/balance-tool-repair`

## 분석 목적

R1 Swiss 3경기에서 0승 0무 3패를 기록한 플레이어가 이후 라운드에서 생존하거나 최종 순위를 회복할 수 있는지 측정한다. 사용자의 우려는 “R1 전패가 사실상 탈락과 같은가”이며, 이는 관찰·가설이지 현재 확정된 사실이 아니다.

이번 분석은 규칙이나 밸런스 수치를 변경하지 않고, 현재 구현과 시뮬레이터가 제공하는 조건부 생존 가능성을 확인하는 데 목적이 있다.

## 검증 질문과 가설

1. R1 종료 시 0W 0D 3L 그룹의 R2 진출률은 얼마인가?
2. 해당 그룹의 R3·R4·R5 진출률과 최종 순위 분포는 다른 R1 전적 그룹과 어떻게 다른가?
3. R1 전패 후에도 회복 가능한 Point·BB·카드 구매 여지가 남아 있는가?
4. R1 전패의 영향이 실제 탈락 규칙(R3 누적 점수선)에 의해 발생하는지, 경제·카드풀·정책 차이에 의해 확대되는지 구분할 수 있는가?
5. 표본·정책·좌석 배정·seed를 바꿔도 같은 경향이 재현되는가?

가설은 사전 확정하지 않는다. 표본 부족, 정책 편향, 시뮬레이터 한계가 있으면 결론 대신 측정 불가로 보고한다.

## 대상 규칙과 비교군

- 현재 `rulesVersion=2` PORENA
- R1: Swiss 3경기, 승리 3P / Split 1P / 패배 0P, 전원 생존
- R2: 공개 드래프트와 Split Run, 전원 생존
- R3: Omaha Swiss 3경기와 누적 점수 기준 8→6 생존 판정
- R4: Best Five of Ten과 6→4 생존 판정
- R5: 7장 BEST5 최종 순위

최소 비교군:

- 0W 0D 3L
- 1W 0D 2L
- 1W 1D 1L
- 2W 0D 1L
- 3W 0D 0L

각 그룹은 실제 관측된 표본 수를 함께 보고한다. 표본이 없는 그룹의 비율은 0으로 기록하지 않고 N/A로 표시한다.

## 필요한 지표

- R1 전적 그룹별 표본 수와 좌석/정책 분포
- R2, R3, R4, R5 진출률
- R3 탈락률과 탈락 시점
- 최종 순위 평균·중앙값·분포
- R1 종료 및 각 라운드 종료 시 Point와 BB 분포
- R1 전패 후 구매·리롤·드래프트 참여 및 카드풀 고갈 여부
- 그룹별 95% 신뢰구간 또는 불확실성 표시(계산 가능한 표본에서만)
- 동일 seed·정책 설정 재실행 결과와 실패 게임 수

`reachedR5`와 최종 순위의 분모는 실제 완주 게임의 실제 플레이어 trace로 고정한다. 실패 게임의 0 초기값을 측정값으로 합산하지 않는다.

## 실행 조건

작업 폴더는 별도 worktree로 만든다. 현재 복구 브랜치의 의존성을 설치하고 다음을 먼저 실행한다.

```powershell
npm exec vitest -- run --config tools/balance-simulator/vitest.config.ts
node tools/balance-simulator/run.mjs --games 1 --seed 12345 --rerolls 0 --output ../product_doc/balance/BAL-002/artifacts/smoke
```

테스트 또는 smoke가 실패하면 대규모 반복을 시작하지 않는다. 구조가 확인된 후 최소 200게임, 가능하면 seed 구간을 나눈 반복으로 측정한다. 실행 시간·메모리 제한은 없지만, 실패율이 0이 아니면 유효 표본과 실패 표본을 분리한다.

## 변경 금지 조건

- 게임 코드와 `src/game/config.ts`의 수치 수정 금지
- 시뮬레이터 코드 수정 금지
- R1 보상·Swiss 매칭·탈락 규칙 변경 금지
- 기존 BAL-001 보고서와 산출물 덮어쓰기 금지
- Codex 공용 문서와 `REQUEST.md` 수정 금지

## 실제 관련 경로

- `holto-chess/tools/balance-simulator/README.md`
- `holto-chess/tools/balance-simulator/simulator.ts`
- `holto-chess/tools/balance-simulator/metrics.ts`
- `holto-chess/tools/balance-simulator/types.ts`
- `holto-chess/src/game/engine.ts`
- `holto-chess/src/game/swiss.ts`
- `holto-chess/src/game/config.ts`

## Claude 쓰기 허용 경로

- `product_doc/balance/BAL-002/REPORT.md`
- `product_doc/balance/BAL-002/artifacts/**`

REPORT에는 기준 커밋, 실행 환경, seed, 표본 수, 실패 처리, 그룹별 분모, 관찰과 측정 결과의 구분, 재현 명령, 결론의 한계를 반드시 기록한다.

## 요청 산출물

- `REPORT.md`
- `artifacts/manifest.json`
- 원시 결과 JSON/CSV 또는 재현 가능한 집계 파일
- smoke 및 본 실행의 종료 코드·소요 시간 기록

분석 결과는 밸런스 수치 변경 권한을 부여하지 않는다. Codex가 독립 검토하고 사용자가 승인한 뒤에만 구현 여부를 결정한다.
