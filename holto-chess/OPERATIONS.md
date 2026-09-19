# PORENA 운영 기록 — 2026-09-19

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
- 버그 제보 이메일: `wlghks1778@gmail.com`. 시작 화면의 링크는 메일 앱에서 제보 초안을 열며 자동 전송하지 않는다. 발생 시각, 방 코드, 기기/브라우저, 재현 방법을 안내하고 비밀번호·재접속 토큰은 요청하지 않는다.
- 사용자 결정: 영구 전적 보관 필요 여부, 100명 이상/장시간 시험 시점 및 유료 플랜 예산.
- 유료 구독, 영구 DB, 신규 외부 모니터링 서비스 가입은 하지 않았다.
- 롤백 전 게임 상태 호환성을 확인한다. Worker 롤백은 DB 상태와 위 도메인 규칙을 되돌리지 않는다.

공식 참고: [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[Traces](https://developers.cloudflare.com/workers/observability/traces/).
