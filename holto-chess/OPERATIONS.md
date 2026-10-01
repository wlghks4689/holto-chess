# PORENA 운영 기록 — 2026-09-19

## 2026-10-01 드래프트 공개 시간(3.5초) 운영 배포

- 사용자 요청:
  - R4 드래프트에서 마지막 선택 직후 바로 다음 단계로 넘어가 선택 결과를 확인할 수 없었다.
  - 마지막 선택 뒤 3~4초 공개 후 진행하도록 요청했다. R2 드래프트도 같은 구조라 함께 적용했다.
- 배포 소스: `4990542`. 운영 버전: `41c23777-87ca-4dde-8084-4ae6f96bf317`. 직전(롤백 기준): `dcff7b85-9d19-47bb-90bf-fad0e98c460c`.
- 동작:
  - 마지막 선택 후 3.5초(`BARRIER_TIMEOUT_MS.DRAFT_REVEAL`) 동안 드래프트 화면을 유지하고, 모든 선택과 소유자를 표시한다.
  - "모든 선택 완료 · 잠시 후 상점/RUN 배치로 이동합니다"를 표시한다.
  - 서버 시계로만 종료하며 그동안 행동할 수 없다.
  - 상점 60초는 공개 종료 뒤부터 계산한다.
  - 싱글 플레이도 같다. 튜토리얼·미리보기·시뮬레이터는 기존처럼 즉시 진행한다.
- 검증:
  - 테스트 577/577(신규 4개), Worker 22/22, 린트, 빌드 통과.
  - 운영 번들 4개가 로컬 빌드와 일치하고, 드래프트 문구가 포함된 엔트리 JS를 확인했다.
  - 직전 번들 파일명은 404(P0 동작 유지). `admin.porena.kr` 200.
- 실제 8인 멀티플레이로 R4까지 진행한 확인은 하지 않았다(서버 룸 테스트와 화면 렌더 테스트로 확인).

## 2026-10-01 P0: 배포 후 옛 JS 조각이 HTML로 1년 캐시되던 문제 수정 배포

- 사용자 승인: 출시 전 점검 보고([qa/2026-10-01-launch-readiness-review.md](../product_doc/qa/2026-10-01-launch-readiness-review.md))의 P0 즉시 수정·배포.
- 문제(운영 재현):
  - 이전 빌드의 `/assets/*.js` 파일명을 요청하면 SPA 대체로 `index.html`(200 text/html)이 왔다.
  - 그 응답에 `_headers`의 1년 immutable 캐시가 붙고 엣지에도 캐시됐다(HIT).
  - 배포 전에 연 탭이 지연 로드 화면에 들어가면 화면이 멈춘다.
  - 원인은 2026-09-30 에셋 최적화의 캐시 규칙과 SPA 대체 설정의 결합이다.
- 수정 `f235e6a`:
  - `not_found_handling: none`
  - Worker가 페이지 이동에만 앱 셸을 제공하고, 없는 파일은 `404 + no-store`로 응답한다.
  - `/assets/` 루트의 번들 JS·CSS는 Worker를 경유한다. `_headers`가 404에도 immutable을 붙이기 때문이다. 미디어 폴더는 직접 제공한다.
  - 클라이언트는 `vite:preloadError` 시 1회 새로고침하고, 60초 안에 반복되지 않게 막는다.
- 배포: 운영 버전 `dcff7b85-9d19-47bb-90bf-fad0e98c460c`. 직전(롤백 기준): `0a393383-afb7-4119-ac78-9ce400bf6ce3`.
  - 미승인 작업(드래프트 공개 3.5초)은 stash로 빼고 배포했다.
- 운영 확인:
  - 엣지에 HTML로 캐시돼 있던 옛 파일명 3개와 임의의 없는 CSS가 모두 `404 text/plain, no-store`로 응답한다(별도 캐시 퍼지 불필요).
  - 현재 번들 4개는 200 immutable이고, 내용이 로컬 빌드와 바이트 단위로 일치한다.
  - 미디어는 기존처럼 재검증 캐시로 제공된다.
  - `/`, 딥링크, `/api/health`, www 301, `porena.kr/admin` 404, `admin.porena.kr` 모두 정상이다.
  - 브라우저에서 시작 화면, 게임 설명, 제보 폼을 지연 로드했고 모두 200이었다. 콘솔 오류 0.
- 영향: 번들 JS·CSS 요청도 Worker 요청으로 집계된다(무료 플랜 일일 10만 요청 한도). 브라우저가 1년 캐시하므로 재방문 시에는 늘지 않는다.

## 2026-09-30 어빌리티 카드 뒷면(상세 효과) 및 건축가 개명 운영 배포

- 사용자 승인: 카드 확대 창의 뒤집기 연출과 뒷면 상세 효과, Codex 작업(아키텍트 → 건축가 개명, 아이콘 교체) 확인 후 커밋·푸시·배포 요청.
- 배포 소스: `e17d7be` (origin/main). Codex `5b53f59`·`837ef28` 위에 Claude 변경을 합쳤다.
  - `ko-KR.ts` 충돌 1건: 포식자 뒷면 문구와 건축가 이름을 둘 다 유지했다.
- 운영 버전: `54926afe-0053-45a9-90d1-b0d07480026c`. 직전(롤백 기준): `8319ea1c-af87-4243-874b-363026a4368c`(Codex 배포).
- 반영:
  - 확대 카드를 누르면 3D 회전으로 뒷면 전환. 12종 뒷면에 판정 기준과 예외를 넣었다.
  - 독주자·쿼드 코어의 "?" 툴팁을 제거했다. 앞면 설명은 그대로다.
- 검증:
  - 테스트 554/554, Worker 22/22, 빌드와 CSS 순서 점검 통과. 린트는 기존 `OnlineApp.tsx:94` 1건만 남았다.
  - 운영 `/api/health` ok. 엔트리 JS·CSS와 `architect.webp`의 운영 SHA256이 로컬 빌드와 일치하고, 엔트리 JS에 건축가·뒤집기 문구가 포함됐다. `admin.porena.kr` 200.
- 운영 전체 게임 완주·실기기 확인은 이번 배포에서 수행하지 않음(로컬 게임의 어빌리티 선택 창에서 뒤집기를 확인함).

## 2026-09-30 제보·문의 폼과 관리자 수신함(admin.porena.kr) 운영 배포

- 사용자 승인: 시작 화면 버그 제보 이메일 삭제, 제보·문의 폼과 별도 로그인 관리자 페이지 추가 후 커밋·푸시·배포 요청.
- 배포 소스: `05f8fae` (origin/main). 상세 [2026-09-30-feedback-admin.md](../product_doc/qa/2026-09-30-feedback-admin.md).
- 신규 리소스:
  - D1 `porena-feedback`(APAC, `26ec86c4-3904-4eab-8a76-09e3261757dc`): 마이그레이션 `0001_feedback.sql`을 `--remote`로 적용.
  - Rate limit `FEEDBACK_LIMITER`(3/60s), `ADMIN_LOGIN_LIMITER`(5/60s).
  - custom domain `admin.porena.kr`: 인증서가 자동으로 발급됨.
- 관리자 secret 3종은 사용자가 `tools/admin/setup-admin.mjs`로 직접 설정했다(비밀번호는 Claude가 보거나 입력하지 않음).
  - `secrets.required` 때문에 secret이 없으면 배포가 거부된다. 첫 배포 시도는 이 이유로 중단됐고 운영은 영향이 없었다.
  - secret을 등록하면서 이전 코드 + secret 버전 `af93b285`가 생성됐다.
- 운영 버전: `1b57e5f1-b709-4141-a496-4c1c33b0a241`. 롤백 기준: 코드 기준 `09a43716-36ea-4e03-8071-722ff217c090`(secret 포함 `af93b285`).
  - 롤백해도 D1 데이터와 `admin.porena.kr` 도메인은 남는다.
- 운영 확인:
  - `porena.kr`:
    - `/api/health` ok. JS 3개와 CSS의 운영 SHA256이 로컬 빌드와 일치하고, 해시 JS는 immutable.
    - 이메일 링크 0건, 메뉴 5개. `/admin`과 `/api/admin/*`는 404, 딥링크 200, www 301.
  - `admin.porena.kr`:
    - 관리자 로그인 화면이 CSP 적용 상태로 렌더링된다. no-store, noindex, DENY 헤더가 붙는다.
    - 게임 API는 404다. 잘못된 로그인과 위조 쿠키는 401이다.
    - Cloudflare Web Analytics 자동 삽입 스크립트는 CSP로 차단된다(의도).
  - 제출 API:
    - 잘못된 분류 400, 교차 출처 403. 허니팟은 201이지만 저장되지 않는다.
    - 브라우저 제출은 201이고 한글이 UTF-8로 저장된다.
    - 확인용 테스트 2행은 삭제했다(현재 0행).
- 관리자 실제 로그인·수신함 조작은 사용자 계정이라 Claude가 운영에서 수행하지 않았다(로컬에서 검증).


## 2026-09-30 정적 에셋 최적화 운영 배포 및 히스토리 정리 반영

- 사용자 승인: 에셋 최적화·.audit 히스토리 정리 후 운영 배포 요청.
- 배포 소스: `f9963b3` (origin/main, 히스토리 정리 후). 파일 트리는 정리 전 main과 동일. 상세 [2026-09-30-history-rewrite.md](../product_doc/qa/2026-09-30-history-rewrite.md).
- Worker `porena`, 기존 계정/도메인/바인딩 유지. 운영 버전: `09a43716-36ea-4e03-8071-722ff217c090`. 직전(롤백 기준): `88d112bb-fba1-402f-b234-c1f06458830a`.
- 반영: 어빌리티·배경 WebP, 족보 사운드 MP3, 공개된 어빌리티만 로드, 사운드 필요 시점 로드, OnlineApp 지연 로드, `public/_headers`(해시 JS/CSS 1년 immutable). 게임 규칙/서버 코드 변경 없음. 상세 [2026-09-30-asset-optimization.md](../product_doc/qa/2026-09-30-asset-optimization.md).
- 검증: 클린 빌드, `css-order-check` 통과, dry-run 통과, `wrangler deploy --keep-vars`.
- 운영 `/` 및 `/api/health` HTTP 200, health ok=true. JS `index-BDDrtJhl.js`, CSS `index-CSaqMqwG.css` 및 신규 WebP/MP3의 운영 SHA256이 로컬 빌드와 일치.
- 운영 헤더: 해시 JS `Cache-Control: public, max-age=31536000, immutable` 적용 확인. HTML·미디어는 `max-age=0, must-revalidate` 유지.
- 운영 브라우저 확인(Desktop 1440×900, Mobile 390×844, 싱글 플레이 매치 로딩까지): 페이지 오류 0, 시작 화면의 게임 전용 미디어 요청 0, 어빌리티 9파일(프레임+배정 8장)만 요청, 매치 배경 PC/모바일 이미지 정상, 구 PNG/WAV 요청 0.
- 운영 전체 게임 완주·부하 시험은 이번 배포에서 수행하지 않음(로컬 프로덕션 빌드로 R1~GAME_RESULT 완주 검증함).
## 2026-09-29 게임 설명 리뉴얼 및 어빌리티 후속 배포

- 사용자 승인: 전체 커밋·origin 푸시 후 운영 배포, Claude의 게임 설명 리뉴얼 포함.
- 배포 소스: `48973988dc4eea5f025ef93208f1a9a04faa2928` (origin/main). 원격 `42e11dc` 게임 설명 리뉴얼과 `70bd2ae` 시뮬레이터 변경 위에 UI 변경을 rebase하여 통합.
- Worker `porena`, 기존 계정 및 `porena.kr`/`www.porena.kr` 유지. 운영 버전: `b45ebf2d-7ce4-4202-b395-c2f906a5226b`.
- 반영: 초보자 가이드·규칙서 분리, 어빌리티 썸네일 이름 축소/구분선 위 배치, 이름·닉네임 고딕, 닉네임 위치 이동(장식 박스 없음), 미사용 SVG 2개 및 구형 프레임 PNG 제거. 이전 커밋의 쿼드 코어·독주자도 포함.
- 검증: 타입 검사/운영 빌드/dry-run 통과. 가이드·어빌리티 관련 테스트 12개, 시뮬레이터 테스트 8개 통과. `wrangler deploy --keep-vars`로 기존 변수 보존.
- 운영 `/` 및 `/api/health` HTTP 200, health ok=true. JS `index-CMHSch1k.js`, CSS `index-CGeXi6gS.css`, 가이드 JS/CSS의 운영 SHA256과 로컬 빌드 일치. 운영 게임 설명 선택 화면 및 초보자 가이드/규칙서 전환 확인.
- 운영 전체 게임 완주·부하 시험은 이번 배포에서 수행하지 않음.

## 2026-09-29 어빌리티 아트워크 후속 운영 배포

- 사용자 승인: 커밋·origin 푸시·운영 배포까지 진행 요청.
- 변경 커밋: `bc08198b32f6dab6839a8e858af8e084fe98d315` (origin/main 푸시 완료).
- Worker `porena`, 기존 계정/도메인/바인딩 유지. 배포 버전: `8b21dd73-deb0-4883-a060-dfb4073f450a`.
- 변경: 프레임/아이콘 동시 공개, 공용 중심 정렬, 아키텍트/왕가의 혈통 PNG, 모바일 4×3(실제 10칸+장식 2칸), 공개 문구 및 글꼴. 게임 규칙/서버 코드 변경 없음.
- 관련 테스트 14개 및 lint 통과. 최종 빌드와 dry-run 통과. Wrangler 4.132.0으로 기존 Vite 출력 빌드를 배포하고 `--keep-vars`로 대시보드 변수 보존.
- 배포 소스와 Git 저장소의 추적된 배포 입력 257개 및 신규 이미지/공용 컴포넌트 일치 확인.
- 운영 `/` 및 `/api/health` HTTP 200, health ok=true. 새 JS `index-Dktq3bj-.js`, CSS `index-CNqqMjhd.css` 반영.
- 새 이미지 2개와 JS/CSS 파일의 운영 응답 SHA256이 로컬 배포 빌드와 일치. 운영 전체 게임 완주/부하 테스트는 하지 않았다.
- 공식 명령/설정 참고: https://developers.cloudflare.com/workers/wrangler/commands/workers/ 및 https://developers.cloudflare.com/workers/wrangler/configuration/.

## 운영 대상

- 공식 계정: `0a1102b704cf75e79300017e1904fe7e`
- Worker: `porena`; HTTPS: https://porena.kr
- 운영 보강 배포: `67edd442-bb4f-4e93-8c0a-4129d2920957`
- 이전 배포(롤백 참고): `bc8b402e-9880-47d4-97b9-6abf17ee7e39`
- Workers 소스는 이 폴더. 게임 규칙이나 밸런스를 이번 운영 보강에서 변경하지 않았다.

## 적용한 보호 및 비용 절감

- `/api/*`, `/ws/*`만 Worker 우선 실행. 페이지/이미지/스크립트는 Assets 직접 제공.
- **아래 두 도메인 규칙은 대시보드 설정이며 Wrangler에 포함되지 않는다. 복구 시 반드시 유지한다.**
  - `PORENA www to apex HTTPS`: `*://www.porena.kr/*` → `https://porena.kr/${2}`, 301, query 보존.
    규칙 ID `720ff4be530147be9d02af85e839cc33`.
  - `PORENA HTTP to HTTPS`: `http://porena.kr/*` → `https://porena.kr/${1}`, 301, query 보존.
    규칙 ID `2add5c913a0844249736ea7cda006efe`.
- 방 생성 IP당 분당 10회, 기타 게임 API/연결 IP당 분당 120회. 429에 Retry-After 60초.
  Cloudflare 위치별 근사 제한으로 전 세계 엄격 합산 또는 완전한 DDoS 차단은 아니다.
  계정이 없는 서비스라 IP 기반으로 선택했으며 학교/PC방 등 공유 IP에서 오탐 가능성을 관찰해야 한다.
- 로그 활성화, 추적 1% 샘플링. 저장 실패에 토큰/닉네임/IP/게임 패 없이 식별용 방 코드와 revision만 기록.
- 동일 시각의 알람 재설정 쓰기 생략. 기존 유휴 연결 방식과 방 24시간 만료 유지.
- 시간당 기본 접속/TLS/리다이렉트 읽기 전용 점검 자동화 `porena` 생성.
  정상 유지 시 알리지 않고 장애/복구 등 의미 있는 변경만 알림. 이 앱 기반 점검은 독립적인 24시간 외부 감시 SLA가 아니다.

## 실제 운영 주소 자동 플레이 결과

| 동시 연결 | 방 | 완료 명령 | 소요 | 응답 중앙값 | 응답 p95 | 최대 |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | 2 × 8 | 416 | 58초 | 137ms | 180ms | 397ms |
| 40 | 5 × 8 | 1,040 | 60초 | 133ms | 167ms | 270ms |

모든 방 R1–R5 완료, 방당 한 플레이어 재접속, 모든 클라이언트 최종 순위 일치.
스크립트는 같은 컴퓨터에서 실행되는 WebSocket 가상 플레이어이며 실제 40대 브라우저/모바일 렌더링 검증이 아니다.
각 방의 행동은 순서대로, 여러 방은 병렬 실행. 준비가 끝나는 시점이 달라 정확히 동시 시작하는 스트레스 시험은 아니다.
응답 시간은 한국 실행 PC→서버→상태 수신, 10ms 폴링 포함. 약 1분의 짧은 정상 흐름 확인이지 최대 수용량 또는 24시간 40명 보장이 아니다.
시험 방 7개는 기존 24시간 만료 정책으로 정리된다. 시험 토큰은 저장하거나 출력하지 않는다.

## 재검증 방법

이 폴더에서 `npm ci`, `npm run test:workers`, `npm test -- --testTimeout=15000`, `npm run lint`, `npm run build`.
배포는 현재 계정과 대상을 먼저 확인하고 `npx wrangler deploy --dry-run`, `npx wrangler deploy`.
도메인 규칙을 먼저 준비한 뒤 선택적 Worker 경로 설정을 배포한다.

프로토콜 시험: `node tools/operations/smoke.mjs` (기본 localhost:8787).
운영 주소는 `PORENA_TEST_ORIGIN=https://porena.kr`와 명시적 `--production`이 모두 필요하다.
`PORENA_TEST_ROOMS` 기본 2, 최대 5; `PORENA_TEST_PLAYERS` 기본/최대 8.
시험은 실제 방을 생성하고 할당량을 소비하므로 반복 실행하지 않는다. `ws`는 현재 lockfile의 설치된 의존성을 사용한다.

## 복구 및 남은 사용자 결정

- 2026-09-19 14:24 KST 소스/설정/테스트/빌드 로컬 백업:
  `../operations-backups/porena-operations-20260919-142414.zip`
  SHA256: `7C18D0EC2448ABBD35FA0B5C11E3CED019CBD35DEE3EC70AA5BC0588D7FA8673`.
  이 문서는 백업 이후 작성됨. 백업의 dist는 위 배포 빌드이며 source는 백업 시점 작업 폴더 스냅샷이다.
- GitHub 저장: 사용자가 현재 변경 전체의 commit/push를 승인함. 생성 파일·의존성 캐시·로컬 백업은 제외한다.
- 사용자: Cloudflare/GitHub/가비아 2단계 인증 및 복구 코드 보관, 도메인 갱신.
- 제보·문의: 2026-09-30부터 시작 화면의 **제보 · 문의하기**로 받는다(공개 이메일 링크 제거). 내용은 D1 `porena-feedback`에 저장되고 `admin.porena.kr` 관리자 수신함에서만 본다. 설정·운영 절차: [2026-09-30-feedback-admin.md](../product_doc/qa/2026-09-30-feedback-admin.md).
- 사용자 결정: 영구 전적 보관 필요 여부, 100명 이상/장시간 시험 시점 및 유료 플랜 예산.
- 유료 구독, 영구 DB, 신규 외부 모니터링 서비스 가입은 하지 않았다.
- 롤백 전 게임 상태 호환성을 확인한다. Worker 롤백은 DB 상태와 위 도메인 규칙을 되돌리지 않는다.

공식 참고: [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[Traces](https://developers.cloudflare.com/workers/observability/traces/).
