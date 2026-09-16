# Run It Twice 결과 요약 및 리롤 제한

2026-09-16

1. **기존 UI 문제**: 보드와 Glow만으로 개별 Run 승패, 동률 원인, 최종 승자까지 연결해서 읽기 어려웠다.
2. **Match Summary**: `src/game/runItTwiceSummary.ts`가 기존 `boardWinnerIds`, `winnerIds`, `runoutCount`를 읽어 Run 결과, 정규 승수, 동률, SD 시도 목록, 최종 승자를 반환한다. 카드 재평가는 없다.
3. **Run Winner**: 로컬/온라인 보드마다 `BOARD 1 · RUN 1`과 `이름 WIN` 또는 `SPLIT`을 표시한다.
4. **정규 Score**: 참가자 순서에 맞춰 단독 승리 횟수를 표시한다. Split은 양쪽 0승으로 기존 엔진 집계와 동일하다. 따라서 1승+Split은 1:0, 양쪽 Split은 0:0이다.
5. **Sudden Death**: 동률 안내 및 각 시도의 번호/승자/Split을 별도 표시한다. SD 승리는 정규 점수에 더하지 않는다.
6. **Final Match Winner**: 별도 MATCH WINNER 영역에 최종 승자와 정규 Run 또는 SD 승리 경로를 표시한다. 시네마틱은 완료된 Run만 공개하며 최종 결과는 RESULT 단계 이후에 표시한다.
7. **리롤 제한**: `BALANCE.maxRerollsPerRound = 2`. `rerollShop`이 한도를 검사하고 성공 시 `rerollsUsed`를 증가시킨다. `startNextRound`에서 초기화한다. 기존 저장 데이터의 누락된 횟수는 0으로 해석한다.
8. **Pending**: `OnlineApp`에서 동기 ref로 같은 렌더 프레임의 재클릭도 막는다. 본인 요청 ID의 ACK를 받고 해당 revision의 PLAYER_VIEW가 도착할 때 해제한다. 실패·연결 종료·재접속 시 해제한다. 버튼에 REFRESHING 및 남은 횟수를 표시하며 5초 쿨타임은 없다.
9. **Concurrent Reroll**: 기존 GameRoom의 `blockConcurrencyWhile`, 복제 상태의 명령 처리, 저장 성공 후 공개, 요청 ID 중복 제거 구조를 유지했다. 동일 요청 ID는 재차감하지 않으며 다른 ID의 연타도 서버 한도를 초과할 수 없다. 3명 WebSocket 동시 리롤과 재전송/연타를 실제 Cloudflare 테스트 런타임에서 검증했다.
10. **Card Ledger**: 기존 52개 고유 카드·상태→플레이어 검증에 플레이어→상태 역방향 검증을 추가했다. 상점 간 중복, 소유/예약 중복, 중복 ID 목록, 잘못된 예약자, 상점에 없는 잠금 카드, 잘못된 상태를 거부한다. 리롤 전후 검사하고 복제 상태만 갱신하므로 실패한 요청은 원본을 바꾸지 않는다.
11. **변경/추가 파일**:
    - 게임: `src/game/config.ts`, `types.ts`, `engine.ts`, `cardPool.ts`, `playerView.ts`, `runItTwiceSummary.ts`
    - 프로토콜: `src/shared/protocol.ts`
    - UI: `src/ui/App.tsx`, `OnlineApp.tsx`, `ShowdownCinematic.tsx`, `RunItTwiceResult.tsx`, `styles.css`
    - 테스트: `src/game/reroll.test.ts`, `runItTwiceSummary.test.ts`, `src/ui/runItTwiceRendering.test.ts`, `tests/worker/room.test.ts`
    - 보고서: `RUN_IT_TWICE_REPORT.md`
    - 작업 시작 전에 존재한 `ShowdownHand.tsx`, `handLabel.ts` 등 변경과 상위 node_modules 캐시는 유지했다.
12. **추가 테스트**: 2회 성공/3회 거절, 다음 라운드 초기화, 자금·단계·탈락 거절 시 원본 보존, 잠금/할인 유지, 이전 저장 데이터 호환, 카드 중복 검출, 2:0/승리+Split/1:1/양쪽 Split/SD 재무승부, 연출의 미래 결과 비공개, 세 플레이어 동시 리롤·중복 요청·연타·재시작 후 한도 유지.
13. **검증 결과**: 일반 테스트 57개, Cloudflare 런타임 테스트 4개 통과. 린트, TypeScript, 프로덕션 빌드 통과. 로컬 브라우저에서 2/2→1/2→0/2 비활성화와 R2 초기화를 확인했다. R2 정규 승리 및 1:1→SD→최종 승자를 확인했고, 850px/390px 화면에서 가로 넘침이 없었다. 온라인 동시성은 WebSocket 런타임 테스트로 검증했으며 배포 환경 부하 시험은 하지 않았다.
14. **기존 규칙 영향**: 의도한 게임 규칙 변경은 라운드당 리롤 2회 제한이다. 기본 5BB 및 기존 2BB 할인 증강, 카드별 잠금, 구매/판매, 포커 평가, R1~R5 판정, Board 생성, BEST 5, 브래킷, Cloudflare 구조는 유지했다. PlayerView는 본인 횟수/한도 두 필드만 추가했고 상대 비공개 정보 공개 범위는 그대로다. 커밋·푸시·배포는 수행하지 않았다.
