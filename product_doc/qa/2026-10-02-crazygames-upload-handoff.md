# PORENA CrazyGames 업로드 재개 기록

2026년 10월 2일 23시 11분 KST 기준. 사용자의 PC 종료 요청에 따라 진행 상황과 브라우저의 미저장 입력을 로컬에 보존한다. 운영 배포는 확인했지만 CrazyGames 최종 제출은 완료하지 않았다. 다음 작업은 ChatGPT Library 로그인 후 승인된 미디어 ZIP을 받아 기존 등록에 업로드하는 것이다.

## 기존 등록과 작업 위치

- 현재 Codex 채팅 ID: `01a0cf3e-d0cc-7780-85e4-99a0c6324759`.
- 저장소: `C:/Users/USER/Desktop/holto_chess`.
- 로컬 브랜치: `main`, HEAD `39ba4dbd33a6770340b7b981987fa17c00c12c44`.
- 이 기록 작성 전 미추적 항목은 `.wrangler-config/`, `varco-export/`였다. 다른 작업자의 항목으로 보존했고 커밋하거나 정리하지 않았다.
- 제출용 원격 브랜치: `feat/crazygames-basic-launch`.
- 제출용 커밋: `4c237414f4b4f281172ee3ef31d7c7c799507498`.
- CrazyGames 계정 표시명: `JI_PANG_E`, 게임명: `PORENA`.
- 기존 등록: https://developer.crazygames.com/games/9c25318f-e399-4360-84d9-c791bb2efaec
- 기존 빌드 ID: `a9cc1e3d-abe3-4456-be77-8414f3207ce5`.
- 프리뷰: https://www.crazygames.com/preview/9c25318f-e399-4360-84d9-c791bb2efaec?gameBuildId=a9cc1e3d-abe3-4456-be77-8414f3207ce5&qaTool=true&role=developer

새 게임 등록을 만들지 말고 위 기존 등록을 이어서 편집한다. 최초 프리뷰 요청은 네트워크 오류를 표시했지만 서버에는 등록이 생성되어 My Games에서 복구했다.

## 확인된 배포 상태

이전 작업에서 Cloudflare의 읽기 전용 배포 조회로 Worker `porena`의 활성 버전을 확인했다. 이번 저장 및 종료 작업에서는 재배포하지 않았다.

- 배포 시각: 2026년 10월 2일 19시 46분 25초 KST.
- 배포 메시지: `CrazyGames basic launch 4c237414`.
- 활성 트래픽 100% 버전: `0314bc76-daa7-4575-a62c-70e8c907e1aa`.
- 제출 URL: https://porena.kr/?platform=crazygames
- 위 URL과 `/platform.js`는 HTTP 200이었다. 플랫폼 스크립트는 제출 커밋과 정규화 비교 시 일치했다. 진입 번들은 `/assets/index-BiUbuCKz.js`였다.
- 직접 연 운영 페이지에서는 빠른 플레이를 눌러 어빌리티 순서 화면까지 진입했다. 전체 게임 및 실제 iOS/Android 검증 완료를 의미하지 않는다.

## 포털 저장 상태

Upload와 QA 단계는 저장했다. Details 단계는 입력했지만 필수 미디어가 없어 저장이 거절되었다. 종료 시 브라우저 입력이 사라질 수 있으므로 아래 값으로 복구한다. Submit 단계에는 도달하지 않았으며 최종 약관 동의나 제출은 하지 않았다.

### Upload 설정

- 게임명: `PORENA`.
- 호스팅: Externally hosted iframe. Worker API와 WebSocket이 필요한 앱이므로 정적 ZIP으로 바꾸지 않는다.
- URL: `https://porena.kr/?platform=crazygames`.
- 출시: Basic Launch.
- 진행 저장 필수 여부: No. 세션 단위 게임이며 로컬 설정과 기록은 계정 진행 저장과 구분했다.
- 모바일: Yes, 방향: BOTH.
- 온라인 멀티플레이: Yes, 로비 최소 2명, 최대 8명.
- SDK 음소거: 미선택. CrazyGames SDK 통합은 구현되지 않았다.

### 저장한 QA 응답과 검증 한계

- 20초 이내 로딩: 자동 판정 N/A.
- 전체 게임플레이 요구사항, 모든 CrazyGames 도메인, 브라우저, 실제 모바일 기기 검사: No. 검증이 충분하지 않아 통과로 표시하지 않았다.
- 외부 광고 없음, 외부 로그인 없음, 이용약관 및 개인정보 링크 존재: Yes. 코드와 표시된 링크를 근거로 했다.
- SDK room/update/join/invite: 자동 감지되지 않음.
- Invite Button, IsInstantMultiplayer, 친구 초대 동작, 같은 친구 로비 유지: No.
- 채팅과 disableChat: N/A.
- 특히 친구 로비 유지 항목을 근거 없이 Yes로 되돌리지 않는다. 자동 검토에서 지적된 응답을 No로 정정한 뒤 저장했다.
- CrazyGames 중첩 iframe의 플레이 조작은 브라우저 도구 좌표 처리 제한으로 완료하지 못했다. 이를 게임 버그나 테스트 통과로 단정하지 않는다.

### 미저장 Details 입력 복구

- Category: `Card`.
- Tags: `1 Player`, `2D`, `Brain`, `Mouse`, `Battle`.
- Google Play, iOS App Store, Steam 링크 및 다운로드 수: 모두 비워 둠.
- Marketing creatives URL: 비워 둠.
- Mobile orientation: BOTH, 기존 빌드에서 정해져 비활성화됨.
- The game works well in fullscreen: 포털 기본 체크 상태 유지. 이번 종료 직전에도 체크 상태 확인.
- 로비: 최소 2, 최대 8.

Description:

> PORENA is a tactical poker auto-battler for eight contenders. Draft a unique ability, build your hand from a shared 52-card pool, and manage your BB to prepare for automatic poker showdowns. Adapt across five rounds with changing card rules, earn points, and fight for first place.
>
> Start with Quick Play against AI, learn the basics in the interactive tutorial, or create a private room for 2–8 players with AI filling the remaining seats. English and Korean are supported. BB is an in-game resource only; there are no real-money bets, deposits, or cash prizes.

Controls:

> Use the left mouse button on desktop, or tap on mobile.
>
> Select an ability card, buy or sell cards, and use the shop buttons to reroll or lock offers. Choose your card lineup when prompted, then press Ready. Showdowns play automatically. Use the on-screen buttons to advance between matches and rounds.

현재 남은 필수 항목은 커버 3개와 영상 2개이다. 종료 직전 실제 페이지에서도 각 커버와 두 영상의 필수 업로드 오류가 표시됨을 확인했다.

## 승인된 미디어와 로그인 필요 사항

사용자는 지정된 ZIP을 ChatGPT Library에서 내려받아 기존 PORENA 등록에 커버와 영상으로 업로드하는 권한을 승인했다. 비밀번호나 서명된 다운로드 URL은 이 기록에 저장하지 않는다.

- 파일명: `PORENA_CrazyGames_Media_Review_Draft_2026-10-01.zip`.
- Library 파일 ID: `libfile_e6830bc845888191bdc197cc72479181`.
- 이전 자료에서 확인된 버전과 크기: v2, 11,822,904 bytes. 실제 다운로드 후 다시 검증한다.
- 예정 구성: 1920×1080, 800×1200, 800×800 커버; 가로 및 세로 2종의 15.5초 무음 H264 영상; `EN_METADATA_DRAFT.txt`.
- 포털 요구: 커버 1920×1080, 800×1200, 800×800; 가로와 세로 MP4 또는 MOV, 최대 20초.
- 현재 로그인 화면: https://chatgpt.com/library
- 내장 브라우저의 ChatGPT는 로그아웃 상태이며 로그인 모달을 열어 두었다. 사용자가 직접 로그인해야 한다.
- 로컬 ZIP은 확보하지 못했다. `C:/Users/USER/Documents/Codex/2026-10-02/task-2/marketing-library`는 이전 확인 시 비어 있었다.
- 다른 작업의 파일 전송 도우미는 Windows 확장 속성 처리에서 실패했다. 도우미 보안 처리를 제거하거나 이전 서명 URL을 재사용하지 않는다. 공식 Library UI 다운로드를 이용한다.
- 브라우저 탭 보존 표시는 했지만 PC 종료 후 입력과 탭 복원을 보장하지 않는다. 이 문서를 복구 기준으로 삼는다.

## 재개 순서

1. 위 기존 CrazyGames 등록을 확인하고 Details의 현재 저장 상태를 읽는다. 누락된 텍스트와 설정만 이 문서에서 복구한다.
2. 사용자의 ChatGPT 로그인을 확인한다. 승인된 ZIP만 공식 다운로드하여 압축 항목과 실제 이미지 크기 및 영상 길이를 확인한다.
3. 해당 등록에 커버 3개와 프리뷰 영상 2개를 업로드하고 포털의 완료 표시를 확인한다. 새 게임이나 새 빌드를 불필요하게 만들지 않는다.
4. Details를 저장하고 Submit 화면의 실제 동의 내용을 읽는다. 법적 계약 동의가 필요하면 그 시점에 구체적 내용을 사용자에게 확인한다. 일반 업로드 승인을 미확인 계약이나 권리 보증으로 확대하지 않는다.
5. 에셋 사용 권리, 미검증 기기 및 멀티플레이 SDK 요구가 해결되지 않았다면 통과나 소유권을 허위로 증명하지 말고 정확히 보고한다. 관련 기존 검수 문서는 제출 커밋의 `product_doc/qa/2026-10-02-crazygames-latest-main.md`에서 확인할 수 있다.
6. 최종 제출 후 실제 상태가 심사 대기인지 확인한다. 업로드, 제출, 승인 및 공개는 별개의 상태로 보고한다.

이 저장 작업은 게임 코드, 다른 작업자의 변경, 원격 브랜치, 배포를 수정하지 않는다. 이 기록 또한 별도 지시 없이 커밋하거나 푸시하지 않는다.
