# SD-FREEZE-002 — 매칭 시간 단축과 로컬 게임 계산 정지

## 기준과 승인

- 기준 `main`, `f6493bb7151cca7dcf7a4022d9cba4b859fb5b6f`.
- 사용자 요청: 로딩 화면 생략·reveal 시간 단축·반복 멈춤 원인 조사 및 수정, R2 예상 승률 확인. 원인 분석 후 사용자가 진행을 승인했다. 완료 후 commit/push 및 PC 종료도 이번 작업에 명시 요청했다.
- 루트 `assets/`, `product_doc/crowdfunding/` 미추적 파일은 기존 작업이며 제외한다.
- 엔진의 게임 규칙, RNG, 핸드 판정, 카드 공개 범위, 보상, 3,500ms MATCH_SETUP 및 각 카드 reveal 상수는 바꾸지 않는다.

## 확인한 원인

1. 서버는 명령 시작 때 얻은 `now`로 동기 엔진 계산을 마친 뒤에도 준비 화면과 쇼다운 일정을 생성했다. 실제 R4 명령에 2,194ms가 걸린 측정에서 3,500ms 준비 시간 중 남은 시간이 1,306ms였다. 단독 엔진 측정은 R4 1,258ms / R5 2,040ms / R6 1,416ms였다. 계산이 느린 상황일수록 화면에 쓸 시간이 줄어드는 구조였다. 이 측정만으로 운영에서 발생한 모든 화면 생략 원인을 단정하지 않는다.
2. 게스트 싱글의 `App.tsx`는 표시 승률을 Worker로 분리한 이후에도 봇의 선택, 경기 확정, 라운드 전환과 `createPlayerView`를 메인 스레드에서 계산했다. 무거운 엔진 계산 동안 렌더링·입력·타이머가 함께 멈출 수 있었다.
3. 로컬 첫 매칭 및 다음 경기의 준비 화면은 wall-clock 타이머라서 숨겨진 탭이나 긴 정지 시간이 표시 시간을 소비했다. 로컬 시네마틱의 가시 시간 재생과도 불일치했다.
4. 다음 경기의 준비 데이터가 RUN 1·2만 복사하고 R5를 기본값으로 결승 처리했다. 현재 6라운드 R5의 세 번째 RUN을 보존하고 실제 final 플래그를 전달하도록 수정했다.

Cloudflare Workers의 시간은 동기 계산 중 갱신되지 않는다. 단순히 계산 직후 `Date.now()`를 다시 호출하는 것만으로는 충분하지 않아 새 스케줄 저장 전에 타이머 이벤트를 한 번 거친다. [공식 performance 문서](https://developers.cloudflare.com/workers/runtime-apis/performance/), [공식 보안 모델](https://developers.cloudflare.com/workers/reference/security-model/).

## 변경

- `GameRoom.commit`: 새 준비 단계 또는 새 시네마틱 일정만 계산 완료 이후의 시계에 맞춘다. 기존 700ms 전달 여유를 사용하며, 이미 진행 중인 일정은 READY·접속·시계 동기화·다른 커밋으로 재시작하지 않는다. `blockConcurrencyWhile` 안에서 기존 직렬 처리와 저장 후 공개 순서를 유지한다. 결과·카드 공개 offset은 그대로 이동하므로 미래 스트리트를 선공개하지 않는다. 의도적으로 끝낸 봇 전용 일정은 연장하지 않는다.
- `localGame.worker.ts` 및 직렬 실행기: 기존 엔진 함수를 그대로 Worker에서 실행하고 게임 상태와 표시 projection을 함께 반환한다. 완료된 상태만 반영한다. 이전 게임/이전 요청의 응답은 거부하고 처리 중 중복 입력을 차단한다.
- Worker 생성/로드/메시지 오류, 예상치 못한 엔진 오류, 20초 무응답은 작업을 종료하고 재시도/홈으로 복귀를 제공한다. 오류 때 UI 스레드로 계산을 되돌리지 않는다. 정상 게임 입력 거부와 시스템 오류를 구분한다.
- 로컬 매칭은 화면이 보이는 시간만 계산하며 긴 프레임 공백은 한 tick에 최대 100ms만 반영한다. 온라인은 서버 시계 기반 동기 진행을 유지한다.
- R2의 동일 세 장 × 두 RUN, 기존 승률 표본/seed/정수 절삭을 유지했다. `35% + 64% = 99%` 같은 표시는 기존 절삭 규칙이며 누락이 아니다.

## 자동 검증

- 새 타이머, 직렬 Worker, stale/cancel/retry, 생성/postMessage/런타임 오류, 엔진 결과 일치, R2 세 장 승률, 기존 서버 타임라인·표시 승률: 9파일 81테스트 통과.
- Cloudflare 실제 로컬 런타임 `room.test.ts`, `disclosureScheduling.test.ts`: 18테스트 통과. 8초 오래된 준비 timestamp로 시작해도 저장된 deadline에 전체 준비 시간이 남고 다음 커밋이 이를 재시작하지 않는 회귀 포함.
- 전체 Vitest: 126파일, **927 통과 / 기존 1 실패** (928개, 약 247초). 실패는 `openDraft.test.ts:246`의 R4 publicHands 비공개 기대와 기존 구현의 불일치. 테스트·playerView·엔진·config는 기준 HEAD와 동일함을 `git diff --exit-code`로 확인했다. 해당 공개 정책을 이번 수정에서 변경하지 않았다.
- 최종 R5 다음 경기의 RUN 3 카드 보존 회귀를 추가한 후 관련 4파일 69테스트 통과. 따라서 전체 실행 이후 추가된 테스트 1개도 별도로 통과했다.
- TypeScript app/worker/검증 harness, 변경 소스 ESLint, 프로덕션 빌드 확인. 새 localGame Worker 번들 생성 확인.

## 브라우저 검증 방법과 범위

- `tools/perf/game-transition.html`: 실 엔진 seed 789부터 살아 있는 p1을 포함한 해당 라운드를 생성한다. 이전 고정 `qaMatch`의 legacy R2 두 장 fixture를 사용하지 않는다. 로컬은 프로덕션 `useLocalGame`·Worker 및 시네마틱을, server-clock 모드는 실제 room/forceBarrier/playerView/disclosure와 동일 컴포넌트를 사용한다. 후자는 WebSocket 통신 자체의 부하 측정과 구분한다.
- DOM에 표시하는 `Transition measurements`에서 phase, PREP 노출 시간, 승률, 카드 수, PerformanceObserver longtask, 40ms 갱신 공백, 브라우저 오류, 실제 viewport 폭을 기록했다. 표준 Chromium 실행이며 이번 실행은 CPU 배속 제한을 적용하지 않았다. 실제 iOS/Android/Safari나 저사양 물리 기기 검증으로 간주하지 않는다.
- 실제 배포 빌드도 별도 루프백 Cloudflare 서버에서 실행했다. 게스트 싱글에서 구매→준비→매칭→쇼다운→다음 경기 확인. 인앱 브라우저와 독립 Chrome의 두 게스트 좌석으로 private room을 생성해 R1 세 경기 및 R2 진행을 확인했다. 실제 서버/WebSocket 및 로컬 Worker 번들을 포함하며 관찰한 두 멀티 탭의 error 로그는 0개였다.
- 검사 중 발견한 harness의 비동기 이벤트 겹침은 서버의 직렬 처리와 같게 수정했다. p1이 탈락한 fixture, 잘못된 viewport 및 수정 전 harness 기록은 최종 합격 표본에서 제외했다. 원시 최종 표본은 별도 JSON에 보존한다.

## 측정 결과

최종 18개 표본에서 첫 PREP→다음 단계까지 로컬 3,632–3,736ms, 서버 시계 모드 4,236–4,320ms였다. 서버 모드는 기존 3,500ms 준비 시간에 700ms 전달 여유를 더한 값이다. 최대 40ms 계측 tick 간격은 103ms, 최대 long task는 75ms였다. 모든 표본이 COMPLETE에 도달했고 기록된 오류 및 가로 overflow는 없었다. 이는 해당 표본의 결과이며 60fps 유지나 실제 저사양 기기의 성능 보장을 뜻하지 않는다.

| Round | 화면 폭 | 모드 | PREP ms | 최대 tick 간격 ms | 최대 long task ms |
|---|---:|---|---:|---:|---:|
| R2 | 393 | local | 3658 | 66 | 0 |
| R2 | 393 | server-clock | 4242 | 73 | 0 |
| R2 | 1280 | local | 3736 | 103 | 75 |
| R2 | 1280 | server-clock | 4276 | 71 | 51 |
| R3 | 393 | local | 3649 | 63 | 0 |
| R3 | 393 | server-clock | 4320 | 69 | 0 |
| R4 | 393 | local | 3632 | 71 | 0 |
| R4 | 393 | server-clock | 4236 | 66 | 0 |
| R4 | 1280 | local | 3703 | 98 | 69 |
| R4 | 1280 | server-clock | 4243 | 78 | 0 |
| R5 | 393 | local | 3677 | 79 | 0 |
| R5 | 393 | server-clock | 4255 | 75 | 0 |
| R5 | 1280 | local | 3652 | 69 | 0 |
| R5 | 1280 | server-clock | 4283 | 72 | 0 |
| R6 | 393 | local | 3665 | 74 | 0 |
| R6 | 393 | server-clock | 4281 | 72 | 0 |
| R6 | 1280 | local | 3649 | 69 | 0 |
| R6 | 1280 | server-clock | 4276 | 58 | 0 |

`0` long task는 50ms 이상 작업이 관측되지 않았다는 뜻이다. 원본 phase 시퀀스와 승률/카드 수 기록: [측정 JSON](showdown-prep-timing-2026-10-15.json). 서로 다른 경기의 스크린샷: [R2 모바일 35% / 64%](assets/2026-10-15-r2-prep-mobile.png), [R2 PC 37% / 62%](assets/2026-10-15-r2-prep-desktop.png).

두 독립 게스트로 연결한 실제 private room에서는 R1 세 경기, R2 두 RUN과 다음 경기, R3 진입까지 관찰했다. 이는 위 server-clock 계측 fixture와 별개의 실제 빌드·Durable Object·WebSocket 확인이다.

## 남는 확인

- 이번 측정에서 재현된 계산 블로킹과 표시 시간 소비 경로를 수정했다. 운영 회선 단절, 브라우저/OS 강제 중단, 장시간 대규모 동시 방 부하까지 "절대 정지 없음"을 증명한 것은 아니다.
- 물리 모바일 및 운영 장시간 관찰은 기존 RELEASE 항목에 남긴다. 실제 Google 로그인 ranked solo는 이번 브라우저 검증에 포함하지 않았다. 같은 서버 타이밍 변경을 사용하지만 별도 인증 통합 검증으로 대체하지 않는다.
