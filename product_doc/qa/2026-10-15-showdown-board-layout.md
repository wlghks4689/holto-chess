# 쇼다운 보드 배치 및 완료 RUN 이동

## 요청과 범위

- PC 커뮤니티 보드 제목을 좌우 플레이어 닉네임 높이로 내린다.
- FLOP / TURN / RIVER 안내를 보드 카드 가로 중앙 위 5px에 표시한다.
- Run It Twice / Three Times에서 완료 RUN을 아래 기록 영역으로 부드럽게 이동한다.
- 게임 판정과 공개 카드 범위는 유지한다. 후속 사용자 요청으로 플랍 3장의 공개 구간만
  각각 500ms에서 450ms로 줄인다. 나머지 스트리트와 결과 대기 시간은 유지한다.

## 구현

- 기존 PC 3열 조건인 `min-width:1200px` + `min-aspect-ratio:4/3`에서 전체 높이의
  커뮤니티 보드 제목을 인접 닉네임 중심에 맞춘다. 높이 760px 이하에서는 기존 닉네임의
  아이콘 행 배치에 맞춰 제목도 이동한다. 다자전·최종전의 세로 배치는 유지한다.
- 공통 `ShowdownCinematic`에서 스트리트 안내를 `.cinema-board-cards`의 위치 기준에
  연결한다. 카드 상단과 안내 하단 사이 간격은 5px이다. 제목 아래에는 안내 공간을 확보하며,
  제목이 카드 옆에 놓이는 모바일 R2는 기존 좌측 제목 배치를 유지한다.
- 다중 RUN 순서는 진행 중 → 아직 공개되지 않은 RUN → 완료 기록(최근 순)이다.
  기존 보드의 이전/새 위치 차이를 Web Animations API로 560ms 동안 보간한다.
  React 카드 키와 기존 공개/판정 단계는 유지한다. 최초 마운트, catch-up, 사용자 동작 끄기,
  OS reduced motion에서는 이동 연출을 생략하고 정위치에 표시한다. 애니메이션은 정리 시 취소한다.
- 개발 전용 `/run-twice-preview`에 현행 R5 `final:false`의 3회 RUN 검증을 추가했다.
  `/responsive-preview`의 `phase`는 기존 타임라인에 있는 단계만 선택한다.

## 검증

- 관련 Vitest 5파일 / 66개 통과: cinematicRendering, cinematicTimeline, cinematicMotion,
  finalShowdownPresentation, runBoardMotion.
- 린트: 오류 없음. 기존 `tools/perf/showdown-transition.tsx:23`의 Fast Refresh 경고 1건.
- TypeScript 및 프로덕션 빌드 통과. 운영 비밀값 미설정 및 기존 큰 청크 안내는 남아 있다.
- 내장 Chromium: 1600×900, 1366×768, 1366×720의 제목 중심 차이는 0~0.008px.
- R1/R4/R6의 RIVER 안내 간격 5px, 최종전 제목과 안내 사이 겹침 없음.
- Run It Twice 전환 및 Three Times의 RUN 1→2, RUN 2→3 전환에서 중간 transform과
  완료 후 순서를 확인했다. 이전 RUN은 아래로, 새 RUN은 위로 이동한다.
- 393×852 모바일 Three Times: 진행 RUN 위쪽, 완료 기록 아래쪽, 간격 5px, 가로 넘침 없음.
- 샌드박스 임시 SSR 캐시 rename 차단으로 첫 테스트 실행은 시작하지 못했다.
  동일 테스트를 일반 로컬 실행에서 재검증했다. 개발 서버는 `127.0.0.1:5176`에만 바인딩한다.
- 이번 요청에서 커밋, 푸시, main 병합 및 운영 배포는 수행하지 않는다.

## 후속 수정 — 카드 하단 이동 / 중앙 안내 / 플랍 속도

- 이전 검증 화면의 R1 카드가 바닥에 붙는 문제를 놓쳤다. R1 카드 영역은 아래 정렬인데,
  해당 공개 단계에 족보 텍스트가 없으면 하단 read 영역이 사라져 카드가 내려갔다.
  텍스트가 없는 경우에도 동일한 flex 영역을 비어 있는 aria-hidden 요소로 유지한다.
- 스트리트 안내를 카드 그룹의 가로 중앙에 배치했다. 세로 간격 5px은 유지한다.
- 공통 `presentationTimeline.ts`의 FLOP_1 / FLOP_2 / FLOP_3 구간을 각각 450ms로 변경했다.
  보드당 총 150ms 단축된다. 싱글과 Worker가 같은 타임라인을 사용하고 presentation version은
  19로 올렸다. 카드 뒤집기 자체의 420ms, TURN / RIVER 속도는 변경하지 않았다.
- 관련 UI/공개 범위/승률 회귀 7파일 87개 통과. Worker 전체 13파일 142개 통과.
- 1600×900에서 R1 FLOP_3, TURN_HAND, BEST5_GLOW, RESULT의 카드 상단은 약 415px로 유지됐다.
  RIVER_SETTLE에서 카드 상단 414.83px, 커뮤니티 상단 415.95px, 안내 중앙 차이 0px,
  안내 하단과 카드 상단 간격 5px을 확인했다.
