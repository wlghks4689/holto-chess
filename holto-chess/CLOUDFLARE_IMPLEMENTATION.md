# Cloudflare 멀티플레이 기반 구현 보고서

## 2026-10-09 IDENTITY-002 main 통합

- 사용자 요청으로 `codex/profile-identity-002`의 최초 로그인 화면·닉네임 설정·입장 영상을 최신 main에 통합한다. 문서 충돌은 양쪽 기록을 보존해 해결했고 최신 게임 규칙·연결 오류 수정·인증 로그 쿼리 가림 설정을 유지했다.
- 계정의 공개 닉네임 저장과 방 좌석 연결에 맞춰 한·영 정책을 갱신했다. 아래 AUTH-GOOGLE-001 및 통합 검토 기록의 "계정과 좌석 분리"는 프로필 통합 이전 상태다. 계정별 영구 전적은 추가하지 않는다.
- 기존 nullable `users.display_name`을 사용하므로 신규 DB migration은 없다. main 푸시가 Cloudflare 자동 배포를 시작하며 실제 운영 로그인·닉네임 저장·입장 영상 확인은 배포 완료 후 수행해야 한다.
- 병합 결과 검증: 전체 앱 111개 파일 / 793개 테스트, Worker 10개 파일 / 108개 테스트, lint·앱/Worker 타입 검사·빌드 및 diff 공백 검사 통과.

## 2026-10-09 통합 검토 수정 — 운영 미배포

- `codex/auth-google-no-deploy`에 원격 main `a2924f6`을 병합했다. 아래 과거 기록의 미커밋·Client ID 빈 값 상태는 당시 기준이다.
- 비정상 WebSocket 종료 시 받은 예약 코드(1005/1006/1015)를 다시 전송하지 않는다. 종료 뒤 접속 상태 전송까지 실행되는 Worker 회귀 테스트를 추가했다.
- 재접속 티켓의 HTTP 상태를 보존한다. 404/410은 방 종료, 401은 세션 오류로 종료하며, 429/503과 네트워크 오류는 기존 제한 재시도를 유지한다.
- 한국어·영어 정책 초안에 선택적 Google 로그인, 실제 저장 항목, 계정과 게임 좌석의 분리, 세션 30일·인증 흐름 10분, 계정 삭제 요청과 쿠키를 반영했다. 소스 시행일은 2026-10-09이며 실제 공개 전 기존 약관의 사전 고지 규칙에 맞춰 최종 시행일을 확정해야 한다.
- 계정 삭제는 문의 접수·본인 확인 후 운영자가 `users`의 해당 계정을 삭제하는 절차다. `oauth_accounts`와 `sessions`는 외래키 `ON DELETE CASCADE`로 함께 삭제된다(기존 D1 테스트로 확인). UUID나 이메일 주장만으로 계정을 삭제하지 않으며, 인증 토큰·Google Secret을 문의·채팅에 붙이지 않는다. 게스트 게임 좌석은 별도 보존 규칙을 따른다.
- 로컬에서 이미 검증한 공개 Google Client ID를 운영 소스 설정에 반영했다. Secret 값은 조회·기록·변경하지 않았다. 운영 Secret 이름 조회 결과는 ADMIN 관련 3개뿐이며 `GOOGLE_CLIENT_SECRET`은 아직 없다.
- 앱·Worker 타입 검사, build, 전체 lint, 업로드 없는 Wrangler 4.132.0 dry-run 통과. 생성된 배포 설정에 `ACCOUNT_DB`, 운영 AUTH_ORIGIN, 공개 Client ID 및 `observability.redact_query_string=true`가 보존됐다.
- 통합 Worker 9개 파일 / 80개 테스트 통과. 테스트 풀의 Wrangler 4.124.0은 쿼리 가림 설정을 지원하지 않으므로 이 테스트가 실제 로그 가림을 검증했다고 간주하지 않는다.
- 통합 게임·포커·네트워크·정책 54개 파일 / 470개 테스트 통과(`--maxWorkers=2`) — 5·6라운드 × 사람 2/4/8명 시간 초과 완주, R5 공개 데이터, 카드·미래 보드 공개 경계와 새 연결 오류 회귀 포함.
- 운영 공개 전: Google Console의 운영 callback URI 확인 → Secret 등록을 포함한 승인된 배포 → 로그인·새로고침 유지·로그아웃·동일 계정 재로그인 → 운영 callback 로그·trace에 code/state 쿼리가 남지 않는지 확인. 운영 배포·Secret 등록을 수행하지 않았다.

## IDENTITY-002 — 계정 프로필·GameRoom 연결 (2026-10-08, 미배포)

- 최신 `origin/main` `83273da`에 기존 `codex/auth-google-no-deploy` `5201e83`을 통합한 `codex/profile-identity-002`에서 구현했다. Auth 자체는 기존 구현을 재사용한다.
- `PATCH /api/profile`은 HttpOnly 계정 세션, same-origin, 제한된 JSON body, 유니코드 닉네임 1~8자 및 제어문자 거부를 검증하고 본인의 `users.display_name`만 수정한다. 기존 nullable 컬럼을 사용하므로 신규 migration은 없다.
- 신규 방 생성·참가에서만 계정 세션을 조회한다. Worker는 외부 내부용 identity 헤더를 제거하고 검증된 UUID와 percent-encoded 공개 닉네임을 DO에 전달한다. Cookie와 Authorization은 내부 요청에서 제거한다.
- Room session의 optional `accountUserId`와 game player.name을 저장한다. 계정 좌석의 클라이언트 JOIN nickname은 무시하며, 같은 계정의 두 번째 신규 좌석은 409로 차단한다.
- 공개 게임 payload에 계정 ID를 넣지 않는다. 방 token 재접속·connection ticket·rematch는 계정 세션과 독립적으로 유지한다. 이름은 방 입장 당시 값을 보존하고 프로필 변경은 다음 신규 입장에 반영한다.
- 첫 화면은 Google/Guest 선택 후 메뉴를 노출한다. 계정 닉네임이 없으면 설정을 먼저 요구하며, 로그인 로비 닉네임은 읽기 전용이다. Guest 닉네임 저장 및 임베디드 Guest 입장은 유지한다.
- 최신 6라운드 규칙은 변경하지 않는다. Rank 점수·영구 전적·Leaderboard는 미구현이다.
- 이번 작업에서 원격 DB 변경이나 운영 배포는 하지 않았다. 실제 Google 브라우저 로그인 대신 mocked OIDC/D1/DO 자동화와 개발용 UI fixture를 검증한다.

상세 결정과 검증: [DECISIONS](../product_doc/DECISIONS.md), [IDENTITY-002 QA](../product_doc/qa/2026-10-08-profile-identity-002.md).

## AUTH-GOOGLE-001 — 계정 기반 추가 (2026-10-07, 미배포)

이 절은 AUTH-GOOGLE-001 당시 계정 구현 기록이다. 프로필과 GameRoom 연결은 위 IDENTITY-002 절이 현재 상태다. **이후 2026-09-16 본문은 당시 멀티플레이 구현 기록**이며, 그 안의 “계정/OAuth/D1 계정 DB 없음”은 이 변경 전 상태다.

### 기준과 범위

- 작업 시작 `main`: `38e78364417011876fab4fc46c700bd97ce426b9` → fetch 후 최신 `019615db4e7bcc16130b59a292919188f13c80c5`로 fast-forward. 명세에 적힌 이전 SHA로 되돌리지 않았다.
- 기존 미추적 `.wrangler-config/`, `product_doc/IA.md`, 과거 QA handoff, `varco-export/`는 보존했다.
- 승인된 외부 변경: 새 `porena-account` D1 생성 및 초기 schema 적용만 수행. commit / push / 운영 Worker 배포 / Google 자격증명 등록은 하지 않았다.
- 계정 UUID만 구축. 랭킹, 프로필, 닉네임, Kakao, 계정 연결, GameRoom ↔ userId는 미구현이다. 로그인은 플레이 조건이 아니다.

### DB / 설정

| 항목 | 내용 |
| --- | --- |
| Worker / Cloudflare account | `porena` / `0a1102b704cf75e79300017e1904fe7e` |
| 새 DB / 지역 힌트 | `porena-account` / APAC |
| DB ID / binding | `e4eedbce-2157-4823-b840-eec1017d4f60` / `ACCOUNT_DB` |
| migration | `account-migrations/0001_accounts.sql` — 기존 feedback migration과 별도 |
| `users` | 독립 UUID, nullable display_name, 생성/마지막 로그인 시각, status |
| `oauth_accounts` | `(provider, provider_subject)` PK, user FK + CASCADE, user index |
| `sessions` | 256-bit random token의 SHA-256 digest만 저장, user FK + CASCADE, user/expiry index |
| `oauth_flows` | state digest, browser binding digest, nonce, 임시 PKCE verifier, 고정 callback URI, 생성/만료, expiry index |
| 공개 config | `AUTH_ORIGIN=https://porena.kr`, `GOOGLE_CLIENT_ID`는 아직 빈 값 |
| 비밀 config | `GOOGLE_CLIENT_SECRET` Worker Secret; 로컬 `.dev.vars`는 기존 ignore 적용. 별도 session 서명 secret은 불필요 |

local migration 적용 후 테스트를 통과하고 remote migration을 적용했다. 원격 read-only 확인: 네 테이블 존재, 사용자 0명, foreign_key_check 오류 0건. 기존 `FEEDBACK_DB`와 운영 데이터는 수정하지 않았다. `ACCOUNT_DB`는 소스·dry-run에 연결됐으며 **운영 Worker에는 아직 배포되지 않았다**.

### 인증과 보안

| API | 동작 |
| --- | --- |
| GET `/api/auth/google/start` | random state/nonce/browser cookie + S256 PKCE 생성, 10분 flow 저장 후 Google로 302 |
| GET `/api/auth/google/callback` | browser-bound state를 `DELETE RETURNING`으로 1회 소비 → 서버 code 교환 → ID token 검증 → 계정/세션 저장 → `/` |
| GET `/api/auth/me` | 익명 `{authenticated:false}`, 로그인 `{authenticated:true,user:{id,displayName}}`만 반환 |
| POST `/api/auth/logout` | same-Origin 필수, DB 세션 삭제와 쿠키 만료. 반복 호출도 성공 |

- `jose@6.2.12`로 Google JWKS RS256 서명, issuer(두 공식 값), audience, exp, 필수 iat/sub/nonce와 nonce 일치 검증. multi-audience의 azp도 검증한다. JWT decode만으로 신뢰하지 않는다.
- Google scope `openid profile`; 저장하는 외부 식별자는 Google `sub`뿐. 이메일, 이름, 사진, access/refresh/ID token은 저장하지 않는다. display_name은 신규 계정에서 null이다.
- Google callback URI는 신뢰한 `AUTH_ORIGIN`에서만 결정한다. 클라이언트의 redirect_uri/returnTo는 사용하지 않는다. 요청 origin도 설정값과 같아야 한다.
- callback만 외부 top-level redirect를 허용한다. 다른 auth API는 외부 Origin / cross-site를 거절한다. 기존 Discord·관리자·게임 Origin 정책은 유지한다.
- 유효하게 매칭한 flow는 성공·실패에 관계없이 소비한다. 잘못된 state 또는 다른 브라우저는 정당한 flow를 소비할 수 없다. 미사용 flow는 10분 뒤 무효이며 이후 시작 요청/일일 Cron에서 삭제한다.
- 첫 로그인 `users` 조건부 INSERT + provider mapping INSERT를 D1 batch transaction으로 묶어 동시 로그인 시 중복·고아 계정을 방지한다. 재로그인은 기존 UUID와 last_login_at만 갱신한다.
- 공통 `readPorenaSession`은 해시 조회, 만료, active status를 검증하고 내부 provider 정보를 반환하지 않는다. 재로그인은 해당 브라우저의 이전 세션을 교체한다.
- 초기 세션 TTL **30일(고정 만료, sliding 갱신 없음)**, flow TTL **10분**. `worker/auth.ts`의 상수 한 곳에서 관리한다. 별도 제품 승인이 확정된 영구 정책으로 간주하지 않는다.
- 쿠키: HTTPS `__Host-porena_session` / `__Host-porena_oauth`, HttpOnly, Secure, SameSite=Lax, Path=/, Domain 없음. 명시한 localhost HTTP에서는 Secure·__Host- 접두사만 생략한다.
- auth 응답은 no-store / no-referrer. 실패 callback은 `/?auth=failed`만 반환하고 UI는 일반 오류 안내 후 query를 제거한다. token/code/exception/Google 응답 전문을 console에 기록하지 않는다.
- `observability.redact_query_string=true`: 자동 요청 로그·trace에도 callback code/state 쿼리를 남기지 않도록 설정. 최종 운영 로그 가림 여부는 배포 후 확인할 것.
- start/callback 전용 `AUTH_LIMITER` 10회/60초/IP. 게임·관리자 제한 예산과 분리했다.
- 기존 일일 Cron에 만료 sessions/flows 정리를 추가했다. users/oauth_accounts는 자동 삭제하지 않는다. 계정 탈퇴·보존 정책은 공개 전 사용자 결정이 필요하다.

### UI / 개발 실행

시작 화면 상단에 Google 로그인 / 로그인됨 / 로그아웃을 추가했다. 기존 시작하기·싱글·멀티·길라잡이를 유지하며 계정 조회 실패로 게임을 막지 않는다. Discord 및 iframe에서는 계정 UI를 표시하지 않고 기존 게스트 흐름을 유지한다.

브라우저 확인에 사용한 실제 로컬 환경은 **http://localhost:8787**이다. 루트 저장소가 아닌 `holto-chess/`에서 실행한다:

```powershell
npm run build
npx wrangler d1 migrations apply porena-account --local
npx wrangler dev --persist-to .wrangler/state --port 8787 --local-upstream localhost:8787 --upstream-protocol http --var AUTH_ORIGIN:http://localhost:8787
```

`--local-upstream` / `--upstream-protocol`은 Wrangler가 로컬 요청 URL을 운영 route로 치환하는 것을 방지한다. `--persist-to .wrangler/state`는 migration과 같은 로컬 DB를 사용하고 빌드 출력 폴더 내부에 DB를 만들지 않게 한다. 포트나 `localhost`/`127.0.0.1`을 섞으면 Origin·callback·쿠키가 맞지 않으므로 위 URL을 일관되게 사용한다. 일반 Vite `npm run dev`를 사용할 경우 실제 포트에 맞춰 AUTH_ORIGIN과 Google redirect를 함께 변경한다. frontend-only `dev:local`은 인증 API 검증용이 아니다.

### 사용자 Google Console Gate

1. Google Cloud Console → Google Auth Platform에서 앱의 Branding / Audience / Data Access를 설정한다. 외부 앱 테스트 모드이면 본인 계정을 테스트 사용자로 등록한다. 웹사이트·개인정보처리방침·약관 주소는 실제 서비스 주소를 사용한다.
2. OAuth Client를 **Web application**으로 생성한다. Authorized redirect URIs 두 개를 정확히 등록한다:
   - `https://porena.kr/api/auth/google/callback`
   - `http://localhost:8787/api/auth/google/callback`
3. `GOOGLE_CLIENT_ID`는 공개값이므로 운영 `wrangler.jsonc` vars에 설정할 수 있다. 로컬은 `holto-chess/.dev.vars`에 아래 이름으로 직접 입력한다. **실제 Secret을 채팅·문서·Git에 넣지 않는다.** 기존 .dev.vars가 있으면 다른 설정을 보존하며 항목만 추가한다.

```dotenv
AUTH_ORIGIN=http://localhost:8787
GOOGLE_CLIENT_ID=<Console에서 받은 Client ID>
GOOGLE_CLIENT_SECRET=<Console에서 받은 Secret — 본인이 로컬에 직접 입력>
```

4. 서버를 재시작하고 Google 계정 선택 → callback → 로그인 표시 → 새로고침 유지 → logout → 같은 계정 재로그인을 확인한다. `/api/auth/me` true/false와 D1 users 1개 유지도 확인한다.
5. 운영 Secret은 별도 배포 승인 뒤 `npx wrangler secret put GOOGLE_CLIENT_SECRET`로 직접 입력한다. **이 명령은 새 Worker 버전을 즉시 배포하므로 지금 실행하지 않는다.** 미배포 버전에만 넣어야 한다면 승인된 릴리스 절차에서 `wrangler versions secret put`을 사용한다.

### 검증 기록 / 남은 확인

#### 2026-10-08 실제 Google 로컬 검증

- 아래 2026-10-07 자격증명 대기 기록의 후속 확인: Google Cloud 프로젝트 `wide-origin-510106-m4`에 `PORENA Web` 생성. 지원 이메일 1778 계정, 개발자 연락처 4689 계정으로 저장. 사용자가 직접 ignored `.dev.vars`에 자격증명을 설정했다. 운영 vars/Secret에는 아직 미등록.
- `http://localhost:8787` 실제 Google 계정 로그인 성공, 새로고침 로그인 유지, 로그아웃 및 새로고침 익명 유지, 재로그인 성공. 로컬 DB users/oauth_accounts/sessions 각 1건. 성공 화면 `artifacts/auth-google/google-login-success.jpg`(ignored).
- 실패 원인: workerd fetch는 `redirect: "error"`를 지원하지 않음. `manual`로 변경하고 비-2xx 거부를 유지. 모의 fetch에 runtime 제약 및 token endpoint 302 거부 회귀를 추가했다. 수정 전 정상 로그인 관련 6개 테스트 실패를 확인했다. 보안 state/nonce/PKCE/JWT 검증은 변경하지 않았다.
- build(frontend/Worker 타입 검사 포함) 통과. 전체 Worker 최초 실행 74/74 통과하나 종료 시 기존 RPC teardown 경고. 기본 병렬 전체 UI 실행 758 통과/기존 openDraft 30초 timeout 1건으로 제한 병렬 재검증. lint는 이번에 수정하지 않은 `src/ui/ShowdownPrepPanel.test.ts:18`의 `no-useless-escape` 1건으로 실패; 통과로 간주하지 않는다.
- 운영 로그인, 실제 모바일 브라우저, 정책·탈퇴·보존, 운영 로그 query 가림은 미검증. 테스트 풀 Wrangler는 `redact_query_string` 미지원 경고를 출력하므로 운영 가림은 설정만으로 완료라고 간주하지 않는다. commit/push/deploy 미수행.
- 최종 제한 병렬 전체 재실행: 게임/UI 107 files / 759 tests, Worker 8 files / 75 tests 통과(302 거부 회귀 포함). 변경 인증 코드·테스트 대상 eslint와 `git diff --check` 통과. 전체 lint의 위 기존 오류는 그대로 남김.

- 신규 Worker 테스트: `tests/worker/auth.test.ts` 31개. 실제 D1 migration/PK/FK/CASCADE, OAuth 시작/고정 redirect/PKCE, 외부 Google endpoint 모의 응답에 실제 RSA 서명 검증, 잘못된 state/cookie/TTL/replay/서명/issuer/audience/nonce/exp/azp/필수 claim, 신규·재로그인·동시 최초 로그인, 세션 해시/쿠키/만료/비활성 계정/logout/Origin/rate limit/Cron.
- UI 회귀: 계정 상태 로딩 중에도 게스트 시작·길라잡이 버튼 유지.
- 전체 게임/UI: `npm test -- --maxWorkers=2` **107 files / 757 tests 통과**. 최초 기본 병렬 실행은 기존 `openDraft.test.ts`의 8-seed 시뮬레이션 한 건이 30초 timeout(755 pass/1 fail); 병렬 수만 낮춘 전체 재실행에서 통과했다. 테스트 제한 시간이나 게임 로직은 변경하지 않았다.
- 전체 Worker: `npm run test:workers -- --maxWorkers=2` **8 files / 74 tests 통과**(신규 31개 포함). 기본 병렬 실행에서는 기존 GameRoom `webSocketClose(1006)` 런타임 경고가 보였고, 제한 병렬 최종 실행에서는 테스트 실패 없이 완료됐다. 해당 GameRoom 코드는 이번에 변경하지 않았다.
- `npm run lint`, `npm run build`(생성 Env + frontend/Worker TypeScript 검사 포함), `npx wrangler deploy --dry-run`, `git diff --check` 통과. 빌드 QA 중 열린 로컬 Worker가 dist 내부 DB를 잠가 한 차례 EPERM이 발생했고 서버 종료 및 별도 persist 경로로 해결 후 build/dry-run 재통과.
- 테스트 풀 내부 Wrangler 4.124.0은 새 `redact_query_string` 옵션에 경고한다. 실제 프로젝트 Wrangler 4.132.0과 Vite 최종 build/dry-run은 해당 옵션을 인식하며 `dist/porena/wrangler.json`에 true가 보존됨을 확인했다. 실제 자격증명 누락 경고는 예상 상태이며 테스트는 가짜 자격증명과 Google 모의 응답을 사용한다.
- 로컬 브라우저: `http://localhost:8787`에서 Google 로그인 링크, 익명 `/api/auth/me` 200, 게스트 싱글의 R1 안내/Ability Draft 진입 확인. 실패 안내는 안전한 문구로 표시되고 query가 제거됨을 확인했다. 마지막 오류 안내 상태 수정 후 UI 테스트와 lint도 재통과했다. 스크린샷은 로컬 ignored `artifacts/auth-google/start-screen.jpg`. 실제 Google 로그인·로그아웃 UI 상태 전환과 실기기 검증은 아래 Gate에 남는다.
- 실제 Google 자격증명 미설정: Google 계정 선택·실제 token 교환·새로고침 세션 유지·재로그인 중복 여부의 **실브라우저 E2E는 미검증**이다. 모의 테스트를 실제 Google 검증으로 간주하지 않는다.
- 공개 전 gate: 기존 `/privacy`, `/terms`의 “계정 없음” 문구 개정, 계정 데이터 보존·탈퇴 처리·Google 제공 정보 설명 및 시행일 결정. 법적 정책을 임의 확정하지 않고 현재 공개 문구는 보존했다.
- 설치 시 audit 요약은 high 7건이며, 별도 `npm audit --omit=dev`에는 기존 `source-map-js@1.2.1` high advisory 1건이 남아 있다(원래 HEAD에도 동일 버전). 이번에 추가한 jose는 해당 경고 대상이 아니다. 범위 밖 강제 업데이트는 하지 않았다.

### 공식 근거

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [실제 discovery와 S256 지원](https://accounts.google.com/.well-known/openid-configuration)
- [jose](https://github.com/panva/jose), [D1 batch transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Secrets — 즉시 배포와 versions 차이](https://developers.cloudflare.com/workers/configuration/secrets/), [로그·trace query redaction](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)

### 변경 파일

| 구분 | 파일(앱 폴더 기준, product_doc은 저장소 루트) |
| --- | --- |
| 계정 DB·설정 | `account-migrations/0001_accounts.sql`, `wrangler.jsonc` |
| 서버 | `worker/auth.ts`, `worker/index.ts` |
| UI·번역 | `src/ui/AccountLogin.tsx`, `src/ui/StartScreen.tsx`, `src/ui/start-screen.css`, `src/i18n/locales/ko-KR.ts`, `src/i18n/locales/en-US.ts` |
| 테스트 | `tests/worker/auth.test.ts`, `tests/worker/applyMigrations.ts`, `vitest.workers.config.ts`, `src/ui/AccountLogin.test.ts` |
| 의존성 | `package.json`, `package-lock.json` — jose 추가, 기존 패키지 버전 변경 없음 |
| 기록 | `CLOUDFLARE_IMPLEMENTATION.md`, `OPERATIONS.md`, `product_doc/DECISIONS.md`, `product_doc/TODO.md` |

---

검증일: 2026-09-16. 기존 기준 커밋: `70b357a`. 실제 배포 및 Git commit/push는 수행하지 않았다.

## 1. 기존 구조 분석

- React + TypeScript + Vite SPA. 기존 `tsc -b && vite build`, Vitest, ESLint 구성을 확장했다.
- `src/ui/App.tsx`의 React state가 전체 `PorenaGameState`를 소유했다. ShopPanel, PlayerStrip, MatchCard, FinalPanel 등이 원장과 플레이어 배열을 직접 읽었다.
- `src/game/engine.ts`는 React와 분리되어 있었고, 상태를 복제해 액션을 적용한다. 따라서 재작성하지 않고 서버에서도 호출한다.
- Card Ledger는 52개의 AVAILABLE / RESERVED_IN_SHOP / OWNED 엔트리다. 상점은 전역 풀에서 카드를 예약하며, 판매·리롤·탈락 시 반환한다.
- `core/poker`는 족보/키커/BEST 5/Omaha 평가를 담당한다. `showdownDeck.ts`는 매치 참가자의 모든 소유 카드를 제외한 임시 덱을 생성한다.
- R1~R5와 8→8→6→6→4→4 생존 구조는 유지한다. 온라인 방은 인간 2~8명이 참여하고 빈 좌석은 AI로 채우는 8좌석 게임이다. 순수 2인 토너먼트 규칙은 새로 만들지 않았다.
- 기존 AI는 구매 가능한 높은 랭크를 우선한다. `prepareShowdown`에 humanIds를 주입해 온라인 인간 좌석을 AI가 대신 구매하지 않게 했다.
- 기존 게임은 localStorage에 의존하지 않았다. 새 UI는 sessionStorage에 임시 방 세션만 저장하며 GameState는 저장하지 않는다.
- 기존 RNG는 seed 기반 xorshift다. 로컬/단위 테스트는 이 경로를 유지한다. 실제 GameRoom은 `randomMode: secure`로 모든 랜덤 추출에 Workers Web Crypto를 사용한다. seed와 모드는 payload에 포함하지 않는다.

## 2. 패키지와 공식 설정

- `@cloudflare/vite-plugin`: 1.54.10
- `wrangler`: 4.132.0
- `@cloudflare/vitest-pool-workers`: 0.22.0
- 설치된 Vite 8.3.0, Vitest 4.1.11과 빌드/테스트 호환을 확인했다.
- 테스트 패키지가 포함한 workerd의 지원 날짜를 고려해 앱과 테스트 모두 `compatibility_date: 2026-08-15`를 사용한다. 최신 날짜를 기계적으로 지정하지 않았다.
- 테스트 도구의 간접 `sharp` 취약점을 수정 버전 `^0.35.4` override로 제한했다. 설치 후 npm audit 0건. 강제 다운그레이드나 `audit fix --force`는 사용하지 않았다.

기준 문서:

- [Cloudflare Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [React + Vite / Workers Static Assets](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Durable Object class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Workers test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)

## 3. 설정 파일

| 파일 | 역할 |
| --- | --- |
| `vite.config.ts` | React + Cloudflare 플러그인, 로컬 workerd와 frontend 동시 실행 |
| `vite.local.config.ts` | 선택적인 기존 Vite-only 개발 모드 |
| `wrangler.jsonc` | Worker entry, Static Assets, GameRoom binding, SQLite exports |
| `tsconfig.worker.json` | DOM 대신 생성된 Workers runtime 타입으로 서버 코드 검사 |
| `vitest.config.ts` | 순수 게임/room/projection 테스트 |
| `vitest.workers.config.ts` | 실제 Workers 런타임 통합 테스트 |
| `package.json` / lockfile | 개발·빌드·테스트·배포 명령 및 버전 잠금 |
| `.gitignore` | `.wrangler`, generated types, env/dev vars, 산출물 제외 |

`npm run cf-typegen`으로 `worker-configuration.d.ts`를 생성한다. Vite build는 `dist/client`와 `dist/holto_chess`를 만들고 Wrangler의 배포 설정을 이 산출물로 연결한다.

## 4–8. Worker, GameRoom, binding, endpoint, 방 생성

`worker/index.ts`는 방 코드에 해당하는 `GAME_ROOM.getByName('room:' + roomId)`로 요청을 전달한다. 게임 상태는 Worker 전역에 두지 않는다.

| Endpoint | 기능 |
| --- | --- |
| `GET /api/health` | 런타임 확인 |
| `POST /api/rooms` | 무작위 6자리 방 생성 및 첫 세션 발급 |
| `POST /api/rooms/:roomId/join` | 대기 중인 방에 새 세션 발급, 최대 8명 |
| `GET /ws/rooms/:roomId` | WebSocket upgrade, 첫 JOIN_ROOM 프레임으로 인증 |

외부에는 위 경로만 노출한다. DO 내부 `/internal/*` 경로는 Worker router가 만들어 전달한다. 방 생성 충돌은 최대 5회 다시 생성하며, 없는 방 입장이 새 게임을 만들지는 않는다. HTTP mutation과 WebSocket upgrade는 same-origin 검사로 제한한다.

```json
{
  "durable_objects": {
    "bindings": [{ "name": "GAME_ROOM", "class_name": "GameRoom" }]
  },
  "exports": {
    "GameRoom": { "type": "durable-object", "storage": "sqlite" }
  }
}
```

새 namespace에 현재 공식 `exports` 선언을 사용했다. Pages/Workers Sites, D1, 외부 KV/R2/Redis/PostgreSQL은 추가하지 않았다.

## 9. 세션 및 서버 액션

- 서버가 좌석 `p1`~`p8`과 256-bit 임시 reconnect token을 발급한다. 같은 `p1`이어도 방이 다르면 다른 세션이다.
- 브라우저 sessionStorage에는 `{roomId, playerId, token}`만 저장한다. 새 탭은 새 세션이고, 같은 탭의 새로고침은 기존 세션을 복원한다. 탭 복제 기능은 브라우저에 따라 sessionStorage를 복사할 수 있으므로 별도 새 탭에서 입장한다.
- 서버 snapshot에는 토큰 원문 대신 SHA-256 hash만 저장한다. 토큰은 URL/로그/PlayerView에 넣지 않고 첫 JOIN_ROOM 프레임으로 전달한다. 실제 배포에서는 HTTPS/WSS를 사용한다.
- 이후 action의 주체는 WebSocket attachment의 playerId에서 결정한다. client가 playerId, BB, winner 등을 명령에 덧붙이면 runtime parser가 거부한다.
- `ClientMessage`와 `ServerMessage`는 discriminated union이며 JSON shape와 길이도 검사한다.
- 액션마다 phase, round/turnKey, 생존 여부, 준비 확정 여부, 소유/예약 원장, BB, 구매 횟수와 보유 한도를 검증한다.
- 세션당 최근 64개의 성공 requestId를 snapshot에 저장해 재전송을 중복 실행하지 않는다. phase가 바뀐 오래된 명령도 거부한다. 64개를 넘긴 장기 replay 저장소는 아니다.
- 인간 모두가 READY 하면 시작한다. 각 인간의 END_SHOP_PHASE를 기다린 다음 기존 엔진을 호출한다. 이후 화면 단계는 생존 인간의 READY 합의로 전환한다.
- 서버 WebSocket 액션은 짧은 `blockConcurrencyWhile` 범위 안에서 순서대로 검증/저장한다. 저장에 실패하면 후보 상태를 공개하지 않는다.

## 10. PlayerView sanitization

`src/game/playerView.ts`의 `createPlayerView`가 명시적인 허용 필드만 구성한다.

- `me`: 본인의 보유 카드, 상점·가격, 선택 카드.
- `players`: ID, 이름, BB, 승점, 생존/준비/연결 상태.
- GameState, Card Ledger, session/hash, RNG, 원본 로그는 포함하지 않는다. 원본 로그에는 구매 카드 ID가 들어 있으므로 전달하지 않는다.
- 쇼다운 결과를 공개하는 phase에서만 본인이 참가한 현재 매치를 보낸다. 다른 매치의 카드나 사전 생성 보드는 보내지 않는다.
- R1은 출전 2장, R2는 선택 2장, R3/R4는 출전 카드, R5는 결과 BEST 5만 공개한다. R2 미선택 카드는 공개하지 않는다.
- 매치 결과에 공개 카드 ID를 당시 시점의 snapshot으로 남겨 탈락 시 원장으로 반환한 카드도 결과에 표시할 수 있다.
- 보드별 족보·순위는 해당 보드에 붙여 표시한다. 최종 매치 승자와 특정 보드의 족보를 혼동하지 않게 했다.
- 기존 매치별 임시 덱 규칙은 그대로다. 다른 매치의 카드나 예약 카드가 보드 카드로 등장할 수 있는 것은 의도된 규칙이며 소유권 노출과 다르다.

## 11–12. Persistence / Hibernation

`worker/GameRoom.ts`가 SQLite-backed DO storage의 key-value API에 `snapshot:v1`을 저장한다. 이것은 별도 Cloudflare KV binding이 아니다.

snapshot에는 schema version, 전체 게임, 인간 세션 해시, phase 준비/확정 상태, requestId 중복 방지 기록을 함께 저장한다. 기존 snapshot의 폐지된 규칙 필드는 복원 시 제거하고, 해당 선택 단계는 다음 라운드 단계로 이행한다. 생성, 입장, 모든 성공 액션과 phase 전환 후 저장이 완료되어야 새 PlayerView를 broadcast한다.

constructor는 `blockConcurrencyWhile` 안에서 snapshot을 읽는다. WebSocket은 `ctx.acceptWebSocket`과 `webSocketMessage/Close/Error`를 사용한다. attachment에는 roomId, playerId, 연결 시각만 저장한다. 카드·토큰을 저장하지 않는다. wake-up 시 `ctx.getWebSockets()`와 attachment로 연결을 복원한다.

미인증 소켓은 15초 뒤 DO alarm으로 정리한다. 상시 setInterval은 없다. 방당 연결 수와 frame 크기는 제한한다. 실제 hibernation eviction 및 socket 유지 테스트를 통과했다.

## 13. UI / 로컬 엔진 재사용

- ONLINE 화면은 `PlayerView`만 렌더링한다. 엔진을 실행해 결과를 추정하지 않는다.
- 기존 `App.tsx`, CardView, styles를 유지하고 LOCAL / DEV simulation에서 원래 8인 로컬 게임을 사용할 수 있다. 이 모드의 8인은 사람 1명 + 기존 AI 7명이다.
- 평가기, 카드풀, 가격, 리롤, 상점 잠금, 매치별 덱, 승패 판정, 보상, 탈락, 다음 라운드 수입은 동일 엔진을 호출한다.
- 온라인 랜덤은 서버 Web Crypto이고 로컬 seed 주입은 유지한다. 완전한 replay 시스템은 없다.
- 안전한 계산 한도를 위해 Sudden Death 256회에 도달하면 액션 전체를 거부한다. 임의 승자·보상으로 대체하지 않는다.

## 14–15. 검증 결과

| 확인 | 결과 |
| --- | --- |
| 기존 포커/덱/엔진 15개 테스트 | 통과 |
| 추가 순수 room/projection 테스트 8개 | 통과: 총 단위 테스트 23개 |
| Workers 런타임 통합 테스트 3개 | 통과 |
| 2명·3명·8명 인간 좌석의 R1~R5 진행 | seeded 엔진 테스트 통과, 생존 8→8→6→6→4→4 유지 |
| 다른 방/개인별 payload | 실제 Workers WebSocket 테스트 통과 |
| 상대 상점 구매, 위조 playerId/BB, phase/구매 한도 | 거부 확인 |
| 동시에 두 사용자가 구매 | 둘 다 각각 한 번 저장되는지 확인 |
| 저장 후 DO eviction | snapshot 복원 확인 |
| hibernation 후 기존 소켓 명령 | attachment 복원 확인 |
| 끊고 같은 token으로 재접속 | 같은 좌석/BB/카드 복원 확인 |
| requestId 재전송 | 중복 구매/차감 없음 |
| Cloudflare 개발 서버 | `npm run dev`, workerd+Vite 정상 실행 |
| 실제 두 탭 | 독립 sessionStorage로 같은 방 p1/p2 입장, 다른 상점, 양쪽 구매, 준비 장벽, 쇼다운 확인 |
| 실제 브라우저 재접속 | 버튼/새로고침 후 좌석, 카드, BB 유지 |
| 브라우저 수신 payload | 개발 전용 수신 프레임 로그에서 상대 카드 ID 미포함 확인 |
| 모바일 | 390px viewport에서 결과 화면 screenshot 확인, 문서 가로 넘침 없음 |
| 로컬 모드 | 기존 화면·구매·쇼다운 진입 확인 |
| TypeScript / production build / ESLint | 통과 |
| Wrangler deploy dry-run | ASSETS/GAME_ROOM 바인딩과 업로드 산출물 검증 통과 |
| 실제 Cloudflare 배포 | 수행하지 않음 |

브라우저 확인에 사용한 개발 방 `9PCXPC`의 R1: p1은 9♦와 T♥ 구매, p2는 4♣와 8♠ 구매. 각자의 수신 JSON은 상대 소유/상점 배열을 포함하지 않았다. 이 방은 로컬 개발용이다.

Network inspector의 GUI 패널 자체는 자동화 도구에서 열지 않았다. 동일한 WebSocket 수신 프레임을 `?inspect=1`의 개발 전용 console 로그로 검사하고, Workers 통합 테스트에서 raw JSON도 검증했다. 사용자가 Network 탭에서 재확인할 절차는 아래에 있다. production bundle에는 개발 로그가 포함되지 않는다.

## 16–17. 사용자 설정 / 실행 / 배포

실제 프로젝트 폴더는 바깥 폴더 안의 `holto-chess`다.

```powershell
cd "C:\Users\PC21\Documents\ChatGPT\holto-chess\holto-chess"
npm ci
npm run dev
```

Cloudflare 로그인 없이 로컬 workerd에서 개발할 수 있다. 두 개의 독립 탭에서 `http://127.0.0.1:5173`을 열어 Create Room / Join Room, 양쪽 READY 순으로 진행한다. 일반 Vite-only 로컬 실험은 `npm run dev:local` 후 LOCAL 모드를 선택한다. Vite-only 서버는 온라인 API를 제공하지 않는다.

```powershell
npm test
npm run test:workers
npm run build
npm run lint
npx wrangler deploy --dry-run
```

실제 배포 시 사용자 작업:

1. Cloudflare 계정을 준비하고 Workers 이용이 가능한 계정을 선택한다.
2. 아래 `wrangler login`의 브라우저 인증을 본인이 완료한다.
3. `wrangler whoami`로 대상 계정을 확인한다. 여러 계정이면 의도한 계정을 `account_id`로 Wrangler 설정에 지정한다.
4. 동일 계정에 기존 `porena` Worker가 있다면 덮어쓰기 전에 확인하고 필요하면 `name`을 바꾼다.
5. `npm run deploy`를 실행한다. 최초 배포에서 exports 선언에 따라 SQLite GameRoom namespace가 생성된다. Dashboard에서 DB/DO를 수동 생성할 필요가 없다.
6. 배포 결과의 workers.dev 주소에서 두 브라우저를 확인한다. custom domain이 필요하면 해당 Worker의 Settings → Domains & Routes에서 추가한다. 이는 선택 사항이다.

```powershell
npx wrangler login
npx wrangler whoami
npm run deploy
```

현재 앱에는 `.env`, `.dev.vars`, Wrangler secret이나 외부 API credential이 필요하지 않다. Cloudflare 인증은 Wrangler가 관리한다. 자격증명은 코드에 넣지 않는다. 향후 인증 시스템/환경변수를 추가할 때 용도에 맞게 secret을 별도로 구성한다.

Network 탭 수동 확인:

1. 두 브라우저에서 DevTools → Network → WS를 켠다.
2. `/ws/rooms/<code>`의 Messages를 열고 `PLAYER_VIEW`를 확인한다.
3. p1의 `me`만 p1 ownedCards/shopCards를 갖는지, players에 p2 카드 배열이 없는지 확인한다. p2에서도 반대로 확인한다.
4. SHOP phase에서는 matches가 비어 있고 seed/ledger/logs/session hash가 없는지 확인한다.
5. 재접속 후 playerId와 구매 후 BB가 같은지 확인한다. JOIN_ROOM 프레임에는 본인의 임시 인증 토큰이 있으므로 Network 전체를 외부에 공유하지 않는다.

## 18. 현재 미구현/제한

- 회원가입·로그인·OAuth, MMR/랭킹/친구/매치메이킹, 채팅, 관전자 입장, 영구 전적, 결제, D1 계정 DB는 없다.
- 실제 8개 브라우저의 부하/지연/장시간 안정성은 검증하지 않았다. 8명은 순수 엔진 테스트로 검증했다.
- turn timer, 끊긴 사용자의 자동 READY/기권/AI 대체가 없다. 생존 사용자가 연결을 끊으면 재접속할 때까지 해당 barrier가 기다린다.
- 임시 세션은 만료·회전·계정 복구가 없다. sessionStorage를 지우거나 탭을 닫으면 token을 잃는다. 좌석 반환/방장 강퇴/방 삭제/방 수명 정책은 후속 작업이다.
- 외부 공개 서비스용 rate limiting, 악용 방지, room 생성 quota, 운영 관측/경보는 없다.
- 기존 규칙상 구매 횟수를 모두 쓰고 카드를 팔거나 리롤로 BB를 소진하면 필요한 보유 수를 채울 수 없어 진행이 막힐 수 있다. 이번에 무료 카드·환불·자동 탈락 같은 규칙을 임의 추가하지 않았다. 정책 확정이 필요하다.
- 실제 Cloudflare 계정의 리소스 생성, custom domain, 원격 배포·원격 hibernation·네트워크 단절 환경 테스트는 미수행이다.
- 로컬 프로토타입의 모든 기존 UX/밸런스 문제를 해결한 작업은 아니다.

## 19. 다음 단계

1. 소규모 비공개 Cloudflare 배포에서 두 실제 기기의 WSS/재접속을 확인한다.
2. 사용자 확정 규칙에 따라 Ready timeout, disconnect 처리, 세션/방 만료, 상점 진행 불가 상황을 정한다.
3. 2~8인 로비의 좌석 변경/퇴장/방장 기능과 8브라우저 통합·부하 테스트를 추가한다.
4. 공개 테스트 전에 요청 제한/운영 로그/오류 관측과 임시 token 수명 정책을 보강한다.
5. 이후 계정/전적/랭크를 별도 시스템으로 설계한다.
