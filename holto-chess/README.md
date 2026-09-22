# PORENA Prototype

52장 싱글 덱 소유 풀에서 카드를 사고팔며 R1부터 R5까지 생존·점수를 겨루는 독립 웹 프로토타입입니다. 기존 Hold'em 프로젝트를 런타임 의존성으로 사용하지 않습니다.

## 실행

현재 Cloudflare Workers + Static Assets + SQLite-backed GameRoom Durable Object 기반의 온라인 개발 모드를 포함합니다. 구현 내역, 검증, 사용자 설정 및 배포 절차는 [Cloudflare 구현 보고서](./CLOUDFLARE_IMPLEMENTATION.md)를 참조하세요.

```bash
npm ci
npm run dev
```

검증:

```bash
npm test
npm run test:workers
npm run build
npm run lint
```

## 조작

카드 부족 시 타임아웃 몰수패 및 R4 공동 2위 각 3P 정책은 [현재 규칙](../README.md#shared-52-card-pool) 앞의 라운드 승점/몰수패 설명을 따릅니다. 카드가 없어도 게임은 진행하고, 몰수패에는 승점·BB 보상이 없습니다. 진출자 전원이 몰수패인 경우 하이카드 추첨은 진출자만 정합니다.

- 카드 마켓의 카드를 눌러 구매합니다.
- 내 카드의 `판매` 영역을 눌러 판매합니다.
- 카드 보유 한도를 채운 뒤 하단 진행 버튼으로 쇼다운합니다.
- R2에서는 보유 3장 중 출전할 2장을 선택합니다.
- R2/R4 종료 뒤 제시되는 증강 중 하나를 선택합니다.
- 상대 플레이어는 같은 공용 카드풀과 경제 규칙 안에서 자동으로 운영됩니다.

## 매치별 Community Board

각 쇼다운은 독립된 카드 유니버스를 사용합니다. 일반 52장 덱에서 해당 encounter 참가자들이 현재 소유한 모든 카드를 제외한 뒤 보드를 생성합니다. 이 임시 덱은 구매·예약·소유 상태를 변경하지 않습니다.

Run It Twice의 BOARD 1과 BOARD 2는 하나의 encounter 덱에서 연속 10장을 뽑으므로 서로 겹치지 않습니다. 다른 매치끼리는 독립된 덱을 사용하므로 같은 카드가 서로의 보드에 나타날 수 있습니다.

## 경계

- `src/core/poker`: 특정 게임 모드와 무관한 카드·족보·BEST 5·Omaha 순수 로직
- `src/game`: PORENA 전용 카드풀, 상점, 경제, 증강, 매칭, 탈락, 라운드 상태
- `src/ui`: 모바일 우선 카드·상점·다인 쇼다운 표현

ONLINE에서는 인간 2~8명이 입장하며 빈 좌석은 AI로 채워 기존 8인 규칙을 유지합니다. GameRoom이 상태를 소유하고 각 사용자에게 PlayerView만 보냅니다. 상점 구성·단계 진행은 준비 장벽으로 동기화합니다. LOCAL / DEV simulation은 기존 한 기기 테스트 모드입니다. 완성형 AI, 최종 밸런스, 계정, 타이머 및 연결 끊김 자동 처리 등은 포함하지 않습니다.

## 온라인 사용

1. `npm run dev`로 Cloudflare 개발 런타임을 실행합니다.
2. 새 탭 두 개에서 같은 주소를 엽니다. 첫 탭에서 Create Room, 다음 탭에서 방 코드를 입력하고 Join Room을 누릅니다.
3. 양쪽 READY 후 개인 상점에서 구성하고 구성 확정을 누릅니다. R2는 출전 2장을 먼저 저장합니다.
4. 이후 생존 플레이어들이 확인을 누르면 다음 단계로 진행합니다.

배포: `npx wrangler login` → `npm run deploy`. 기존 동일 이름 Worker와 대상 계정을 먼저 확인하세요. 현재 저장소에는 credential이 필요하지 않습니다.
