# 자본주의 이자 누락 복구 및 12종 명세 동기화 — 2026-09-30

## 시작 상태와 범위

- 브랜치 `main`, upstream `origin/main`, 확인 HEAD `e17d7be`. 시작 시 tracked 변경 없음. 기존 미추적 `.wrangler-config/`, `varco-export/`는 보존했다. 이 작업에서 원격 fetch나 커밋·push·배포는 하지 않았다.
- 저장소 지침 및 product_doc/README.md를 확인하고 ABILITY_RULES/CARDS, DECISIONS의 ABILITY-001/011/012, TODO, 2026-09-29 QA, 실제 정의·정산·기존 테스트를 대조했다.
- 두 누락은 확인 HEAD에도 존재했다. 20%·소수점 버림·최종 생존자만·라운드당 한 번이라는 승인 규칙을 복구하며, AI/UI 구조/새 능력/밸런스 수치는 변경하지 않았다.

## 재현과 원인

코드를 수정하기 전에 `capitalism.test.ts`로 엔진 종료 경로를 실행했다. 초기 20개 테스트 중 4개가 실패하고 16개가 통과했다.

- R2: RUN 보상 후 77BB인 보유자의 예상 92BB(이자 15BB)에 대해 실제 77BB. `resolveSplitRuns`가 이자를 호출하지 않았다.
- R3 생존 경계 생존자: 보상 후 92BB의 예상 110BB(이자 18BB)에 대해 실제 92BB.
- R3 경계 밖 안전 생존자: 102BB의 예상 122BB(이자 20BB)에 대해 실제 102BB.
- R3 경계 탈락자: 지급 제외 자체는 맞지만 해당 라운드 정산 완료 표시도 남지 않았다.
- R3 원인은 `resolveSurvival`이 `state.survival`을 지우기 전에 이자를 호출하여 `abilityRewards.ts`의 대기 방어에 걸리는 순서 오류였다.

## 최소 수정 및 기록 의미

- `src/game/engine.ts`: R2 두 RUN 완료 후 독주자 판정 앞에서 이자를 호출한다. R3는 `eliminate` → `delete state.survival` → 이자 → 보상 스냅샷 → 라운드 결과/독주자 순으로 정리한다.
- `abilityRewards.ts`의 대기 방어와 `abilityInterestRounds` 중복 방어는 그대로 둔다. 정산 함수 재진입은 기존 페이즈 검증으로 막고, 저장/복원 후 helper 재호출도 재지급하지 않는다.
- 최종 탈락 결정 전에는 지급하지 않는다. 정규 BB 보상 후 현재 BB로 계산하며, R5 ICM은 이자보다 먼저 확정된다.
- 이자는 `round-interest` 라운드 이벤트 및 실제 플레이어 BB/통계에 반영된다. R2 매치/RUN 원장은 이미 완료된 RUN 보상으로 유지한다. 라운드 결과 및 플레이어 뷰의 잔액은 이자를 포함한다. R3 생존 매치처럼 이자 후 캡처하는 원장은 실제 `afterBB`에 이자를 포함하므로 이벤트를 다시 합산하면 안 된다.
- 멀티 방 자동 전이와 싱글은 동일 엔진을 호출한다. 방 전이 회귀 테스트에서 R2 및 R3 타이브레이크 생존 보유자의 플레이어 상태/이벤트/정산 마커가 로컬 결과와 같음을 확인했다.

## 회귀 테스트

신규 `src/game/capitalism.test.ts` 최종 22개:

- R1~R5 정상 정산 5개: 보상 후 BB, 한 번 지급, 미보유자 불변, 이벤트/통계, 라운드 결과/플레이어 뷰, R5 최종 잔액, 저장/복원 후 재호출 및 종료 경로 재진입 차단.
- R3 생존 타이브레이크 3개: 경계 생존자·경계 탈락자·경계 밖 생존자, 대기 중 지급 보류, 최종 탈락/원장/스냅샷.
- R3/R4 정상 탈락 보유자 2개: 생존 타이브레이크 없는 종료의 지급 제외와 탈락 스냅샷 유지.
- 경계 BB 10개: 0/1/4/5/9/10/57/99/100/101, 버림, 0원 정산도 마커 보존, 탈락자/미보유자 불변, 복원 후 BB 증가에도 중복 지급 없음.
- 방 전이 2개: R2/R3 로컬 결과 일치 및 오래된 READY 요청 거부.

## 문서별 정리

- `ABILITY_RULES.md`: 현행 12종, 최신 한국어 이름/ID, 자본주의 정산 순서·대상·기준 BB·이벤트, 쿼드 코어 조건/ICM/예외/중복, 독주자 순위 기준/시점/점수/중복을 추가했다. 타이브레이크 보드의 매치 효과와 이후 라운드 효과를 구분했다.
- `ABILITY_CARDS.md`: 12종 앞/뒷면 검증 기준, details 번역 키, 건축가/architect 명칭, 핵심 경계 조건을 맞췄다.
- `src/i18n/locales/ko-KR.ts`, `en-US.ts`: 쿼드 코어 “재발동”을 “동일 카드 재획득 시 자격 회복, 최종 매치 한 번 지급”으로 명확히 하고 ICM 본인 몫 및 제외 대상을 명시했다. 효과 변경은 없다.
- `DECISIONS.md`: 새로운 밸런스 결정이 아닌 기존 승인 규칙 복구와 근거를 덧붙였다.
- `TODO.md`: 이자 감사 완료, 과거 두 능력 배포 기록을 근거로 release 완료 갱신. 미검증 전체 운영 플레이는 별도 미완료 항목으로 분리했다. 라이브 AI 개선 TODO는 그대로다.
- `qa/2026-09-29-front-runner.md`, `qa/2026-09-29-quad-core.md`: 당시 개수/실패/미배포 사실을 수정하지 않고 후속 해결·동기화 기록을 추가했다.

## 최종 검증

명령은 별도 표기가 없으면 저장소 루트에서 실행했다.

| 검증 | 결과 |
| --- | --- |
| `npm test -- src/game/capitalism.test.ts src/game/frontRunner.test.ts src/game/quadCore.test.ts` | 3파일 65개 통과 |
| `npm test` | 최종 80파일 576개 통과, 71.90초 |
| `npm run test:workers` | 2파일 22개 통과, 13.14초 |
| 앱 폴더 `npx tsc -b`, `npx tsc -p tsconfig.worker.json` | 둘 다 통과 |
| 앱 폴더 `npx eslint src/game/engine.ts src/game/capitalism.test.ts src/i18n/locales/ko-KR.ts src/i18n/locales/en-US.ts` | 변경 소스 통과 |
| `npm run lint` | 실패: 기존 `src/ui/OnlineApp.tsx:94`의 `react-hooks/set-state-in-effect` 1건 |
| `npm run build` | 최종 한영 문구 포함 Wrangler 타입 생성·클라이언트/Worker 타입 검사·Vite 양쪽 빌드 통과 |
| `git diff --check` | 통과 |

- 새 테스트의 선택 필드 `view.roundSummary`에 대한 초기 타입 오류는 optional 접근으로 수정했으며 최종 타입 검사/빌드는 통과했다.
- Lint 실패 코드가 시작 HEAD에 동일하게 존재함을 `git show HEAD:holto-chess/src/ui/OnlineApp.tsx`로 확인했다. 이번 변경의 오류로 분류하지 않으며 범위 밖이라 수정하지 않았다.
- Worker/build는 기존 로컬 `.wrangler-config`를 `XDG_CONFIG_HOME`으로 지정하고 `WRANGLER_SEND_METRICS=false`로 실행했다. 관리자 secret 미설정 경고가 있었으나 테스트와 빌드는 성공했다. Worker 테스트에는 Vite native config 경고와 Windows 경로 정적 export 분석 접근 경고도 있었으며 실제 22개 테스트는 통과했다. 운영 secret/설정은 변경하지 않았다.

## 한계 및 남은 확인

- 이번에는 브라우저 수동 플레이, 실제 휴대폰, 운영 멀티플레이에서 이자 연출·잔액을 직접 확인하지 않았다. 결과 데이터/원장/플레이어 뷰는 자동 테스트로 검증했다. 새로 길어진 쿼드 코어 한영 뒷면의 실기기 레이아웃도 미검증이다.
- 이번 수정은 미커밋·미배포 상태다. 이미 과거 코드로 정산 완료된 경기나 저장 데이터의 누락 이자를 소급 지급하지 않는다.
- 최신 명시적 승인과 기존 능력 테스트 사이에서 추가 기획 판단이 필요한 충돌은 발견하지 않았다. 기존 10/11종은 당시 이력으로 남기고 현재 기준만 12종으로 정리했다.
