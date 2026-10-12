# SD-FREEZE-001 — 매칭 로딩 → 쇼다운 정지

## 기준과 확인한 원인

- 기준 HEAD: `2a53078249380f21d8c69c7dcc6fd82d8aeeb5d0`, branch `codex/profile-identity-002`.
- 최초 미추적 `assets/`, `product_doc/crowdfunding/`는 보존한다. 게임 규칙·표본 수·판정·보상·서버 시계·프로토콜 변경 없음.
- `ShowdownPrepPanel`의 `useMemo`와 `ShowdownCinematic`의 `matchStreetEquity`가 렌더링 중 동기 승률 계산을 실행했다. 캐시 적중 전 계산은 화면·타이머·WebSocket 처리가 사용하는 브라우저 메인 스레드를 점유한다.
- 실제 Chromium, CPU 6배 제한, PC 1280×800 / 모바일 viewport 393×852에서 재현했다. 수정 전 R3 플랍의 긴 작업은 local 925ms / server-clock 923ms, R4 준비 화면의 긴 작업은 1342ms / 1817ms였다. 전체 갱신 공백 최대 2406ms. 초기 모듈 로딩 비용도 포함된 원시 기록과 게임 중 수치를 구분한다.
- 서버 시계 기반 재생은 화면 스레드가 멈춰도 시간이 진행하므로, 계산 후 복귀 때 뒤쪽 프레임으로 이동하는 원인이 된다. 이 기록은 재현된 계산 병목의 증거다. 사용자 운영 환경의 모든 정지 원인을 단일 원인으로 입증한 것은 아니다.

## 수정과 승률 신뢰성

- 표시 계산만 브라우저 Web Worker에서 실행한다. 기존 `showdownEquity`, `r4ThreeWayEquity`, `finalFourWayEquity`, `visibleStreetEquity`를 그대로 사용한다. 게임 서버의 능력 자격·보상 계산은 변경하지 않는다.
- 기존 프리플랍 표본 수/seed/절삭, 스트리트 전수 계산, 오마하 정확히 2장 규칙, 동률 지분을 유지한다. R1–R4, 모든 R2 RUN, R6 결승의 기존 함수와 값 일치 검증을 추가했다.
- 로딩에서 완료한 승률을 동일 공개 카드 입력의 쇼다운 첫 화면에서 재사용한다. R3 2인 모바일 6배 제한 검증에서 준비 `37% / 62%` → TABLE_ENTER `37 / 62`를 확인했다. 합계 99는 기존 정수 절삭 방식이다.
- 스트리트 계산은 해당 공개 프레임부터 시작한다. 입력은 해당 보드의 공개 prefix만 포함한다. 미래 보드, 승자, 순위, 결과를 Worker에 전달하지 않는다.
- 표시 시점은 기존 서버/로컬 프레임의 flip + 300ms 조건과 실제 카드 DOM의 flip 타이머를 모두 충족해야 한다. 선계산 완료만으로 수치를 미리 노출하지 않는다.
- 입력 변경/경기 전환/언마운트 때 Worker를 종료한다. 이전 입력의 응답을 즉시 거부한다. 카드 입력만 캐시하며 상한 128개다.
- Worker 미지원/생성 실패/로드 오류/메시지 오류/8초 응답 정지는 미확정 승률로 처리한다. 임의 수치나 메인 스레드 동기 계산으로 대체하지 않으며 쇼다운 진행은 승률 완료를 기다리지 않는다.

## 검증

- 최종 관련 6파일 **93테스트 통과**. 추가 Worker 수명·오류·취소·숨겨진 카드·R6·렌더링 계산 금지 회귀와 선계산/표시 지연 분리 포함.
- 전체 Vitest 실행: **825 통과 / 1 실패 (826개)**. 이후 추가된 3개 회귀는 관련 93테스트 실행에서 통과했다. 전체를 다시 실행했다고 합산 보고하지 않는다.
- 기존 실패: `src/game/openDraft.test.ts:241`, R4 publicHands 기대와 현행 구현 불일치. 단독 재현도 실패. `git diff --exit-code HEAD -- src/game src/core src/shared worker` 성공으로 해당 테스트 및 엔진·서버 코드가 기준 HEAD 그대로임을 확인했다. 이번 성능 수정에서 공개 정책을 바꾸거나 실패를 숨기지 않았다.
- Cloudflare 로컬 런타임: `tests/worker/disclosureScheduling.test.ts`, `room.test.ts` **17테스트 통과**. 방 진행·공개 스케줄 관련 회귀.
- TypeScript, 변경 소스 ESLint, 최종 `npm run build` 통과. Worker 번들 `displayEquity.worker-BfgVA31X.js` 약 8.27KB 생성.
- R1–R4 × local/server-clock = **8개 브라우저 전환 모두 통과**. TABLE_ENTER·FLOP_1·RIVER를 거쳐 실제 승률 표시. R1/R2/R4 준비 승률이 TABLE_ENTER 전 준비됨을 자동 assertion으로 확인. R3 3인 준비 승률은 기존 구현에서도 없으므로 기존 범위를 유지하고 R3 2인을 별도 검증했다.
- 최종 8개 실행의 게임 중 긴 작업 최대 381ms, 준비 화면 이후 갱신 공백 최대 625ms. CPU 6배 제한이며 초기 모듈 로딩 포함 최대 작업 614ms. 일반 렌더링 비용은 남아 있다. 1초 이상 게임 중 갱신 공백과 500ms 이상 게임 중 단일 긴 작업에 자동 실패하도록 검증 도구를 추가했다.
- Worker 미지원/자산 로드 실패/응답 정지 **3개 브라우저 시나리오**에서 TABLE_ENTER → FLOP → RIVER → RESULT → 결과 화면까지 진행, pageerror 없음. 응답 정지에서는 실제 terminate 호출 확인.
- 393×852 / 1280×800 가로 넘침 없음. 저장한 두 화면 이미지를 직접 확인했다.
- 최종 실제 릴리스 빌드: localhost의 독립 Cloudflare 설정/실제 Durable Object/WebSocket에 연결한 PC·모바일 2인 멀티와 게스트 싱글이 R1 세 경기 및 결과 화면까지 완료했다. 세 탭 모두 pageerror 0, 승률 Worker 자산 HTTP 200. 근거 `showdown-game-smoke.json`. 다른 검사와 달리 이 실행은 실제 게임 진입·구매·준비 입력과 점진적 서버 공개를 포함한다.
- 물리 iOS/Android/Safari, 운영 회선·장시간 동시 방 부하, 실제 Google 로그인 ranked solo는 미검증이다. 로컬 viewport 검사와 구분한다.

## 재현 도구와 근거

- 원시 성능: `showdown-transition-before.json`, `showdown-transition-after.json`.
- Worker 실패: `showdown-worker-failure.json`.
- 실제 빌드 게임: `showdown-game-smoke.json`.
- 이미지: `assets/2026-10-12-showdown-local.png`, `assets/2026-10-12-showdown-online.png`.
- Vite harness: `holto-chess/tools/perf/showdown-transition.html`, `showdown-transition.tsx`.
- 자동 검증: `showdown-transition.mjs`, `showdown-worker-failure.mjs`, 실제 게임 `showdown-game-smoke.mjs`. 모두 localhost만 허용한다. 운영 방 생성 금지.

```powershell
# nested holto-chess/에서, 사용 가능한 Playwright 모듈 경로를 지정한다.
$env:PLAYWRIGHT_MODULE = '<installed playwright module path>'
npm run dev:local -- --host 127.0.0.1 --port 5195
# 다른 터미널
$env:AUDIT_ORIGIN = 'http://127.0.0.1:5195'
$env:AUDIT_ASSERT = '1'
node tools/perf/showdown-transition.mjs
node tools/perf/showdown-worker-failure.mjs
npx vitest run src/ui/displayEquity.test.ts src/ui/streetEquity.test.ts
```

실제 빌드 게임 검증은 별도 로컬 설정에서 `main`/`assets.directory`를 빌드 산출물의 절대 경로로 지정하고 `AUTH_ORIGIN`을 정확한 localhost origin으로 맞춘다. 빌드된 wrangler.json의 configPath/userConfigPath 재지정과 기존 실행 서버의 outDir 파일 잠금이 로컬 검증을 방해했으며, 운영 파일 변경 없이 별도 테스트 설정/검증 서버 종료로 해결했다. 기존 package.json에 있으나 설치되지 않은 pixi.js를 포함한 로컬 의존성을 복원했다. package.json/lockfile 변경 없음.

## 적용 상태

로컬 수정·자동 회귀·빌드 검증 완료. 사용자 2026-10-12 승인에 따라 이번 수정·회귀·QA 자료를 `codex/profile-identity-002` 브랜치에 커밋·push한다. 운영 배포는 승인 범위에 포함되지 않으며, main 반영·운영 적용과 실기기 확인은 별도 Gate다.
