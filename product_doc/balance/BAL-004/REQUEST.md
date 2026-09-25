# BAL-004 — 로우 카드 가격 곡선이 선택 가치에 미치는 영향

상태: 분석 요청 준비 / 사용자 승인 대기
분석 기준 커밋: `ef5bda3` (최신 `afbad6c` 계통의 시뮬레이터 복구·검토 반영 후 기준)
분석 브랜치: `balance/BAL-004-latest`

## 분석 목적

현재 `BALANCE.rankPrices`에서 rank 2, 3, 4, 5 카드 가격은 모두 5BB다. 다음 후보 가격 곡선이 로우 카드의 경제적 가치와 경기 결과를 바꾸는지 분석한다.

| rank | 현행 | 후보 |
|---:|---:|---:|
| 2 | 5BB | 2BB |
| 3 | 5BB | 3BB |
| 4 | 5BB | 4BB |
| 5 | 5BB | 5BB |

rank 6 이상, 시작 BB, 판매 환급률, 구매 횟수, 리롤 비용, 라운드 보상, Point, 족보 점수와 탈락 규칙은 고정한다. 실제 게임 코드와 `src/game/config.ts`는 변경하지 않는다.

## 검증 질문과 가설

1. 후보 가격에서 rank 2~4의 구매율·보유율·교체율·최종 보유율이 현행보다 증가하는가?
2. 로우 카드의 가격 인하가 카드 자체의 족보 기여와 분리된 순수 경제 가치 상승으로 측정되는가?
3. 가격 인하의 수혜가 특정 드래프트 순번, R1 성적, 정책, 라운드(R1~R5)에 집중되는가?
4. 저렴해진 카드가 BB를 절약해 고등급 카드·리롤·후속 라운드 구매를 늘리는 간접 효과가 있는가?
5. 최종 순위·R5 진출·우승률·Point·종료 BB에 재현 가능한 변화가 있는가?

사전 가설(확정 사실 아님): rank 2~4는 구매율이 상승하지만, 최종 승률 상승은 카드의 직접 기여보다 절약된 BB가 후속 구매로 전환되는 정도에 좌우된다. 반드시 측정값과 추론을 구분한다.

## 분석 대상과 비교 설계

- 모드: 현행 `rulesVersion=2`, 8인 기본 게임.
- 라운드: 카드 구매·판매·리롤이 가능한 R1~R5 전체. 특히 R2 드래프트와 R4 드래프트는 가격을 실제 구매 결정에 적용해 비교한다.
- 조건 A: 현행 가격표.
- 조건 B: 후보 가격표(2/3/4/5 rank만 2/3/4/5BB).
- 동일 seed·동일 정책 배정으로 paired 비교하고, fixed policy, random assignment, 독립 seed block을 포함한다.
- 실제 공용 시뮬레이터와 게임 설정을 수정하지 말고, 분석 산출물 내부의 가격 함수/엔진 미러만 후보 조건에 사용한다.

## 필요한 지표

- 조건별 완주·실패 수, 실패 단계·오류 메시지
- rank별 노출·구매·판매·교체·최종 보유 횟수와 구매율
- rank별 구매 시점의 라운드, 구매자의 시작/구매 후 BB, 남은 구매 한도
- 라운드·정책·드래프트 순번·R1 순위별 rank 2~5 효과
- R5 진출률, 우승률, 최종 순위, Point, hand score, stack score, 종료 BB
- 후보 조건의 추가 구매·리롤·고등급 카드 구매로 이어지는 BB 경로
- 평균 차이뿐 아니라 paired 차이, 효과 크기, 95% CI/재표본화, 분모와 다중비교 처리
- 실패 표본과 유효 표본을 분리하며 실패 결과를 0으로 집계하지 않음

## 완료 조건

- 최소 200게임×2조건의 주 실행과 fixed/random/seed-block 재현 실행
- 모든 비교에서 완료·실패 수와 seed를 기록하고, 교차검증 불일치 0건 또는 원인 공개
- 후보 가격이 로우 카드의 구매 가치만 올리는지, 최종 성과까지 영향을 주는지 질문별 결론을 측정값/추론/미확인으로 구분
- 10장 드래프트 분석과 섞지 않고 가격 효과만 식별
- 권고안은 선택 사항으로 제출하되, REPORT만으로 가격 변경이 승인되지 않음을 명시

## 관련 실제 경로

- `holto-chess/src/game/config.ts` — `BALANCE.rankPrices`, `cardPrice`, 구매·판매 관련 기본값
- `holto-chess/src/game/engine.ts` — 구매·판매·봇 구매 계획·R2/R4 드래프트 구매
- `holto-chess/tools/balance-simulator/` — 현행 시뮬레이터·metrics·report·테스트
- `holto-chess/src/game/types.ts` — 플레이어 경제·라운드 상태
- `product_doc/balance/BAL-003/REPORT.md` — 최신 시뮬레이터 신뢰성 주의사항과 순위 정의

## 실행 예시와 제한

```powershell
npm exec vitest -- run --config tools/balance-simulator/vitest.config.ts
node product_doc/balance/BAL-004/artifacts/scripts/run.mjs --games 200 --seed 12345 --rerolls 1 --assignment fixed --label <라벨> --validate 25 --output results
```

실제 CLI 인자와 경로는 기준 커밋에서 확인해 갱신한다. 분석 산출물 안에 후보 가격을 적용한 스크립트를 두며, 기존 게임 코드·공용 시뮬레이터·lockfile은 수정하지 않는다. 실행 시간·자원은 200게임×2조건의 smoke/주 실행 범위로 제한하고, 대규모 반복은 필요성과 비용을 REPORT에 기록한 뒤 중단 또는 추가 승인을 요청한다.

## Claude 쓰기 허용 경로

- `product_doc/balance/BAL-004/REPORT.md`
- `product_doc/balance/BAL-004/artifacts/**`

Claude는 게임 코드, `src/game/config.ts`, 공용 문서, 공용 시뮬레이터를 수정하지 않는다. 분석 브랜치에서 후보 가격을 게임의 승인된 규칙으로 표현하지 않는다.

## 요청 산출물

- `REPORT.md`
- `artifacts/manifest.json`
- 조건별 JSON/CSV와 rank·라운드·정책 교차표
- 재현 가능한 후보 가격 적용 스크립트
- smoke/주 실행 로그와 종료 코드
- 측정값, 가정, 실패 표본, 불확실성, 권고안(있는 경우)을 분리한 최종 보고
