# UI-EQUITY-001 — 쇼다운 승률 미터

- 기준: origin/main b983477, 격리 작업 폴더에서 `git pull --ff-only origin main` 완료.
- 승인: 2026-10-08 사용자. 기존 프리플랍 예상 승률과 공개 스트리트 승률, 카드 flip 완료 후 300ms 지연, 숫자·게이지 250ms 동시 보간.
- 모바일 추가 승인: 스킬 아이콘/미터를 닉네임 위 별도 행에 배치. 둘 다 32px, 동일 top 및 좌우 여백.
- 공개 타이밍: 재생 타임라인과 실제 카드 DOM open 이후 타이머를 모두 충족해야 갱신. 일반 420+300ms, 리버 600+300ms. 숨겨진 카드 입력 거부, 미래 보드·경기 결과는 계산 입력에서 제외.
- 플랍/턴/리버는 가능한 남은 보드를 열거. 오마하 2장 사용 규칙 유지, 동률 지분 배분. RUN 교체 중 미터 숨김 및 RUN별 초기화. 보드 없는 구형 비공개 결승에는 미터 없음.
- 검증: streetEquity / cinematicRendering / cinematicTimeline / showdownEquity 4파일 67테스트 통과. TypeScript 빌드 검사, 변경 파일 ESLint 통과. Vite local config 클라이언트 build 통과.
- 브라우저: 393x852 R2 2인 및 R4 3인에서 아이콘·미터 각 32x32, 동일 top, 프로필 경계 좌우 9px(테두리 포함) 확인. 문서 scrollWidth=393. 1280x800 R4 문서 scrollWidth=1280.
- 미리보기: http://127.0.0.1:5193/responsive-preview?case=showdown-equity-live
- 범위: UI/표시 계산만 변경. 게임 판정·밸런스·서버 프로토콜 변경 없음. 운영 멀티플레이/실기기 QA, 커밋·push·배포 미실행.
