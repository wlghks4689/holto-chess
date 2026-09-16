# Showdown Cinematic / R5 Final 구현 완료 보고

2026-09-16. 이전 체크포인트의 남은 브라우저 및 온라인 인수 검증까지 완료한 보고서입니다.
커밋, 푸시, 배포는 하지 않았습니다.

## 구현 항목 19개

1. 기존 UI: 엔진 결과를 즉시 정적 MatchCard/MatchView에 표시하던 구조입니다. 정적 결과는 유지하고 앞에 CinematicGate를 배치했습니다.
2. Cinematic State: 순수 timeline/frameAt 함수와 클라이언트 elapsed/speed/focus 상태로 분리했습니다. 엔진 또는 서버에 프레임별 상태를 저장하지 않습니다.
3. VS Intro: 1.2초. 헤즈업, 3인전, 최종 4인전 제목과 참가자 영역을 구분합니다.
4. 반응형: 639px 이하 헤즈업 인트로는 상대 위/본인 아래, 640px 이상 좌우. 3인전은 모바일 세로, R5는 2×2입니다. 639/640px 경계를 실제 브라우저에서 확인했습니다.
5. 공개 타이밍: 플롭 200ms 간격, 마지막 플립 완료 후 1000ms, 턴 플립 완료 후 1000ms, 리버 suspense 250ms 및 플립 400ms, 완료 후 800ms 대기입니다.
6. River: 회전/확대/밝기 전용 애니메이션. 2x 속도 선택 시 플립 시간도 같이 단축합니다.
7. BEST 5: 엔진 usedCardIds를 사용합니다. 클라이언트가 승자를 재계산하지 않습니다. 보드 초점은 참가자별 BEST 5 확인 버튼으로 변경할 수 있습니다.
8. Dim: glow → 미사용 홀카드 dim → 미사용 보드 dim → 프로필 → 족보 순서입니다.
9. Made Hand: 기존 detailedHandLabel과 madeTone을 재사용합니다. 색상/글로우는 시네마틱 CSS에 연결했습니다.
10. Reward: 엔진의 실제 before/after BB 및 point 차이와 그룹/생존/탈락 상태를 저장하여 표시합니다. UI에서 보상을 다시 계산하거나 지급하지 않습니다.
11. R2: RUN 1, RUN 2, 필요한 Sudden Death 보드를 순서대로 재생합니다. 같은 매치에서는 VS를 반복하지 않습니다.
12. R3: 보유 4장 표시, 기존 evaluator의 홀 2장 + 보드 3장 usedCardIds 사용. UI에 해당 규칙을 표기합니다.
13. R4: 기본전 최대 5홀카드, 2차전 3인 참가자 영역과 그룹별 제목/등수 표시입니다.
14. R5: 보드 없이 4명 최대 7장씩 공개. 110ms 간격으로 같은 카드 순번을 네 플레이어에게 동시에 공개하고 마지막 플립 후 800ms 대기합니다. 각자 Best 5를 강조합니다.
15. R5 Point: 사용자 승인 임시값 1위 6 / 2위 4 / 3위 2 / 4위 0. 공동 등수는 동일 점수, 기존 competition ranking 유지(예: 1,1,3,4).
16. 최종 동점: 기존 누적 포인트 + 족보점수 + floor(BB/10), 동일 합계에서는 R5 등수가 높은 플레이어 우선입니다.
17. Skip/Speed: Skip Cinematic, 1x/2x 제공. 완료 또는 스킵 후 기존 결과 화면으로 돌아갑니다. 서버 계산에 영향을 주지 않습니다.
18. 테스트: 일반 44개, Worker 3개, 밸런스 시뮬레이터 6개 통과. lint, TypeScript, production build 통과. R5 동일 족보/무늬 무관/전체 flush kicker/공동 순위/중복 지급 방지/원장 유지와 timeline/초기 렌더 결과 은닉, Sudden Death 결판 보드 recap을 검사했습니다.
19. 게임 규칙 영향: 의도적인 변경은 승인된 R5 순위 포인트와 명시적인 R5 순위 기반 최종 동점 정렬입니다. 포커 evaluator, 기존 상점/증강/탈락/일반 라운드 보상 규칙은 변경하지 않았습니다. 로컬 UI는 준비 직후 결과를 계산하여 시네마틱으로 연결하고, 온라인 READY 프로토콜은 유지합니다.

## 확인한 실제 화면 및 흐름

- R2: RUN 1 → RUN 2 → Sudden Death 순차 재생, 2배속, 최종 보상 2개 확인. 정적 recap이 이전 기본 보드 족보를 보여주던 결함을 발견하여 마지막 결판 보드 결과로 수정했습니다.
- 639px: 헤즈업 인트로가 1열이며 상대가 위, 내가 아래. `scrollWidth 639 == innerWidth 639`.
- 640px: 헤즈업이 좌우 2열. `scrollWidth 640 == innerWidth 640`.
- R3: 양쪽 모두 홀 4장 중 2장 glow/2장 dim, 보드 3장 glow/2장 dim. 홀 2 + 보드 3 표기 확인.
- R4: 850px 3인 `SURVIVAL SHOWDOWN`, 각자 후보 10장 중 Best 5가 각각 홀/보드 3+2, 2+3, 3+2로 일치. `scrollWidth 835 <= innerWidth 850`.
- R5 320px 인트로: 4명, 2×2, 카드 뒷면 28장, 보드 0개, 결과 선노출 없음. `scrollWidth 320 == innerWidth 320`.
- R5 완료: 네 명 모두 7장 중 glow 5장/dim 2장, 1~4위, 보상 4개, 보드 0개 확인.
- 최종 순위표는 기존 CSS에서 320px 가로 넘침이 발견되어 2행형 모바일 grid로 수정했습니다. 수정 후 네 행 모두 폭 278px, `scrollWidth 320 == innerWidth 320`.
- 온라인 실제 2탭: p1/p2 동일 방 참가, READY, 상점 확정, 각자 다른 매치 시네마틱 수신, Skip/2x, p1 재접속 좌석 유지, 두 사용자 동의 후 R2 상점 전환을 확인했습니다. 테스트 탭과 세션은 정리했습니다.

## 알려진 호환성 범위

1. 구버전 저장 스냅샷은 rewards가 없으면 보상 상세를 생략합니다.
2. 변경 전 R5 스냅샷이 Best 5만 저장했다면 과거 7장 전체는 복원할 수 없습니다. 새로 생성되는 결과에는 최대 7장이 저장됩니다.
3. 브라우저 재로드는 동일한 서버 결과의 시네마틱을 처음부터 다시 재생합니다. 화면 내 재접속 버튼은 이미 완료한 시네마틱을 반복하지 않습니다.
4. 이번 작업에서는 커밋, 푸시, 배포를 수행하지 않았습니다.

## 후속 교착 버그 수정

- 판매 후 보유 장수 + 남은 구매 횟수가 라운드 필수 장수보다 작아지는 판매를 엔진에서 거부합니다.
- 로컬 및 온라인 UI도 같은 계산으로 카드를 비활성화하고 `판매 불가`와 원인을 표시합니다.
- 시작 카드 판매 → 카드 2장 구매 경로에서 보유 2장, 구매 2/2 상태의 재판매가 차단되고 R1 쇼다운이 정상 시작되는 것을 실제 브라우저에서 확인했습니다.
- 이미 수정 전에 1장으로 교착된 실행 상태는 새 게임 또는 새로고침이 필요합니다.

## 주요 코드

- src/game/config.ts: FINAL_ROUND_PLACEMENT_POINTS
- src/game/engine.ts: captureRewards, R5 points, finalStandings
- src/game/matchView.ts: 공개 필드 allowlist
- src/ui/cinematicTimeline.ts: 연출 순서/시간
- src/ui/ShowdownCinematic.tsx: 실제 UI 및 결과 노출 gate
- src/ui/cinematic.css: 반응형, 카드 공개/글로우
- src/ui/App.tsx, src/ui/OnlineApp.tsx: 로컬/온라인 연결
- src/game/finalShowdown.test.ts, src/ui/cinematicTimeline.test.ts, src/ui/cinematicRendering.test.ts: 신규 회귀 검사

기존 Vite node_modules 캐시 변경은 작업 대상이 아니므로 보존했습니다.
