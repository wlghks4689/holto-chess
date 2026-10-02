# PORENA Discord Activity — Compatibility Spike 보고서

- 작성: 2026-10-02 · 작업 브랜치 `claude/zen-edison-cxisk1`
- **기준 커밋(BASE)**: 최초 `39ba4dbd33a6770340b7b981987fa17c00c12c44` → **2026-10-02 재정리 후 `629901931601c8abca0c5d539426069480c376b1`**(`origin/main`, idle lobby/room expiry 포함) 위로 rebase. 재정리 내용은 §10
- 범위: Discord Activity iframe에서 기존 웹 버전이 부팅되고, 기존 Multiplayer(방 생성 → 방 코드 → 참가 → 진행)가 동작하는지를 코드와 실행 증거로 확인한다.
- 이번 작업에서 하지 않은 것: 게임 규칙·밸런스·엔진·state machine 변경, CrazyGames 코드, 배포, Developer Portal 설정, Discord Verification 신청.

> 협업 계약 참고: `AGENTS.md`와 `product_doc/README.md`는 Claude를 분석 보조로 규정합니다. 이번 구현은 사용자가 직접 요청한 범위의 플랫폼·네트워크 코드에 한정됩니다. 게임 규칙·밸런스는 손대지 않았고, `product_doc/TODO.md`와 `DECISIONS.md`도 수정하지 않았습니다. 통합 전에 Codex 검토와 TODO·DECISIONS 기록이 필요합니다.

---

## 1. 구현 전 분석 (코드 수정 전 판단)

### 1.1 Discord Activity 적용 가능 여부 — **가능 (조건부)**

- 클라이언트의 모든 서버 호출은 상대 경로(`/api/...`)이고, WebSocket은 `location.host`로 주소를 만든다. 정적 리소스도 모두 같은 origin의 절대 경로(`/assets/...`)다.
- Discord는 `/.proxy/` 접두사를 더 이상 요구하지 않는다(Discord change log, 2024). 그래서 **루트 URL Mapping 하나(`/` → `porena.kr`)만 두면 클라이언트 네트워크 코드는 수정 없이 프록시를 통과한다.**
- 클라이언트는 쿠키를 쓰지 않는다. 세션 토큰은 `X-Porena-Session` 헤더와 WebSocket 첫 메시지로 전달된다. 따라서 서드파티 iframe의 쿠키 제한도 영향이 없다.

### 1.2 가장 큰 blocker

| 순위 | Blocker | 근거 |
|---|---|---|
| **1 (확정·해결)** | `worker/index.ts`가 `Origin === url.origin`(=`https://porena.kr`)만 허용한다. Activity 안의 브라우저는 `Origin: https://<APP_ID>.discordsays.com`을 보내므로 `/api/*`·`/ws/*`가 모두 **403**이 된다. | 코드 확인. 로컬 시뮬레이션에서 기본 설정일 때 403 재현(§5) |
| 2 (미해결·출시 전 필수) | Rate limit 키가 `CF-Connecting-IP`다. Discord 프록시는 사용자 IP를 숨기므로, **모든 Discord 사용자가 프록시 IP 몇 개의 버킷을 공유할 가능성**이 높다(방 생성 10회/분, 연결 120회/분, 피드백 3회/분). | 소규모 테스트에는 무관. 실제 헤더 값은 Discord 실기기에서 확인 필요(§6) |
| 3 (경미) | Google Fonts / Google Analytics는 Activity CSP와 URL Mapping 밖의 외부 요청이다. 따라서 차단될 것으로 예상한다. | 시스템 폰트 폴백(`Manrope, "Noto Sans KR", sans-serif`)으로 동작한다. GA는 `async` 스크립트라 부팅에 영향이 없다 |

### 1.3 수정 대상 파일

`worker/index.ts`, `wrangler.jsonc`, `src/main.tsx`, `src/ui/OnlineApp.tsx`, `src/ui/FeedbackDialog.tsx`, `src/ui/OnlineLobby.tsx`, `src/i18n/locales/ko-KR.ts`, `src/i18n/locales/en-US.ts`, `vitest.workers.config.ts`, `package.json`, `package-lock.json`

### 1.4 신규 파일

| 파일 | 역할 |
|---|---|
| `src/platform/runtime.ts` | 실행 환경 판별(web / discord)의 **유일한 진입점**. 이 밖의 코드는 hostname을 직접 검사하지 않는다 |
| `src/platform/discord.ts` | Discord SDK 생성과 `ready()` 처리. Discord 분기에서만 동적 import되는 별도 청크다 |
| `src/network/endpoints.ts` | 클라이언트가 쓰는 서버 주소를 한곳에 모은다 |
| `src/ui/PlatformNotice.tsx`, `src/ui/platformNotice.css` | SDK 실패 시에만 보이는 안내 배너(Discord 전용) |
| `worker/origin.ts` | Origin exact allowlist |
| 테스트 | `src/platform/runtime.test.ts`, `src/platform/discord.test.ts`, `src/network/endpoints.test.ts`, `tests/worker/discordOrigin.test.ts` |
| `tools/discord-activity-sim.mjs` | 로컬 Discord 프록시·iframe 시뮬레이션 하네스(재현용, 빌드에 포함되지 않음) |

> `src/platform/web.ts`는 만들지 않았다. 웹 동작은 "아무것도 하지 않음"이므로 별도 파일은 빈 껍데기가 된다. CrazyGames 같은 다음 플랫폼은 `runtime.ts`의 `PlatformRuntime` 유니언에 kind를 하나 추가하고, 자기 모듈을 동적 import하는 방식으로 확장한다.

### 1.5 Discord Developer Portal에서 사용자가 직접 설정할 항목

배포와 Portal 변경은 사용자 승인 후에 진행한다.

1. **Application 생성.** 운영용과 개발용을 분리할 것을 권장한다. 두 ID 모두 allowlist에 넣을 수 있다.
2. **Activities → Settings**: Activities 활성화. 지원 플랫폼(Desktop/Web, iOS, Android)과 모바일 화면 방향(세로 고정 여부)을 정한다. 방향은 기획 결정 사항이다.
3. **Activities → URL Mappings**: 아래 §1.6의 루트 매핑.
4. **OAuth2 → Redirects**: Discord 시작 가이드가 Activity 활성화를 위해 placeholder redirect(예: `https://127.0.0.1`)를 요구하는 경우에 등록한다. 이번 단계에서 OAuth는 사용하지 않는다.
5. **App Testers / Team**: 검증(Verification) 전에는 테스트 유저를 팀원 또는 테스터로 추가해야 Activity를 실행할 수 있다.
6. **Application ID 복사** → `wrangler.jsonc`의 `vars.DISCORD_ACTIVITY_CLIENT_IDS`에 입력 → 배포. 배포는 별도 승인이 필요하다.

### 1.6 예상 URL Mapping

| PREFIX | TARGET | 용도 |
|---|---|---|
| `/` | `porena.kr` | 앱 셸, `/assets/*`, `/api/*`, `/ws/*` 전부 |

- 타깃은 반드시 `porena.kr`로 한다. `www.porena.kr`은 Worker가 301 리다이렉트하므로 쓰지 않는다.
- 2단계 후보(선택): `/gfonts` → `fonts.googleapis.com`, `/gstatic` → `fonts.gstatic.com`. 다만 CSS 안의 `@font-face` 절대 URL은 매핑으로 바뀌지 않는다. 그래서 **폰트 self-host가 더 확실한 해법**이다.

### 1.7 보안 영향

- **기본값은 비어 있음**(`DISCORD_ACTIVITY_CLIENT_IDS: ""`). 이 상태로 배포하면 porena.kr의 Origin 정책은 이전과 **완전히 같다**.
- ID를 설정하면 `https://<그 ID>.discordsays.com` **정확히 그 문자열만** 추가로 허용한다.
  - 와일드카드(`*.discordsays.com`)는 쓰지 않는다. 다른 Discord 앱도 같은 도메인을 쓰기 때문이다.
  - 다른 앱 ID, `http://`, 포트 포함, 접미사 위장(`…discordsays.com.evil.test`), 하위 도메인 위장, 끝 `/`, `"null"`, Origin 누락은 모두 거부된다(테스트로 고정).
  - 형식이 잘못된 ID(17~20자리 숫자가 아님, `*` 등)는 무시되어 아무것도 허용하지 않는다.
- CORS 헤더는 추가하지 않았다. 브라우저 입장에서 Activity의 요청은 `discordsays.com`에 대한 same-origin 요청이므로 CORS가 필요 없다.
- 관리자 페이지(`admin.porena.kr`)는 별도의 Origin·Fetch-Metadata 검사를 그대로 사용하며 이번 변경과 무관하다.
- Origin 검사는 원래도 "브라우저가 보장하는 출처 신호"이지 인증이 아니다. 비브라우저 클라이언트에 대한 방어 수준은 이전과 같다.
- 방 초대 링크: Activity 안에서는 `https://<id>.discordsays.com/?room=…` 대신 **`https://porena.kr/?room=…`** 를 보여준다. 기존 값은 Discord 밖에서는 열 수 없는 링크였다. 이 변경으로 Discord 플레이어와 웹 플레이어가 같은 방에서 플레이할 수 있다(§5에서 확인).

### 1.8 기존 web / CrazyGames 작업과의 충돌 가능성

- 원격에는 CrazyGames 브랜치가 아직 없다(`git ls-remote` 확인 시점 기준). 아래는 예상 충돌 지점이다.
  - `src/main.tsx`: 양쪽 모두 SDK 초기화 지점이 필요하다. 이번에는 `void startPlatform();` 한 줄과 `<PlatformNotice />`만 추가했다.
  - `package.json`, `package-lock.json`: 의존성 추가가 겹치면 lockfile 충돌이 난다. 수동 병합하지 말고 `npm install`로 재생성한다.
  - `index.html`(GA): 이번에는 **수정하지 않았다.**
  - `src/ui/OnlineLobby.tsx`의 초대 링크: CrazyGames도 자체 초대 방식을 쓴다면 `shareOrigin()`을 확장하는 방식으로 합치는 것을 권장한다.
- 권장: CrazyGames도 `src/platform/runtime.ts`에 `kind: "crazygames"`를 추가한다. 그러면 플랫폼 분기가 한 파일에만 모인다.

---

## 2. 구현 내용

| 파일 | 변경 | 이유 |
|---|---|---|
| `worker/origin.ts` (신규) | `discordActivityOrigins()`, `isAllowedOrigin()` | Blocker 1을 exact allowlist로 해결 |
| `worker/index.ts` | `Origin !== url.origin` → `!isAllowedOrigin(origin, url.origin, env.DISCORD_ACTIVITY_CLIENT_IDS)` | 위와 같음. 나머지 라우팅·rate limit·DO 전달은 그대로 |
| `wrangler.jsonc` | `vars.DISCORD_ACTIVITY_CLIENT_IDS: ""` | 설정 지점. 빈 값이면 기존과 동일 |
| `src/platform/runtime.ts` (신규) | `detectPlatform`, `discordLaunchProblem`, `shareOrigin`, `startPlatform`, 상태 구독 | 플랫폼 판별을 한곳에 모음 |
| `src/platform/discord.ts` (신규) | `new DiscordSDK(clientId)` → `ready()`(10초 타임아웃) | SDK 최소 초기화. OAuth 없음 |
| `src/network/endpoints.ts` (신규) | API 경로와 WebSocket URL 생성 | 주소를 한곳에서 관리. 웹에서 생성되는 URL은 이전과 바이트 단위로 같다(테스트로 고정) |
| `src/ui/OnlineApp.tsx`, `FeedbackDialog.tsx` | 하드코딩된 경로를 `endpoints`로 교체 | 동작 변화 없음 |
| `src/ui/OnlineLobby.tsx` | 초대 링크 origin을 `shareOrigin()`으로 결정 | 웹은 기존 `location.origin` 그대로. Discord는 `porena.kr` |
| `src/main.tsx` | `void startPlatform();`, `<PlatformNotice />` | 웹에서는 no-op. Discord에서는 백그라운드로 handshake |
| `src/ui/PlatformNotice.tsx`, `platformNotice.css` (신규) | SDK 실패 시 닫을 수 있는 상단 배너 | "명확한 fallback/error" 요구 |
| `src/i18n/locales/*.ts` | `platform.discord.sdkFailed` 키 1개(ko/en) | 배너 문구 |
| `package.json` | `@discord/embedded-app-sdk` **2.5.0** (exact) | SDK |
| `vitest.workers.config.ts` | 테스트 전용 가짜 ID `123456789012345678` 바인딩 | allowlist 통합 테스트용 |
| `tools/discord-activity-sim.mjs` (신규) | 로컬 프록시·iframe 시뮬레이션 | 실행 증거 재현용 |

### 설계 결정

- **Activity 판별**: hostname이 `^\d{17,20}\.discordsays\.com$`일 때만 Discord로 본다. 쿼리 파라미터(`frame_id` 등)만으로는 판별하지 않으므로 porena.kr에 같은 쿼리를 붙여도 웹으로 처리된다(테스트).
- **Client ID**: hostname에서 추출하므로 클라이언트 빌드에 ID를 주입할 필요가 없다. 서버 측 허용 여부는 Worker 설정이 결정한다. 클라이언트 값은 신뢰 근거로 쓰지 않는다.
- **SDK는 게임을 막지 않는다**: MVP 흐름은 SDK 없이 URL Mapping만으로 동작한다. SDK가 실패하거나 타임아웃되면 게임은 계속하고, 배너와 `console.error`, `<html data-platform-status="failed">`로 실패를 알린다.
  - 실행 정보가 불완전하면(`frame_id`·`instance_id`·`platform` 누락이나 오류) SDK를 생성하지 않고 이유를 담은 에러를 낸다.
- **웹에서 SDK 미실행·미다운로드**: SDK는 `discord-*.js` 별도 청크(147.95 kB, gzip 44.14 kB)로 분리된다. 웹 경로에서는 import하지 않는다. 빌드 결과물과 브라우저 요청 기록으로 확인했다(§5).
- **SDK 콘솔 포워딩**: SDK 기본값(콘솔 로그를 Discord 개발자 콘솔로 전달)을 유지했다. Activity 안에서만 적용되며, 실기기 디버깅에 유용하다.

---

## 3. 테스트 결과 (모두 `holto-chess/`에서 실행)

| 명령 | 결과 |
|---|---|
| `npm test` (= `npm run test`) | **87 files / 610 tests passed** (신규 3 files / 8 tests 포함) |
| `npm run test:workers` | **3 files / 27 tests passed** (신규 `discordOrigin.test.ts` 5 tests 포함). 재정리 후에는 main의 `lobbyExpiry.test.ts`가 더해져 4 files / 28 tests(§10) |
| `npm run lint` | 경고·에러 0 |
| `npm run build` | 성공. `dist/client/assets/discord-*.js`가 별도 청크로 생성됨. `index.html`에는 이 청크의 preload가 없음 |

신규 테스트가 고정하는 내용은 다음과 같다.

- `runtime.test.ts`: porena.kr·localhost·위장 hostname은 web으로 판별된다. 정상 Activity URL만 discord로 판별된다. 실행 정보 누락은 이유와 함께 보고된다. 초대 origin(웹은 현재 origin, Discord는 porena.kr)이 맞게 정해진다.
- `discord.test.ts`: 실행 정보가 불완전하면 SDK를 생성하지 않는다. handshake가 없으면 읽을 수 있는 타임아웃 에러를 낸다.
- `endpoints.test.ts`: 웹 API·WS URL이 기존 문자열과 같다. Discord에서는 같은 경로가 discordsays host에 생성된다.
- `discordOrigin.test.ts` (실제 Worker + Durable Object):
  - ID 파싱과 exact match·위장 Origin 거부.
  - Activity origin으로 방 생성·참가·세션 확인이 된다.
  - **웹 origin 사용자가 같은 방에 참가**할 수 있다.
  - 다른 앱 ID는 403.
  - Activity origin에서 WebSocket 101 → `ROOM_JOINED`.
  - 피드백 API에도 같은 gate가 적용된다.
- 기존 `room.test.ts`의 "rejects foreign origins"(`https://evil.test` → 403)는 수정 없이 그대로 통과한다.

---

## 4. 질문별 답변

| # | 질문 | 답 | 근거 수준 |
|---|---|---|---|
| 1 | React/Vite 앱이 Activity iframe에서 부팅되는가 | **예.** 외부 iframe + discordsays origin에서 시작 화면 → 멀티 → R1 진입 | 로컬 시뮬레이션. 실기기 미확인 |
| 2 | URL Mapping으로 정적 리소스 제공이 되는가 | **예(루트 매핑 기준).** 모든 리소스가 same-origin 절대 경로라 수정이 필요 없다 | 코드 감사 + 시뮬레이션 |
| 3 | `/api/*`가 Worker까지 도달하는가 | **allowlist 설정 시 예.** 미설정(현재 운영)이면 403 | 시뮬레이션 + Worker 테스트 |
| 4 | `/ws/rooms/*`가 Durable Object까지 연결되는가 | **allowlist 설정 시 예(101 → ROOM_JOINED → 게임 시작).** 미설정이면 403 | 시뮬레이션 + Worker 테스트 |
| 5 | strict same-origin과 Discord Origin의 충돌 | `Origin: https://<id>.discordsays.com` ≠ `url.origin`(`https://porena.kr`) → 모든 API·WS가 403 | 코드. 단 **Discord 프록시가 Origin을 그대로 전달한다는 전제**이며 실기기 확인 필요 |
| 6 | porena.kr 보안을 약화시키지 않고 Discord origin만 허용할 수 있는가 | **예.** 설정된 앱 ID의 정확한 origin만 추가하고, 기본값은 비활성 | Worker 테스트 |

---

## 5. 로컬 실행 증거 (시뮬레이션)

**구성**

- `npm run build` → `dist/porena/wrangler.json`에 테스트 ID 주입 → `vite preview`(workerd)
- 로컬 HTTPS 리버스 프록시(`https://123456789012345678.discordsays.com` → Worker, Origin 그대로 전달)
- 부모 페이지(`https://discord-sim.test`)가 Activity를 `?instance_id&frame_id&platform=desktop`과 함께 iframe으로 띄운다
- Chromium(Playwright)
- 재현: `tools/discord-activity-sim.mjs` 상단 주석 참고

**결과** (마지막 실행 기준)

| 단계 | 결과 |
|---|---|
| 허용 목록 비어 있음(운영 기본값)일 때 Activity origin `POST /api/rooms` | **403** (blocker 재현) |
| 허용 목록 설정 후 Activity(1280×800)에서 방 생성 | `POST /api/rooms` **201**, `WS /ws/rooms/GLFP3U` **101**, 대기실 "연결됨" |
| 초대 링크 표시 | `https://porena.kr/?room=GLFP3U` |
| 웹 사용자(390×844 모바일)가 `?room=` 초대로 참가 | 대기실 2/8, `data-platform` 없음, **SDK 청크 요청 0건** |
| Activity 쪽 SDK 청크 | 로드됨. Discord 클라이언트가 없으므로 10초 뒤 `platformStatus=failed`, 배너 표시(웹에는 배너 없음) |
| 양쪽 READY | Activity 프레임이 `ROUND 01 · PLAY GUIDE`(Classic Hold'em)로 진입 |
| 다른 앱 ID(`876543210987654321`)의 Activity | `POST /api/rooms` **403**, 화면에는 "방을 사용할 수 없습니다." |
| 외부 요청 | `www.googletagmanager.com`, `fonts.googleapis.com`, `fonts.gstatic.com` 3개 host뿐. 실제 Activity에서는 CSP로 차단될 대상 |

**시뮬레이션의 한계**: 실제 Discord 프록시의 헤더 처리(Origin 재작성 여부, IP 헤더), CSP, WebSocket 유휴 타임아웃, 모바일 웹뷰는 재현하지 않았다. R1~R5 완주는 UI 자동화로 하지 않았다. 다만 Origin 검사는 연결 시점에만 적용되고, 이후 메시지 처리 경로는 웹과 같다. 게임 진행 자체는 기존 `room.test.ts`의 전체 게임 테스트가 보장한다.

---

## 6. 실제 Discord 클라이언트에서 추가로 확인해야 할 항목

1. **Origin 전달 방식**: 허용 목록이 빈 상태에서 403, ID를 설정하면 201이 나오는지 확인한다. Discord가 Origin을 재작성한다면 allowlist는 필요 없다. 그래도 남겨 두면 무해하다.
2. **`CF-Connecting-IP`의 실제 값**: 여러 Discord 사용자가 같은 값으로 들어오는지 확인한다. 로그에 IP를 남기지 말고, 429 발생 양상이나 일시적인 "동일 여부" 집계로 확인한다. 이 결과가 blocker 2의 심각도를 정한다.
3. SDK `ready()` 성공 여부(배너가 뜨지 않아야 함). 데스크톱·웹·iOS·Android 각각 확인한다.
4. **2인 R1~R5 완주**(Activity↔Activity, Activity↔웹 혼합)와 결과 화면.
5. WebSocket 장시간 유지, 백그라운드·최소화 후 재연결, Discord 모바일에서 앱 전환 후 복귀(세션 복원).
6. 모바일 Activity 레이아웃: 세로 공간, 하단 버튼 접근성, safe-area, 회전과 viewport 변화.
7. 폰트 폴백 품질(Manrope·Noto Sans KR 미로드 시 한글 가독성), GA 차단이 다른 오류를 일으키지 않는지.
8. `navigator.clipboard`(코드·초대 링크 복사)가 iframe 권한 정책상 막히는지. 막히면 기존 폴백 문구가 나온다.
9. 오디오 자동재생 정책, `location.reload()`(배포 직후 청크 재로드)가 Activity 안에서 정상 동작하는지.
10. Cloudflare WAF·Bot 보호가 Discord 프록시의 서버 간 요청을 막지 않는지.
11. Activity의 localStorage는 discord.com 아래로 분리되어 porena.kr 웹과 세션·설정을 공유하지 않는다(예상된 동작). 재실행 후 유지되는지 확인한다.

---

## 7. 아직 구현하지 않은 2단계 기능

- Discord instance 기반 자동 룸 생성과 매칭(`instanceId` → 방 연결)
- Discord OAuth / 계정 기반 로그인, 프로필·아바타
- Rich Presence(`setActivity`), SDK 초대 다이얼로그(`openInviteDialog`)
- 외부 링크를 `openExternalLink`로 여는 처리(현재 게임 화면에 외부 링크는 없음)
- 폰트 self-host 또는 폰트 URL Mapping, Discord 환경의 GA 처리 방침(비활성 또는 매핑)
- 랭크, 신규 DB

---

## 8. 추가 발견 사항

### 반드시 수정 권장 (공개 출시 전)

- **Rate limit 키 재설계**(blocker 2). 후보는 다음과 같다. 정책 결정이 필요하다.
  - (a) Discord origin 요청에 별도 limiter 바인딩과 더 큰 한도 적용
  - (b) 2단계 OAuth 후 Discord user ID를 키로 사용
  - (c) Discord가 신뢰할 수 있는 클라이언트 IP 헤더를 제공하는지 확인 후 사용

### 개선 권장

- Origin 거부(403)가 클라이언트에서 "방을 사용할 수 없습니다."로 표시된다. 설정 누락 시 원인을 알기 어렵다. 403 전용 문구(예: "이 환경에서는 서버에 연결할 수 없습니다")를 권장한다. UI 문구 변경이라 이번에는 보류했다.
- 실패 배너는 화면 상단 중앙에 고정된다. 데스크톱 대기실 패널의 윗부분을 일부 가리므로, 닫기 버튼으로 해소할 수 있다. 모바일 Activity 레이아웃이 정해지면 위치를 다시 확인한다.
- `src/ui/OnlineApp.tsx`의 `storedNickname()`과 `join()`은 `localStorage`를 try 없이 사용한다. 저장소가 차단된 웹뷰에서는 예외가 날 수 있다. 기존 코드이며 이번 변경과는 무관하다.

### 참고

- 게임 페이지는 `X-Frame-Options`·`frame-ancestors`를 보내지 않는다. 그래서 Discord iframe 임베딩에 장애가 없다. 반대로 누구나 프레이밍할 수 있다는 뜻이며, 이는 기존 상태다. 필요하면 `frame-ancestors 'self' https://discord.com https://*.discordsays.com …` 형태의 정책을 별도로 검토한다(CrazyGames 임베딩도 함께 고려해야 함).

---

## 9. 출처

- Discord Developer change log — `/.proxy/` 접두사 요구 제거: https://discord.com/developers/docs/change-log
- Discord embedded-app-sdk 2.5.0 (`node_modules/@discord/embedded-app-sdk/output/Discord.mjs`): 생성자가 `frame_id`, `instance_id`, `platform` 쿼리를 필수로 요구함을 확인
- 이 환경에서는 discord.com 문서에 직접 접근할 수 없었다(egress 차단). Portal 항목은 공식 가이드로 다시 확인해야 한다.

---

## 10. PR #1 재정리 — 최신 main 위로 rebase (2026-10-02)

### 기준

| 항목 | 값 |
|---|---|
| 이전 PR head | `58630d6a8358b60dfebf2afd2d3c449e77231965` (base `39ba4db`, main보다 2 commits behind) |
| 새 base(current main) | `629901931601c8abca0c5d539426069480c376b1` |
| 방법 | 작업 브랜치(Claude가 만든 `claude/zen-edison-cxisk1`)를 `origin/main` 위로 rebase. 충돌 없음. `--force-with-lease`로 push |
| 보존 확인 | main의 `fb12145`(idle lobby 30분 만료, 클럭 프로브 제한, `Room expired` 처리, `online.roomExpired` 문구)와 `6299019`(운영 기록)가 그대로 유지된다. 겹친 3개 파일(`en-US.ts`, `ko-KR.ts`, `OnlineApp.tsx`)은 서로 다른 위치를 수정하므로 자동으로 병합됨. Discord 쪽 변경은 키 1개 추가와 `endpoints`/`roomSocketUrl` 치환뿐 |

### 의존성

- 기존 `node_modules`, `dist`, 생성 타입을 지운 뒤 `npm ci`(PR의 `package-lock.json` 기준)로 다시 설치했다. 242 packages, `@discord/embedded-app-sdk` **2.5.0** 설치 확인. lockfile 충돌이 없어 재생성할 필요가 없었다.

### 검증 (clean install, 최종 head)

| 명령 | 결과 |
|---|---|
| `npm test` (= `npm run test`), 기본 병렬 | **87 files / 610 tests passed**, 60.4s. timeout 없음. 그래서 제한된 worker 설정으로 재실행할 필요가 없었다 |
| Discord 단위 테스트 개별 확인 (`vitest run src/platform src/network --reporter=verbose`) | 3 files / 8 tests passed. `discord.test.ts`는 실제 SDK 모듈을 import해 실행한다(handshake 타임아웃 51ms 등) |
| `npm run test:workers` | **4 files / 28 tests passed**. `discordOrigin.test.ts` 5개와 main의 `lobbyExpiry.test.ts` 1개 포함 |
| `npm run lint` | 에러·경고 0 |
| `npm run build` | 성공. `discord-*.js` 147.95 kB가 별도 청크로 생성되고, `dist/client/index.html`에는 discord 참조가 0건 |
| Discord 시뮬레이션 (`tools/discord-activity-sim.mjs`) | Activity origin `POST /api/rooms` 201, `WS` 101. 웹(모바일) 사용자가 초대 링크로 참가하고 양쪽 READY 후 R1 진입. 다른 앱 ID는 403. **웹은 SDK 청크 요청 0건** |

### Platform notice 위치 QA (360×740 모바일, 1440×900 desktop, Discord 시뮬레이션 iframe)

- 배너 위치: 모바일 `x16 y8 w328 h77`, desktop `x440 y8 w560 h58`.
- 시작 화면·대기실에서는 겹치는 조작 요소가 없다.
- **문제 발견**: 게임이 시작된 뒤에도 배너가 남아 있으면 상단 nav를 덮는다.
  - 모바일: "홈으로", "나가기", R1 가이드 "×"
  - desktop: "홈으로", 라운드 진행 표시
- **최소 수정**: 레이아웃은 바꾸지 않고, 배너를 **10초 뒤 자동으로 숨긴다**(`PLATFORM_NOTICE_VISIBLE_MS`). 닫기 버튼은 유지한다.
  - 재측정 결과 두 해상도 모두 실패 후 10.5초 시점에 HIDDEN, 겹침 0.
  - SDK 실패는 페이지 로드 약 10초 뒤에 판정된다. 그래서 대부분 시작 화면이나 대기실에서 보였다가 게임 시작 전에 사라진다.
- 시뮬레이션 하네스의 부모 페이지에 viewport meta를 추가했다. 없으면 모바일 iframe 폭이 980px로 잡혀 측정이 틀어진다.

### Cloudflare PR deployment failure (`58630d6`)

- GitHub check run `Workers Builds: porena`(id 110692911558): conclusion `failure`.
  - `started_at`와 `completed_at`가 모두 `2026-10-02T03:30:51Z`(0초)이고, output text가 비어 있다.
  - details URL은 Cloudflare 대시보드의 build `cd5aaa8b-6809-4172-9bea-c43385366f0a`를 가리킨다.
- 이 세션에는 Cloudflare 대시보드 접근 권한이 없다. 원인: **UNVERIFIED — Cloudflare dashboard log required.**
- **추가 확인(사용자 제공 build `56be2d2c` 로그, head `60b171a`)**: `npm run build`는 성공했다. 실패는 deploy 단계에서 났다. `npx wrangler versions upload`가 저장소 루트에서 실행되어 `holto-chess/wrangler.jsonc`를 찾지 못했다(`✘ [ERROR] Missing entry-point to Worker script or to assets directory`). 그래서 고정 버전 4.132.0 대신 `wrangler@4.146.0`이 임시로 설치됐다. PR 코드가 아니라 Workers Builds의 작업 디렉터리 설정 문제다. 해결은 대시보드에서 Root directory를 `holto-chess`로 바꾸거나 Git 빌드를 끄는 것이다. 운영 자동 배포 여부와 함께 사용자가 결정한다.
- 같은 빌드 명령(`npm run build`)은 로컬 clean install 환경에서 성공했다. production deploy는 하지 않았다.

### 미해결 위험 (OPEN RISK)

1. **Rate limit**: `CF-Connecting-IP` 기반이라 Discord 사용자끼리 버킷을 공유할 가능성이 있다. 정책은 바꾸지 않았다. 실제 Discord에서 `Origin`, `Host`, `CF-Connecting-IP`, `CF-Ray`, `X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `X-Forwarded-Proto`를 관찰한 뒤 별도 작업으로 다룬다(TODO `DIST-DISCORD-001-HEADERS`, `-RATELIMIT`).
2. **대기실 WebSocket 무활동 (main 변경과의 상호작용, 신규)**: main의 `fb12145` 이후 대기실에서는 클럭 프로브를 보내지 않아 WebSocket이 조용하다.
   - Discord 프록시에 WebSocket 유휴 타임아웃이 있다면, 대기실 연결이 끊기고 클라이언트가 재접속한다.
   - 재접속 시 `JOIN_ROOM`이 닉네임과 함께 전송되고, 대기실에서는 이것이 commit되어 30분 idle 타이머를 다시 시작한다(`worker/GameRoom.ts`의 JOIN_ROOM 처리).
   - 결과적으로 Discord에서는 무활동 대기실이 닫히지 않을 수 있다. 코드는 바꾸지 않았다(main 동작 보존). 실제 Discord 테스트에서 대기실 연결이 무활동 상태로 유지되는지 확인해야 한다(TODO `DIST-DISCORD-001-PLAYTEST`).
3. 실제 Discord 클라이언트 동작(Origin 전달, CSP, SDK ready, 모바일 웹뷰)은 여전히 미검증이다(§6).
4. Cloudflare Workers Builds 실패 원인 미확인(위).

### PR 범위 확인

- PR 변경은 Discord 플랫폼 작업과 승인된 협업 문서 기록뿐이다.
  - `product_doc/TODO.md`: `DIST-DISCORD-001` 추가
  - `product_doc/DECISIONS.md`: 사용자가 승인한 5개 결정만 기록
- 게임 엔진(`src/game`, `src/core`), 밸런스, 에셋(`public/`, `asset-source/`), `GameRoom.ts` 변경은 없다.

## 11. 법적 URL — Developer Portal 등록값 (LEGAL-001, 2026-10-02)

Discord App Discovery는 공개된 개인정보처리방침과 이용약관을 요구한다. 아래 값은 운영 배포 후 두 URL이 200인지 확인한 뒤 Portal의 General Information에 입력한다. Portal 입력은 사용자 작업이다.

```
Privacy Policy URL:
https://porena.kr/privacy

Terms of Service URL:
https://porena.kr/terms

Support/Contact:
wlghks4689@gmail.com

Operator:
김지환

Minimum age:
14+
```

- 두 페이지는 로그인·게임 시작 없이 열리고, Activity 안에서는 History API로 이동해 launch query(frame_id 등)를 유지한다.
- 현재 정책은 Discord 사용자 정보를 수집하지 않는다고 명시한다. OAuth·프로필·친구 초대 등 Discord identity를 도입하면 **도입 전에** 개인정보처리방침 5장을 개정해야 한다.

## 12. Developer Portal 진행 상황과 Discovery 문안 (2026-10-02)

### 완료된 Portal 설정

- 일반 정보: 이용약관 `https://porena.kr/terms`, 개인정보 보호 정책 `https://porena.kr/privacy` 저장(Claude, 사용자 요청).
- 앱 인증: 사용자가 2단계 인증, 팀 이전, 신원 확인, 제출 완료. Discovery 상태에서 "인증을 마쳐야 해요" 충족 확인.
- Activity: URL 매핑 루트 `/` → `porena.kr`, 활동 활성화(엔트리 포인트 명령어 자동 생성), 최대 참가자 8, 지원 플랫폼 웹·iOS·Android(Claude, 사용자 요청). 연령 제한·프록시 인증은 끔.
- Discovery 남은 요건: 커뮤니티 지원 서버(사용자). 찾기 설정 화면은 지원 서버가 없으면 저장되지 않아 요약·언어·상세 설명·링크는 서버 지정 후 입력한다.

### 찾기 설정 입력값

- 요약(200자 이내): `Free 8-player poker autobattler. Buy cards from a shared 52-card pool, build the best hand and survive arenas whose rules change every round. No real money.`
- 언어: Korean, English (US)
- 링크: Website `https://porena.kr`
- 상세 설명(Default, Markdown):

```
**PORENA** is a free 8-player poker autobattler you can play right inside Discord.

- **Shared 52-card pool** – everyone buys from the same deck, so every card you take is one your rivals can't have.
- **Build the best hand** – combine your cards into the strongest poker hand and let it fight automatically.
- **Arenas that change every round** – drafts, survival rounds and a final showdown, each with its own rules.
- **12 abilities** – pick one and shape your own strategy.
- **Play solo or with friends** – face 7 AI opponents, or start it in a voice channel and play together.

**No real money.** BB, points and rewards are in-game values only. There are no bets, entry fees or cash prizes.

Website: https://porena.kr
Privacy Policy: https://porena.kr/privacy · Terms of Service: https://porena.kr/terms

---

**포레나(PORENA)**는 Discord에서 바로 즐기는 무료 8인 포커 오토배틀러입니다.

- **52장 공용 카드풀** – 모두가 같은 덱에서 카드를 사기 때문에, 내가 가져간 카드는 상대가 쓸 수 없습니다.
- **가장 강한 패 만들기** – 카드를 조합해 가장 강한 포커 패를 만들면 전투는 자동으로 진행됩니다.
- **라운드마다 바뀌는 아레나** – 드래프트, 서바이벌, 파이널 쇼다운까지 라운드마다 규칙이 달라집니다.
- **12가지 어빌리티** – 하나를 골라 나만의 전략을 완성하세요.
- **혼자 또는 친구와** – AI 7명과 대결하거나, 음성 채널에서 실행해 친구와 함께 플레이하세요.

**실제 돈을 사용하지 않습니다.** BB, 점수, 보상은 게임 안에서만 쓰이는 수치이며 베팅, 참가비, 현금 상금이 없습니다.
```

