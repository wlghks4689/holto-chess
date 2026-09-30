# PORENA 운영 기록 — 2026-09-19


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
