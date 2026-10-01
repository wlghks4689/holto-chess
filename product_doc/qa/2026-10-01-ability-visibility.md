# UI-ABILITY-013 검증 — 2026-10-01

## 기준과 범위

- 기준 main: `4982d2523c1f6d98c7ea3c902241c8fa2ec6d77a` (origin/main fetch 및 fast-forward 후 작업).
- 앱: `holto-chess/`, 개발 서버: `http://127.0.0.1:5173/`.
- 사용자 승인: 전체 누적 본인 이득, 상대 이득 수치 비공개, 재생 길이 유지, 드래프트/배치 내 표시, 카드별 라운드 최초 잠금, First Class 원래 순번.
- 향후 분석 시스템, 운영 배포, 커밋/push, 공유 PC 데이터 삭제는 이번 완료 범위에 포함하지 않았다.

## 구현

- 기존 AbilityEvent/AbilityTotals에 실제 거래 이득과 안정적인 이벤트 순번을 기록한다. 기본 비용 차액을 저장하는 함수는 BB/P를 지급하지 않는다.
- 인간/AI 구매·리롤·판매 및 공개 드래프트 거래를 같은 집계 경로에 연결했다.
- 퍼스트 클래스의 적용 전 순번을 드래프트 순서 생성 시 저장한다. 기존 랜덤 호출/동률 정렬 및 게임 규칙은 유지한다.
- 서버 공개 뷰에서 상대 이득 수치를 제외하고 본인 누적 값도 공개된 정산 시점까지만 계산한다. 관전 대상의 private 누적은 제공하지 않는다.
- R2의 RUN 2 이벤트를 합쳐진 매치에 연결한다. RUN별 결과, R5 최종 공개 및 라운드 보상을 분리한다.
- 공통 아이콘/팝업/요약 컴포넌트, 한국어/영어 문구, 키보드·터치·hover 처리 및 모션 감소 설정을 적용했다.
- 승인된 별도 수정으로 R2 및 R3 survival의 자본주의 정산 누락을 복구했다.

## 자동 검사

실행 디렉터리: `holto-chess/`.

| 검사 | 결과 |
| --- | --- |
| `npm test -- --maxWorkers=2` | 81개 파일, 572개 테스트 통과 (85.96초) |
| `npm run test:workers` | 2개 파일, 22개 테스트 통과 (13.98초) |
| `npm run lint` | 통과 |
| `npm run build` | Worker/client 및 TypeScript 모두 통과 |
| `git diff --check` | 공백 오류 없음 |

- 최초 전체 테스트는 기본 병렬 실행에서 3개 시간 초과가 발생했다. 병렬 수를 2로 제한한 전체 재실행에서 모두 통과했다.
- Worker 테스트의 기존 `잠금=항상 3BB` 가정을 `me.lockCost`로 변경했다. 무작위로 Trader가 배정되면 무료 잠금이므로 고정 3BB 검사가 실패하던 문제였다.
- 기존 OnlineApp 판매창 초기화 effect의 lint 오류는 PLAYER_VIEW 수신 및 세션 전환 처리로 옮겨 해결했다.
- 새 11개 테스트: 구매/판매 차액 및 중복 지급 방지, 재잠금/리롤, First Class 원순위, 드래프트 할인, 승/패/split별 실제 발동, R2/R3 이자, R2 RUN 공개 및 재생 창, 상대 수치/관전/라운드 공개, R5 조기 공개 방지.
- 빌드에는 로컬 ADMIN_* secrets 미설정 경고가 있었으나 exit 0. 관리자 인증 동작은 이번 검증 대상이 아니다.

## 브라우저 검증

개발 전용 `/responsive-preview?case=...&benefitQa=1`에서 실제 UI 컴포넌트를 사용했다. 이 fixture의 손패/발동은 표시 검수를 위한 합성 데이터이며 실제 발동 판정의 증거는 위 엔진 테스트다.

- 화면: R2/R4 드래프트, R2 카드 배치, R1/R2/R3 서바이벌/R4/R5 쇼다운.
- 크기: 360×780, 390×844, 402×874, 1280×720, 1440×900, 1920×1080.
- 48개 조합에서 `document.documentElement.scrollWidth <= innerWidth`; 쇼다운 아이콘 행과 프로필 영역이 겹치지 않음을 확인했다.
- 모바일 R5 7장 한 줄 및 2×2 좌석, R3 생존 도장, R4 3인 화면을 스크린샷으로 확인했다. 패배자 아이콘은 dim되지 않는다.
- 360px 상대 팝업: 좌우 경계 48~348px, 화면 안에 표시되고 누적 요약 없음. Escape로 닫기 및 원래 버튼 focus 복귀 확인.
- 본인 상점에 `누적 획득 +60BB`; First Class에 `R2 선택 순위 6위 → 1위`, R4에서 이전/현재 라운드 순번이 함께 표시됨.
- 팝업/요약은 기존 카드와 겹치지 않도록 문서 흐름 또는 포털로 배치한다. 세로 스크롤은 숨기지 않는다.

### 제한과 남은 확인

- 360×780 R4 드래프트 합성 fixture(8명 포함)는 문서 높이 792px이다. 같은 크기 R4 상점 fixture는 916px로 세로 스크롤이 필요하다.
- 낮은 PC 화면에서는 기존 큰 카드/패널을 유지하므로 드래프트·R2 쇼다운 등 일부 화면이 세로 스크롤된다. 가로 넘침 및 아이콘/프로필 겹침과 구분한다. 상세 수치는 [레이아웃 기록](assets/2026-10-01-ability/layout-matrix.json).
- 실제 여러 브라우저의 동시 접속으로 전 라운드를 다시 완주하거나 실제 iOS/Android 기기로 확인한 것은 아니다. 멀티플레이 공개 계약은 엔진/Worker 자동 검사로 확인했다.
- 구버전 게임에 기록되지 않았던 할인·무료 잠금·원래 순번을 소급 추정하지 않는다.

### 이미지

- [R2 배치 360px](assets/2026-10-01-ability/loadout-360.png)
- [R4 드래프트 360px](assets/2026-10-01-ability/draft-r4-360.png)
- [R4 쇼다운 360px](assets/2026-10-01-ability/showdown-r4-360.png)

## 전달 상태

- 변경은 로컬 작업 폴더에 있으며 커밋/push/운영 배포는 하지 않았다.
- 기존 root `node_modules/.vite/deps/_metadata.json`, `react-dom.js` 변경은 보존했다. 후속 커밋에서 제외해야 한다.
- 사용자가 개발 화면 확인 후 Git 전달 및 공유 PC 정리를 진행할 수 있다. 서버는 루프백 주소로 실행 중이다.

## 브라우저 피드백 후속 — UI-FEEDBACK-014

사용자 주석 1~5 반영, 2026-10-01.

1. 어빌리티 팝업에서 details 및 benefit 요약을 제거했다. 카드 앞면 description 1문단과 이름/닫기만 표시한다. 본인 누적 패널은 유지한다.
2. R2 `CARD_SWITCH · 대표 카드 유지 · RUN 2 보조 카드 교체` 안내만 제거했다. 개발 fixture의 CARD_SWITCH_OUT 및 CARD_SWITCH_IN에서 안내 문구 없음과 기존 단계 유지를 확인했다.
3. 플러시 상세는 단일 문양과 전체 랭크로 변경했다. 홀카드/보드 혼합 및 보드 단독 플러시에서 `♠ A 10 8 6 2`를 확인한다. 스트리트 족보에도 공개된 보드만 전달한다.
4. 모바일 26px 순위 셀의 1·2위는 2px 테두리 때문에 접미사가 줄바꿈되던 문제였다. inline-flex/nowrap 및 접미사 간격 조정 후 텍스트 너비 20.39px가 내부 폭 22px 안에 들어간다.
5. 점수 팝업 모든 내부 글꼴 computed size 12px 확인. 포커스 이동에만 의존하던 닫기를 document pointerdown 캡처로 보완했다. 1번 점수→2번 점수 클릭 후 열린 팝업은 1개이고 첫 버튼 aria-expanded=false/둘째=true, 바깥 제목 클릭 후 0개다.

검사:

- `npm test -- --maxWorkers=2 src/ui/handLabel.test.ts src/ui/cinematicRendering.test.ts src/ui/FinalResultsPanel.test.ts`: 3개 파일/61개 테스트 통과.
- `npx tsc -b --pretty false`: 통과.
- 변경 TS/TSX 파일 `npx eslint`: 통과.
- 브라우저 viewport override 382×827 중심, 360×780 및 791×884 추가 확인. 각 측정에서 scrollWidth <= innerWidth. UI 컴포넌트를 공유하는 개발 fixture 사용; 실제 터치 기기 검증은 아니다.
- 이번 후속은 UI 표시/닫기 로직 수정이며 전체 게임/Worker 검사와 빌드는 반복하지 않았다.

증거:

- [점수 상세 12px 및 가로 순위](assets/2026-10-01-ability-feedback/score-popover-382.png)
- [플러시 표기](assets/2026-10-01-ability-feedback/flush-382.png)
- [간소화된 어빌리티 설명](assets/2026-10-01-ability-feedback/ability-description-382.png)
