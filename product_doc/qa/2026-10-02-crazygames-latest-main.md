# CrazyGames 최소 분기 — 최신 main 통합 검증

- 작업 PC: DESKTOP-5D9U5KH. 별도 clone `C:/Users/USER/Documents/Codex/2026-10-02/task-2/latest-cg-review`, 브랜치 `feat/crazygames-basic-launch`.
- 기반 main: `cd8aee4cfb59ded774608807911b8698587617e8`. 이전 CG 기반 `39ba4dbd33a6770340b7b981987fa17c00c12c44`보다 15커밋 앞선 main을 그대로 기반으로 했다.
- 기존 Desktop CG worktree의 stage된 14파일과 원본 main은 수정하지 않았다. 기존 브랜치 전체 병합·rebase·reset 없음.

## 적용 범위

- 정확히 디코딩한 첫 platform 값이 crazygames일 때만 blocking bootstrap에서 GA 다운로드/초기화를 제외한다. 일반 모드는 기존 ID 및 js/config 초기화를 유지한다.
- CG 홈 Quick Play → 기존 single, 멀티·튜토리얼·가이드 유지. 어빌리티 선택을 생략하지 않는다.
- CG feedback 이메일/동의 DOM 및 contactEmail/consent payload 제외. message/category/locale/website 유지.
- CG waiting-room 직접 초대 URL/복사 버튼 숨김. 방 코드 표시/복사/코드 참가 유지.
- 최신 main의 Discord SDK/runtime, API endpoint 모듈, 개인정보·약관 내용/번역/홈 링크, Worker Origin/retention, 의존성 및 일반 UI 변경을 보존했다. 해당 파일/설정에 새 CG 작업의 변경 없음.
- 최신 legal routing과 CG를 함께 사용할 때 platform query가 없어지는 회귀를 수정했다. legal 이동에서 CG query를 유지하며, CG feedback privacy는 iframe 안에서 연다. 일반 웹과 Discord의 기존 경로는 유지한다.
- 작은 화면에서 최신 legal footer가 CG 마지막 버튼을 가리는 회귀를 수정했다. CG의 짧은 landscape 화면에만 제목·메뉴 위치와 제목 크기를 조정했다.
- 게임 규칙·엔진·경제·밸런스·타이머·Worker 보안·오디오 정책 변경 없음. 신규 SDK/의존성 없음.

## 자동 검증

- 전체 앱 91파일 / 644개 테스트 통과. 신규 CG legal 이동 3건 포함.
- Worker 5파일 / 33개 테스트 통과. 테스트 재실행 중 기존 room rate-limit 테스트가 1회 429 대신 404를 반환했다. 제품/테스트 코드를 바꾸지 않은 재실행에서 33개 통과했으며 원인은 확정하지 않았다.
- lint, 앱 tsc -b, Worker tsc, production build, git diff --check 통과.
- build 반복은 법적 query 유지 수정 및 실제 브라우저에서 발견한 화면 겹침을 각각 반영하기 위해 수행했다.
- `wrangler deploy --dry-run --keep-vars` 통과. dry-run은 운영 배포가 아니다.

## 실제 브라우저 검증과 근거

- 설치 Chrome 154 headless/CDP, 검수 전용 profile 사용. app `http://127.0.0.1:5196`, 부모 `http://127.0.0.1:5197`, sandbox `allow-scripts allow-same-origin allow-forms`.
- DPR1, 800×450 / 821×462 / 907×510 / 1077×606 / 1080×607 / 1216×684 / 1280×720 / 1366×768 / 1536×864 / 1920×1080 / 360×780.
- 홈·법적 링크·영어 홈/피드백·AI 진입·CG 방 코드·일반 모드 선택/초대 URL의 121 측정. scrollIntoView 후 CTA 중심 elementFromPoint 검사. 최종 issues=[]; 초기 화면에 모든 요소가 동시에 들어온다는 의미는 아니다.
- CG GA requests=[], gtag undefined. 일반 모드 GA loader 및 js/config 유지. 외부 GA 요청은 관찰 후 차단해 실제 analytics 전송 없음.
- query 누락/정확값/유사값/공백/디코딩값 및 양 방향 중복값 확인. 첫 값 기준 유지.
- mock CG feedback에 category/message/locale/website만 있으며 이메일/consent 없음. 일반 mock feedback에는 이메일과 consent 유지. 운영 피드백 전송 없음.
- 영어 홈·피드백·Privacy Policy·Terms of Service 및 실제 AI 어빌리티 순서 화면 확인. legal/feedback privacy의 query 유지 확인.
- 튜토리얼 진입→나가기→홈→Quick Play→실제 내 차례 어빌리티 선택/배정 확인. 정상 전체 튜토리얼 및 AI 완주는 미실행.
- 최종 결과는 React App state에 GAME_RESULT fixture를 주입했다. 안내를 닫고 포인터 클릭으로 재시작→round1 ABILITY_ORDER 및 홈→CG Quick Play 확인. 실제 게임 완주 결과의 승패/점수 검증과 구분한다.
- 로컬 CG/일반 각각 실제 API 방 생성 및 WS 연결 확인. CG invite DOM 숨김, 일반 invite URL 유지. 온라인 전체 완주/재경기는 미실행.
- 원자료/캡처/스크립트는 저장소 밖 `C:/Users/USER/Documents/Codex/2026-10-02/task-2/latest-evidence/` 및 `latest-browser-review.mjs`, `english-portal-check.mjs`에 보존. 오류를 발견한 pre-fix JSON과 최종 JSON을 구분했다.

## 제출 및 남은 조건

- Cloudflare 기존 로그인과 해당 계정 접근을 읽기 전용 확인했다. secret 내용 조회/입력 없음.
- 실제 JS 브라우저에서 제출 포털은 로그인 페이지로 이동했다. 검수용 새 프로필이며 사용자의 기존 로그인 상태/계정 JI_PANG_E를 확인한 것이 아니다. 이 실행 환경에는 computer-use에 필요한 node_repl 및 로그인된 사용자 브라우저 제어 도구가 없다. 인증 화면 자동 입력 없음.
- SDK 없는 Basic Launch는 허용된다. 외부 호스팅은 실제 CG 포털의 플레이 도달 20초 평가가 필요하다. 현재 앱의 루트 절대 경로와 Worker API/WS 때문에 dist ZIP을 플랫폼 내부 정적 호스팅에 그대로 올린다고 동작이 보장되지 않는다. 운영 URL 모드와 정적 ZIP 모드를 구분해야 한다.
- 새 SFX ZIP 공식 materialization은 Windows `os.setxattr` 미지원으로 실패했다. 새 MP3를 적용하지 않았다. 승인된 새 3음원은 외부 샘플 없이 직접 합성했다고 전달됐지만 실제 ZIP 및 생성 기록을 이 PC에서 검증하지 못했다. 기존 7개 런타임 MP3와 다른 모든 에셋의 상업 사용 권리를 해결했다고 주장하지 않는다. 출처/사용허가 증빙 부족은 최종 제출 전에 확인해야 한다.
- 마케팅 ZIP `PORENA_CrazyGames_Media_Review_Draft_2026-10-01.zip` 버전 2 / 11,822,904바이트를 Library에서 확인했다. 공식 helper materialization이 같은 Windows os.setxattr 오류로 실패해 로컬 ZIP은 없다. 기존 1920×1080/800×1200/800×800 cover, 15.5초 무음 영상 및 영어 메타데이터의 로컬 파일을 확보해야 한다. 임의 재제작/오류 우회 없음.
- 실제 포털/app, Edge, iOS Safari, 낮은 메모리 Chromebook, 운영 CG의 20초 기준, 정상 전체 완주 및 온라인 재경기는 미검증.
- 이전 16.351초는 구 기반 local Worker의 cold-cache DOM 조작 가능 시각 1회 표본이며 최신 production/포털 20초 충족 근거가 아니다.
