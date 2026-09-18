# PORENA

**Tactical Poker Autobattler**

PORENA는 텍사스 홀덤의 족보와 BEST 5 판정을 기반으로, **카드 마켓·공유 52장 소유 풀·라운드별 규칙 변화·증강·생존 경쟁**을 결합한 8인 전략 게임 프로토타입입니다.

일반 홀덤의 베팅을 그대로 재현하는 대신, 플레이어가 BB를 사용해 카드를 사고팔고 리롤하며 자신의 패를 설계합니다. 같은 52장 소유 풀을 모든 플레이어가 공유하기 때문에 **무엇을 사느냐뿐 아니라 무엇이 시장에서 사라졌는지 읽는 것**도 전략의 일부입니다.

> **현재 상태:** 온라인 플레이 가능한 개발 프로토타입  
> **인원:** 실제 사용자 2~8명, 빈 좌석은 AI가 채워 8인 게임 유지  
> **서버:** Cloudflare Workers + Durable Objects + WebSocket

---

## 핵심 플레이

1. 라운드 시작 시 개인 상점에서 카드를 구매합니다.
2. 필요하면 카드를 판매하거나 상점을 리롤·잠금합니다.
3. 라운드별 보유 한도와 출전 규칙에 맞게 패를 구성합니다.
4. 쇼다운 결과에 따라 BB와 Point를 획득하고 일부 라운드에서는 탈락자가 발생합니다.
5. R2/R4 종료 후 증강을 선택해 이후 운영 방향을 바꿉니다.
6. R5 종료 시 누적 Point, 족보 점수, 남은 BB를 합산해 최종 순위를 결정합니다.

---

## 5개의 라운드

| Round | Rule | Hand | 핵심 |
| --- | --- | ---: | --- |
| **R1** | Classic Hold'em | 2장 | 같은 패로 3번의 스위스 매치. 탈락 없음 |
| **R2** | Run It Twice | 3장 → 2장 선택 | 두 번의 런아웃과 승자/패자 그룹. **8 → 6** |
| **R3** | Omaha Double | 4장 | 2장+2장으로 두 게임 구성, 각 게임은 정확히 **홀 2 + 보드 3**. 탈락 없음 |
| **R4** | Best Five of Ten | 5장 | 홀 5 + 보드 5 중 자유롭게 BEST 5. **6 → 4** |
| **R5** | The Last Hand | 7장 | 커뮤니티 보드 없이 7장 중 BEST 5로 최종 승부 |

R1은 첫 대진 이후 비슷한 성적의 상대를 우선하는 스위스 방식으로 진행합니다. R2와 R4에서는 1차전 이후 그룹전이 이어지며, R5에서는 라운드 배치 점수까지 반영해 최종 점수를 계산합니다.

---

## 52장 공유 카드풀

PORENA의 카드 시장은 한 게임에서 **52장의 고유 카드**를 공유합니다.

각 카드는 항상 다음 세 상태 중 하나입니다.

- `AVAILABLE` — 아직 누구에게도 배정되지 않은 카드
- `RESERVED_IN_SHOP` — 특정 플레이어의 상점에 노출된 카드
- `OWNED` — 특정 플레이어가 구매한 카드

동일한 physical card를 두 플레이어가 동시에 소유할 수 없습니다. 판매·리롤·탈락으로 반환된 카드는 다시 시장의 후보가 됩니다.

### 현재 밸런스 상수

| 항목 | 현재 값 |
| --- | ---: |
| 시작 스택 | 50BB |
| 라운드 기본 수입 | 30BB |
| 기본 상점 | 3장 |
| 리롤 | 5BB |
| 카드 잠금 | 3BB |
| 판매 환급률 | 60% |
| 보유 한도 | R1 2 / R2 3 / R3 4 / R4 5 / R5 7 |
| 구매 한도 | R1 2 / R2 2 / R3 2 / R4 3 / R5 3 |
| 리롤 한도 | R1 2 / R2 2 / R3 2 / R4 2 / R5 3 |

이 값들은 현재 플레이테스트와 시뮬레이션을 위한 밸런스 값이며 계속 조정될 수 있습니다.

---

## Match-scoped Community Board

커뮤니티 보드는 경제용 52장 소유 원장과 별도로 생성합니다.

각 쇼다운마다:

```text
Showdown Deck
= Full 52
- 해당 encounter 참가자들이 소유한 모든 OWNED 카드
```

을 새로 만든 뒤 보드를 뽑습니다.

- 참가자의 보유 카드는 자신의 보드에 등장하지 않습니다.
- 상점에 예약된 카드나 다른 매치 참가자의 카드는 해당 encounter의 보드 후보가 될 수 있습니다.
- 서로 다른 매치는 독립된 카드 유니버스이므로 같은 cardId가 각각의 보드에 등장할 수 있습니다.
- Run It Twice의 BOARD 1 / BOARD 2는 같은 encounter 덱에서 연속으로 뽑아 서로 중복되지 않습니다.
- 보드 생성은 경제용 카드 원장의 상태를 변경하지 않습니다.

---

## 점수

현재 최종 점수는 다음 세 요소를 합산합니다.

```text
Final Score
= 누적 Round Point
+ Hand Score
+ floor(보유 BB / 10)
```

족보 점수와 라운드별 보상 수치는 `src/game/config.ts`에서 한 곳에서 관리합니다.

---

## 온라인 멀티플레이

온라인 게임의 진실 공급원은 브라우저가 아니라 **GameRoom Durable Object**입니다.

```text
Browser
  │
  ├─ React UI
  │
  └─ WebSocket
        │
        ▼
Cloudflare Worker
        │
        ▼
GameRoom Durable Object
  ├─ Authoritative GameState
  ├─ Card Ledger / Shop
  ├─ Round / Match / Showdown
  ├─ Session / Reconnect
  └─ PlayerView
```

주요 특징:

- 실제 사용자 **2~8명** 입장
- 빈 좌석은 AI가 담당
- 플레이어마다 자신의 카드·상점만 포함한 `PlayerView` 수신
- 상대의 비공개 카드와 상점은 payload 자체에서 제외
- 브라우저별 최근 방 세션 복원 및 탭별 활성 방 분리
- 준비 완료 시 즉시 다음 단계 진행
- 대기자가 응답하지 않으면 서버 타이머 후 AI가 해당 단계만 대신 처리
- Durable Object snapshot을 이용한 상태 복원
- 방 상태는 생성 후 최대 24시간 유지

---

## 쇼다운 연출

쇼다운은 결과 숫자만 표시하지 않고 **카드가 만들어지는 과정과 BEST 5**를 보여주는 방향으로 구현되어 있습니다.

- FLOP / TURN / RIVER 단계별 공개
- 승자의 BEST 5 강조
- 사용되지 않은 카드 dim 처리
- Run It Twice 개별 보드 결과
- 다인 쇼다운 및 그룹전 표현
- R5 전용 단계별 7장 공개와 최종 패 연출

---

## 기술 스택

- **Frontend:** React, TypeScript, Vite
- **Runtime:** Cloudflare Workers
- **Realtime:** WebSocket
- **Room State:** Cloudflare Durable Objects
- **Persistence:** SQLite-backed Durable Object storage
- **Test:** Vitest, Cloudflare Workers test pool

기존 Hold'em 프로젝트의 카드/족보 판정 구조를 참고했지만, PORENA는 독립 프로젝트이며 기존 저장소에 런타임 의존성을 갖지 않습니다.

---

## 실행

실제 애플리케이션은 `holto-chess/`에 있고 저장소 루트의 npm 스크립트는 해당 앱으로 위임됩니다.

```bash
npm install
npm run dev
```

외부 기기에서 개발 서버를 확인하려면:

```bash
npm run dev -- --host 0.0.0.0
```

### 검증

```bash
npm test
npm run test:workers
npm run lint
npm run build
```

### Cloudflare 배포

```bash
npx wrangler login
npm run deploy
```

Cloudflare 인증 정보나 비밀 값은 저장소에 커밋하지 않습니다.

---

## 프로젝트 구조

```text
.
├─ README.md
├─ AGENTS.md
├─ package.json              # holto-chess/로 명령 위임
└─ holto-chess/
   ├─ src/
   │  ├─ core/poker/         # 카드, 족보, BEST 5, Omaha 판정
   │  ├─ game/               # 카드풀, 경제, AI, 라운드, 점수, 매치
   │  ├─ shared/             # 클라이언트-서버 프로토콜
   │  └─ ui/                 # 시작 화면, 로비, 상점, 결과, 쇼다운
   ├─ worker/
   │  ├─ index.ts            # HTTP / WebSocket 라우팅
   │  └─ GameRoom.ts         # Durable Object 게임방
   ├─ tests/                 # Workers 통합 테스트
   └─ wrangler.jsonc
```

---

## 현재 개발 상태

### 구현됨

- [x] R1~R5 전체 게임 루프
- [x] 52장 고유 소유 카드풀과 개인 상점
- [x] 구매·판매·리롤·카드 잠금
- [x] R2/R4 증강 시스템
- [x] Match-scoped Community Board
- [x] 온라인 방 생성/참가 및 2~8인 세션
- [x] 서버 권위 GameState와 PlayerView 분리
- [x] 재접속 및 단계별 서버 타이머
- [x] AI 빈 좌석 및 비응답 좌석 진행
- [x] 라운드 가이드 / PREP 단계 표현
- [x] 쇼다운 및 R5 최종 연출

### 진행 중

- [ ] 밸런스 시뮬레이션과 수치 조정
- [ ] AI 전략 고도화
- [ ] 사운드 및 환경 설정
- [ ] 계정 / 전적 / 랭크 시스템
- [ ] 실제 서비스 환경 QA 및 운영 안정화

---

PORENA는 **좋은 카드가 들어오기를 기다리는 포커**보다, 제한된 시장 안에서 **어떤 카드를 확보하고 어떤 패를 설계할지 선택하는 포커**를 목표로 합니다.
