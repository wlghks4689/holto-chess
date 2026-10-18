# 공개방 2단계 — 목록·등록부·100개 상한·게스트 (PUBLIC-ROOMS-002) 구현 기록

- 작성: Claude, 2026-10-18. 브랜치 `feat/public-rooms-phase1`. 설계: [PUBLIC_ROOMS_PHASE2_DESIGN.md](../PUBLIC_ROOMS_PHASE2_DESIGN.md).
- 상태: 로컬 구현·테스트 완료, Codex 검증 대기. 운영 반영(D1 생성·마이그레이션, secret, 플래그, Cron, 배포)은 하지 않았다.
- 커밋: 2-A `797ad5d`, 2-B `bf92f24`, 2-C `42e7304`, 2-D `71da109`, 2-E `b9ff3cf`, 2-F(이 문서와 함께).

## 쉬운 요약

공개방을 찾고 들어가는 데 필요한 서버 기능이 모두 들어갔다. 화면(UI)은 아직 없다.

- **등록부**: 공개방 전용 작은 DB 표에 "지금 살아 있는 공개방" 목록을 둔다. 실제 자리와 게임은 여전히 각 방이 결정하고, 등록부는 찾기와 개수 제한만 맡는다.
- **100개 상한**: 살아 있는 공개방(게임 중 포함)이 100개면 새 방을 만들 수 없다. 여러 명이 동시에 만들어도 넘치지 않게 DB 한 문장으로 확인과 등록을 같이 한다.
- **게스트 참가·생성**: 로그인 없이도 공개방에 들어가고 만들 수 있다. 서버가 서명한 쿠키로 같은 게스트임을 기억한다.
- **목록 API**: 누구나 대기 중인 공개방을 20개씩 볼 수 있다. 만원 방, 게임 중인 방, 사람이 없는 방, 소식이 끊긴 방은 보이지 않는다.
- **자동 정리**: 1분마다 등록부와 실제 방이 어긋난 곳을 찾아 바로잡는다.

## 단계별 내용

| 단계 | 한 일 | 주요 파일 |
| --- | --- | --- |
| 2-A | 등록부 표와 인덱스, 100개 상한 확보, 같은 생성 요청은 영원히 같은 방 | `public-lobby-migrations/0001_public_rooms.sql`, `worker/publicLobby.ts` |
| 2-B | 게스트 신원 쿠키, 계정·게스트 공용 좌석, 한 방 같은 IP 3석 | `worker/publicGuest.ts`, `worker/roomIdentity.ts`, `src/game/publicRoom.ts` |
| 2-C | 생성 흐름을 등록부 기반으로 교체, 1인 1방, IP당 10분 5회 | `worker/index.ts`, `worker/publicLobby.ts` |
| 2-D | 방이 자기 상태를 등록부에 보고(번호로 순서 보장, 실패 시 재시도, 30초 갱신) | `worker/GameRoom.ts`, `worker/publicLobby.ts` |
| 2-E | 목록 API, 20개 페이지, 5초 캐시 | `worker/publicList.ts` |
| 2-F | 1분 Cron 정리, 방 쪽 점검 창구 | `worker/publicRepair.ts`, `worker/GameRoom.ts` |

## 응답 코드 (새로 생긴 것)

| 상황 | 코드 |
| --- | --- |
| 게스트가 닉네임 없이 요청 | 400 `NICKNAME_REQUIRED` |
| 같은 게스트가 같은 방에 또 참가 | 409 `GUEST_ALREADY_SEATED` |
| 같은 IP가 한 방에 4번째 자리 | 409 `NETWORK_SEAT_LIMIT` |
| 신원 없이 초대 코드로 공개방 참가 | 401 `IDENTITY_REQUIRED` (공개 참가 경로가 쿠키를 발급) |
| 이미 살아 있는 공개방이 있는 사람이 또 생성 | 409 `CREATOR_HAS_ROOM` |
| 같은 IP 10분 6번째 생성 | 429 `RATE_LIMITED` (`Retry-After: 600`) |
| 공개방 100개 가득 | 503 `PUBLIC_CAPACITY_REACHED` (`Retry-After: 30`) |
| 끝난 방의 생성 재시도 | 410 `ROOM_CLOSED` (새 방을 만들지 않음) |
| 공개방 DB 없음 | 503 `LOBBY_UNAVAILABLE` |
| 잘못된 목록 커서 | 400 `INVALID_CURSOR` |

## 설계와 다르게 한 부분 (검토 요청)

1. **신원당 생성 2회/분, 참가 10회/분 한도는 따로 만들지 않았다.** Workers rate-limit은 10초·60초 창만 지원하고, 새 limiter 바인딩은 운영 설정이 필요하다. 대신 "1인 1방"(등록부)이 생성을 더 강하게 막는다. 참가는 기존 IP 연결 한도(120회/분)를 따른다.
2. **목록 조회 한도는 30회/분이 아니라 기존 연결 limiter(120회/분/IP)를 별도 키로 쓴다.** 재접속 예산과 섞이지는 않는다. 전용 limiter는 릴리스 때 `wrangler.jsonc`에 추가하는 것을 권한다.
3. **방→등록부 전송은 알람 안(직렬 구간)에서 3초 제한으로 한다.** 설계서는 직렬 구간 밖을 권했지만, 기존 RP 정산(`flushRank`)과 같은 방식을 택했다. 목록 갱신 때문에 게임 처리가 최대 3초 늦어질 수 있는 상한이 생긴다. 실제 D1 지연은 staging에서 측정해야 한다.
4. **`protocolVersion`에는 기존 화면 연출 버전(`PRESENTATION_VERSION`)을 기록한다.** 별도 프로토콜 버전 상수가 없어서다.
5. **생성 응답의 `listingStatus` 필드는 넣지 않았다.** 방은 생성 직후 알람으로 바로 등록부에 보고한다. 표시 문구는 3단계 UI에서 정한다.
6. **0001 마이그레이션에 `network_key` 열과 인덱스 2개를 추가했다.** 아직 어떤 실제 DB에도 적용한 적이 없어 같은 파일을 고쳤다.

## 운영 영향

- `wrangler.jsonc`는 바꾸지 않았다. 테스트용 D1은 `vitest.workers.config.ts`에서만 주입한다.
- 운영에는 `PUBLIC_ROOMS_ENABLED`, `PUBLIC_ROOM_SECRET`, `PUBLIC_LOBBY_DB`가 없으므로 공개방 경로는 404, 1분 Cron은 등록되지 않았고 등록돼도 즉시 끝난다.
- private 방·서버 solo·게임 규칙·타이머·쇼다운 공개 시각·멀티 RP 산식은 바꾸지 않았다. private 방은 게스트 쿠키를 발급하지도 읽지도 않는다(테스트로 확인).

## 운영 반영 순서 (모두 별도 승인)

1. `wrangler d1 create porena-public-lobby` → `wrangler.jsonc`에 `PUBLIC_LOBBY_DB` 바인딩(`migrations_dir: "public-lobby-migrations"`) 추가 → 원격 마이그레이션 적용.
2. `PUBLIC_ROOM_SECRET` Worker secret 등록.
3. `triggers.crons`에 `"* * * * *"` 추가. 필요하면 목록 전용 limiter 추가.
4. staging에서 D1 동시성·지연·`rows_written` 측정, 공유망 한도 확인.
5. `PUBLIC_ROOMS_ENABLED="1"` 설정 후 배포.

## 검증

| 검사 | 결과 |
| --- | --- |
| `npm run test:workers` | 178/178 통과 (공개방·등록부 관련 47건 포함) |
| `npm test` | 918/921. 실패 3건(`releaseAudit`, `phasePreviewStates`, `R2DraftArena`)은 전체 동시 실행 때만 나는 시간 초과이고, 하나씩 실행하면 모두 통과 |
| `tsc -b`, `tsc -p tsconfig.worker.json`, `eslint .` | 오류 0 (기존 경고 1건, `tools/perf`) |
| `npm run build` | 통과. 생성 타입 파일 변경 없음 |

신규 테스트가 다루는 것: 동시 생성 시 상한, 실제 100개 상한, 같은 요청 20회 동시, 끝난 방 재시도 410, 코드 충돌·이동, 1인 1방, IP당 생성 제한, 게스트 쿠키 발급·재사용·위조 거부, 게스트 1인 1석, 같은 IP 3석, 게스트 RP 제외(보너스 인원에는 포함), 등록부 반영·인원 추적·게임 중 슬롯 유지, 결과 화면에서 슬롯 반납과 재경기 미노출, D1 장애 중 게임 진행 후 재전송, 30초 갱신, 삭제 시 CLOSED, 순서 뒤바뀜·종료 후 부활 거부, 목록 노출 조건·공개 필드·페이지·커서·캐시, Cron의 취소·닫기·되살리기·24시간 삭제·경쟁 상황 보호.

한계: 동시성 검증은 로컬 miniflare D1에서 했다. 실제 D1의 동시성·지연은 운영 DB를 만든 뒤 staging에서 확인해야 한다.
