# BAL-003 — 1차 드래프트 8장과 10장의 순번별 수혜·순위 변화

상태: 분석 요청 준비 완료 / 사용자 승인 대기
분석 기준 커밋: `d6f323c` (최신 `afbad6c` 계통에 시뮬레이터 복구를 재적용하고 의뢰서를 포함한 기준)
분석 브랜치: `balance/BAL-003-latest`

## 분석 목적

현재 R2 첫 공개 드래프트의 공개 카드 수를 8장에서 10장으로 늘린 가상 변경이 드래프트 순번별 기대 이익과 최종 결과에 미치는 영향을 비교한다. 실제 게임 규칙과 수치는 변경하지 않는다.

## 순위 정의

보고서에서 다음 순위를 별도로 기록한다.

- R1 Swiss 순위: R1 3경기 종료 후 Swiss 성적/Point 순위
- R2 첫 드래프트 순번: `draft.order`의 실제 카드 선택 순번
- 최종 순위: R5 `finalStandings` 결과

사용자의 “1라운드 순위”가 R1 Swiss 순위인지 드래프트 순번인지 혼동되지 않도록 두 값을 모두 저장하고 각각 분석한다.

## 검증 질문

1. 8장과 10장 조건에서 각 드래프트 순번의 선택 카드 가치·가격·선택 가능 카드 수·최종 보유 핸드가 어떻게 달라지는가?
2. 10장 조건에서 가장 큰 기대 이익을 얻는 순번은 몇 번째인가?
3. 8장과 10장 조건에서 R1 Swiss 순위별 R5 진출률·최종 순위·최종 점수·우승률이 유의미하게 달라지는가?
4. 드래프트 순번별로 R1 순위와 최종 순위 사이의 상관 및 역전 빈도가 달라지는가?
5. 특정 정책·R1 성적 그룹·seed가 구조적으로 더 큰 수혜를 얻는가?

“유의미”는 평균 차이만으로 확정하지 않는다. 표본 수, 95% 신뢰구간 또는 재표본화 결과, 효과 크기와 분모를 함께 보고한다.

## 비교 조건

현행 조건은 `rulesVersion=2`, R2 드래프트 카드 풀 8장이다. 후보 조건은 R2 첫 드래프트 카드 풀만 10장으로 바꾸고, 순서·가격·보유 한도·RUN_LOADOUT·후속 라운드 규칙은 동일하게 유지한다. 후보는 분석 산출물 안에서만 적용하고 게임 코드와 공용 시뮬레이터는 수정하지 않는다.

최소 비교군은 R1 Swiss 순위, 드래프트 순번, 정책 고정/무작위 배정, 동일 seed 조건이다. 관측되지 않은 그룹은 0이 아니라 N/A로 기록한다.

## 필요한 지표

- 조건별 완주·실패 수와 실패 단계
- 드래프트 순번별 표본 수, 선택 카드 rank/가격, 선택지 고갈률
- R1 순위별 R5 진출률·탈락률·평균 최종 순위·점수·우승률
- 드래프트 순번별 R5 진출률·최종 순위·우승률
- R1 순위→최종 순위의 평균 변화와 역전 빈도
- 정책·seed별 결과와 상호작용
- 카드풀 고갈 및 실패 표본 분리

## 실행 조건

별도 worktree에서 기준 커밋을 고정한다.

```powershell
npm exec vitest -- run --config tools/balance-simulator/vitest.config.ts
node tools/balance-simulator/run.mjs --games 1 --seed 12345 --rerolls 1 --output ../product_doc/balance/BAL-003/artifacts/smoke

최신 기준 smoke에서 완료 게임과 실패 게임을 반드시 분리해 기록한다. `shop fill failures`가 0이 아니면 완주 여부와 별개로 데이터 신뢰성 경고로 보고하고, 수치 권고를 확정하지 않는다.
```

구조가 통과하면 현행 8장과 후보 10장을 동일 seed로 각각 최소 200게임 실행하고, 고정 정책·무작위 배정·독립 seed 블록을 포함한다. 실패가 있으면 완료 표본과 분리하며 실패 결과를 측정값으로 합산하지 않는다.

## 변경 금지 조건

- 게임 코드, `src/game/config.ts`, 공용 `tools/balance-simulator/*.ts` 수정 금지
- R1/R2 보상·Swiss·탈락·최종 점수 규칙 변경 금지
- BAL-001/BAL-002 보고서 및 산출물 덮어쓰기 금지
- 공용 문서와 기존 REQUEST 수정 금지

## 관련 경로

- `holto-chess/src/game/engine.ts`
- `holto-chess/src/game/types.ts`
- `holto-chess/tools/balance-simulator/`
- `holto-chess/src/game/swiss.ts`
- `holto-chess/src/game/config.ts`

## Claude 쓰기 허용 경로

- `product_doc/balance/BAL-003/REPORT.md`
- `product_doc/balance/BAL-003/artifacts/**`

REPORT에는 기준 커밋, 8장/10장 후보 정의, 실행 명령, seed·정책·표본 수, 순위 정의, 효과 크기·불확실성, 실패 처리, 측정값과 추론을 기록한다.

## 요청 산출물

- `REPORT.md`
- `artifacts/manifest.json`
- 8장/10장 조건별 JSON/CSV
- 순번별 비교표와 재현 가능한 집계 스크립트
- smoke 및 본 실행 종료 코드·소요 시간

분석 결과는 10장 변경 승인으로 해석하지 않는다. Codex 검토와 사용자 승인이 필요하다.
