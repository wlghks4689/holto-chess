# 2026-10-12 검색 등록 및 실제 플레이 분석

- 사용자 승인: Google 사이트맵 제출, GA4 주요 이벤트 지정, 네이버 유입 설정을 직접 진행하도록 승인. 이번 목적의 main push와 운영 반영을 포함한다.
- 구현 커밋: `b4f3921` (main → origin/main). 운영 버전: `12aef47b-e188-4bc4-8d6c-f3c2d87d9931`, 100%, 2026-10-12 08:48:40 UTC.
- 앞선 다른 작업의 미추적 `assets/`, `product_doc/crowdfunding/`는 제외·보존했다.

## 확인한 계정과 색인

- Search Console: `porena.kr` **도메인 속성**. 개요에서 색인 생성 1개·미생성 1개를 확인했다. 개별 `https://porena.kr/` URL 검사에서 **URL이 Google에 등록되어 있음**, **페이지 색인이 생성됨**을 확인했다. 미생성 URL의 원인은 이번 작업에서 단정하지 않는다.
- GA4: 기존 속성의 포레나 웹 스트림, URL `https://porena.kr`, 측정 ID `G-34CRPR69CF`를 화면에서 확인했다. 동일 속성에 과거 게임 스트림도 있어 계정·속성 이름이나 기존 이벤트는 변경하지 않았다.
- 네이버: 서치어드바이저에 `https://porena.kr` 등록 및 소유 확인 완료. 확인 태그를 초기 HTML head에 배포했다. 보안문자(CAPTCHA)는 사용자가 직접 처리했다.

## 사이트 변경

- `/sitemap.xml`: 현재 구현된 공개 URL `/`, `/privacy`, `/terms`, `/ranking` 4개. 미구현 `/about`, `/guide`, 규칙 설명 페이지, 방 URL, API, 관리자, 미리보기는 포함하지 않는다. 근거 없는 lastmod 날짜도 넣지 않는다.
- `/robots.txt`: 공개 페이지 허용, API·웹소켓·관리자·미리보기 경로 제외, 사이트맵 주소 명시.
- 공개 URL마다 Worker가 canonical을 초기 HTML에 넣는다. SPA 내부 이동에서도 canonical을 갱신한다. UTM이나 초대 쿼리가 대표 주소에 포함되지 않는다.
- 게임 엔진·판정·경제·타이머·인증 구조는 바꾸지 않았다.

## GA4 이벤트와 주요 이벤트 지정

기존 gtag를 재사용한다. 개발·미리보기·Discord 도메인의 신규 이벤트는 전송하지 않는다. 광고 차단·태그 부재·스토리지 거부·태그 오류는 게임 진행을 막지 않는다.

| 이벤트 | 시점 | 주요 이벤트 |
| --- | --- | --- |
| landing_view | 홈페이지 최초 진입, StrictMode 중복 제외 | 아니오 |
| play_cta_click | 실제 모드 선택 버튼 | 아니오 |
| game_start | 로컬 게임 생성 후 또는 서버 PLAYING/R1 확인 후 | 예 |
| round_1_complete | R1 ROUND_RESULT 진입 | 아니오 |
| game_complete | 최종 결과. 온라인은 finalResultsReleased 확인 후 | 예 |
| tutorial_start | 챕터가 성공적으로 초기화된 후 | 아니오 |
| tutorial_chapter_complete | 챕터 완료 | 아니오 |
| tutorial_complete | 마지막 6장 완료 | 예 |

- 주요 이벤트 3개를 GA4 UI의 **코드로 만들기** 방식으로 등록하고 체크 상태를 확인했다. 페이지 조회로 게임 시작을 합성하는 규칙은 만들지 않았다.
- 모두 기본 금액 없음, 이벤트당 한 번. 실제 같은 경기의 중복은 클라이언트의 경기별 키로 방지한다. 온라인 새로고침에서도 같은 탭의 sessionStorage 키로 중복을 막고, R2 이후 복귀는 새 시작으로 보지 않는다. 스토리지가 차단된 경우 재렌더 중복은 메모리로 방지하지만 새로고침 이후 중복 방지는 제한된다.
- 전송하는 신규 매개변수는 game_mode(enum), selected_mode(enum), chapter(1–6)뿐이다. 로컬 중복 키·방 ID·토큰·계정·닉네임·카드·상점·승률·BB를 전송하지 않는다. 기존 GA4 자동 페이지 조회/표준 수집 설정은 유지했다.
- GA4의 새 이벤트 수신·집계 보고서는 이후 실제 이용 데이터와 처리 시간을 필요로 한다. 이번 브라우저 QA는 테스트 데이터를 Google에 전송하지 않고 실제 production 빌드의 dataLayer 이벤트를 검증했다.

## 외부 제출 결과와 미완료 상태

- Google: `https://porena.kr/sitemap.xml` 제출 완료 팝업 확인. 운영 확인 후 한 번 재제출했지만 보고서의 **가져올 수 없음 / 발견 0개** 상태는 아직 해소 확인 전이다. 따라서 처리 성공으로 표시하지 않는다.
- Google 실제 URL 테스트: 동일 사이트맵에서 2026-10-12 17:59 KST **Google 검사 도구 스마트폰**, **크롤링 허용 예**, **페이지 가져오기 성공** 확인. 일반 HTTP 및 Googlebot/Yeti User-Agent 요청도 200, XML 301bytes, 올바른 namespace. 실제 Google 사이트맵 처리 성공은 별도 확인이 필요하다. 이 관찰만으로 실패 이유를 단정하거나 구조를 변경하지 않았다.
- 네이버: 사이트맵 제출 목록에 `sitemap.xml`과 등록일 확인. 홈페이지 `/` 수집 요청 목록에 접수 확인.
- 네이버 IndexNow: 운영 공개 소유 증명 파일 확인 후 공개 URL 4개 POST, **HTTP 200**. 수신 성공이며 색인·검색 노출 확정을 뜻하지 않는다.
- 추후 변경 URL 알림: `node holto-chess/tools/search/submit-indexnow.mjs`는 운영 proof와 sitemap을 읽는 dry-run. `--submit`을 붙일 때만 공식 네이버 API로 보낸다. 자동 일정·배포 연동은 만들지 않았다. 공개 proof 키는 계정 비밀번호나 운영 secret이 아니다.

## 검증

- 관련 단위 테스트: analytics, searchPages, onlineScreen, sessionStore **23개 통과**.
- 전체 Worker 실행에서 기존 **118개 통과**. 새 검색 테스트의 redirect-follow/테스트 ASSETS 바인딩 문제를 수정한 후 해당 **4개 통과**. 제품 라우팅 문제로 수정하지 않았다.
- lint: 오류 0개. 기존 perf 컴포넌트 Fast Refresh 경고 1개 유지.
- 최종 build 및 배포 패키지 dry-run 통과. 로컬 기본 샌드박스의 Wrangler 로그/의존성 접근 오류는 권한 예외로 빌드 재실행해 검증했다.
- 새 테스트 브라우저 1440×900 / 390×844: 개인정보 페이지 왕복 canonical 갱신, 모드 선택만으로 game_start 없음, 실제 게스트 싱글 진입 후 game_start 1회. 페이지 오류 및 가로 넘침 없음.
- 운영 `/`, `/privacy`, `/terms`, `/ranking`, sitemap, robots, 공개 proof, `/api/health` 200. 누락 JS 404/no-store 유지. 운영 싱글·멀티·튜토리얼 lazy 번들에서 이벤트 연결 확인.
- 실제 8인 경기 완주·GA4 새 이벤트의 관리자 보고서 수신·검색 순위 상승은 이번 검증에 포함하지 않는다.

참고: [Google 사이트맵](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [GA4 이벤트](https://developers.google.com/analytics/devguides/collection/ga4/events), [GA4 주요 이벤트](https://support.google.com/analytics/answer/12844695), [네이버 IndexNow](https://searchadvisor.naver.com/guide/indexnow-request).
