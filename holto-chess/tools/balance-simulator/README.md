# PORENA Balance Simulator

`src/game/engine.ts`의 공개 API로 **현재 규칙 그대로** 8인 6라운드 게임(rulesVersion 2)을 끝까지 돌려 밸런스 지표를 모으는 UI 없는 도구입니다. 규칙을 다시 구현하지 않고, 서버(`room.ts`)와 같은 phase 순서로 엔진 함수를 호출합니다.

## 게임 진행 (driver.ts가 따르는 순서)

| 라운드 | phase 흐름 |
| --- | --- |
| R1 | `SHOP` → `SHOWDOWN_PRIMARY`(Swiss 3경기) → `ROUND_RESULT` |
| R2 | `DRAFT_ORDER` → `OPEN_DRAFT`(8장 공개, 픽) → `RUN_LOADOUT` → `SHOWDOWN_PRIMARY`(RUN1·RUN2) → `ROUND_RESULT` |
| R3 | `FINAL_AUCTION`(16장 경매, 1인 1장) → 낙찰 공개 → `DRAFT_ORDER` → `OPEN_DRAFT`(낙찰 실패자 2배 구매) → `SHOWDOWN_PRIMARY`(Omaha Swiss) → 필요 시 `SURVIVAL_READY` → `ROUND_RESULT` (8→6) |
| R4 | `DRAFT_ORDER` → `OPEN_DRAFT`(16장) → `SHOP` → `SHOWDOWN_PRIMARY` → `GROUP_ASSIGNMENT` → `SHOWDOWN_SECONDARY` → `ROUND_RESULT` (6→4) |
| R5 | `OPPONENT_SELECT` → `SHOP` → `RUN_LOADOUT`(3핸드) → `SHOWDOWN_PRIMARY`(RUN 3번) → 필요 시 `SURVIVAL_READY` → `ROUND_RESULT` (4→3) |
| R6 | `SHOP` → `SHOWDOWN_PRIMARY`(3인, 보드 없음 BEST 5) → `GAME_RESULT` |

매 단계 뒤에 카드 원장(`assertPoolIntegrity`)과 라운드 종료 생존 인원(8·8·6·4·3·3)을 검사합니다. `--five-rounds`는 6라운드 이전에 만들어진 방이 끝까지 쓰는 5라운드 규칙(R3 상점, R5 경매 결승, 생존 8·8·6·4·4)으로 돌립니다. 위반하거나 엔진이 예외를 던지면 그 게임만 **실패**로 기록하고 어떤 지표에도 섞지 않습니다.

## 실행

`holto-chess/`에서 실행합니다.

```powershell
node tools/balance-simulator/run.mjs --games 200 --seed 12345 --jobs 4
```

출력: `tools/balance-simulator/output/result.json`(집계), `report.md`(사람이 읽는 표). 이 폴더는 Git에서 제외됩니다.

| 옵션 | 기본값 | 의미 |
| --- | --- | --- |
| `--games` | `100` | 게임 수. 게임 i는 seed `--seed + i` |
| `--seed` | `12345` | 첫 seed |
| `--policies` | `ENGINE_BOT` | 쉼표 구분 정책 목록 |
| `--assignment` | `rotate` | `rotate`(게임마다 좌석 배정을 한 칸씩 밀어 좌석 편향 제거) · `fixed` · `random` |
| `--rerolls` | `1` | 휴리스틱 정책의 플레이어·라운드별 리롤 상한(엔진 한도가 더 낮으면 그것을 따름) |
| `--set path=값` | 없음 | 밸런스 상수 실험 override. 여러 번 지정 가능 |
| `--compare` | 꺼짐 | 같은 seed·같은 정책으로 현행 규칙(기준)과 override(실험)를 모두 돌려 `compare.md` 생성 |
| `--jobs` | `1` | 병렬 worker 수(게임은 서로 독립) |
| `--rows` | 꺼짐 | 플레이어별 `players.jsonl`, 게임별 `games.jsonl` 원자료도 저장 |
| `--out` | `tools/balance-simulator/output` | 출력 폴더 |
| `--verbose` | 꺼짐 | 게임별 성공/실패 로그 |
| `--five-rounds` | 꺼짐 | 5라운드 규칙으로 실행(전후 비교용) |

예: rank 14·13 가격을 10BB로 내리는 실험 비교

```powershell
node tools/balance-simulator/run.mjs --games 200 --policies HIGH_RANK,PAIR_BUILDER,ECONOMY,ENGINE_BOT --set rankPrices.14=10 --set rankPrices.13=10 --compare --jobs 4
```

테스트:

```powershell
npm exec vitest -- run --config tools/balance-simulator/vitest.config.ts
```

## 정책

- `ENGINE_BOT`: 게임의 실제 AI 봇 로직(`prepareShowdown` 기본 두뇌, `autoPickDraft`, `bestRunLoadout`). 실제 게임의 AI 좌석과 같습니다. 게임당 약 3초로 가장 느립니다.
- `HIGH_RANK` · `PAIR_BUILDER` · `STRAIGHT_BUILDER` · `FLUSH_BUILDER` · `ECONOMY` · `RANDOM`: 단순하고 읽기 쉬운 전략. 손 장수를 채우는 데 필요한 구매를 하며 판매·카드 잠금은 사용하지 않습니다. 상점·드래프트·R2 RUN 배치는 엔진의 공개 API(`buyCard`, `rerollShop`, `pickDraftCard`, `setRunLoadout`)로 수행하므로 엔진이 모든 규칙을 그대로 검증합니다.

한 게임 안에서 정책을 섞을 수 있습니다. 밸런스 변경 A/B에는 정책 하나(예: `ENGINE_BOT`)로 좌석 8개를 채우는 것이 가장 해석하기 쉽습니다.

## Override 범위

`--set`은 `BALANCE`(예: `rankPrices.2`, `rerollCostBB`, `points.r1.win`, `handScores.FLUSH`, `sellRate`)와 `FINAL_ROUND_PLACEMENT_POINTS`(`final.1=25`)의 **기존 숫자 상수**만 실행 중 임시로 바꾸고 끝나면 복원합니다. 없는 경로나 숫자가 아닌 값은 오류입니다. 엔진 코드에 직접 박힌 값(R3 BB 보상 10/15+5n, R1 승리 10BB, 드래프트 공개 카드 8·16장, `finalStandings`의 순위 점수 8/4/2/0/-1/-2/-4/-8)은 바꿀 수 없으므로 그런 실험은 엔진 변경이 필요합니다.

## 수집 지표 (report.md)

정책별 결과 · 좌석 편향 · 라운드 생존 · R1 전적/순위별 결과 · R2·R4 드래프트 순번별 결과 · rank별 구매(상점/드래프트/판매/최종 보유) · 라운드별 경제(시작 BB, 카드 순지출, 경기 BB 손익, 종료 BB, 획득 Points) · 최종 점수 구성(Round Points/Hand/Stack, 우승자가 Points 1위였던 비율) · SPLIT·서든데스·무작위 추첨·몰수패 · 라운드별 족보 분포.

비율에는 Wilson 95% 신뢰구간, 평균에는 ±95% 반폭을 붙입니다. 관측되지 않은 그룹은 0%가 아니라 표에서 빠지거나 N/A로 표시됩니다.

## 해석 주의

- 결과는 정책이 만드는 행동에 좌우됩니다. `ENGINE_BOT`도 인간 플레이의 대리일 뿐입니다.
- 표본이 작으면 신뢰구간이 넓습니다. 정책 간·전후 차이는 신뢰구간과 함께 읽으세요.
- override 결과는 실험 규칙의 결과이며 현행 규칙이 아닙니다. 수치 변경 자체는 이 도구가 하지 않습니다.
- 엔진 실행 결과이므로 `src/game`이 바뀌면 지표도 바뀝니다. 실행 시 커밋 SHA를 함께 기록해 두세요.
