# BAL-007 — R2 프리플랍 RUN별 승률 로직 검증

분석 브랜치: `balance/BAL-007-latest` · 기준 커밋: `2cce1a2e63573556124c167337b1294020c68a4a` (REQUEST 포함 커밋 `f62ce673dd5875c79e858d8f1652da53240e7b2a`)

이 보고서는 계산 오류를 이미 확정하지 않는다. 모든 수치는 `product_doc/balance/BAL-007/artifacts/scripts/`의 스크립트가
**실제 프로덕션 함수**(`showdownEquity`, `resolvePrimary`/`resolveSplitRuns`, `findBestFive`, `compareHands`,
`createShowdownDeck`, `drawCommunityBoards`)를 직접 호출해 얻은 결과다. 게임 소스·UI·공용 테스트는 전혀 수정하지 않았다.

## 0. 요약 (TL;DR)

| # | 발견 | 분류 |
|---|---|---|
| 1 | UI의 RUN 분리(`playerView.ts`의 `[[sel[0],sel[1]],[sel[0],sel[2]]]`)는 엔진의 실제 판정(`handFor`/`shownCardIds`의 `[sel[0], sel[gameNumber]]`)과 **완전히 일치**한다. 실제 `resolvePrimary()`를 호출해 얻은 RUN1/RUN2 카드 구성과 UI 로직이 만드는 구성을 직접 대조해 확인했다. | 정상 (확인됨) |
| 2 | UI가 넘기는 `deadCards`(6장 전체 소유 카드)는 실제로 결과에 영향을 준다 — 이를 생략하면(4장만 제외) 같은 손에서 승률이 79%→80%처럼 달라진다. 현재 구현(`deadCards` 인자 지원)은 REQUEST가 우려한 "일부만 제외" 오류가 없다. | 정상 (확인됨) |
| 3 | **핵심 발견**: 두 참가자가 "같은 랭크, 다른 슈트" 조합(드래프트형 게임에서 흔함)을 쥐면, 개별 RUN 승률이 화면에 "50%"로 뜨는데 **그 50%의 실제 구성은 90% 이상이 "거의 확실한 스플릿"이고 진짜 승/패 불확실성은 거의 없다.** 24개 사례 중 완전 미러 유형 5개에서 "양쪽 RUN 모두 승리" 확률이 naive 독립 가정 대비 최대 **26.7%p** 낮게 나왔고, 앵커·보조가 뒤바뀐 부분 미러 사례 1건에서는 스플릿이 드문데도(0.64%) 다른 메커니즘(강한 종속)으로 **30.4%p** 격차가 나타났다 — 실측으로 확인. | **표시 개선 필요 (핵심)** |
| 4 | RUN1과 RUN2는 (a) 같은 앵커 카드를 공유하고 (b) 한 번의 셔플에서 겹치지 않게 뽑은 두 보드를 쓰므로 통계적으로 독립이 아니다. 현재 UI는 이 두 RUN의 "결합 결과"(둘 다 승리/합산 기대 승점)를 전혀 보여주지 않고 각 RUN의 주변 승률만 보여준다 — 이것이 계산 오류는 아니지만, 사용자가 두 숫자를 곱하거나 더해 매치 전체를 추정하면 체계적으로 틀린다. | 규칙상 올바르지만 불확실한 추정 |
| 5 | 정확 계산은 **RUN 1개의 주변 승률**에 한해 현실적이다(잔여 덱 `C(46,5)=1,370,754`, 실측 70.1초). **두 RUN의 결합 확률을 완전 전수 계산하는 것은 `C(46,5)×C(41,5)≈1.03×10¹²`로 비현실적**이라 시도하지 않았다(계산만 하고 실행하지 않음). | 표본오차 있음, 정확계산 범위 한정 |
| 6 | 반복성, 좌우 대칭성, deadCards 포함 카드 순서 불변성, 중복/불완전 입력 처리 7개 항목 전부 통과했다(기존 `showdownEquity.test.ts`가 이미 커버하는 부분에 deadCards 조합을 추가로 검증). | 정상 (확인됨) |

## 1. 실제 규칙 확인 (Q1, Q2)

### 1.1 UI의 RUN 분리가 엔진과 일치하는가 (Q1)

- 엔진: `engine.ts`의 `handFor`/`shownCardIds`가 R2·rulesVersion 2에서 `[player.selectedCardIds[0], player.selectedCardIds[gameNumber ?? 1]]`을 사용한다. `gameNumber`는 1(RUN1) 또는 2(RUN2)다.
- UI: `playerView.ts`의 `showdownPrepView`가 `[[selected[0],selected[1]], [selected[0],selected[2]]]`를 만들어 `ShowdownPrepView.viewer.runCards`/`opponent.runCards`로 내려보낸다.
- 이 둘은 텍스트상으로도 동일하지만, `crossCheckUiVsEngine.ts`로 **직접 `resolvePrimary()`를 호출**해 엔진이 실제로 만든 `match.runCards`와 UI 쪽 구성 로직의 결과를 대조했다: `As,Ah,Kd`(좌) vs `7c,7d,9h`(우) 손에서 양쪽 모두 `RUN1=[As,Ah]/[7c,7d]`, `RUN2=[As,Kd]/[7c,9h]`로 **정확히 일치**했다.

### 1.2 Dead card 6장 제외가 실제로 필요한가 (Q2)

`RunTwicePrepPanel`은 `deadCards = [...viewer.cards, ...opponent.cards]`(양쪽 전체 소유 3장씩, 총 6장)를 `showdownEquity(2, left, right, deadCards)`에 넘긴다. 이 6장 제외가 실제로 결과를 바꾸는지 확인하기 위해 같은 RUN1 손(`As,Ah` vs `7c,7d`)을 (a) 올바른 6장 제외와 (b) 제외 없음(0장)으로 각각 계산했다:

| 조건 | 결과 |
|---|---|
| 올바른 6장 dead card 제외 | `[80, 20]` |
| dead card 미제외(0장) | `[79, 21]` |

차이가 존재한다 — 즉 반대편의 다른 RUN에서 쓰이는 두 장의 보조 카드(`Kd`, `9h`)를 덱에 남겨두면 승률이 달라진다. 현재 UI는 이 6장을 정확히 제외하므로 **이 부분은 올바르게 구현되어 있다.**

## 2. 지표 정의 — 주변 승률 vs 결합 결과

- **RUN 주변 승률(marginal)**: 그 RUN 하나만 떼어놓고, 46장(52−6) 중 5장 보드를 무작위로 뽑았을 때의 승/무/패 기대치. `leftShare = Σ(승=1, 무=0.5, 패=0)/N`. 현재 UI가 보여주는 지표이며, **RUN 하나만 고려하면 계산이 올바르다**(§1).
- **결합 결과(joint)**: 실제 매치는 RUN1과 RUN2를 **한 번의 셔플에서 겹치지 않게 뽑은 두 보드**로 동시에 진행하고(`engine.ts`의 `encounterBoards`→`createShowdownDeck`+`drawCommunityBoards(deck,2)`), 승점은 `ROUND_POINTS.r2Run.win=4`/`split=2`를 RUN마다 합산한다(둘 다 이기면 8P, 하나는 승 하나는 스플릿이면 6P, 등). 이 결합 분포(둘 다 승리 확률, 기대 합산 승점)는 **RUN1·RUN2 주변 승률을 독립으로 가정해 곱하거나 더해서는 구할 수 없다** — §3에서 실측으로 증명한다.

## 3. 핵심 발견: RUN1·RUN2의 종속성과 "미러 핸드"의 스플릿 지배 현상 (Q3, Q4)

### 3.1 방법

`lib/jointVsMarginal.ts`가 실제 `createShowdownDeck`+`drawCommunityBoards`(engine.ts와 동일한 단일 셔플·비중복 보드 2개)와 실제 `findBestFive`+`compareHands`를 사용해, 고정된 6장 손 조합마다 RUN1·RUN2 결과를 **같은 시행에서 동시에** 기록했다(재구현 아님 — production 함수 그대로 호출). 24개 사례 × N=50,000 시행(§5.2 근거로 사전에 크기를 정함), 실측 총 134.9초.

각 사례에서 다음을 비교했다:
- **참값**: 실제로 측정된 "양쪽 RUN 모두 승리" 확률(`trueBothWinPercent`).
- **naive 근사**: 두 RUN의 주변 승률을 독립사건처럼 곱한 값(`naiveBothWinPercent = run1Win × run2Win`).

### 3.2 결과 — 미러 핸드에서 격차가 극단적으로 커진다

24개 사례를 naive와 참값의 격차(`delta`) 순으로 정렬하면(`joint_case_matrix.json` 원본):

| case | splitSplit(양쪽 다 스플릿) | 참값(양쪽 다 승) | naive(독립 가정) | 격차 |
|---|---:|---:|---:|---:|
| r2-22 앵커·보조 강도 반전 | 0.64% | 0.57% | 31.01% | **30.44%p** |
| r2-05 A-suited-run vs A-offsuit | 83.27% | 0.14% | 26.83% | **26.69%p** |
| r2-21 양쪽 보조 강도 동일 패턴 | 86.06% | 0.12% | 26.30% | **26.18%p** |
| r2-04 2-anchor 미러(다른 슈트) | 93.03% | 0.07% | 25.52% | **25.45%p** |
| r2-10 A-anchor 미러(슈트만 다름) | 91.38% | 0.05% | 25.02% | **24.97%p** |
| r2-17 9-anchor 미러 | 91.60% | 0.04% | 24.96% | **24.92%p** |
| r2-13 A-anchor vs K-anchor(둘 다 강, 미러 아님) | 0.02% | 54.47% | 56.54% | 2.07%p |
| r2-24 브로드웨이 산개(미러 아님) | 0.00% | 37.56% | 38.36% | 0.80%p |

전체 24건 원본은 `artifacts/results/joint_case_matrix.json`, 표는 `artifacts/results/tables.md`에 정리했다.

### 3.3 왜 이런 일이 벌어지는가

`compareHands`는 카테고리·랭크·키커만 비교하고 **슈트로 동점을 깨지 않는다**(스트레이트/플러시 완성 여부에만 슈트가 관여). 두 참가자가 "같은 랭크, 다른 슈트" 조합(예: `As,Kc,2d` vs `Ah,Kd,2c` — 랭크 집합이 완전히 같음)을 쥐면, 어떤 보드가 나오든 두 손의 랭크 구성은 동일하므로 **한쪽만 우연히 백도어 플러시를 완성하지 않는 한 거의 항상 정확히 동점(스플릿)이 된다.** 실측 스플릿 비율이 83~93%에 달한다(r2-04/05/10/17/21).

`r2-22`(앵커·보조 강도 반전)는 다른 메커니즘이다 — RUN1만 랭크가 겹치고(`As,3d` vs `3s,Ad`) RUN2는 겹치지 않는데도(`As,2c` vs `Ad,Kc`), 전체 splitSplit 비율은 0.64%로 낮다. 즉 이 사례의 30.4%p 격차는 "스플릿 지배"가 아니라 **RUN1 결과와 RUN2 결과 사이의 강한 종속(한쪽이 RUN1을 이기면 RUN2는 지는 경향)**에서 온다 — 두 메커니즘(스플릿 지배, 강한 종속) 모두 naive 독립 가정을 깨뜨리지만 원인은 다르다는 뜻이다. 어느 쪽이든 "RUN1 주변값 × RUN2 주변값"으로는 결합 확률을 재현할 수 없다.

문제는 `showdownEquity`가 스플릿을 0.5승으로 계산해 평균을 내므로, **"50%"라는 표시 숫자 자체는 정상적으로 계산된 것**이지만(§1 확인 사항과 모순 없음), 그 50%의 실제 내용물이 "진짜 5:5 승부"인 경우(예: r2-13처럼 스플릿 0.02%, 참값 54.47%≈naive 56.54%로 거의 일치)와 "거의 항상 무승부"인 경우(스플릿 90%+, 참값 0.05%대)가 **완전히 다른 상황인데도 화면에는 구분 없이 같은 형태(정수 %)로 표시된다.** 사용자가 "50%면 반반 승부"라고 이해하면, 미러 핸드 상황에서는 실제로는 "거의 항상 공동 4위 수준의 스플릿"이라는 사실을 놓친다.

### 3.4 결론

- RUN 주변 승률 자체의 산식·계산은 **올바르다**(§1, §3.2의 각 RUN 개별 숫자는 정확).
- 그러나 **두 RUN을 각각 보여주는 현재 화면만으로는 "둘 다 이길 확률"이나 "합산 기대 승점"을 사용자가 정확히 추정할 수 없다** — naive 곱셈/합산은 미러 핸드에서 최대 30%p까지 틀린다.
- 특히 스플릿이 결과를 지배하는 상황(미러 핸드)에서는 "50%"라는 표시가 "동전 던지기"처럼 오독될 위험이 실측으로 확인됐다.

## 4. 정확 계산 vs Monte Carlo (Q5)

- **RUN 1개의 주변 승률**: 잔여 덱 46장 중 5장 = `C(46,5)=1,370,754`가지. 실제 `findBestFive`+`compareHands`로 전수 순회한 실측 결과(`exactMarginal.ts`, `exactMarginal.log`): **70.1초**, `leftEquityExact=79.2723%`(같은 손에 대한 production `showdownEquity()`의 1200-표본 추정치 `[80,20]`과 표본오차 범위 내 일치).
- **RUN1·RUN2 결합 확률의 완전 전수 계산**: 두 번째 보드는 첫 번째 보드가 제외된 41장 중 5장을 뽑으므로 결합 조합 수는 `C(46,5) × C(41,5) = 1,370,754 × 749,398 ≈ 1.03×10¹²`(계산만 함, 실행하지 않음 — REQUEST의 "비용 큰 전수 계산은 승인 없이 금지" 제한에 따름). 이 규모는 현재 환경에서 명백히 비현실적이다.
- **권고**: RUN 개별 주변 승률은 (원한다면) 서버 사전계산으로 정확 계산 전환이 가능하지만, 결합 확률/기대 승점은 Monte Carlo가 유일한 현실적 방법이다. §3에서 쓴 N=50,000 시행에 시행당 약 0.12~0.17ms(실측)가 걸려, 사례당 5~6초, 24개 사례 총 134.9초였다 — 실시간 UI 계산에도 이 방식(가벼운 함수 직접 호출, 게임 상태 전체를 복제하지 않음)은 부담이 크지 않아 보이나, 실제 UI 스레드에서의 체감 지연은 이번 조사에서 측정하지 않았다(브라우저 환경 벤치마크는 범위 밖).

## 5. 재현성·대칭성·입력 처리 (Q6)

`symmetryChecks.ts`로 7개 항목을 실제 `showdownEquity()` 호출로 검증했다(기존 `showdownEquity.test.ts`는 순서 불변성과 deadCards 중복 검증을 각각 테스트하지만 "deadCards를 포함한 상태에서의 좌우 대칭·순서 불변"은 조합 테스트가 없어 추가로 확인함):

| 항목 | 결과 |
|---|---|
| 동일 호출 반복 시 동일 결과 | PASS |
| deadCards 포함 상태에서 좌우 교환 시 정확히 대칭(`[a,b]`↔`[b,a]`) | PASS |
| 손·deadCards 내부 순서를 모두 뒤집어도 동일 결과 | PASS |
| deadCards 배열 순서만 섞어도 동일 결과 | PASS |
| 보여지는 손의 카드가 deadCards에 중복 등장 → `null` 반환(정상 거부) | PASS |
| 카드 1장짜리 불완전 손 → `null` 반환 | PASS |
| deadCards를 아예 안 넘겨도(빈 배열) 크래시 없이 유효한 결과 반환 | PASS |

전부 통과했다 — Q6에서 우려한 재현성·대칭성·방어적 입력 처리에서 결함을 발견하지 못했다.

## 6. UI 표시 권고 (Q7, 제안만 — 구현하지 않음)

1. **핵심 권고**: RUN별 %만으로는 미러 핸드의 "사실상 확정 스플릿" 상황을 구분할 수 없으므로, 각 RUN 옆에 무승부(스플릿) 비중을 함께 보여주는 것을 검토할 만하다(예: "50% (스플릿 다수)" 같은 보조 표기, 혹은 승/무/패 3분할 바). 현재 `showdownEquity`는 승/무/패를 합쳐 하나의 %로만 반환하므로, 이 권고를 구현하려면 반환값 확장이 필요하다 — REQUEST 범위상 구현하지 않는다.
2. **보조 권고**: 두 RUN을 합산한 "예상 획득 승점"(§3.1의 `expectedLeftPoints`, 4~8점 범위)을 화면 하단에 별도로 보여주면, 사용자가 "각 RUN 50%"를 보고 매치 전체를 오추정하는 것을 줄일 수 있다. 다만 REQUEST가 명시했듯 이는 "RUN별 승률"과는 다른 지표이므로 라벨을 명확히 구분해야 한다(예: "RUN 개별 승률" vs "예상 합산 승점").
3. 기존 footer 문구("각 RUN 승률은 개별 보드 기준 예상치입니다")는 이미 "이건 RUN 단위 추정치"라는 점을 밝히고 있어 방향은 맞으나, "두 RUN은 서로 독립이 아니다"까지는 전달하지 못한다.

## 7. Codex를 위한 참고 계산 계약 메모 (구현 아님)

- 결합 지표가 필요하면 `lib/jointVsMarginal.ts`의 방법(실제 `createShowdownDeck`+`drawCommunityBoards`로 한 번에 보드 2개를 뽑고, 같은 시행에서 RUN1·RUN2를 함께 평가)을 그대로 재사용할 것을 권고한다 — RUN을 따로따로 시뮬레이션한 뒤 결합하면 §3의 오차가 그대로 재현된다.
- `showdownEquity()` 자체(주변 승률 하나만 필요할 때)는 현재 구현을 그대로 유지해도 무방하다 — 이번 조사에서 계산 오류를 찾지 못했다.

## 8. 한계와 잔여 위험

- Joint 시뮬레이션은 N=50,000(사례당)으로 수행했다 — 참값 자체에도 몬테카를로 오차가 있으나(예: `trueBothWinPercent`가 0.04%인 경우 표본오차는 매우 작지만 정확히 0은 아님), 전수 계산(§4)과 대조한 결과 RUN 단일 주변값은 오차 범위 안에서 일치했다.
- 24개 사례는 직접 설계한 것이며(방향성 있는 손 조합 24종), 실제 R2 드래프트에서 "미러 핸드"가 발생하는 **빈도**는 이번 조사 범위가 아니다 — 다만 서로 다른 슈트의 같은 랭크 카드는 드래프트 풀에 항상 4장씩 존재하므로 구조적으로 드물지 않을 것으로 추정된다(확인 안 됨, 추정임을 명시).
- 브라우저 메인 스레드에서의 실제 체감 지연·메모리는 측정하지 않았다(Node 서버 사이드 실측만 수행).
- REQUEST가 지정한 4개 타깃 테스트(`showdownEquity.test.ts`, `ShowdownPrepPanel.test.ts`, `showdownPrepView.test.ts`, `openDraft.test.ts`)는 기준 커밋에서 35/35 통과를 확인했다(작업 전후 동일, 게임 코드 미수정이므로 재확인 불필요하나 베이스라인으로 기록).
- 대규모 실행(전체 24×N=50,000 결합 시뮬레이션, 134.9초)과 단일 정확 계산(70.1초) 외에는 장시간 계산을 수행하지 않았다 — REQUEST/사용자 지시에 따라 이 이상의 확장은 승인 후 진행 대상이다.

## 9. 재현 방법

```bash
cd holto-chess && npm ci   # 최초 1회
cd product_doc/balance/BAL-007/artifacts/scripts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs validate.ts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs crossCheckUiVsEngine.ts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs symmetryChecks.ts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs runCaseMatrix.ts   # ~135초
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs exactMarginal.ts   # ~70초
```

기준 회귀 테스트:

```bash
cd holto-chess && node_modules/.bin/vitest run src/ui/showdownEquity.test.ts src/ui/ShowdownPrepPanel.test.ts \
  src/game/showdownPrepView.test.ts src/game/openDraft.test.ts
```

## 10. 산출물

- `artifacts/manifest.json`
- `artifacts/scripts/` — `lib/fixture.ts`(R2 엔진 상태 빌더), `lib/jointVsMarginal.ts`(결합 시뮬레이션 핵심 로직),
  `lib/cases.ts`(24개 사례), `lib/prng.ts`, `crossCheckUiVsEngine.ts`, `symmetryChecks.ts`, `runCaseMatrix.ts`,
  `exactMarginal.ts`, `validate.ts`, `smoke.ts`, `benchSmall.ts`
- `artifacts/results/` — `joint_case_matrix.json`(24건 원본), `tables.md`, 각 스크립트 로그
- `artifacts/tests/` — `baseline_target_tests.md`(REQUEST 지정 4개 타깃 테스트 35/35 통과 로그),
  `cross_check_ui_vs_engine.md`(§1 근거), `symmetry_checks.md`(§5 근거)
