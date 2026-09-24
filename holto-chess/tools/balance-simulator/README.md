# PORENA Balance Simulator

현재 `src/game/engine.ts`의 공개 API를 호출해 PORENA 게임을 반복 실행하고 밸런스 지표를 수집하는 UI 없는 도구입니다. 게임 규칙, Cloudflare Worker, 온라인 UI를 별도로 재현하거나 수정하지 않습니다.

## 실행

프로젝트 루트(`holto-chess/`)에서 실행합니다.

```powershell
node tools/balance-simulator/run.mjs --games 1000 --seed 12345
```

기본 출력은 `tools/balance-simulator/output/result.json`과 `report.md`입니다. 이 디렉터리는 Git에서 제외됩니다.

테스트:

```powershell
npx vitest run --config tools/balance-simulator/vitest.config.ts
```

## 설정

| CLI | 기본값 | 의미 |
| --- | ---: | --- |
| `--games` | `1000` | 실행할 게임 수 |
| `--seed` | `12345` | 첫 게임 seed. 다음 게임은 1씩 증가 |
| `--policies` | 전체 정책 | 쉼표로 구분한 정책 목록 |
| `--assignment` | `fixed` | `fixed` 순환 배정 또는 seed 기반 `random` 배정 |
| `--rerolls` | `1` | 플레이어·라운드별 최대 리롤 수 |
| `--output` | `tools/balance-simulator/output` | JSON/Markdown 출력 폴더 |
| `--verbose` | 꺼짐 | 실패 및 100게임 단위 진행 로그 |

예:

```powershell
node tools/balance-simulator/run.mjs --games 100 --seed 9000 --assignment random --policies HIGH_RANK,PAIR_BUILDER,ECONOMY --rerolls 0
```

동일한 config와 seed는 실행 시간 필드를 제외하고 동일한 시뮬레이션 결과를 만듭니다. JSON 결과에는 실행 시간을 넣지 않아 직접 diff할 수 있습니다.

## 정책

- `HIGH_RANK`: 높은 rank 우선
- `PAIR_BUILDER`: 기존 보유 rank와 같은 카드 우선
- `STRAIGHT_BUILDER`: 기존 rank와 1~2칸 연결되는 카드 우선
- `FLUSH_BUILDER`: 가장 많이 보유한 suit 우선
- `ECONOMY`: 저렴한 카드 우선, 전략 리롤 미사용

모든 정책은 엔진의 라운드 hand limit을 채워야 쇼다운이 가능하므로 필요한 최소 구매는 수행합니다. 전략 후보가 없으면 비-Economy 정책은 설정 한도 안에서 보수적으로 리롤합니다. 판매는 현재 정책이 보유 카드를 교체하지 않으므로 0일 수 있으며, 지표와 JSON 스키마는 향후 교체 정책을 수용합니다.

## 수집 지표

- 게임: 요청/완주/실패 수, 평균 엔진 액션 수, seed별 실패 정보
- 라운드: 평균 진입·생존 인원, BB 평균/중앙값/최소/최대
- 경제: 구매·판매·리롤 수, 구매/리롤 지출, 종료 BB, 플레이어 슬롯별 및 라운드별 1인 평균
- BB 보상 원인: 라운드 수입, 승리/패배 기본 보상, 연승·연패 보너스, 증강 보너스, 미분류 보상
- 카드: rank별 상점 등장, 구매, 구매율, 판매, 최종 보유
- 카드풀: `AVAILABLE`, `RESERVED_IN_SHOP`, `OWNED`, 고갈과 상점 충전 실패
- 족보: R1~R5 분포. `ROYAL_FLUSH`는 `STRAIGHT_FLUSH`와 분리된 엔진 카테고리로 집계
- 토너먼트: R2/R4의 primary 승리, winner/loser bracket 결과, 탈락
- 점수: R5 진출자의 Round Points, Hand Score, Stack Score와 Final Score
- 정책: 참가 수, R5 진출률, 1위 비율, 평균 최종 순위, BB, 결승 진출자 평균 점수

`result.json`은 현재 config와 결과를 함께 저장하므로, 향후 Current/Experimental config를 별도로 실행해 필드별 비교할 수 있습니다. 이 도구 자체는 게임 밸런스 값을 변경하지 않습니다.

## 불변조건

매 라운드에 카드 원장 52장·유일 소유권·hand limit·예상 생존 인원을 검사합니다. 생성된 매치 보드에는 해당 참가자의 OWNED 카드가 없어야 하며, Run It Twice의 최초 Board A/B에는 동일 physical card가 없어야 합니다. 위반 시 해당 게임을 실패로 기록하고 다음 seed를 계속 실행합니다.

## 해석 주의

이 결과는 현재 구현한 heuristic AI policy 기반이며 실제 인간 메타를 직접 의미하지 않습니다. 정책이 만드는 편향과 게임 규칙의 효과를 완전히 분리할 수 없습니다. 특히 Hand Score는 현재 `src/game/config.ts`의 임시값을 그대로 사용하므로, 이 결과만으로 새 점수표를 확정하면 안 됩니다.
