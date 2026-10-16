# 공개방 2단계 설계 — 목록·등록부·100개 상한·게스트 참가 (PUBLIC-ROOMS-002)

- 작성: Claude, 2026-10-17. 상태: **설계 확정(2026-10-17 질문 4건 답변 반영)**. 구현·DB 변경·배포 승인은 아직 아니다.
- 기준: `develop` `22fa4c9`(1단계 `0cbd788` 포함). 작업 브랜치 `feat/public-rooms-phase1`(develop과 동일 지점으로 이동).
- 1단계 명세: [qa/2026-10-13-public-rooms-phase1.md](qa/2026-10-13-public-rooms-phase1.md). 원 감사 보고서: `PORENA-public-rooms-audit-2026-10-13.md`.

## 1. 사용자 결정 (2026-10-17) 반영

| 항목 | 결정 | 설계에 미치는 영향 |
| --- | --- | --- |
| 참가 자격 | **게스트도 공개방에 참가·(생성)할 수 있다.** 1단계의 "계정 전용"을 대체 | 서명된 게스트 신원, 게스트 한도, 좌석 신원 모델 변경 (4장) |
| 목록 노출 | 만원 방과 진행 중인 방은 **목록에 보이지 않는다** | 목록 조건에 이미 포함. 만원 표시 UI 없음 |
| 운영 상한 | 공개방을 **최대 100개**로 제한. **진행 중인 방도 포함** | 등록부의 원자적 슬롯 확보 (3장). 비용·부하가 작아짐 |
| Human 보너스 | 현행 유지(게스트 포함) | 산식 변경 없음 (4.3) |
| 게스트 방 생성 | 허용 (한도는 더 엄격) | 4.2 |
| solo RP | 서버 solo는 RP를 지급하지 않는 **현행이 기준** | `DECISIONS.md` 재작성 완료. 코드 변경 없음 |
| 자동 배포 | develop 브랜치 작업을 기본값으로 수용 | 아래 가정 참고 |

**자동 배포에 대한 가정(확인 필요):** develop에서 커밋·push하는 동안 운영 배포는 일어나지 않고, 배포는 main 머지와 별도 승인으로만 일어난다고 가정하고 진행한다. 이 가정이 틀리면 알려 달라. `OPERATIONS.md`와 TODO의 서술이 어긋나 있어 저장소 문서로는 확인하지 못했다.

## 2. 범위

**포함(서버 전용):** 별도 `PUBLIC_LOBBY_DB`, 방 등록부, 목록 API, 100개 상한, DO→D1 요약 전달(재전송·순서 보호), lease, 종료 기록, 1분 Cron 복구, 게스트 신원과 한도, 5초 캐시.

**제외:** 목록·참가 UI(3단계), 지역별 부하 검증(4단계), 방 제목·채팅·관전, 실시간 목록 구독.

**1단계에서 넘어온 한계 중 2단계가 해결하는 것:** 원래 방이 삭제된 뒤 도착한 생성 재시도가 새 방을 만드는 문제. 등록부가 `(생성자, requestId) → instanceId`를 보관하므로 해결된다.

## 3. 등록부와 100개 상한

### 3.1 스키마 (`public-lobby-migrations/0001_public_rooms.sql`, 신규 D1 `PUBLIC_LOBBY_DB`)

```sql
CREATE TABLE public_rooms (
  instance_id      TEXT PRIMARY KEY,            -- 128bit hex, 생성 회차마다 다름
  room_code        TEXT NOT NULL,
  creator_key      TEXT NOT NULL,               -- HMAC(신원) 해시. 내부 전용, 응답·로그 제외
  request_id       TEXT NOT NULL,
  state            TEXT NOT NULL,               -- PROVISIONING|WAITING|PLAYING|FINISHED|CLOSED|CANCELLED
  slot_held        INTEGER NOT NULL DEFAULT 1,  -- 1이면 100개 상한에 포함
  confirmed_count  INTEGER NOT NULL DEFAULT 0,
  reserved_count   INTEGER NOT NULL DEFAULT 0,
  capacity         INTEGER NOT NULL DEFAULT 8,
  summary_seq      INTEGER NOT NULL DEFAULT 0,
  rules_version    INTEGER NOT NULL,
  protocol_version INTEGER NOT NULL,
  language         TEXT,
  region_hint      TEXT,
  created_at       INTEGER NOT NULL,
  observed_at      INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,            -- 방이 관찰한 시각 + 90초. D1 수신 시각으로 연장 금지
  room_expires_at  INTEGER NOT NULL,
  repair_due_at    INTEGER,                     -- Cron이 이 시각 이후 DO에 상태를 묻는다
  closed_at        INTEGER
);
CREATE UNIQUE INDEX pr_request  ON public_rooms (creator_key, request_id);
CREATE UNIQUE INDEX pr_live_code ON public_rooms (room_code) WHERE slot_held = 1;
CREATE INDEX pr_list   ON public_rooms (created_at, instance_id) WHERE state = 'WAITING';
CREATE INDEX pr_repair ON public_rooms (repair_due_at) WHERE slot_held = 1;
```

- 모든 필드에 인덱스를 걸지 않는다. lease 갱신 UPDATE가 인덱스 열을 건드리지 않게 하려는 의도다. 실제 인덱스는 조회 계획으로 확정한다.
- 공개 JSON에는 `creator_key`, `request_id`를 넣지 않는다.

### 3.2 100개 상한은 한 문장으로 원자적으로 확보

```sql
INSERT INTO public_rooms (...)
SELECT ... WHERE (SELECT COUNT(*) FROM public_rooms WHERE slot_held = 1) < :cap;
```

- D1은 한 문장을 한 번에 처리하므로 동시 100개 요청 중 정확히 상한 이내만 성공한다. `meta.changes = 0`이면 상한 도달이며 `503 PUBLIC_CAPACITY_REACHED`와 `Retry-After`를 반환한다. 이 동시성 가정은 구현 시 동시 호출 테스트로 검증한다.
- 상한 값은 코드 상수 `PUBLIC_ROOMS_MAX = 100`, 테스트에서는 환경 값으로 낮춘다.
- `slot_held`가 1인 행은 최대 100개이므로 COUNT 비용이 작다.

### 3.3 슬롯을 쥐는 구간 (확정)

| 상태 | 슬롯 | 목록 노출 | 비고 |
| --- | --- | --- | --- |
| PROVISIONING | 쥠 | 숨김 | 2분 안에 WAITING이 안 되면 Cron이 CANCELLED로 닫고 슬롯 반환 |
| WAITING | 쥠 | **빈자리가 있고 lease가 유효할 때만 표시** | 만원이면 숨김(방은 유지) |
| PLAYING | 쥠 | 숨김 | 게임 중에도 방은 운영 중이므로 상한에 포함 (사용자 확정) |
| FINISHED | 반납 | 숨김 | GAME_RESULT 진입 시. 이후 재경기는 현행 private 규칙대로 동작하지만 등록부 밖 |
| CLOSED / CANCELLED | 반납 | 숨김 | 종료 기록은 24시간 유지 후 Cron이 삭제 |

### 3.4 생성 흐름 (1단계 후보 탐색 루프를 등록부로 대체)

1. Worker가 신원(계정 또는 게스트)을 확인하고 생성 한도를 검사한다.
2. `(creator_key, request_id)`로 행을 조회한다. 있으면 그 `instance_id`와 `room_code`로 5단계에 간다. 이미 CLOSED이면 `410 ROOM_CLOSED`를 반환하고 **새 방을 만들지 않는다.**
3. 없으면 3.2의 조건부 INSERT. 코드는 HMAC 후보를 쓰고 `pr_live_code` 충돌 시 다음 후보로 최대 5회 시도한다.
4. 상한 초과면 503, 코드 후보 소진이면 503 `LOBBY_UNAVAILABLE`.
5. Worker가 DO `/internal/public-create`를 호출한다. 1단계의 멱등 동작을 유지한다. 다른 방(주로 private)이 그 코드를 쥐고 있으면 등록부의 코드를 다음 후보로 바꾸고 재시도한다.
6. DO가 저장을 끝내면 자기 요약 outbox에 WAITING을 기록한다. 응답에는 `listingStatus: "VISIBLE" | "PENDING"`을 넣는다. D1 반영이 늦으면 PENDING이며 좌석은 그대로 유지된다.

## 4. 게스트 참가 (1단계 대비 핵심 변경)

### 4.1 신원 모델

현재 `RoomAccountIdentity`는 계정 전용이다. 이를 `account | guest` 신원으로 일반화한다.

- 게스트 신원은 Worker가 발급하는 서명 쿠키 `__Host-porena_guest`(`HttpOnly; Secure; SameSite=Lax; Path=/`). 값은 `v1.<무작위 128bit>.<발급시각>.<HMAC>`이며 서명 키는 `PUBLIC_ROOM_SECRET`에서 라벨을 달리해 도출한다.
- 서명은 **임의 ID 위조와 타인 ID 사칭만** 막는다. 쿠키를 지우거나 브라우저를 바꾸면 새 게스트를 만들 수 있으므로 "1인 1신원" 보호가 아니다. 실질 방어는 아래 한도다.
- 좌석에는 게스트 ID 원문 대신 도출 해시(`guestKey`)만 저장한다. PlayerView, 응답, 로그에는 넣지 않는다(IDENTITY-002-g와 같은 원칙).
- 1단계의 `accountUserId` 중복 착석 검사를 `accountUserId` 또는 `guestKey` 기준으로 확장한다. 한 방에 한 신원은 한 좌석이다.
- 게스트 닉네임은 기존 `normalizeNickname` 규칙(1~8자)을 쓴다. 공개 요청 본문 `nickname`으로 받고, 잘못된 값은 400이다.
- 게스트는 RP 대상이 아니다(RANK-SYSTEM-002-d 유지).

### 4.2 한도 초안 (모두 코드 상수, 조정 가능)

| 대상 | 한도 | 이유 |
| --- | --- | --- |
| 신원당 활성 공개방 생성 | 1개 (게스트 포함) | 자리·슬롯 독점 방지 |
| 신원당 생성 | 2회/분 | 보고서 제안 |
| IP당 방 생성 | 5회/10분 | 쿠키 초기화를 통한 반복 생성 방지 |
| 신원당 참가 | 10회/분 | 보고서 제안 |
| 한 방의 같은 IP 좌석 | 3석 | PC방·학교·가족 공유망을 완전히 막지 않기 위해 완화 |
| 목록 조회 | 30회/분/IP | 재연결·참가 예산과 분리된 별도 limiter |

- Worker rate-limit binding은 지역별 근사 카운터다. 정확한 전역 상한은 위 D1 조건부 INSERT와 `creator_key` 활성 방 1개 제약으로 보장한다.
- 위 수치는 출시 전 공유망 시나리오(REG-08)로 검증한 뒤 조정한다.

### 4.3 RP와의 관계 (확정: 현행 유지)

현행 규칙은 Human 보너스를 시작 시 착석 인원(게스트 포함)으로 계산한다([DECISIONS RANK-SYSTEM-002-c](DECISIONS.md)). 공개방에서 게스트가 누구나 쉽게 앉을 수 있게 되면, 한 사람이 계정 1개와 게스트 여러 석으로 보너스를 키울 유인이 생긴다. 규칙 변경은 사용자 승인 사안인데, 사용자가 **현행 유지(게스트 포함)** 를 선택했다. 이 설계는 산식을 바꾸지 않는다. 베타에서 공개 게스트 좌석으로 보너스를 키우는 사례가 보이면 "공개방은 계정 좌석만 센다"로 바꾸는 안을 다시 올린다.

### 4.4 Discord Activity

임베디드 환경은 서드파티 쿠키가 막힐 수 있다. 게스트 쿠키를 저장하지 못하면 공개방 참가를 막고 "브라우저에서 이용" 안내를 한다. 이 동작은 3단계 UI에서 실제 환경으로 확인해야 하며 이번 단계에서 검증하지 않는다.

## 5. DO → D1 요약 전달

1. GameRoom은 좌석·상태가 바뀔 때마다 **같은 저장(commit)** 에 `publicSync { seq, summary, retryAt, attempts }`를 함께 기록한다. 요약에는 confirmed/reserved 수, lifecycle, 만료 시각만 넣는다(카드·판정·계정 정보 없음).
2. 전송은 `blockConcurrencyWhile` 밖에서 짧은 제한 시간으로 한다. 최신 요약 하나로 합친다. 성공하면 "전달 완료 seq"를 짧게 기록한다.
3. D1 반영 조건: `WHERE instance_id = ? AND summary_seq < ? AND state NOT IN ('FINISHED','CLOSED','CANCELLED')`. 같은 seq 재전송은 성공으로 본다. 종료 상태는 더 큰 seq로도 WAITING으로 되돌릴 수 없다.
4. 실패하면 1초부터 시작해 최대 30초 간격으로 지터를 두어 재시도한다. `retryAt`은 저장하고 기존 단일 alarm 슬롯에 `reason: "lobby-sync"`로 합산한다. 카드 공개·barrier 기한을 덮어쓰지 않는다.
5. 목록 표시 조건인 WAITING 방만 30초마다 lease를 갱신한다. 인원 0, 만원, 시작한 방은 갱신하지 않는다.
6. 공개 DB 장애 중에도 진행 중인 WS 게임은 이 DB를 호출하지 않는다. 신규 공개 후보 검색만 멈춘다.

## 6. 목록 API

`GET /api/public-rooms?cursor=&limit=20` (Origin 헤더 요구 없음, IP limiter 사용 — rankings GET과 같은 패턴)

```json
{ "serverNow": 0, "rooms": [{ "instanceId": "…", "roomCode": "ABC234", "capacity": 8, "openSeats": 3,
  "confirmed": 4, "reserved": 1, "createdAt": 0, "leaseExpiresAt": 0, "roomExpiresAt": 0,
  "rulesVersion": 2, "protocolVersion": 0, "language": "ko", "regionHint": "ASIA" }], "nextCursor": null }
```

- 조건: `state='WAITING' AND lease_expires_at > :now AND room_expires_at > :now AND confirmed_count + reserved_count < capacity`. 정렬은 `(created_at, instance_id)` keyset.
- 공개 100개 상한 덕에 전체 목록이 작다. 그래도 20개 단위 페이지 계약은 유지한다.
- 캐시: Worker Cache API로 최대 5초. 캐시에서 꺼낸 항목도 **응답 시점**에 lease·만료를 다시 검사해 제외한다. 응답에는 개인 정보가 없고 `Vary: Cookie`가 필요 없는 공개 응답만 공유 캐시한다.
- 목록은 참가 후보일 뿐이다. 정원·시작 여부의 최종 판단은 참가 요청 시 GameRoom이 한다(1단계 동작).
- 응답에 `creator_key`, `request_id`, 계정·게스트 식별자, 토큰, 카드·판정 정보는 없다(REG-04 테스트).

## 7. Cron 복구 (`* * * * *`, 기존 `0 18 * * *`와 별도)

배치당 최대 100건, 인덱스 조회만 한다.

1. PROVISIONING이 2분을 넘은 행 → CANCELLED, 슬롯 반납.
2. `repair_due_at <= now`인 행 → GameRoom `/internal/public-repair`로 현재 상태를 묻는다. DO가 없으면(404) CLOSED로 닫고 슬롯을 반납한다. 정상이면 최신 요약과 다음 `repair_due_at`을 받는다.
3. PLAYING 방은 시작 시 `repair_due_at = now + 30분`으로 잡고, 매 점검 때 연장한다. alarm이 멈춘 방이 슬롯을 24시간 붙들지 않게 한다.
4. 24시간 지난 종료 기록 삭제.
5. lease 만료만으로는 방을 닫지 않는다(복구 가능한 STALE). DO가 정상 복귀하면 다시 표시된다. DO가 확정한 종료(CLOSED/EXPIRED)와 구분한다.
6. Cron의 숨김 처리는 읽은 `summary_seq`가 그대로일 때만 적용한다. 새 갱신을 덮어쓰지 않는다.

## 8. 운영 영향 최소화 (배포 전략)

- 코드는 `PUBLIC_LOBBY_DB`가 없으면 `503 LOBBY_UNAVAILABLE`, `PUBLIC_ROOMS_ENABLED`가 꺼져 있으면 404로 응답한다. 1분 Cron도 같은 조건에서 즉시 종료한다.
- 테스트용 D1은 vitest의 miniflare 설정으로 주입한다(주입 방식은 구현 때 확인). **`wrangler.jsonc`의 D1 바인딩과 Cron 추가는 운영 DB를 만든 뒤 릴리스 단계에서 한다.** 그래서 develop과 main에 코드를 머지해도 운영 동작은 바뀌지 않는다.
- 운영 반영에는 아래가 필요하며 모두 별도 승인이다: `wrangler d1 create` 및 마이그레이션 적용, `PUBLIC_ROOM_SECRET` 등록, `PUBLIC_ROOMS_ENABLED` 설정, `wrangler.jsonc` 바인딩·Cron·limiter 추가, 배포.

## 9. 비용 감각 (모델 추정, 측정값 아님)

상한 100개라면 최악의 lease 쓰기는 `100방 × (30일 ÷ 30초) = 약 864만 회/월`이다. 한 번에 약 1~3행 쓰기로 보면 약 900만~2,600만 행이며 Workers Paid 포함량(D1 쓰기 5,000만 행/월) 안이다. 방은 최대 60분만 대기하므로 실제는 이보다 훨씬 작다. 1분 Cron은 월 약 4만 3천 회 호출이다. 실제 `rows_written`은 staging에서 측정한다.

## 10. 구현 순서와 검증

| 단계 | 내용 | 주요 파일 |
| --- | --- | --- |
| 2-A | 스키마·마이그레이션, 등록부 모듈, 100개 상한 원자 확보 | `public-lobby-migrations/`, `worker/publicLobby.ts` |
| 2-B | 신원 일반화(account/guest), 게스트 쿠키, 한도 | `worker/roomIdentity.ts`, `worker/publicGuest.ts`, `worker/index.ts`, `src/game/publicRoom.ts` |
| 2-C | 생성 흐름을 등록부 기반으로 교체, 1단계 probe 루프 제거 | `worker/index.ts`, `worker/GameRoom.ts` |
| 2-D | DO outbox, D1 조건부 반영, lease, 종료 기록 | `worker/GameRoom.ts`, `worker/publicLobby.ts` |
| 2-E | 목록 API, 캐시, 별도 limiter | `worker/index.ts` |
| 2-F | Cron 복구, `/internal/public-repair` | `worker/index.ts`, `worker/GameRoom.ts` |

**검증 기준 (감사 보고서 PUB 14~25와 이번 결정)**
- 100개 상한: 동시 생성 요청이 상한 이내만 성공, 반납 후 재생성 가능, 상한은 테스트에서 낮춰 검증.
- 생성 멱등: 방이 삭제된 뒤의 재시도가 새 방을 만들지 않고 `410`.
- 목록: 만원·진행 중·lease 만료·방 만료·private·solo 방 0건 노출, 응답에 식별자 0건, 캐시된 항목도 만료 후 제외.
- 순서·장애: seq 역전·중복·종료 후 WAITING 재도착 무시, D1 쓰기 실패 주입(전·후), 공개 DB 장애 중 기존 게임 진행, Cron과 갱신 경쟁.
- 게스트: 위조·변조 쿠키 거부, 한 방 한 신원 한 좌석, 생성·참가 한도, 게스트 좌석은 RP 정산 의무를 만들지 않음, private 게스트 참가는 기존 그대로.
- 회귀: 1단계 테스트 16건, 기존 Worker 테스트, private·solo·멀티 RP, 게임 규칙·타이머·쇼다운 공개 시각.

## 11. 알려진 위험

- 게스트 쿠키는 초기화가 쉽다. 한도는 완화책일 뿐 남용을 완전히 막지 못한다.
- 같은 IP 3석 한도는 공유망 사용자를 막을 수 있다. 실제 반응을 보며 조정해야 한다.
- PLAYING 방이 슬롯을 쥐므로, 100개가 모두 진행 중이면 새 방을 만들 수 없다. 사용자에게 보이는 안내는 3단계 UI에서 다룬다.
- D1 조건부 INSERT의 동시성은 문서 근거와 구현 후 테스트에 의존한다.

## 12. 결정 기록과 남은 미정

**확정(2026-10-17):** 100개 상한은 진행 중인 방을 포함한다. Human 보너스는 현행 유지(게스트 포함). 게스트도 공개방을 만들 수 있다(4.2의 엄격한 한도 적용).

**아직 미정:** 4.2 한도 수치의 최종값(출시 전 공유망 검증 후 확정), 지역·언어 필터의 노출 범위, Discord Activity에서의 게스트 공개방 동작, 운영 반영 시점.
