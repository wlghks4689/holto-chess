# IDENTITY-002 구현 및 검증 — 2026-10-08

## 기준과 범위

- 시작 로컬 branch / HEAD: `main` / `c1c6a9981ee435c04faededcc81743d87e30308d`.
- fetch로 확인한 최신 `origin/main`: `83273da5be61de48084f97b1072ef63253526a93`.
- 기존 Google 구현: `origin/codex/auth-google-no-deploy`, `5201e838ff9689549053e35e4f3d9c1cc7130736`. `worker/auth.ts`, `account-migrations/0001_accounts.sql`, `ACCOUNT_DB` 설정을 재사용했다.
- 구현 branch: `codex/profile-identity-002`. 최신 main을 기준으로 Auth branch를 merge한 기준 commit은 `e834dca`다. R5 hand/equity 수정과 최신 room diagnostics/rate-limit 수정도 포함한다.
- 사용자 승인: profile identity 작업과 첫 화면 Google/Guest 선택 구조. 로컬 OAuth 설정이 없는 상태에서는 자동화 테스트와 화면 검증까지만 수행.
- 이번 작업에서 운영 배포, 원격 DB 변경, Rank 지급, 현재 구현 변경의 commit/push는 하지 않았다. 기존 미추적 `assets/`, `product_doc/crowdfunding/`은 유지했다.

## 동작

`Google OAuth → D1 users.id → 공개 display_name → Worker 검증 → Room session.accountUserId + pN → game player.name`으로 연결한다.

- `PATCH /api/profile`: 인증된 본인만 수정. same-origin·CSRF 검사, 요청 제한, JSON body 검사, UPDATE 시 세션 만료/비활성 여부 재검사. 기존 nullable `display_name`을 사용해 migration 추가 없음.
- 닉네임: 앞뒤 공백 trim, Unicode 문자/숫자/공백/_/- 1~8 code points, 제어문자·HTML 거부, 전역 중복 허용. Google 실명·이메일 자동 공개 없음.
- 최초 화면: Google/Guest 선택 후 게임 메뉴가 나타난다. 닉네임 없는 계정은 설정 먼저. 유효한 계정 세션 또는 탭의 Guest 선택이 있으면 메뉴 재사용. 계정 ID는 브라우저 영구 저장소에 쓰지 않는다.
- 계정 로비는 D1 닉네임을 읽기 전용으로 표시하고 Guest는 기존 localStorage 닉네임을 사용한다. 신규 좌석 전에 상태 재검사하며 계정 만료·변경·조회 실패는 Guest 입장으로 바뀌지 않는다. 임베디드 Guest는 기존 Guest 방 경로를 유지한다.
- Worker는 외부 identity 주장 헤더를 제거하고 검증된 값만 내부 헤더로 전달한다. 한글 이름은 percent encoding, Cookie/Authorization은 전달하지 않는다.
- Room session의 optional 계정 UUID와 기존 player name을 저장한다. snapshot schema와 방 token은 유지한다. 계정 좌석의 `JOIN_ROOM.nickname`은 무시한다.
- 같은 계정의 두 번째 신규 좌석은 departed 좌석을 포함해 409. 기존 방 token 복구는 별도 경로. Guest 선택 뒤 계정 cookie가 생긴 경쟁 상태도 409로 거부한다.
- 계정 닉네임 수정은 다음 신규 입장에 적용한다. 현재 방·재접속·리매치에서는 입장 당시 이름과 계정 연결을 유지한다.
- 내부 `accountUserIdForPlayer(room, playerId)`로 최종 순위와 UUID를 연결할 수 있다. 공개 PlayerView/MatchView/방 응답/WS 메시지/로그/URL에는 추가하지 않는다.

## 자동화 검증

| 검증 | 결과 |
|---|---|
| 일반 전체 `npm test -- --maxWorkers=2` | 107파일 / 764개 중 762개 통과, 기존 계산 테스트 2개는 기본 30초 제한 초과; 아래 별도 재검증 통과 |
| Worker 전체 `npm run test:workers` | 10파일 / 104개 통과 |
| 마지막 Guest/account 경쟁 조건 변경 후 `profileIdentity.test.ts --maxWorkers=1` | 1파일 / 28개 통과; 최종 Worker 총 test 수 105개 |
| 프런트 계정 UI `AccountLogin.test.ts` | 6개 통과 |
| `npm run lint` | 통과 |
| `npm run build` | 통과; 앱/Worker TypeScript 및 Vite 번들 포함 |
| `npx wrangler deploy --dry-run` | 통과; 실제 배포 없음 |
| `git diff --check` | 통과 |

Worker 검증은 native workerd 실행 권한과 임시 `XDG_CONFIG_HOME`으로 수행했다. sandbox에서는 시작 시 `cloudflare:test-internal` 오류가 있어 의존성 변경 없이 승인된 로컬 실행으로 해결했다. 의도된 `serverDiagnostics` projection 오류 출력은 해당 회귀 테스트가 검증하는 상황이며 suite는 통과했다.

Profile/identity 테스트는 인증/만료/비활성/CSRF/Unicode/동명이인, 실제 mocked OIDC 재로그인 닉네임 유지, D1 장애, 내부 헤더 위조, JOIN nickname 위조, 공개 payload 개인정보 제외, 동시 중복 입장, 로그아웃·DO eviction 후 connection ticket 재접속, rematch, 기존 Guest snapshot을 포함한다.

일반 전체 suite는 949.32초 후 종료했다. 105파일 통과, 시간 초과가 포함된 2파일 실패로 최초 실행 exit code는 1이다. assert 불일치는 없고 아래 시간 초과 재검증으로 전체 항목을 확인했다. 최신 6라운드 suite도 포함한다.

일반 suite의 기본 30초 제한에서 `openDraft`의 추천 RUN 배치 테스트와 `releaseAudit`의 2인 timeout 게임 테스트가 시간 초과됐다. 같은 머신의 별도 checkout에서 jobs 8 + jobs 3 balance simulator가 동시 실행 중이며, 테스트 fork의 CPU 누적값이 계속 증가하는 것을 확인했다. 다른 작업은 중단하지 않았다. 해당 두 이름만 `--maxWorkers=1 --testTimeout=120000`으로 재실행한 결과 2파일/3개 테스트가 통과했다(5/6라운드 동명 사례 포함). openDraft 43.66초, releaseAudit 두 사례 합계 59.51초. 제한 시간만 명령행 옵션으로 늘렸으며 게임/테스트 코드는 변경하지 않았다.

## 내장 브라우저 화면 검증

실제 StartScreen/ProfileForm/MultiplayerLobby를 사용하는 개발 전용 `/account-preview` fixture에서 확인했다. 계정 저장은 fixture 메모리 상태 변경이며 실제 OAuth/DB 저장으로 주장하지 않는다. 서버 저장·Room 연결은 위 Worker 통합 테스트에서 확인했다.

- 1440×900: Google/Guest 선택만 표시, 선택 후 게임 메뉴 노출, 최초 닉네임 저장, 프로필 변경, 계정 로비 읽기 전용 닉네임 확인.
- 393×852: 두 로그인 버튼 315×54px, 중앙 배치, 문서 폭 393px로 가로 넘침 없음. Guest 선택 후 시작/튜토리얼/설명/설정/문의 메뉴 표시.
- 393×852: 최초 닉네임 9자 입력은 저장 비활성, 8자 입력은 저장 가능, 저장 후 메뉴와 공개 이름 표시.
- 360×780: 8자 계정 이름·닉네임 변경·로그아웃 사이 겹침 없음. 계정 로비 input readOnly=true, 가로 넘침 없음.
- 관련 화면 console error/warn 없음. 임시 viewport override는 검증 후 해제했다.
- 화면 서버: `http://127.0.0.1:5175/account-preview?case=choice`. 프런트 전용 로컬 서버이며 실제 Google 인증 서버가 아니다. 미리보기 case: choice/profile/account/guest/lobby/embedded.

추가로 빌드된 UI와 실제 로컬 Worker를 `http://127.0.0.1:8787/`에서 연결했다. `/api/auth/me`가 200 anonymous를 반환하는 환경에서 Guest 선택 → 게임 메뉴 → 멀티 로비 → 닉네임 `게스트확인` 입력 → 방 생성 → `연결됨` 및 참가자 1/8을 확인했다. 새로고침 후 최근 참여 방의 다시 참가 버튼으로 같은 좌석과 이름이 복구됐다. 검증 후 로비로 돌아와 로그인 선택 첫 화면을 열어 두었다. 실제 빌드의 1440×900 / 393×852 화면도 확인했으며 모바일 문서 폭은 393px였다.

로컬 서버 명령은 `npx wrangler dev --ip 127.0.0.1 --port 8787 --var AUTH_ORIGIN:http://127.0.0.1:8787 --local-upstream 127.0.0.1:8787 --upstream-protocol http`다. 임시 XDG config를 사용하며 모든 binding은 local이다. Wrangler route의 production hostname 치환이 로컬 AUTH_ORIGIN과 충돌하지 않도록 upstream을 명시했다. Guest 확인에 D1 migration은 필요하지 않았다. 이 서버에서도 실제 Google 자격증명은 설정하지 않았다.

## 수정 파일

- 서버/공유: `worker/auth.ts`, `worker/index.ts`, `worker/GameRoom.ts`, 새 `worker/roomIdentity.ts`, `src/game/room.ts`, 새 `src/shared/nickname.ts`.
- UI: `AccountLogin.tsx`, 새 `AccountProvider.tsx`, `accountState.ts`, `useAccount.ts`, `AccountPreview.tsx`, `ModeApp.tsx`, `StartScreen.tsx`, `OnlineApp.tsx`, `OnlineLobby.tsx`, `start-screen.css`, ko-KR/en-US locale.
- 테스트: `AccountLogin.test.ts`, 새 `tests/worker/profileIdentity.test.ts`, 기존 `tests/worker/auth.test.ts`; 전체 lint에서 발견한 `ShowdownPrepPanel.test.ts`의 불필요한 regex escape 1개만 동작 변화 없이 제거.
- 문서: `DECISIONS.md`, `CLOUDFLARE_IMPLEMENTATION.md`, 본 QA.

## 남은 확인 / 다음 단계

- 실제 Google OAuth 브라우저 왕복, 실제 계정 두 브라우저 플레이는 사용자 선택에 따라 이번 검증에서 제외했다. 배포 전 실제 설정 환경에서 최종 확인해야 한다.
- Rank 데이터 설계에 필요한 서버 계정·좌석 매핑은 준비됐다. `rank_profiles`, `rank_events`, 멱등 지급, 시즌/등급/Leaderboard는 별도 후속 작업이다.
- 방 token을 잃은 계정의 다른 기기 좌석 복구는 범위 밖이다. 같은 방 중복 계정 정책은 현재 409 차단으로 구현돼 있다.
- Google credentials/운영 로그 redaction 최종 상태 등 AUTH-GOOGLE-001의 운영 환경 확인 항목은 이번 로컬 UI 검증으로 대체되지 않는다.
