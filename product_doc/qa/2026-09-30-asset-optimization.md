# 정적 에셋·로딩 최적화 (2026-09-30)

게임 규칙, 점수, 서버, 진행 순서, UI 디자인은 바꾸지 않았다. 이미지·오디오 포맷과 해상도, 로딩 시점, 초기 JS 분할만 변경했다.

## 측정 방법

- 도구: `tools/perf/asset-audit.mjs` (Playwright + 시스템 Chrome, CDP Network 이벤트)
- 대상: 프로덕션 빌드(`dist/client`)를 로컬 서버로 서빙. 텍스트 에셋은 gzip, 미디어는 원본 그대로 전송(Cloudflare와 같은 방식). 캐시 헤더도 운영과 같게 `max-age=0, must-revalidate` + ETag/304, 빌드의 `_headers` 규칙 적용.
- 캐시: 뷰포트마다 빈 캐시로 시작(첫 방문). 세션 안에서는 브라우저 캐시가 정상 동작한다. `CACHE_DISABLED=1`이면 캐시를 완전히 끈다(같은 이미지가 다시 마운트될 때마다 재다운로드되어 실제보다 크게 나옴. 초기 측정 84 MiB는 이 모드의 수치).
- 흐름: 시작 화면 → 첫 클릭 → 싱글 플레이 → 어빌리티 드래프트 → R1~R5 → GAME_RESULT까지 자동 완주. 요청은 시작 시점의 화면 단계에 귀속.
- 뷰포트: Desktop 1440×900 (DPR 1), Mobile 390×844 (DPR 3, 모바일 에뮬레이션)
- 한계: CDN 실측이 아니라 로컬 서빙이다. 텍스트는 gzip 기준이며 Cloudflare는 브로틀리라 JS/CSS는 실제로 조금 더 작다. 이미지·오디오는 무압축 전송이라 실측과 같다. 멀티플레이는 같은 에셋 URL을 쓰지만 이번 측정은 싱글 플레이 경로다. 구글 폰트·gtag(약 655 KB)는 외부 요청이라 이번 작업 범위 밖이며 전후 동일하다.

## 1. 전체 전송량

| 뷰포트 | Before | After | 감소 |
| --- | --- | --- | --- |
| Desktop 1440×900 | 106 req · 35,164 KB (34.3 MiB) | 107 req · 3,763 KB (3.68 MiB) | −89.3% |
| Mobile 390×844 | 112 req · 38,536 KB (37.6 MiB) | 100 req · 3,566 KB (3.48 MiB) | −90.7% |

종류별 (Desktop / Mobile)

| 종류 | Before | After |
| --- | --- | --- |
| 이미지 | 32,953 / 36,325 KB | 2,849 / 2,657 KB |
| 오디오 | 1,352 / 1,352 KB | 60 / 55 KB (실제 나온 족보 사운드만) |
| JS | 332 / 332 KB | 327 / 327 KB (gtag 173 KB 포함) |
| CSS | 182 / 182 KB | 182 / 182 KB (구글 폰트 CSS 포함) |
| 폰트 | 344 / 344 KB | 344 / 344 KB |

자체 정적 미디어(이미지+오디오)는 Desktop 약 34.3 MiB → 2.8 MiB로, 1차 목표(4~6 MiB)보다 낮다.

## 2. 단계별 비교 (요청 수 / KB)

| 단계 | Desktop Before | Desktop After | Mobile Before | Mobile After |
| --- | --- | --- | --- | --- |
| `/` 최초 진입 | 22 / 946 | 20 / 912 | 22 / 975 | 20 / 941 |
| 첫 클릭 | 10 / 1,384 | 3 / 32 | 9 / 1,384 | 2 / 32 |
| 게임 진입 | 22 / 26,094 | 20 / 560 | 23 / 26,094 | 21 / 560 |
| 어빌리티 드래프트 | 2 / 40 | 10 / 665 | 2 / 40 | 10 / 671 |
| R1 | 1 / 2,362 | 2 / 394 | 2 / 2,323 | 1 / 348 |
| 매치 로딩 | 14 / 489 | 11 / 445 | 14 / 399 | 12 / 388 |
| R2 드래프트 | 6 / 14 | 5 / 1 | 5 / 1,934 | 5 / 1 |
| R3 | 14 / 3 | 11 / 43 | 12 / 3 | 14 / 70 |
| R4 드래프트 | 13 / 301 | 23 / 335 | 21 / 2,258 | 13 / 301 |
| R5 | 2 / 3,530 | 2 / 375 | 2 / 3,124 | 2 / 254 |
| GAME_RESULT | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

- 첫 클릭: 전체 WAV 1.35 MB 선다운로드가 사라졌다. 남은 32 KB는 한글 웹폰트 조각이다. 오디오 요청은 0건이다.
- 게임 진입: 어빌리티 12장 + 프레임 일괄 preload(26 MB)가 사라졌다. 남은 것은 게임 JS 청크, 테이블 배경, 카드 프레임(82 KB)이다.
- 시작 화면은 게임 전용 대형 에셋을 받지 않는다.
- 세션 내 같은 URL 재요청은 메모리 캐시로 처리되어 전송량이 약 9~10 KB뿐이다(304 없음).

After 가장 무거운 리소스 TOP (Mobile): match-arena-mobile.webp 348 · final-table.webp 264 · final-arena-portrait.webp 254 · battlefield-portrait.webp 207 · r2-arena-portrait.webp 199 · main-table.webp 175 · gtag 173 · showdown-arena-1/2.webp 171/167 · 구글 폰트 CSS 137 · porena-wordmark.webp 122 · index.js 99 · 어빌리티 아이콘 75~89 KB (KB). 원자료: `tools/perf/asset-audit.mjs` 실행 시 `<OUT>/<viewport>.json`.

## 3. 에셋별 크기

모두 `tools/perf/optimize-assets.mjs`로 `asset-source/` 원본에서 만든다. 설정은 에셋별 표시 크기와 측정한 화질로 정했다(일괄 동일 품질 아님).

| 에셋 | 기존 | 신규 | 설정 |
| --- | --- | --- | --- |
| 어빌리티 아이콘 ×12 (PNG 1254²) | 1,859~2,135 KB | 70~89 KB (512² WebP) | q90, alpha q95, smartSubsample |
| 어빌리티 프레임 (PNG 1024×1536) | 1,698 KB | 82 KB (960×1440 WebP) | q88 |
| match-arena-pc | 2,362 KB | 373 KB | 1672×941 유지, q92 |
| match-arena-mobile | 2,299 KB | 348 KB | 941×1672 유지, q92 |
| final-arena-landscape | 3,529 KB | 375 KB | 1672×941 유지, q92 |
| final-arena-portrait | 3,123 KB | 253 KB | 941×1672 유지, q92 |
| 족보 사운드 ×7 (WAV) | 1,351 KB 합계 | 229 KB 합계 (MP3 128 kbps mono) | |
| 가이드 썸네일 ×12 | 13~15 KB | 13~15 KB (192² WebP, 원본에서 재생성) | q82 |

해상도 근거: 상세 카드 최대 320 CSS px, 아이콘 영역 54%(약 173 CSS px) → DPR 3에서 약 520px → 512px. 프레임은 320×3 = 960px. 배경은 기존 구도 그대로 원본 해상도를 유지했다.

화질 비교(카드 배경색 위 합성 PSNR, 512px 무손실 기준): WebP q90 약 30~33 dB, AVIF q78 약 36 dB(55 KB). 실제 카드 UI를 DPR 1/2로 원본과 나란히 캡처해 비교했을 때 프레임 빛 번짐, 테두리, 아이콘 디테일, 위치 차이는 보이지 않았다. 배경은 밝기 ×3 확대에서도 밴딩이 없었다.

## 4. 어빌리티 로딩

| | Before | After |
| --- | --- | --- |
| 게임 진입 시 | 프레임 + 12장 동시 다운로드·디코드 (약 25.6 MB) | 프레임 1장 (82 KB) |
| 드래프트 중 | 없음(이미 받음) | 공개된 카드의 아이콘만 |
| 한 게임 총량 | 13파일 · 25,649 KB (Desktop) / 29,538 KB (Mobile, 재요청 포함) | 9파일(프레임 + 배정된 8장) · 약 710 KB |

- `preloadAbilityArtwork(revealed)`는 프레임과 이미 공개된 어빌리티만 받는다. 공개되지 않은 어빌리티는 받지 않는다.
- 같은 URL은 기존 Map 캐시로 한 번만 요청·디코드한다. 쇼다운 프로필 아이콘도 같은 URL을 재사용한다.
- 공개 순간: 아이콘(약 80 KB)을 그때 받는다. `AbilityArtwork`는 프레임과 아이콘이 모두 디코드될 때까지 숨겨 두므로 반쯤 그려진 카드나 위치 변화는 없다. 느린 망에서는 카드 이름이 먼저 보이고 그림이 잠시 뒤 나타날 수 있다(사전 다운로드를 없앤 대가).
- 디코드 메모리(계산): 기존 1254²×4B×12장 ≈ 75 MB → 512²×4B×8장 ≈ 8 MB. 브라우저 내부 디코드 메모리는 직접 계측하지 못했다.

## 5. JS / CSS 청크

| | Before | After |
| --- | --- | --- |
| 초기 JS | index 348.2 KB (gz 105.4) + jsx-runtime 87.7 KB (gz 30.2) = 435.9 KB (gz 135.6) | index 318.8 KB (gz 101.9) |
| 초기 CSS | 228.8 KB (gz 46.2) | 228.3 KB (gz 46.0) |
| OnlineApp | 초기 번들 포함 | 별도 청크 35.6 KB (gz 11.1), 멀티플레이 선택 또는 초대 링크 시 로드 |

초기 번들 구성(After): react-dom 약 202 KB, 한/영 문자열 약 62 KB, 시작 화면. 멀티플레이 로비, 소켓 처리, 쇼다운, 어빌리티 선택, 결과 UI는 초기 번들에서 빠졌다. 게임 가이드는 이미 지연 로드 중이다.

CSS는 분할하지 않았다. OnlineApp과 함께 컴포넌트 CSS를 지연 로드하면 `styles.css`·`online.css`·`responsive.css`보다 늦게 적용되어 캐스케이드가 뒤집힌다. 측정 중 실제로 매치 로딩 배경이 테이블 이미지로 바뀌고, 모바일 `.cinema` 여백과 나가기 버튼 폭이 달라지는 회귀를 발견했다. 그래서 `src/ui/gameStyles.ts`가 기존 순서 그대로 CSS만 먼저 불러온다. 빌드 후 entry CSS 규칙 2,716개가 기존과 같은 순서임을 확인했다. `tools/perf/css-order-check.mjs`는 지연 청크 CSS가 entry 규칙을 덮어쓰면 실패한다.

## 6. 정리한 미사용 에셋

`rg` 전체 검색 결과 런타임, 테스트, 문서에서 참조가 없었다. 아래 SVG 2개와 `platinum-frame.png`는 같은 시기 main(`64923c3`)에서 삭제되어 그 결정을 따랐다(git 기록에는 남음). `r2-equity-concept.svg`는 `holto-chess/asset-source/legacy/`로 옮겼다.

- `abilities/royal-blood.svg` (3.2 MB), `abilities/architect.svg` (2.4 MB): `ABILITY_CARDS.md`의 오래된 표에서만 언급. 표를 갱신함.
- `abilities/platinum-frame.png` (1.9 MB): 참조 0 (런타임은 `-aligned`를 사용).
- `public/r2-equity-concept.svg` (8 KB): 참조 0.

최적화 대상 PNG·WAV 원본도 `asset-source/`로 옮겼다. 배포 `dist/client/assets`는 48 MB에서 5.5 MB가 됐다.

## 7. 캐시 정책

운영 응답 확인 결과, HTML·해시 JS·미디어 모두 `Cache-Control: public, max-age=0, must-revalidate` + ETag다. 재방문 때 모든 파일을 재검증한다.

- `public/_headers`로 Vite 해시 산출물(`/assets/*.js`, `/assets/*.css`)만 `max-age=31536000, immutable`로 했다. 내용이 바뀌면 파일명이 바뀌므로 안전하다. `public/assets`에는 `.js`/`.css`가 없어 미디어는 이 규칙에 걸리지 않는다.
- 미디어는 같은 파일명을 재사용하는 구조라 기본 정책(재검증)을 유지했다. 이번 변경으로 최적화 대상은 모두 `.webp`/`.mp3`로 새 이름이 되어 옛 PNG/WAV가 캐시에 남아 섞일 일은 없다.
- 미디어에도 장기 캐시를 쓰려면 이미지를 Vite import(해시 파일명)로 바꾸거나 파일명에 버전을 붙여야 한다. 후속 과제로 둔다.
- 배포 후 Cloudflare에서 `_headers`가 적용됐는지 `curl -I`로 확인이 필요하다(로컬에서는 같은 규칙으로 검증함).

## 8. 테스트

- `npx tsc -b` 통과
- `npm test`: 78파일 549개 통과. 신규: 어빌리티 preload 범위, 첫 제스처 오디오 요청 0건, 사운드 prefetch 1회·음소거 시 미다운로드, MP3 형식·예산(400 KB 미만)
- `npm run build` 통과
- ESLint: 기존 `OnlineApp.tsx:94` 오류 1건만 남음(이번 변경과 무관, TODO에 기록됨)
- 시뮬레이터 테스트 8개 통과
- 브라우저: Desktop·Mobile 모두 R1~R5 → GAME_RESULT 완주, 페이지 오류 0건. 모바일 DPR 3에서 어빌리티 상세 팝업, 공개 그리드(8장 모두 표시), 최종 결과 세로 배경 확인. Desktop에서 매치 로딩 배경 확인.
- 미확인: 실제 iOS/Android 기기, Safari MP3 디코드 지연, Cloudflare 배포 후 헤더.

## 9. 화질 절충

- 아이콘은 WebP 4:2:0 크로마 때문에 강한 붉은/초록 글로우의 미세 질감이 원본보다 아주 약간 부드럽다(200% 확대에서만 구분). AVIF는 더 정확하고 작지만 포맷 감지와 이중 에셋이 필요해 이번에는 WebP만 썼다.
- MP3는 인코더 지연(약 30 ms)이 앞에 붙는다. 스트레이트 플러시 core/tail은 같이 지연되어 서로 맞는다. 화면 연출과의 체감 차이는 확인하지 못했다(사람 청취 검증 필요).
- 첫 사운드는 해당 매치 시네마틱이 시작될 때 그 매치에 나올 사운드만 미리 받는다. BEST5_GLOW까지 수 초 여유가 있어 지연이 없어야 하지만, 매우 느린 망에서는 첫 재생이 늦을 수 있다.

## 10. 이번에 하지 않은 것

- 외부 리소스: 구글 폰트(약 480 KB)와 gtag(173 KB)가 첫 진입의 약 70%를 차지한다. 폰트 서브셋·셀프 호스팅이나 gtag 지연 로드를 검토할 만하다.
- 나머지 WebP 배경(final-table 264 KB, r2-arena 199~277 KB, battlefield 177~207 KB 등): 이미 WebP라 손대지 않았다.
- AVIF 도입(아이콘 약 −30 KB/장), 미디어 해시 파일명과 장기 캐시.
- 비활성 언어 문자열 지연 로드(약 10 KB gzip): i18n이 동기 구조라 보류.
- 반복 마운트되는 `porena-mark.webp` 등의 불필요한 재요청(메모리 캐시라 전송량은 거의 0).

## .audit 저장소 정리 (런타임과 별개)

- 내용: `tools/multiplayer-audit.mjs`가 운영 서버에서 8인 게임을 완주하며 남긴 QA 기록. 점검 6회분(multiplayer, multiplayer-resilience, multiplayer-suspension, fix-resilience, fix-eight, fix-auto-spectator), 화면 캡처 PNG 1,618장, 이벤트 로그 jsonl 6개, 실행 조건·요약 json 12개. 합계 587 MB.
- 커밋 `4722b36`(2026-09-24)에 함께 들어갔고, 스크립트 기본 출력 경로가 `.gitignore`에 없어서 추적됐던 것으로 보인다.
- 조치(2026-09-30): `.audit/`를 `holto-chess/.gitignore`에 추가하고 `git rm -r --cached`로 추적을 해제했다. 로컬 폴더는 그대로 남는다. 앞으로 QA 실행 결과는 커밋되지 않는다. 보고서에 쓰는 대표 캡처는 `product_doc/qa/assets/`에 둔다.
- 남은 선택: 과거 커밋에는 파일이 남아 있어 clone 크기(pack 약 531 MiB)는 그대로다. 줄이려면 `git filter-repo`로 history에서 제거하고 강제 푸시해야 한다. 모든 클론에 영향을 주므로 사용자 결정이 필요하다.
