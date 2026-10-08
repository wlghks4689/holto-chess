# 미완료 작업

마지막 정리: 2026-10-03. 완료된 작업은 QA·DECISIONS·OPERATIONS 기록에 남기고 이 목록에서는 제외한다.

## 운영 후속 확인

### Google 로그인 — 공개 전 Gate

- [ ] AUTH-GOOGLE-001-LEGAL | 담당 사용자·Codex | 상태 TODO | 운영 공개 전 개인정보처리방침·이용약관의 계정 미지원 문구 개정, 계정 보존·탈퇴 정책과 시행일 결정. 초기 session 30일을 제품 정책으로 확정할지 확인.
- [ ] AUTH-GOOGLE-001-RELEASE | 담당 사용자·Codex | 상태 BLOCKED | 위 Gate 및 별도 commit/push/deploy 승인 후 운영 Secret·ACCOUNT_DB binding 배포, 로그인/기존 게스트·Discord·관리자 smoke QA, 자동 로그의 callback query 가림 확인. 신규 D1 생성·remote 초기 migration은 2026-10-07 완료, 운영 Worker는 미배포.

### 개인정보 보존

#### Cron 첫 실행 확인

- [ ] LEGAL-001-RETENTION | 담당 Codex | 상태 REVIEW | 의존 운영 Cron의 첫 실행 | 완료 조건: Cloudflare 로그에서 `retention.feedback` 실행 성공을 확인하고 기록한다. Cron 등록과 90일 삭제·보관 이메일 삭제 코드는 `e11697b` 배포로 적용됨. 로그 확인 후 완료 처리.

### Google Analytics

#### 보존 및 수집 설정

- [ ] LEGAL-001-GA4 | 담당 사용자 | 상태 BLOCKED | 의존 Google Analytics 관리자 로그인 | 완료 조건: 이벤트 데이터 보관 14개월, 새 활동 시 사용자 데이터 재설정 OFF 여부를 확인한다. Google Signals·광고 개인 최적화·사용자 제공 데이터 수집 상태를 먼저 확인해 보고한 뒤, 승인된 설정만 변경하고 저장을 확인한다.

## Discord Activity 출시 준비

### 코드 통합

#### PR #1 독립 검토 및 통합

- [ ] DIST-DISCORD-001-SPIKE | 담당 Codex | 상태 REVIEW | 의존 PR #1 `claude/zen-edison-cxisk1` 최신 main 기준 검토 | 완료 조건: Discord 플랫폼 판별, SDK 동적 import, exact Origin allowlist, 테스트와 시뮬레이션을 확인한다. 게임 규칙·밸런스·엔진 변경이 없는지 검토하고, 사용자 승인 기록에 따라 PR을 통합한다. 상세 `holto-chess/DISCORD_ACTIVITY_REPORT.md`.
- [ ] DIST-DISCORD-001-CONFIG | 담당 Codex | 상태 REVIEW | 의존 SPIKE 검토 및 PR 통합 | 완료 조건: 사용자 제공 Application ID `1555427351829942353`이 `holto-chess/wrangler.jsonc`의 `DISCORD_ACTIVITY_CLIENT_IDS`에 반영되고, 통합·운영 빌드에서 확인된다.

### Developer Portal

#### 인증 및 검색 공개 설정

- [ ] DIST-DISCORD-001-PORTAL | 담당 사용자 | 상태 IN_PROGRESS | 의존 CONFIG, HEADERS, RATELIMIT, PLAYTEST | 완료 조건: 기존 앱 설정(URL Mapping `/` → `porena.kr`, Activities, 최대 8명, 플랫폼 지원, 커뮤니티 서버, Discovery 문안 및 요건)을 확인하고, 실제 출시 시점에 Discovery 검색 공개를 활성화할지 결정한다. 현재 검색 공개는 비활성 상태로 두기로 했다.
- [ ] DIST-DISCORD-001-VERIFICATION | 담당 사용자 | 상태 TODO | 의존 Discord 팀 운영 준비 | 완료 조건: 앱을 팀 소속으로 이전하고 팀 구성원 이메일 인증 및 2단계 인증을 완료해 App Verification 미충족 항목을 해소한다.

### 네트워크 및 플레이 검증

#### 실제 Discord 동작과 공유 IP 제한

- [ ] DIST-DISCORD-001-HEADERS | 담당 Codex | 상태 BLOCKED | 의존 CONFIG 및 실제 Discord 요청 | 완료 조건: 요청의 Origin, Host, CF-Connecting-IP, CF-Ray, X-Forwarded-For, Forwarded, X-Real-IP, X-Forwarded-Proto 존재 여부와 형태를 기록한다. IP 원문은 저장하거나 로그하지 않는다.
- [ ] DIST-DISCORD-001-RATELIMIT | 담당 Codex | 상태 BLOCKED | 의존 HEADERS 및 사용자 정책 승인 | 완료 조건: CF-Connecting-IP 기반 제한이 Discord 사용자 간 공유되는지 판단하고, 공유 IP 영향에 대한 정책을 별도 결정한다. 결정 전 rate-limit 정책은 변경하지 않는다.
- [ ] DIST-DISCORD-001-PLAYTEST | 담당 사용자·Codex | 상태 BLOCKED | 의존 CONFIG | 완료 조건: 실제 Discord에서 2인 R1~R5를 Activity↔Activity 및 Activity↔웹 조합으로 완주한다. desktop·mobile, SDK 준비, 대기실 WebSocket 무활동을 확인한다.

## 어빌리티 후속 작업

### 실전 검증

#### 독주자·쿼드 코어

- [ ] ABILITY-012-LIVE-QA | 담당 Codex | 상태 TODO | 의존 운영 플레이 검증 환경 | 완료 조건: 실제 기기에서 독주자와 쿼드 코어 효과를 포함해 R1~R5 플레이를 검증한다. 기존 배포·에셋 확인 및 자동 테스트와 구분해 기록한다.

### AI 전략

#### 쿼드 코어 최초 카드 평가

- [ ] ABILITY-011-AI | 담당 Codex | 상태 TODO | 의존 어빌리티를 고려한 AI 평가 설계 | 완료 조건: 최초 카드 랭크의 보유·구매 자원 가치를 공정한 공개 정보로 평가하고 AI 회귀 테스트를 추가한다. 현재 AI는 구매 가중치를 반영하지 않는다.

## 멀티플레이 출시 전 검증

### 실기기·네트워크 QA

#### 혼합 버전과 부하 확인

- [ ] MP-QA-005 | 담당 Codex·사용자 | 상태 TODO | 의존 MP-QA-004 및 운영 검증 일정 | 완료 조건: 구형 탭 혼합 전환, Safari/iOS/Android 실기기, 원거리 회선, 동시 방 부하를 점검한 뒤 운영 준비 상태를 판단한다. 로컬 headless 결과만으로 완료 처리하지 않는다.

## 효과음 후속 작업

### 메이드별 사운드

#### 음질 승인 후 제작·연결

- [ ] SFX-001 | 담당 Codex | 상태 REVIEW | 의존 사용자가 생성 음질을 승인할 새 음원 제공 또는 방향 확정 | 완료 조건: 스트레이트·플러시·풀하우스·포카드·로열 플러시 전용 WAV 5종을 준비하고, 일반/R2/R3/R4/R5 메이드 연출에 장면별 최고 족보 사운드를 한 번 연결한다. 설정·미리듣기·회귀 테스트를 완료한다. 판정과 재생 타임라인은 유지한다. 현재 스트레이트 플러시 core/tail 연결과 미리듣기 `/fx`는 구현돼 있으며, 나머지 생성 음원은 사용자 음질 피드백으로 보류 중이다.

## 현지화 출시 QA

### 언어 전환·오류 메시지·번역 검수

#### 전체 흐름 검증

- [ ] I18N-001 | 담당 Codex | 상태 IN_PROGRESS | 의존 사용자 현지화 요청 | 완료 조건: ko-KR/en-US 키 일치, 브라우저 언어 감지, 영어 대체 언어, 저장 우선순위, 즉시 전환, 문서 lang, 접근성 문자열 및 전 화면 이전을 출시 QA로 확인한다. 현재 키 각 697개이며 한국어 참가자의 R1~R5 완주, 오류 화면 전수, 실제 5개 viewport 검증은 미완료. 상세 `holto-chess/LOCALIZATION_REPORT.md`.
- [ ] I18N-002 | 담당 Codex | 상태 IN_PROGRESS | 의존 I18N-001 | 완료 조건: Worker 오류와 Player Log의 event/error code·params 현행/재접속 호환성, 사용자 노출 문자열 점검, 5개 viewport 한·영 전체 흐름, 원어민 번역 검수를 완료한다. 기존 의미 코드·legacy fallback과 혼합 언어 멀티플레이 테스트는 구현됨. 실제 5개 viewport, 한국어 전체 완주, 오류 전수·원어민 검수는 미완료. 상세 `holto-chess/LOCALIZATION_REPORT.md`.

## 밸런스 분석 협업

### BAL-001 격리 보고서

#### 기준 고정·접근 확인

- [ ] COL-005 | 담당 Codex | 상태 IN_PROGRESS | 의존 COL-003, COL-004 | 완료 조건: BAL-001 REQUEST가 포함된 기준 문서 커밋을 고정하고, 사용자 승인 범위 안에서 공유한 뒤 전체 SHA를 기록한다. 2026-09-24 문서 commit/push 요청은 기록돼 있으나 최종 SHA 인계가 확인되지 않았다.
- [ ] COL-006 | 담당 Codex | 상태 BLOCKED | 의존 COL-005 | 완료 조건: 분리된 Claude worktree/clone에서 BASE_COMMIT과 REQUEST를 읽을 수 있는지 확인하고 BAL-001을 READY로 표시한다. Claude 환경의 접근은 아직 확인되지 않았다.

### 분석·독립 검토·승인

#### 제안 근거 확인

- [ ] BAL-001-A | 담당 Claude | 상태 BLOCKED | 의존 COL-006 | 완료 조건: 코드 근거, 도구 호환성, 측정 가능·불가 지표, 재현 증거를 보고서와 산출물로 제출하고 보고서 커밋 SHA를 제공한다.
- [ ] BAL-001-R | 담당 Codex | 상태 TODO | 의존 BAL-001-A | 완료 조건: 보고서 SHA를 고정하고 기준 대비 관련 변경을 검토·재현한 뒤 각 제안의 채택 권고·보류·기각 근거를 작성한다.
- [ ] BAL-001-U | 담당 사용자 | 상태 TODO | 의존 BAL-001-R | 완료 조건: 구현할 도구 개선과 규칙·수치 변경을 각각 승인 또는 거절하고 근거를 DECISIONS에 기록한다. 보고서 제출만으로 게임 규칙 변경을 승인하지 않는다.

### 승인된 내용 구현

#### 도구와 게임 변경 분리

- [ ] BAL-001-T | 담당 Codex | 상태 BLOCKED | 의존 BAL-001-U | 완료 조건: 승인된 시뮬레이터 개선만 구현하고 재현성·완주·집계 테스트 후 구현 SHA를 기록한다.
- [ ] BAL-001-G | 담당 Codex | 상태 BLOCKED | 의존 BAL-001-U 및 필요한 경우 BAL-001-T | 완료 조건: 명시적으로 승인된 게임 변경만 구현하고 전후 비교·회귀 검증·승인 근거·구현 SHA를 기록한다.

## 개발자도구 정보 노출·치팅 방어

### 감사 발견 사항의 수정 및 정책 확정

#### 공개 데이터·입장 권한·연결 자원

- [ ] SEC-001 | 담당 Codex·사용자 | 상태 REVIEW | 의존 사용자 공개 정책 승인 완료 | 완료 조건: 상점 구매 시 상대 BB 차이로 구매 랭크를 추론하는 노출을 방지하고 자기 경제 값·서버 정산 정확성을 유지한다. 최초 감사의 단독 Q 구매 50→35BB 노출은 신규 상점 기준 스냅샷으로 차단한다. 기존 진행 중 상점의 이행 한계는 QA에 기록한다. | 구현 완료, 통합 검증과 남은 한계: [보안 후속 QA](qa/2026-10-03-security-followup.md).
- [ ] SEC-002 | 담당 Codex | 상태 REVIEW | 의존 보안 수정 작업 진행 | 완료 조건: 미공개 동시 테이블의 승점이 standingsBefore 등 보조 필드로 전송되지 않게 하고 R1/R3 모든 좌석의 공개 경계 회귀를 추가한다. | 구현 완료, 통합 검증과 남은 한계: [보안 후속 QA](qa/2026-10-03-security-followup.md).
- [ ] SEC-003 | 담당 Codex | 상태 REVIEW | 의존 보안 수정 작업 진행 | 완료 조건: 공식 탈락 공개 전 ownedCards 소멸 등으로 탈락 여부가 드러나지 않게 하며 실제 카드 풀 반환과 몰수패 처리를 유지한다. | 구현 완료, 통합 검증과 남은 한계: [보안 후속 QA](qa/2026-10-03-security-followup.md).
- [ ] SEC-004 | 담당 Codex | 상태 REVIEW | 의존 보안 수정 작업 진행 및 일정 설계 | 완료 조건: 결과에 의존하는 순위 프레임·추가 보드·타이브레이크/종료 일정의 선전송 노출을 제거하고 재접속·동기화·실제 긴 결정전을 유지한다. | 구현 완료, 통합 검증과 남은 한계: [보안 후속 QA](qa/2026-10-03-security-followup.md).
- [ ] SEC-005 | 담당 Codex·사용자 | 상태 REVIEW | 의존 익명/경쟁 참가자 식별·입장 정책 결정 | 완료 조건: 한 사람이 여러 좌석 token을 발급받아 상점/패를 확보하거나 방을 독점하는 경로를 제한하고 정상 공유 IP 참가자를 보존한다.
- [ ] SEC-006 | 담당 Codex | 상태 REVIEW | 의존 보안 수정 작업 진행 | 완료 조건: 인증 전 소켓이 전체 방 연결 cap을 점유해 정상 재접속을 거부하는 문제를 수정하고 로컬 Workers 회귀를 추가한다. 최초 감사의 무인증 24연결 뒤 정상 handshake 429 재현을 인증된 좌석의 일회용 티켓과 제한된 레거시 대기 슬롯으로 보강한다. | 구현 완료, 통합 검증과 남은 한계: [보안 후속 QA](qa/2026-10-03-security-followup.md).

감사 근거와 보강 제안: [2026-10-03 보안 감사](qa/2026-10-03-devtools-security-audit.md). 게임 코드 수정·운영 공격 검증·커밋·push·배포는 이번 감사에서 진행하지 않았다.
