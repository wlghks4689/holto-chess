# Cloudflare 멀티플레이 기반 구현 보고서

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
