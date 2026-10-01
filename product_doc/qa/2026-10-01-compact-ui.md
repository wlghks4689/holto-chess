# UI-FEEDBACK-015 — 상점/파이널 추가 검수

2026-10-01 사용자 브라우저 주석 1~7 반영. 이전 인게임 어빌리티 변경에 이어 로컬 구현했으며 기준 HEAD는 `4982d2523c1f6d98c7ea3c902241c8fa2ec6d77a`이다.

## 변경

- R2/R4 First Class 표기를 block 행으로 분리.
- 상점 전용 제목 도움말 absolute 배치 제거. PrepRoundHeader 및 일반 라운드 헤더 모두 동일 간격 적용.
- [후속 롤백] 리롤은 카드 마켓 하단의 기존 텍스트 버튼으로 복구. 비용과 사용 횟수를 표시하며 클릭 즉시 실행한다.
- `ArenaBrand`로 메인 페이지 워드마크를 싱글/멀티 상단에 재사용.
- R5 아이콘을 프로필 내부로 이동. CSS flex wrap으로 공간이 부족하면 이름을 다음 행에 배치하고 우측 상단 도장 공간을 예약. 12px 이름 및 아이콘 10% 확대, 보상 영역 32px 기준 중앙 정렬.

## 자동 검사

- `npm test -- --maxWorkers=2 src/ui/cinematicRendering.test.ts src/game/abilityVisibility.test.ts`: 2파일/53개 통과.
- `npx tsc -b --pretty false`: 통과.
- 변경 TS/TSX ESLint: 통과.
- `npm run build`: Worker/client 빌드 및 타입 검사 통과. 기존 로컬 ADMIN_* secrets 미설정 경고만 있음.
- `git diff --check`: 통과.
- 전체 게임/Worker 테스트는 직전 기능 검증 기록을 참조하며 이번 UI 변경에서 반복하지 않음.

## 브라우저 검사

실제 UI 컴포넌트를 사용하는 localhost 개발 fixture. 사용자 진행 중 게임 탭은 유지하고 임시 검수 탭을 사용함.

### 상점/드래프트

- 360px R4 드래프트에서 R2 행 y=187.89, R4 행 y=202.73으로 정확히 두 행.
- R1~R5 상점 제목/도움말: 수평 간격 9px, 세로 중심 차이 0px. 모바일 nav 높이 54px 유지.
- 롤백 후 실제 `createGame`/`rerollShop` 연결 fixture를 393px·1440px에서 확인: 카드 마켓 아래 버튼 표시, 50→45BB 차감, 0/1→1/1 갱신, 소진 시 비활성화, 확인창 없이 즉시 실행. 모바일 scrollWidth 393, 데스크톱 1440.

### 파이널

- 393×852: 이름 computed font 12px, 아이콘 30.8px. 한글 8글자 이름이 같은 줄에 들어가고 이름 오른쪽과 도장 사이 약 8px 유지.
- 360×780: 한글 8글자 이름이 y=136.80으로 내려가고 아이콘 하단 y=132.80과 분리됨. 짧은 이름은 같은 줄 유지.
- UI 상한보다 긴 합성 영어 이름은 다음 줄에 놓이고 남는 폭을 넘는 부분은 말줄임. 한글 8글자는 잘리지 않음.
- 1440×900: 아이콘 37.4px, 이름 12px, 네 명의 7장 카드 한 줄/2×2 배치 확인.
- R5 보상 영역 실제 높이 32px, flex align-items/justify-content center. 393px 합성 fixture 좌석 높이는 이름 길이에 따라 약 201/182px.
- 검사한 크기에서 scrollWidth <= innerWidth. 합성 fixture의 발동·손패는 표시 검사용이며 실제 지급 규칙은 엔진 테스트가 검증한다.

## 증거 이미지

- [First Class 두 줄](assets/2026-10-01-compact-ui/first-class-360.png)
- [리롤 롤백 및 새 로고](assets/2026-10-01-compact-ui/reroll-rollback-393.png)
- [모바일 파이널](assets/2026-10-01-compact-ui/final-393.png)
- [PC 파이널](assets/2026-10-01-compact-ui/final-1440.png)

## 전달

로컬 개발 서버에 반영. 커밋·push·배포·공유 PC 정리 미실행. 기존 root Vite 캐시 변경은 보존한다.
# 리롤 UI 롤백 후속 (2026-10-01)

- 사용자 요청으로 싱글/멀티 리롤 버튼을 카드 마켓 하단 텍스트 버튼으로 복구했다. 아래 원형 버튼/확인 UI 검증은 변경 전 기록이다.
- 실제 엔진 fixture에서 한 번 클릭으로 카드 교체, 50→45BB 차감, 0/1→1/1 갱신과 횟수 소진 후 비활성화를 확인했다. 확인창은 표시되지 않는다.
- TypeScript 및 변경 파일 ESLint 통과. 모바일 393px에서 가로 넘침 없음.
- [복구 화면](assets/2026-10-01-compact-ui/reroll-rollback-393.png)
