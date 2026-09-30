# 제보·문의 폼과 관리자 수신함 — 2026-09-30

## 요청과 결정

- 사용자 요청:
  - 시작 화면 최하단의 버그 제보 이메일 링크를 삭제한다.
  - `환경 설정` 아래에 `제보 · 문의하기` 버튼을 둔다.
  - 섹션별로 요청을 받고 500자로 제한한다.
  - 별도 로그인이 필요한 관리자 페이지에서 메일 수신함 형태로 확인한다.
  - 이후 로그인 시스템을 도입하면 같은 곳에서 유저 관리를 한다.
- 사용자 결정(질문 응답):
  - 관리자 주소: `admin.porena.kr`. 이미 보유한 `porena.kr`의 하위 도메인이라 도메인을 추가로 구매하지 않는다.
  - 로그인: 자체 아이디·비밀번호.
  - 후원: 지금은 문의 글만 받는다. 후원 링크는 준비되면 추가 요청한다.
  - 답장 연락처: 이메일을 선택 입력으로 받고 동의를 받는다.

## 구조

| 구분 | 위치 | 내용 |
| --- | --- | --- |
| 공용 규칙 | `src/shared/feedback.ts` | 분류 4종(`feedback` `bug` `inquiry` `support`), 500자(UTF-16, textarea `maxLength`와 같은 기준), 이메일 형식·동의 검증 |
| 플레이어 폼 | `src/ui/FeedbackDialog.tsx`, `feedback.css` | 시작 화면에서 열 때만 불러옴(지연 로드). 한국어·영어 |
| 제출 API | `POST /api/feedback` (`worker/feedback.ts`) | 같은 출처만 허용. IP당 분당 3건(`FEEDBACK_LIMITER`), 본문 4KB 제한. 스팸 방지용 숨김 필드(honeypot)는 저장하지 않고 성공처럼 응답 |
| 저장소 | D1 `porena-feedback` (`FEEDBACK_DB`), `migrations/0001_feedback.sql` | 분류, 내용, 선택 이메일, 언어, User-Agent(300자), 상태(`unread` `read` `archived`), 시각. **IP는 저장하지 않는다** |
| 관리자 페이지 | `admin.html`, `src/admin/*` | 받은편지함/보관함, 분류 필터와 안 읽은 수, 읽음 자동 표시, 읽지 않음·보관·복원·영구 삭제, 50건씩 더 보기. PC 3단, 모바일 목록↔본문 전환 |
| 관리자 API | `/api/admin/*` (`worker/admin.ts`) | `login` `logout` `session` `feedback`(GET 목록, PATCH 상태, DELETE) |
| 인증 | `worker/adminAuth.ts` | PBKDF2-SHA256 10만 회 해시, HMAC 서명 세션 쿠키 `__Host-porena_admin`(HttpOnly, Secure, SameSite=Strict, 12시간). 로그인은 IP당 분당 5회(`ADMIN_LOGIN_LIMITER`) |

### 도메인 분리

- `wrangler.jsonc`에 `admin.porena.kr` custom domain을 추가했다. 배포하면 Cloudflare가 DNS와 인증서를 자동으로 만든다.
- 정적 파일(`/assets/*`, 파비콘)을 뺀 모든 요청이 Worker를 먼저 거친다(`run_worker_first`). 그래서 관리자 도메인은 어떤 경로든 관리자 페이지만 보여 준다.
- `admin.porena.kr`:
  - 관리자 페이지와 `/api/admin/*`만 제공한다. 게임 API와 WebSocket은 404다.
  - 페이지 응답 헤더: `no-store`, `noindex`, CSP, `X-Frame-Options: DENY`.
- `porena.kr`: `/admin`과 `/api/admin/*`은 404로 숨긴다. 게임 동작과 캐시 헤더는 이전과 같다.
- 로컬 개발(`localhost`)에서는 `http://localhost:<포트>/admin`으로 관리자 페이지를 연다.

## 운영 배포 절차

순서가 중요하다. 1–2를 건너뛰고 배포하면 제출은 500 오류가 나고, 관리자 로그인은 "설정되지 않음"으로 표시된다.

1. 운영 DB 스키마 적용 (DB는 2026-09-30 생성 완료, id `26ec86c4-…`):

```bash
npx wrangler d1 migrations apply porena-feedback --remote
```

2. 코드 배포:

```bash
npm run build
```

```bash
npx wrangler deploy --keep-vars
```

3. 관리자 계정 설정은 **사용자가 직접** 한다. 비밀번호는 터미널에서만 입력하고 어디에도 평문으로 남기지 않는다.

```bash
node tools/admin/setup-admin.mjs
```

   - 아이디, 비밀번호(12자 이상), 확인을 입력하면 `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`이 `wrangler secret bulk`로 저장된다.
   - 다시 실행하면 계정이 바뀌고 기존 관리자 세션은 모두 로그아웃된다.
   - 로컬용은 `--local`을 붙인다. 이때는 git에서 제외된 `.dev.vars`에 저장한다.
4. 확인:
   - `https://admin.porena.kr` 로그인
   - `porena.kr`에서 제보 1건 제출 → 수신함에 표시 → 삭제
   - `https://porena.kr/admin`이 404인지

## 개인정보·보안 메모

- 이메일은 선택이며, 입력한 경우에만 동의 체크를 요구한다(서버에서도 검증).
- 동의 문구는 "답변에만 쓰고 문의 처리가 끝나면 삭제"다. 운영자가 답변 후 해당 메시지를 삭제해야 이 약속이 지켜진다. 자동 삭제는 아직 없다.
- 세션은 서버 상태가 없는 서명 쿠키다.
  - 로그아웃은 쿠키만 지운다.
  - 쿠키 유출이 의심되면 `setup-admin.mjs`를 다시 실행해 모든 세션을 무효화한다.
- 관리자 계정은 1개(Worker secret)다.

## 이후 확장

- 후원 링크: `feedback.hint.support` 문구와 폼에 링크를 추가한다.
- 유저 로그인 도입 시:
  - 관리자 메뉴의 `유저 관리`(현재 비활성) 자리에 화면을 붙인다.
  - 같은 D1에 `users` 테이블과 마이그레이션을 추가한다.
  - 관리자 계정도 그때 DB 기반(여러 관리자, 권한)으로 옮기는 것을 검토한다.

## 검증 (로컬, 2026-09-30)

- `npm test` 553/553, `npm run test:workers` 22/22.
  - 신규: 제출 검증, 허니팟, 출처 차단, 분당 제한, 관리자 로그인 실패, 위조 쿠키 4종, 목록·상태·삭제, 페이지 나눔, 세션 만료.
- 테스트에서 발견해 수정한 문제: 형식이 깨진 세션 쿠키가 500을 내던 것 → 401로 처리.
- `npm run build` 통과, `css-order-check` 통과.
  - 게임 CSS `index-CSaqMqwG.css`는 해시가 이전과 같다.
  - 게임 JS는 React를 관리자 페이지와 나눠 쓰는 공용 파일로 분리됐다. 초기 JS는 gzip 약 102KB → 104KB이고, 파일은 3개가 병렬로 로드된다.
- `npm run lint`: 기존 `OnlineApp.tsx:94` 오류 1건만 남는다(이번 변경과 무관).
- 브라우저(개발 서버):
  - 시작 화면: 메일 링크가 없고 버튼이 5개다. 1440×900, 1366×768, 1280×650, 1280×600, 390×844, 360×640에서 메뉴가 타이틀과 겹치거나 가로로 넘치지 않는다. 세로가 짧은 가로형 화면에서는 버튼 높이만 줄였다.
  - 제보 폼: 분류 전환, 글자 수 표시, 이메일 입력 시 동의 체크 요구, 제출 201, 네 번째 연속 제출 429, 영어 모바일 표시.
  - 관리자: 잘못된 비밀번호 거부, 로그인 후 3건 표시, 열면 읽음 처리, 보관 후 보관함 이동, 모바일 목록↔본문 전환. 세션 쿠키는 JS에서 읽을 수 없다.
- 프로덕션 빌드 미리보기(Host 헤더로 도메인 흉내):
  - 관리자 도메인의 `/`, `/foo`, `/admin`은 관리자 페이지와 보안 헤더를 반환한다.
  - 관리자 도메인의 `/api/rooms`는 404다.
  - `porena.kr/admin`과 `porena.kr/api/admin/session`은 404다.
  - 게임 `/`와 딥링크의 캐시 헤더, 정적 파일과 해시 JS의 immutable 헤더는 그대로다.
- 운영 배포와 실제 `admin.porena.kr` 접속은 아직 하지 않았다.
