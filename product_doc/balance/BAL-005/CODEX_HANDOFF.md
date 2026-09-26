# BAL-005 Codex 인계 메모

상태: Claude 분석 완료(코드 미수정) / Codex 구현 검토 대기

이 메모는 밸런스 수치나 게임 규칙을 승인하는 문서가 아니다. `REPORT.md`의 발견을 실제 코드 수정으로
옮기기 전에 Codex가 검토·승인해야 한다는 REQUEST.md의 실행 제한("대규모 반복이나 UI/게임 코드 수정은
Codex 검토와 사용자 승인 없이 진행하지 않는다")에 따라, Claude는 게임 소스·UI·공용 테스트를 전혀
건드리지 않고 `product_doc/balance/BAL-005/REPORT.md`와 `artifacts/**`에만 분석 결과를 남겼다.

## 기준과 커밋

- 분석 기준 코드: `c7b2315` (REQUEST 포함 커밋 `2e4bbdd`)
- 분석 브랜치: `balance/BAL-005-latest`
- Claude 분석 커밋:
  - `45343df` — 72건(R1/R3/R4 각 24건) 사례 비교, Omaha 제약 검증, 봇 이중보드 편향 검증, REPORT.md 초안
  - `88a3c8a` — R4 전수 계산 3건 반영, `artifacts/manifest.json` 추가(최종본)
- 원격: `origin/balance/BAL-005-latest` (푸시 완료)

## 무엇을 검증했는가 (요약 — 전체는 `REPORT.md` 참고)

실제 프로덕션 함수(`showdownEquity`, `findBestFive`, `findBestOmaha`, `compareHands`)를 Node에서 직접
import해 실행했다(재구현 없음). R1/R3/R4 각 24개 결정적 사례에 대해 표시값(실제 `showdownEquity()` 호출)을
독립 RNG 대형 몬테카를로(R1 N=200,000/R3 N=150,000/R4 N=40,000) 및 대표 사례 전수 계산(R1 6건/R3 4건/R4 3건,
표본오차 0)과 대조했다.

**결론: 계산 로직 자체는 정상이다.**
- Omaha "홀 2장+보드 3장" 제약: 5개 적대적 케이스 전부 통과(§3)
- R3는 실제로 보드 1개만 쓴다 — REQUEST의 "두 런" 가설은 코드(`engine.ts`)로 기각됨(§1.2)
- 무승부 처리(1/0.5/0)와 좌우 합계=100 보장: 72건 전부 확인
- 봇의 R3 이중보드 평균: 단일보드 기대값과 통계적으로 구분 불가(편향 없음, §4)

## Codex가 검토·구현할 항목 (우선순위 순)

### 1. (핵심 권고) `showdownEquity.ts` 시드를 카드 순서 불변으로 고정

파일: `holto-chess/src/ui/showdownEquity.ts`

현재 시드 문자열이 `known.map(card => card.id).join(":")`로, **정렬하지 않은 원본 배열 순서**를 그대로
쓴다. 완전히 동일한 카드 구성이라도 배열 순서만 다르면(예: 카드 구매 순서 차이) 표시 승률이 달라진다 —
실측: 72건 중 63건(88%)에서 재현, 최대 11%p 차이.

**가장 뚜렷한 증거(`r4-16`, AAKK vs QQJJ)**: 실제 승률은 약 65%인데 화면엔 57%로 뜨고, 배열만 뒤집으면
67%가 나온다(REPORT.md §7.1). 이것이 REQUEST가 제기한 "표시 승률이 가끔 실제 카드 강도와 안 맞는다"는
관찰과 가장 직접적으로 일치하는 재현 사례다.

**권고 수정(최소 변경)**: 시드 생성 시 `known.map(c => c.id)`를 정렬한 뒤 join하도록 한 줄만 바꾼다.
로직·규칙 변경이 아니라 시드의 정의만 카드 배열 순서와 무관하게 만드는 것이다.

주의사항:
- 이 변경은 각 매치업의 표시 승률 정수값을 (보통 1~2%p 이내로) 바꾼다 — 기존 스냅숏/회귀 테스트
  (`showdownEquity.test.ts`)의 하드코딩된 기대값을 다시 확인해야 할 수 있다.
- 정렬 기준(문자열 정렬 vs 랭크·슈트 기준 정렬)은 사용자가 보기에 중요하지 않지만, 재현성을 위해 한
  가지로 고정해야 한다.
- REQUEST.md는 "게임 소스·UI 직접 수정 금지"를 Claude에게만 적용했다 — Codex가 사용자 승인을 받고
  진행하는 것은 이 규칙 위반이 아니다.

### 2. (보조 권고, 우선순위 낮음) 표본 수·오차 표시

R3(SAMPLES=600)/R4(SAMPLES=240)의 정수 % 표시가 실제 오차 범위(R4 약 ±6%p)보다 정밀해 보인다. 두 가지
독립적인 대안이 있고 함께 적용할 필요는 없다:
- SAMPLES를 늘린다 — UI 로딩 화면 노출 시간과의 트레이드오프이므로 기획 판단 필요.
- 표시에 오차 힌트를 추가한다("57% ± 6%p" 등) — 계산은 그대로 두고 표시만 바꾸는 저위험 대안.

### 3. (아이디어, 낮은 우선순위) 정확 계산 전환 검토

R1/R3/R4의 조합 수(R1 48장 중 5장 = 1,712,304가지 등)가 클라이언트 실시간 계산에는 무겁지만, 서버
사전계산·캐싱으로 전환하면 표본오차 자체를 없앨 수 있다. 지금 당장 필요한 항목은 아니다.

## 검증 방법 재현

```bash
cd holto-chess && npm ci   # 최초 1회
cd product_doc/balance/BAL-005/artifacts/scripts
node --experimental-strip-types productionEquity.ts        # 실제 표시값 + 순서-안정성 재확인
node --experimental-strip-types classify.ts                # 표시값 vs 기준값 분류 재생성
node --experimental-strip-types --experimental-loader ./lib/tsExtLoader.mjs omahaConstraint.ts
```

수정 후에는 반드시 `holto-chess/`에서 기존 회귀 테스트를 다시 돌려야 한다:

```bash
cd holto-chess && node_modules/.bin/vitest run src/ui/showdownEquity.test.ts src/ui/ShowdownPrepPanel.test.ts
```

## 범위와 제한

- Claude는 밸런스 수치·게임 규칙을 하나도 바꾸지 않았다 — 전부 `product_doc/balance/BAL-005/` 안의
  분석 산출물이다.
- 순서-불안정성이 "실제로 얼마나 자주" 사용자에게 보이는지(서버 상태에서 `ownedCardIds` 순서가 실제
  플레이 중 얼마나 바뀌는지)는 확인하지 못했다 — 코드 자체의 취약점은 확정적이지만 체감 빈도는 별도 조사
  필요.
- R2/R5는 이번 분석 핵심 범위가 아니어서 심층 검증하지 않았다.
- 전수 계산은 R1 6건·R3 4건·R4 3건에만 적용했고, 나머지는 독립 RNG 대형 몬테카를로(N=40,000~200,000)다.

## 다음 Codex 작업

1. 위 "핵심 권고"의 시드 정렬 수정을 사용자 승인 하에 구현
2. `showdownEquity.test.ts`의 하드코딩된 기대값을 새 시드 기준으로 갱신
3. (선택) 표본 수/오차 표시 개선안 중 하나를 기획 판단과 함께 검토
4. 구현 후 `artifacts/scripts/productionEquity.ts`로 순서-안정성이 실제로 해소됐는지 재검증 권장
   (이 스크립트는 Claude 작성본이지만 재실행에는 제약이 없다)

전체 근거와 72건 사례별 수치는 `REPORT.md`, 원시 데이터는 `artifacts/results/*.json`,
재현 스크립트는 `artifacts/scripts/`, 전체 파일 설명은 `artifacts/manifest.json`을 참고할 것.
