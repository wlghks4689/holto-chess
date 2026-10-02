# PORENA — app

게임 소개·규칙서는 [저장소 README](../README.md)에 있습니다. 이 문서는 `holto-chess/` 앱을 실행하고 고치는 개발자를 위한 안내입니다.

## 실행

```bash
npm ci
npm run dev
```

Cloudflare 개발 런타임(Workers + Durable Objects)이 함께 뜹니다. 같은 주소를 탭 두 개에서 열면 멀티플레이를 시험할 수 있고, 개발 서버에서는 화면 오른쪽 아래 버튼으로 싱글/멀티를 바로 전환할 수 있습니다.

검증:

```bash
npm test               # 게임·UI 단위 테스트
npm run test:workers   # Worker / Durable Object 테스트
npm run lint
npm run build
```

배포: `npx wrangler login` → `npm run deploy`. 운영 절차와 배포 기록은 [OPERATIONS.md](./OPERATIONS.md)를 따릅니다.

## 코드 구조

| 경로 | 역할 |
| --- | --- |
| `src/core/poker` | 카드·족보 평가·BEST 5·Omaha (게임 규칙과 무관한 순수 로직) |
| `src/game` | PORENA 규칙: 카드 풀, 상점, 드래프트, 경제, 매칭, 탈락, 어빌리티, 방 상태(`room.ts`), 봇 |
| `src/game/config.ts` | 가격·승점·BB·족보 점수 등 밸런스 수치의 단일 출처 |
| `src/shared` | 클라이언트·서버 공용 프로토콜, 제한 시간, 연출 타임라인 |
| `src/ui` | React 화면, 쇼다운 시네마틱, 게임 설명(초보자 가이드·규칙서) |
| `src/tutorial` | 체험 · 길라잡이 5장 |
| `src/i18n` | 한국어(`ko-KR`)·영어(`en-US`) 문구. 두 파일의 키는 항상 같아야 합니다 |
| `src/admin` | 제보·문의 관리자 수신함 |
| `worker/` | Cloudflare Worker와 방 하나당 하나의 `GameRoom` Durable Object |
| `tools/balance-simulator` | 엔진을 그대로 돌리는 밸런스 시뮬레이터 ([사용법](./tools/balance-simulator/README.md)) |

## 원칙

- 서버가 게임 상태의 유일한 기준입니다. 클라이언트는 행동을 요청하고 받은 `PlayerView`만 그립니다.
- 상대의 홀카드·상점은 쇼다운으로 공개되기 전까지 payload에 넣지 않습니다.
- 각 쇼다운의 보드는 그 매치 참가자의 보유 카드를 뺀 별도 덱에서 뽑습니다. Run It Twice의 두 보드는 같은 덱에서 연속으로 뽑아 겹치지 않습니다.
- 화면 문구는 `src/i18n/locales`에만 둡니다. 엔진이 저장하는 좌석 이름(AI 이름)은 화면에서 현재 언어로 바꿔 표시합니다(`src/ui/botNames.ts`).
