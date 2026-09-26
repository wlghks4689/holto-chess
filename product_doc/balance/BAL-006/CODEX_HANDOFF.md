# BAL-006 Codex 인계 메모

상태: Claude 분석 완료(코드 미수정) / Codex 구현 검토 대기

이 메모는 밸런스 수치·게임 규칙·UI 문구를 승인하는 문서가 아니다. REQUEST.md의 "구현 권한 없음 · 게임 코드,
UI, 공용 테스트, 공용 문서, TODO/DECISIONS 수정 금지" 제약에 따라, Claude는 `product_doc/balance/BAL-006/
REPORT.md`와 `artifacts/**`에만 분석 결과를 남겼다.

## 기준과 커밋

- 분석 기준 코드: `d5e62cb2af4ae0f1dcd3ccccf52e18a2c48052db` (REQUEST 포함 커밋 `cee690b1737ab882d4c1f18ddc707f0a6c6c9f7b`)
- 분석 브랜치: `balance/BAL-006-latest`
- Claude 분석 커밋: `d3a51ff` — REPORT.md, artifacts/manifest.json, artifacts/scripts·results·tests 전체
- 원격: `origin/balance/BAL-006-latest` (푸시 완료)
- 별도 worktree: `/home/user/holto-chess-BAL-006` (기준 SHA에서 분기, 다른 작업과 경로 분리)

## 무엇을 검증했는가 (요약 — 전체는 `REPORT.md` 참고)

실제 프로덕션 함수(`resolveSecondary`, `findBestFive`, `compareHands`, `rankPlayers`, `placeInRanking`)를
Node에서 직접 호출했다(재구현 없음). R4 SHOWDOWN_SECONDARY를 실제 엔진 상태(`createGame` + 카드 소유권
직접 배정, `loserBracketReview.test.ts`와 동일한 기법)로 재현해 24건의 결정적 사례, 규정 보드 전수 계산,
Monte Carlo, pairwise 비교, 시드 canonicalization 프로토타입을 수행했다.

**결론: 계산 로직 자체는 정상이다.** 사용자가 관찰한 "R4 3인 로딩 화면에 승률이 안 보인다"는 계산 버그가
아니라 **UI가 애초에 값을 계산·전달하지 않기 때문**이다(`ShowdownPrepPanel.tsx`의 `PrepSeat`은 이미
`winPercent` prop을 지원하지만 multiway 분기에서 넘기지 않음).

## 핵심 발견 (Codex가 반드시 알아야 할 것)

### 1. R4 3-way는 "가끔"이 아니라 표준 8인 게임의 유일한 경로다

`BALANCE.playerCount=8`, R1·R2는 탈락 없음, R3는 `assignSurvivalBoundary`가 항상 정확히 2명을 탈락시켜
8→6명이 R4에 진입, R4 primary는 `pair(alive)`로 6명을 3쌍으로 나눈다 → winnerGroup·loserGroup이 항상
정확히 3명. 기존 `engine.test.ts`의 "uses separate boards for R4 winner and loser three-way encounters"로
교차 확인됨(REPORT.md §1.1). **즉 3-way 승률 표시는 R4 SHOWDOWN_SECONDARY의 예외 케이스가 아니라 기본
케이스로 설계해야 한다.**

### 2. 3파전 동점 해소 → place 배정 규칙 (반드시 그대로 재현해야 함)

`engine.ts`의 `resolveParticipants`(341–421행)를 그대로 따르면:

- 규정 보드에서 1위가 단독이면 종료(sudden death 없음). 2위 동점은 그대로 둔다.
- 1위가 동점이면 그 **동점자 집합만** 새 보드(원참가자 전원 카드 제외, 규정 보드와 카드가 겹칠 수 있음)로
  최대 2회 재비교하고, 그래도 안 풀리면 카드와 무관한 rank 추첨.
- **핵심**: 몇 라운드가 걸렸든, 원래 1위 동점자 중 최종 승자가 아닌 사람은 **전부 2위로 수렴**한다(누가
  sudden death를 더 오래 버텼는지는 결과에 반영 안 됨). 원래부터 뒤처져 있던 참가자는 원래 순위를 유지.
- 이 때문에 **승자조 총 포상액이 시나리오에 따라 18P(1/2/3 클린)와 16P(1위 동점 후 해소, tiedSecond=3P씩)로
  달라진다.** 기대 승점을 "1위 확률×10 + 2위 확률×5 + 3위 확률×3" 같은 단순 가중합으로 근사하면 이 분기를
  놓쳐 틀린다 — 반드시 실제 포상표 분기(REPORT.md §1.3)를 반영할 것.
- REPORT.md §5.4에 이 붕괴 규칙이 실제 엔진 호출로 재현된 사례(seed=159 등)가 있다.

### 3. 계산 방법 — 정확 계산은 "규정 보드 단독" 계층에서만 현실적

- 잔여 덱 `C(37,5)=435,897`개, 실측 584초/조합(단일 코어) — 규정 보드 단독 1위/동점 fractional equity는
  전수 계산 가능(서버 사전계산 캐시 전제, 실시간 부적합).
- **Sudden death까지 포함한 전수 계산은 재귀적으로 폭발해 비현실적**이다(동점 보드 비율에 따라 최소
  수 시간~수일). 최종 승률·기대 승점·생존 확률은 **Monte Carlo가 유일한 방법**.
- `resolveSecondary()`를 그대로 매 표본마다 호출하는 방식은 시행당 ~12ms(게임 상태 clone/부기 비용 때문 —
  실제 포커 계산 자체는 1ms 미만). **실시간 UI용으로는 이 오버헤드를 뺀 경량 계산기가 필요하다** — 다만
  그 경량 계산기가 위 2번의 place 배정 규칙을 정확히 재현하는지 반드시 테스트할 것.

### 4. "두 명씩 heads-up 계산 후 결합"은 쓰면 안 된다

실측으로 5~7%p 오차가 확인됨(정규화해도 100%가 안 맞음). 3-way는 반드시 **하나의 공유 보드**로 세 손을
동시에 비교해야 한다(REPORT.md §4).

### 5. 시드 canonicalization은 N명으로 그대로 확장된다

BAL-005의 "카드 ID 전체를 정렬해 시드 생성" 원칙을 N=3에도 그대로 적용 가능(손 내부 순서, 손들의 배열
순서 양쪽에 불변). 프로토타입으로 6가지 순서 변형에서 전부 동일한 보드가 나옴을 확인함(REPORT.md §6).

### 6. Edge case

- 카드 부족(불완전 핸드)은 이미 `forfeitHand()`로 처리되어 0P/최하위가 되지만, UI에서는 "0%"가 아니라
  "계산 불가/몰수"로 별도 표기할 것을 권고(§7, §8.3).
- 중복 카드는 `ownershipCardPool` 모델 자체가 구조적으로 막고 있어 정상 상태에서는 발생 불가.
- **참가 인원이 3이 아니면 `r4WinnerGroup` 포상표(1/2/3위만 정의)가 4위 이상을 0P로 떨어뜨린다** — 표준
  8인 게임에서는 도달 불가로 보이나(위 1번), N-way 계산 계약에는 이 전제를 명시할 것.

## Codex가 검토·구현할 항목 (우선순위 순)

### 1. (핵심) R4 3-way 승률 계산기 + UI 연결

- REPORT.md §9의 계산 계약 제안 참고: `finalWinProbability`(필수), `expectedPoints`(승자조만, 실제 포상표
  분기 반영), `status: "OK"|"FORFEIT"|"INVALID_INPUT"` 구분.
- `ShowdownPrepPanel.tsx`의 multiway 분기에 `PrepSeat`의 기존 `winPercent` prop을 연결(컴포넌트 자체는
  이미 지원). 라벨은 승자조="우승/1위 확률", 패자조="생존 확률"로 구분(REPORT.md §8.2) — "예상 승률" 하나로
  뭉뚱그리지 말 것.
- 실시간 성능이 필요하면 `resolveSecondary` 재사용 대신 경량 계산기 검토(위 3번) — 이 보고서의
  `lib/regulationEquity.ts`(규정 보드 계층)를 재사용하고 sudden-death 카스케이드만 추가 구현하는 방식을
  검토할 만하다(단, place 배정 규칙 재현 여부를 반드시 회귀 테스트로 검증).

### 2. (주의) 기대 승점 계산 시 포상 분기 반영 확인

Codex가 구현할 계산기가 무엇이든, 승자조 기대 승점은 반드시 "1위 동점 후 해소" 케이스에서 tiedSecond=3P가
적용되는지 테스트로 확인할 것(REPORT.md §1.3 표, §5.4 재현 사례).

### 3. (선택) 4인 이상 그룹 포상 공백

표준 8인 게임에서는 도달 불가로 보이지만(REPORT.md §1.1), 향후 플레이어 수 설정이 바뀔 가능성이 있다면
`r4WinnerGroup` 포상표에 4위 이상 항목을 추가할지 검토(REPORT.md §1.4, §7 — Claude는 게임 규칙을
수정하지 않았으므로 이 공백은 그대로 남아 있음).

## 검증 방법 재현

```bash
cd /home/user/holto-chess-BAL-006/holto-chess && npm ci   # 최초 1회 (또는 원하는 worktree)
cd ../product_doc/balance/BAL-006/artifacts/scripts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs smoke.ts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs sweepBranches.ts   # ~10분대
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs caseMatrix.ts
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs benchExact.ts       # ~10분
```

수정 후에는 반드시 REQUEST.md가 지정한 회귀 테스트를 다시 돌릴 것:

```bash
cd holto-chess && npm test -- src/game/engine.test.ts src/game/loserBracketReview.test.ts \
  src/ui/ShowdownPrepPanel.test.ts src/game/showdownPrepView.test.ts src/ui/showdownEquity.test.ts
```

## 범위와 제한

- Claude는 밸런스 수치·게임 규칙·UI를 하나도 바꾸지 않았다 — 전부 `product_doc/balance/BAL-006/` 안의
  분석 산출물이다.
- 정확 계산 실측은 1개 손 조합에서만 수행했다(다른 조합은 재현 가능하나 재실측하지 않음).
- Full-engine Monte Carlo는 N=300 소규모 실측에서 추정했다 — REQUEST의 "저비용 smoke 후 승인 전 대규모
  실행 중단" 지시에 따라 대규모 실행은 하지 않았다. 채택 시 원하는 CI 폭에 맞춰 재측정 필요.
- "R4는 항상 3-way"는 `BALANCE.playerCount=8`과 현재 R1~R3 탈락 규칙을 전제로 한다 — 게임 설정이 바뀌면
  달라질 수 있다.
- 4인 이상 그룹의 포상 공백이 표준 8인 게임에서 실제로 도달 가능한지는 산술적으로만 추론했고 전수
  조사하지 않았다.

전체 근거와 24건 사례별 수치는 `REPORT.md`, 원시 데이터는 `artifacts/results/*.json`, 재현 스크립트는
`artifacts/scripts/`, 전체 파일 설명은 `artifacts/manifest.json`을 참고할 것.
