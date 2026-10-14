# 공개방 1단계 — 안전한 방 수명 (PUBLIC-ROOMS-001)

- 작성: Claude, 2026-10-13. 브랜치 `feat/public-rooms-phase1`, 기준 `0707ed3e98a3d6b055715fe4dc0529d278ee080b`(= 감사 보고서 기준 = 작업 시작 시 `origin/main`).
- 근거: `PORENA-public-rooms-audit-2026-10-13.md`(사용자 첨부). 보고서 기준과 main 사이 diff가 없어 재확인 구간은 없었다. 대신 보고서 주장 6건(정원 판정, join 재시도, 요청 시점 만료, connected 판정, solo RP, 목록 부재)을 코드에서 직접 확인했다.
- 상태: 로컬 구현과 테스트만 진행했다. 커밋, push, 운영 secret 등록, D1 마이그레이션, 배포는 실행하지 않았다.

## 사용자 결정 (2026-10-13)

| 항목 | 결정 |
| --- | --- |
| 공개방 생성·참가 자격 | 계정 전용. private 게스트 참가는 유지 |
| 공개 대기 시간 값 | 보고서 제안값: 예약 30초, 재연결 유예 90초, 빈 방 60초 후 종료, 무활동 30분(기존 LOBBY 값), 생성 후 최대 60분 |
| 응답 유실 후 재시도 | HMAC 결정적 토큰. 원문 토큰은 저장하지 않음. 새 Worker secret `PUBLIC_ROOM_SECRET` 필요 |
| 요청 시점 논리 만료 검사 | private 방에도 적용 |

## 범위

- 포함: 공개방 전용 `visibility`·`instanceId`, 좌석 예약·확정·유예·회수, `seatEpoch`, create/join 재시도 처리, 요청 시점 만료 검사, presence(close 이벤트, 30초 점검, opt-in heartbeat).
- 제외(2단계 이후): PUBLIC_LOBBY_DB, registry, 목록 GET, lease, tombstone, Cron, 캐시, 계정당 활성 공개방 상한, UI.
- 기본값은 비활성이다. `PUBLIC_ROOMS_ENABLED`가 `"1"`이 아니면 `/api/public-rooms*`는 404를 반환한다. 운영 `wrangler.jsonc`에는 추가하지 않았다.

## 유지한 동작

- private 생성·초대 코드·URL·게스트 참가, 서버 solo(RP 미지급 그대로), 로컬 연습.
- 게임 규칙, 판정, 타이머, 쇼다운 공개 시각, 멀티 RP 산식과 정산.
- 공개방도 PLAYING에 들어간 뒤에는 private와 같은 흐름(봇 대체, departed, 기권, 재경기)을 따른다.
- private 방에서 달라지는 점은 하나다. 만료 시각이 지났지만 alarm이 아직 실행되지 않은 방은 join, ticket, session, WS를 404로 거부하고 수명을 다시 연장하지 않는다. 미정산 `rankPending`이 남은 방은 기존처럼 유지한다.

## 동작 명세

| 상황 | 결과 |
| --- | --- |
| `POST /api/public-rooms {requestId}` | 계정 필수. 코드와 instanceId는 `HMAC(secret, 계정·requestId·시도번호)`. 같은 requestId로 재시도하면 같은 방과 같은 토큰. 응답: `roomId, playerId, token, instanceId, reservedUntil` |
| `POST /api/public-rooms/:code/join {requestId, instanceId}` | 계정 필수. instance가 다르면 410 `INCARNATION_MISMATCH`, private 방이면 404 `ROOM_NOT_FOUND` |
| 같은 key 재시도 | 같은 credential(201). 예약이 만료된 key는 409 `RESERVATION_EXPIRED`, 퇴장·회수된 key는 409 `SEAT_RELEASED`. 기록 보존 10분 |
| 다른 key로 같은 계정 | 409 `ACCOUNT_ALREADY_SEATED` |
| 정원 | 예약+확정+유예 ≤ 8. 초과 시 409 `ROOM_FULL`. 퇴장한 좌석은 가장 낮은 빈 `pN`으로 재사용 |
| 시작 | 기존 규칙과 같다(최소 2명, 전원 READY). 예약·유예 좌석은 READY할 수 없어 시작을 막는다. 예약·확정·퇴장·회수 때 READY 전원 초기화 |
| 시작 후 신규 참가 | 409 `ROOM_STARTED`. 기존 좌석 재접속은 허용 |
| 연결 끊김(공개 LOBBY) | 즉시 READY 해제, 90초 유예 뒤 좌석 회수. 같은 좌석의 다른 탭이 열려 있으면 유예를 시작하지 않음 |
| 회수·퇴장된 좌석 | 소켓 4003 종료, ticket 삭제, 옛 토큰 401·SESSION_INVALID, 봇 이름 복원 |
| heartbeat | `porena-ping` → `porena-pong` 자동 응답(DO를 깨우지 않음). 한 번이라도 ping한 소켓이 90초 동안 무응답이면 4002로 닫음. 클라이언트 송신은 3단계에서 추가 |
| 수명 | 사람이 없으면 60초, 생성 후 60분이면 종료(410 `ROOM_EXPIRED`). presence 변화는 30분 무활동 시계를 연장하지 않음 |
| private 초대 코드로 공개방 참가 | 공개 규칙 적용(계정 필수, 예약). 이 경로는 재시도 키가 없음 |

## 알려진 한계

- 생성 재시도는 방이 삭제된 뒤에 들어오면 같은 코드로 새 방을 만든다. registry가 생기는 2단계에서 해결한다.
- heartbeat 미전송 클라이언트의 반쯤 열린 연결은 transport close나 30초 점검으로만 잡힌다.
- 동시 경쟁 테스트는 Worker 런타임에서 시나리오당 1회, 상태 모델은 순수 함수로 1,000 seed 실행했다. Worker 수준 1,000회 반복과 지역 부하는 4단계 범위다.
- `PUBLIC_ROOM_SECRET`을 교체하면 진행 중인 재시도 복원이 끊긴다(좌석 자체는 유지).

## 검증

| 명령 | 기준선 `0707ed3` | 이 브랜치 |
| --- | --- | --- |
| `npm run test:workers` | 126/126 통과 | 139/139 통과(신규 `tests/worker/publicRoom.test.ts` 13건) |
| `npm test` | 3건 실패 | 3건 실패, 같은 목록. 신규 `src/game/publicRoom.test.ts` 9건 통과 |
| 실패 3개 파일 단독 실행 | `openDraft` 1건 실패 | `openDraft` 1건 실패(기존 TODO에 기록된 공개 정책 건). `phasePreviewStates`·`R2DraftArena`는 단독 실행 시 통과, 전체 실행 시에만 30초 타임아웃 |
| `eslint`(변경 파일), `tsc -b`, `tsc -p tsconfig.worker.json` | — | 통과. 저장소 전체 lint의 기존 경고 1건(`tools/perf`)은 무관 |

신규 테스트와 보고서 ID의 대응: PUB-01·02(동시 100명), 03(READY와 join 경쟁, 5회), 04·06(같은 key 20회 동시 create/join, 응답 유실 재시도), 05(instance 불일치, 잘못된 요청), 07(30초 예약 반환), 08(100회 참가·퇴장, 순수 함수), 09(회수 좌석의 옛 socket·token·ticket), 10·13(유예 89/90초, 다중 탭), 11(private·public 요청 시점 만료), 12(시작 후 참가 거부, 재접속 허용), REG(플래그 off 404, 계정 전용, private 탐침 차단, private 게스트 초대 유지), 상태 모델 1,000 seed.

## 운영 반영 전 남은 일

- `PUBLIC_ROOM_SECRET` Worker secret 등록과 `PUBLIC_ROOMS_ENABLED` 설정은 배포 승인 범위에서 별도로 진행한다. 둘 다 없으면 공개방 경로는 404/503이고 기존 동작은 영향받지 않는다.
- private 방 요청 시점 만료 검사는 플래그와 관계없이 적용된다. 배포하면 즉시 운영 동작이 바뀐다.
