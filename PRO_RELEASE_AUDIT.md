# PORENA Independent Release Audit

> [!IMPORTANT]
> 이 파일은 2026-09-22에 후보 `8984da8`을 대상으로 작성된 독립 감사 원문을 보존한 저장소 사본입니다. 아래 **Remediation Update**가 이후 저장소에서 직접 재현·수정·검증한 최신 상태이며, 원문의 당시 판정과 증거 범위를 소급해 바꾸지 않습니다.

## Remediation Update — 2026-09-23

- 적용 커밋: [`1318827a5feec312f9f645414e64eced4e998527`](https://github.com/wlghks4689/holto-chess/commit/1318827a5feec312f9f645414e64eced4e998527)
- **P-B01 FIXED:** 사용자 구매와 AI 구매가 같은 예약→소유 이전 함수를 사용합니다. 구매한 카드는 `lockedShopCardIds`에서 즉시 제거되며, AI 리롤도 실제로 바꿀 수 있는 슬롯이 있을 때만 수행됩니다.
- **P-M01 FIXED:** 라운드 순위 변동의 이전 순위가 이전 승점뿐 아니라 첫 보상 원장의 `beforeBB`까지 사용합니다.
- **P-M02 FIXED:** 생존 타이브레이크 요약이 각 플레이어가 마지막으로 참가한 결정 보드의 족보와 사용 카드를 보존합니다. 생존자·탈락자 계산 및 보상은 변경하지 않았습니다.
- **P-M03 FIXED:** Omaha 예시는 실제 evaluator와 일치하는 `A♥·2♦ + 3♠·4♣·5♠ = 5 하이 스트레이트`로 수정했습니다.
- **M-03 / N-05 FIXED:** 라운드 가이드에 포커스 진입·순환·복귀·Escape 닫기를 추가했고, 최종 총점 팝업은 hover 자동 열기와 click 토글의 충돌을 제거했습니다.
- **최종 순위 정책 FIXED:** R5 진출자는 최종 총점으로 1~4위, R4 탈락자는 탈락 당시 승점으로 5~6위, R3 탈락자는 같은 기준으로 7~8위에 고정됩니다.
- **관전자 READY 정책 FIXED:** 탈락자는 `waitingOn`과 READY 투표 대상에서 제외됩니다. 모든 인간이 탈락한 뒤의 연출·결과 장벽은 관전자 입력 없이 서버 타이머가 진행합니다.
- README의 R4 드래프트 뒤 개인 상점과 최종 점수의 증강 보너스 공식을 실제 코드에 맞췄습니다.

검증 결과: `npm test` **51 files / 361 tests PASS**, `npm run test:workers` **1 file / 12 tests PASS**, `npm run lint` PASS, `npm run build` PASS. Worker 시험은 실제 Durable Object에서 `2-lock → R1 timeout → AI purchase → persist/broadcast/reconnect`를 확인합니다. Wrangler 로그 파일 `EPERM` 및 정적 분석 경고는 출력됐지만 각 명령은 종료코드 0으로 시험/번들 생성을 완료했습니다.

운영 도메인은 이전 후보 `8984da8`(Cloudflare Version ID `758e8fc5-ff55-4bce-a185-7c93b382ad7f`)까지 배포되어 있습니다. 2026-09-23 읽기 전용 확인에서 health/root/`/play`는 HTTP 200, `www`는 apex로 HTTP 301이었습니다. 이 보정 커밋 `1318827`은 현재 요청 범위에 따라 GitHub에만 전달하며 새 운영 배포는 하지 않습니다.

**판정은 계속 NOT READY입니다.** 위에서 재현된 코드 결함과 최종 순위·관전자 READY 정책은 닫혔지만, `win_bonus`의 R3 적용 범위, 시네마틱 이전 resolved payload 공개 정책과 실제 모바일·부하·장애 주입 검증은 별도 승인 또는 실행 증거가 필요합니다.

**감사일:** 2026-09-22 · **판정:** **NOT READY**
**감사 방식:** 읽기 전용 소스 대조 + 독립 실행 검증 + 기존 QA 증거 검토
**신규 확인:** BLOCKER **1건**, CRITICAL **0건**, MAJOR **3건**

> Astra의 NOT READY 판정에 동의한다. 다만 이유가 추가되었다. 정책 후속 수정이 들어간 QA 브랜치에도 **잠긴 상점 카드를 AI가 자동 구매하면서 진행을 멈추는 결함**이 남아 있다. 또한 최신 `main`에는 Astra의 주요 수정 자체가 아직 들어오지 않았다.
> 이 문서는 전체 npm/Workers 테스트나 실기기 QA를 재실행했다는 인증서가 아니다. 실제 실행한 독립 검증과 소스 검토, Astra가 보고한 시험 결과를 구분한다.

---

## Tested Revision

### 1. 실제 확인한 버전

| 대상 | 확인 결과 | 감사에서의 역할 |
| --- | --- | --- |
| GitHub `main` | `1d5ab2f977d8c7765b108ca8eade23eefe288bad` | 사용자가 요청한 최신 main. QA 이전 상태 |
| `codex/release-audit` | `8984da87228ee3e4f102fa80a131b714935822a8` | 후속 정책 수정까지 포함한 후보 버전. main보다 3커밋 앞섬 |
| 1차 수정 커밋 | `c224bd0f5118dec80ba40a8540d833e5cd076b33` | 마감시간 검증·재경기 식별자·R1 표시 스냅샷 등 |
| 보고서 커밋 | `1145c55911cf63737728a536d08928842ecc13cd` | 저장소에 있는 초기 QA 보고서 |
| 정책 후속 수정 커밋 | `8984da8` | 카드 부족 몰수패·R4 공동 2위 3P |
| 실제 앱 | `holto-chess/` | Cloudflare/Vite 실행 앱. 루트 명령은 위임 구조 |
| 배포된 도메인의 코드 버전 | **미확인** | GitHub HEAD와 배포 버전을 동일하다고 가정하지 않음 |

브랜치 확인은 감사 시작과 보고서 작성 직전에 반복했으며 같은 SHA를 확인했다. 근거: [main 커밋][S-main], [후속 수정 커밋][S-candidate], [두 버전 비교][S-compare], [프로젝트 지침][S-agents].

### 2. 보고서가 세 상태로 나뉘어 있다

- **사용자 첨부본** `RELEASE_QA_REPORT(1).md`: B-01/B-02를 후속 수정 완료로 설명하지만, L9에는 후속 변경이 아직 커밋·푸시되지 않았다고 적혀 있다.
- **GitHub QA 브랜치의 `RELEASE_QA_REPORT.md`**: 여전히 초기 보고서다. B-01/B-02를 OPEN으로, 당시 테스트를 알려진 결함 재현용 assertion으로 설명한다.
- **실제 QA 브랜치 코드·테스트**: `8984da8`에 정책 수정과 성공 진행/정상 지급 assertion이 들어 있다.

따라서 첨부본의 “아직 푸시하지 않음”은 **현재 GitHub 상태로는 오래된 설명**이다. 반대로 저장소에 들어 있는 초기 보고서의 “두 blocker가 미수정” 역시 **후속 코드에는 맞지 않는다**. 어느 보고서 파일이 최신인지와 어떤 커밋을 검증한 것인지부터 정리해야 한다. [저장소 보고서][S-repo-report], [후속 수정][S-candidate]

첨부본 SHA-256: `c289a214910efd52a93cb241b9e9c4f475a715e278bcfcdefe9ce8afeccedc5e`.

### 3. 이번 감사의 실행 범위와 한계

**직접 수행한 것**

- GitHub 연결을 통한 main/QA 브랜치, 변경 내역, 게임 엔진·소유 원장·프로토콜·DO·관련 UI·시험 소스 확인.
- 7개 핵심 TypeScript 파일을 격리 환경에 복사하고, 각각 Git blob SHA가 원본과 일치하는지 검증.
- 해당 원본 모듈로 5장 족보 전체 2,598,960개 조합의 분포, 오마하/키커 사례, ICM, 스위스 매칭 표본, 보드 제외 규칙, 순위 변동 계산 실행.
- `aiPrepare/prepareShowdown`, `resolveSurvival`의 해당 함수 본문을 별도 하네스에서 실행해 결함 경로 재현. AI 평가와 매치 생성 접착 부분에는 명시적인 테스트 대역을 사용했고, 원장 검사와 오마하 판정은 원본 모듈을 사용했다.

**직접 재실행하지 않은 것**

- 저장소 전체 `npm ci`, `npm test`, `test:workers`, `lint`, `build`.
- 전체 애플리케이션의 브라우저 자동화, 실제 Cloudflare DO 통합 재현, 실기기 iOS/Android 시험, 부하 시험, 배포.

작업 컨테이너의 GitHub DNS 접근이 실패해 전체 checkout/install을 하지 못했다. 연결된 GitHub 도구로 소스는 읽었지만, 이를 전체 저장소 테스트 실행과 혼동하지 않았다. 프로덕션 페이지/health를 재확인하려는 읽기 요청도 이 환경에서 성립하지 않았다. **이것을 서비스 장애라고 판정하지 않는다.** 저장소 코드는 수정·커밋·푸시하지 않았으며 게임 규칙·밸런스·인프라도 변경하지 않았다.

---

## Final Verdict

# NOT READY

**main과 QA 후보 버전 모두 공개 출시 승인 대상이 아니다.**

| 버전 | Astra가 이미 발견한 문제 | 이번에 추가로 발견한 문제 | 판정 |
| --- | --- | --- | --- |
| main `1d5ab2f` | B-01/B-02 수정 미반영. C-01/C-02 등 QA 수정도 미반영 | P-B01 잠금 카드 자동 구매 진행 차단 | NOT READY |
| QA 후보 `8984da8` | B-01/B-02 및 C-01/C-02 수정 코드·회귀시험 존재. 정책/실기기/배포 확인은 별개 | P-B01 잔존, 결과/안내 관련 MAJOR 3건 | NOT READY |

**신규 BLOCKER 1건**은 “테스트를 못 해서 보수적으로 잡은 위험”이 아니라, 유효한 상점 상태에서 소스의 실제 변경 로직이 원장 검사에 실패하는 재현 가능한 결함이다. **신규 CRITICAL 0건**은 이번 확인 범위에서 추가 확정하지 않았다는 뜻이지, 모든 경쟁 조건이 안전하다는 뜻이 아니다.

Severity는 사용자 정의를 따른다. 방 전체 진행을 막는 P-B01은 BLOCKER다. 이번에 발견한 순위 변동·설명 예시·타이브레이크 요약 오류는 실제 점수/생존 판정을 바꾸는 증거가 없으므로 MAJOR로 분리했다.

---

## Astra QA Verdict Review

첨부 보고서의 번호를 유지한다. **ALREADY FIXED는 QA 후보에서의 상태이며 main 수정 완료를 뜻하지 않는다.** PARTIALLY CONFIRMED는 소스·시험은 확인했지만 보고서의 실제 실행/화면 결과를 이번 환경에서 다시 확인하지 못했다는 뜻이다. 미실행을 NOT REPRODUCIBLE로 둔갑시키지 않았다.

| Astra 항목 | 독립 판정 | 근거와 보정 |
| --- | --- | --- |
| B-01 카드 부족/빈 패로 진행 중단 | **PARTIALLY CONFIRMED** | main에는 원래 가정이 남아 있다. 후보에는 `forfeitHand`, 부족 카드 판정, null draft pick, R2 불완전 배치 처리와 정상 진행 시험이 있다. 전체 DO 시험 재실행은 못 했다. 별개의 잠금 카드 경로 P-B01은 해결되지 않았다. [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts) · [S-forfeit](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/forfeit.test.ts) · [S-release-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts) |
| B-02 R4 공동 2위 10/5/5 | **ALREADY FIXED** | 후보의 `tiedSecond:3`과 동일 2위 수를 검사하는 지급 분기 확인. 회귀시험이 10/3/3, 정상 10/5/3을 모두 검사한다. main에는 미반영. [S-config](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/config.ts) · [S-ties](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseTies.test.ts) |
| C-01 SHOP/AUGMENT 마감 뒤 입력 수락 | **ALREADY FIXED** | 후보는 변이 전 `now >= deadline`을 거부한다. main에는 해당 공통 guard가 없다. 경계/마감 100ms 전 시험 코드 확인. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-main-room](https://github.com/wlghks4689/holto-chess/blob/1d5ab2f977d8c7765b108ca8eade23eefe288bad/holto-chess/src/game/room.ts) · [S-release-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts) |
| C-02 이전 게임 명령의 재경기 적용 | **ALREADY FIXED** | 후보의 turn key는 generation/encounter를 포함한다. main은 `round:phase`뿐이다. 재경기 증가 및 이전 키 거부 시험 확인. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-main-room](https://github.com/wlghks4689/holto-chess/blob/1d5ab2f977d8c7765b108ca8eade23eefe288bad/holto-chess/src/game/room.ts) · [S-protocol](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/shared/protocol.ts) |
| M-01 규칙 문서 불일치 | **CONFIRMED** | root README의 R4 누적 하위 탈락, R4 개인 상점 대체 문구, 최종 식의 증강 누락 등을 확인했다. 보고서 자체도 버전 불일치가 있다. [S-readme](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/README.md) · [S-repo-report](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/RELEASE_QA_REPORT.md) |
| M-02 승자의 배당 R3 미적용 | **CONFIRMED** | 설명은 승리 보상 +5BB, R3 전용 분기는 10BB를 고정 지급하고 해당 증강을 검사하지 않는다. 의도 확정 없이 경제를 수정하지 않는다. [S-augments](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/augments.ts) · [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts) |
| M-03 RoundGuide 포커스 이탈 | **PARTIALLY CONFIRMED** | 컴포넌트의 dialog/aria-modal은 확인되지만 자체 focus trap/inert/focus 복귀는 없다. 실제 Shift+Tab 재현은 Astra 증거이며 이번 브라우저 재실행은 없음. [S-guide] |
| M-04 R1 첫 매치에서 미래 승점 표시 | **PARTIALLY CONFIRMED** | 모든 라운드에 before/after point snapshot을 생성하도록 바뀐 코드와 렌더링 회귀시험 추가를 확인했다. 실시간 UI 전 구간 무스포일러까지 증명된 것은 아니다. [S-initial-fix](https://github.com/wlghks4689/holto-chess/commit/c224bd0f5118dec80ba40a8540d833e5cd076b33) · [S-release-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts) |
| M-05 같은 방 재경기 기록 ID 재사용 | **ALREADY FIXED** | `gameId`에 generation 포함. 저장소의 방 ID는 유지한다. main은 아직 미수정. [S-player-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/playerView.ts) · [S-initial-fix](https://github.com/wlghks4689/holto-chess/commit/c224bd0f5118dec80ba40a8540d833e5cd076b33) |
| M-06 운영 smoke의 구형 명령 | **PARTIALLY CONFIRMED** | 수정 커밋과 v2 Worker 시험의 draft/loadout/phase 처리 확인. 로컬 WS 158초 실행 결과는 첨부 보고서 증거이며 이번에 재측정하지 않았다. [S-initial-fix](https://github.com/wlghks4689/holto-chess/commit/c224bd0f5118dec80ba40a8540d833e5cd076b33) · [S-worker-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/tests/worker/room.test.ts) |
| N-01 360px 보상 문구 잘림 | **PARTIALLY CONFIRMED** | CSS 변경 내역은 있으나 동일 뷰포트 렌더링 결과 재검증 없음. 완료로 무조건 인증하지 않는다. [S-initial-fix] |
| N-02 드래프트 앞 CTA의 “상점” 표기 | **PARTIALLY CONFIRMED** | App.tsx의 수정 내역 확인. 해당 브라우저 전환을 이번에 재실행하지 않았다. [S-initial-fix] |
| N-03 Loadout의 raw card ID | **CONFIRMED** | `RunLoadoutPanel`의 option label이 `{c.id}`여서 `8c` 같은 내부 ID를 그대로 표시한다. 카드 모양과 별개로 선택지 문구는 미수정. [S-open-draft] |
| N-04 작은 터치 대상 | **PARTIALLY CONFIRMED** | 보고서의 26px/50px 실측은 직접 재측정하지 않았다. 실기기 미확인이라는 한계에는 동의한다. |
| N-05 최종 총점 hover/click 충돌 | **CONFIRMED** | `onPointerEnter`가 true로 열고 `onClick`이 같은 boolean을 반전한다. 마우스가 들어온 뒤 클릭하면 닫히는 경로가 명시돼 있다. [S-final-row] |

### Design Decision Required 재검토

| 보고서 결정 항목 | 판정 | 조치 |
| --- | --- | --- |
| B-01 몰수패 정책 | **ALREADY FIXED** — 후보 코드 기준 | 첨부본에 기록된 승인 정책으로 취급. 별도 경제 구제책을 새로 만들지 않음 |
| B-02 공동 2위 각 3P | **ALREADY FIXED** — 후보 코드 기준 | 1/2/2를 억지로 1/2/3으로 바꾸지 않음 |
| R3 win_bonus 예외 | **CONFIRMED** | 증강 적용 범위 또는 설명 예외를 승인해야 함 |
| 시네마틱 공개 시점 이전 payload | **CONFIRMED** | 사전 전달을 허용할지, 서버 단계별 공개를 요구할지 결정 |
| 모든 인간 탈락 후 관전자 READY | **CONFIRMED** | 현 구현은 진행을 허용. “어떤 상태도 변경 금지”와는 다름 |
| 탈락자의 최종 순위/족보 스냅샷 | **CONFIRMED** | 탈락자의 총점이 생존자를 앞설 수 있고 R3은 보유 4장 partial 평가를 저장함 |

근거: [PlayerView][S-player-view], [presentation][S-presentation], [room][S-room], [finalStandings/eliminate][S-engine]. 이 사항들은 보고서가 이미 공개한 정책 문제다. 이를 새로 발견한 보안 BLOCKER 수에 중복 합산하지 않았다.

---

### Known Remaining Risks 및 무번호 항목 재검토

| 첨부 보고서 항목 | 판정 | 근거/남은 검증 |
| --- | --- | --- |
| L255 후속 B-01/B-02 로컬 수정, 미배포 | **PARTIALLY CONFIRMED** | 지금은 후보에 커밋·푸시됨. 배포 여부/수정 후 실기기 결과는 미확인 |
| L256 증강·최종 순위·관전자·payload 정책 | **CONFIRMED** | 위 정책 표 및 실제 분기에서 확인 |
| L257 부하/인터넷 장애/전원 손실 시험 미수행 | **CONFIRMED** — 제출 증거의 범위 | 그런 시험 결과는 첨부되지 않았고 이번에도 실행하지 않음. 외부에서 전혀 수행하지 않았다고 추측하지는 않음 |
| L258 production 무변경, preview 미배포 | **PARTIALLY CONFIRMED** | Astra의 작업 기록으로 존중하되 계정 배포 이력까지 독립 확인하지 못함 |
| L259 1,000-game balance run 미인증 | **CONFIRMED** — 증거 범위 | 독립 evaluator 전수 검사는 게임 1,000판 밸런스 시뮬레이션이 아님 |
| L260 v1 지원/legacy 시험 유지 | **CONFIRMED** | v1 분기 및 config 잔존 확인. 전 v1 게임 루프 호환성 검증 완료라는 뜻은 아님 |
| L261 UI/실기기 한계 | **CONFIRMED** — 증거 범위 | 관련 실행 로그가 보장하지 않는 범위는 계속 미확인으로 유지 |
| L132 일반 시네마틱 speed/skip 비노출 | **PARTIALLY CONFIRMED** | 동기화된 재생과 사용자 조작 허용 정책을 분리해야 함. preview의 조작 가능만으로 실제 서비스 지원을 인증하지 않음 |

---

## Confirmed Astra Findings

### 유효한 개선

C-01의 마감 검증 위치, C-02의 세대별 turn key, M-05의 게임별 archive ID, B-02의 중앙화된 공동 2위 배점은 원인과 수정이 대응한다. 불완전 패 처리 역시 예외를 무시하는 방식이 아니라 별도의 몰수패 결과를 생성하고 실제 소유 카드를 보존하는 방향으로 구현됐다. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-player-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/playerView.ts) · [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts) · [S-config](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/config.ts)

`releaseAudit.test.ts`의 최초 파산 재현 시험은 초기 커밋에서 예외 발생을 기대하던 시험이었으나, 후보에서는 실제 GAME_RESULT까지 진행해야 성공하도록 바뀌었다. `releaseTies.test.ts` 역시 잘못된 10/5/5가 유지되는지를 검사하지 않고 승인된 10/3/3을 검사한다. **“결함 재현용 시험이 통과했다”와 “결함이 수정됐다”의 구분은 후보 시험에 반영되어 있다.** [S-initial-fix](https://github.com/wlghks4689/holto-chess/commit/c224bd0f5118dec80ba40a8540d833e5cd076b33) · [S-release-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts) · [S-ties](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseTies.test.ts)

### 승격해서 해석하면 안 되는 부분

Astra의 357개 unit test, 11개 Workers test, 두 클라이언트 WS smoke는 유용한 보고 증거지만 이번 감사에서 재실행한 수치가 아니다. 특히 두 클라이언트의 로컬 p95 517ms는 인터넷 지연이나 동접 수용 능력으로 사용할 수 없다. 원 보고서도 이 한계를 명시한다(첨부본 L24–30, L215–230).

---

## Incorrect / Overstated Astra Findings

### 1. R1 연승 BB 설명은 코드와 다르다 — INCORRECT

첨부본 L147은 R1 승리를 `10BB + prior-win*5`라고 설명한다. 실제 후보의 `rewardMatch`는 다음과 같다.

```ts
const base = state.round === 1 ? 10 : BALANCE.winRewardBB;
const streakBonus = state.round === 1 ? 0 : player.winStreak * BALANCE.winStreakStepBB;
```

즉 일반 R1 승리의 연승 보너스는 **0**이다. 이 설명을 근거로 코드를 +5씩 지급하도록 바꾸면 QA가 아니라 밸런스 변경이다. 보고서/설명을 고쳐야 한다. [S-engine]

### 2. 수정 반영 위치 설명이 최신 저장소와 맞지 않는다 — PARTIALLY CONFIRMED

“후속 정책 수정이 로컬에만 있다”는 첨부본의 설명은 작성 당시 기록으로는 가능하지만, 현재는 `8984da8`로 푸시되어 있다. 다만 main에 병합되거나 도메인에 배포됐다는 뜻은 아니다. 저장소의 초기 보고서는 반대로 이전 OPEN 상태를 유지한다. [S-candidate](https://github.com/wlghks4689/holto-chess/commit/8984da87228ee3e4f102fa80a131b714935822a8) · [S-compare](https://github.com/wlghks4689/holto-chess/compare/1d5ab2f977d8c7765b108ca8eade23eefe288bad...8984da87228ee3e4f102fa80a131b714935822a8) · [S-repo-report](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/RELEASE_QA_REPORT.md)

### 3. “0 open”을 일반적인 출시 안전성으로 확장할 수 없다

첨부본은 이미 “addressed paths”로 범위를 제한했다. 그 범위 밖인 **잠금 + 충분한 BB + 타임아웃 구매**는 추가로 실패한다. B-01의 파산 시험이 잠금을 두 번씩 토글해 **마지막에 해제된 상태**를 만든다는 점이 핵심이다. 해당 시험이 잠긴 카드 구매까지 검증했다고 해석하면 안 된다. [S-release-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts) · [S-forfeit](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/forfeit.test.ts)

### 4. 화면 전체의 무스포일러 및 실기기 완료를 인증한 보고서는 아니다

R1 point snapshot 수정으로 모든 payload가 공개 시간에 맞춰 숨겨지는 것은 아니다. R4/R5/최종 표를 모든 해상도에서 확인한 것도 아니다. 첨부본 L197과 L207–211의 제한은 유지해야 한다. 본 감사도 그 제한을 없앴다고 주장하지 않는다.

---

## Missed Blockers

### P-B01 — 잠긴 상점 카드를 AI가 자동 구매하면 원장 검사에서 진행이 중단됨

**Severity:** BLOCKER
**Status:** CONFIRMED — 소스 경로 확인 및 격리 실행 재현
**영향 버전:** main / QA 후보 모두. 해당 AI 구매 경로는 후속 수정에서도 남아 있음
**영향:** 상점 타임아웃 이후 쇼다운 준비로 넘어가지 못하는 방 전체 진행 차단

#### 정상 입력으로 도달 가능한 조건

1. R1에서 기본 카드 1장을 보유한다.
2. 상점의 리롤 1회를 사용한다. 시작 50BB라면 45BB가 남는다.
3. 상점 두 카드를 각각 잠근다. 3BB씩 차감되어 39BB가 남는다.
4. 카드는 구매하지 않고 상점 제한시간이 끝나도록 둔다.
5. 타임아웃 처리에서 이 좌석을 AI가 대신 준비한다.

두 제시 카드 가격은 모두 20BB 이하이므로 이 시점에는 구매할 돈이 충분하다. 이미 R1 리롤 한도를 썼기 때문에 어느 카드를 선호하든, AI가 구매하는 카드는 잠긴 카드다. 이는 Astra B-01처럼 돈을 고갈시키는 시나리오가 아니다. [S-config](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/config.ts) · [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts)

#### 원인

`engine.ts`의 `aiPrepare` 안에 공개 구매 함수와 별개의 내부 `buy`가 있다.

```ts
player.shopCardIds = player.shopCardIds.filter((id) => id !== cardId);
player.ownedCardIds.push(cardId);
entry.state = "OWNED";
entry.ownerPlayerId = player.id;
delete entry.reservedPlayerId;
```

여기서 **`lockedShopCardIds`에서 구매한 카드가 제거되지 않는다.** 반면 일반 `buyCard`는 그 목록도 제거한다. 이어서 `prepareShowdown`은 원장 검사를 실행하고, `cardPool.ts`는 다음 조건을 거부한다.

```ts
if ((player.lockedShopCardIds ?? []).some((id) => !player.shopCardIds.includes(id)))
  throw new Error("Locked card is not reserved in shop");
```

근거: [AI 구매 및 prepareShowdown][S-ai-lines], [소유 원장 검사][S-pool].

#### 직접 관찰한 독립 실행 결과

유효한 52장 원장에서 다음 상태로 시작했다.

```text
OWNED:   Ah
SHOP:    5c, 6d
LOCKED:  5c, 6d
BB:      39
```

AI 구매 후 임시 상태:

```text
OWNED:   Ah, 5c
SHOP:    6d
LOCKED:  5c, 6d      ← 구매한 5c가 여기에 남음
ERROR:   Locked card is not reserved in shop
```

선호 순서를 뒤집어 6d를 먼저 구매하게 해도 같은 검사 오류를 재현했다. 테스트에서는 실제 구매/준비 함수 본문과 원본 원장 검사를 사용했고, 전략 선택·가격 등 주변 의존성은 이 fixture에 필요한 범위의 테스트 대역으로 공급했다. 가격의 정밀 계산이나 봇의 실제 선호도를 검증한 시험은 아니다. **실제 Workers 알람까지 실행한 결과는 아니며**, 알람 영향은 `forceBarrier → prepareShowdown → assertPoolIntegrity`와 DO의 저장 순서를 소스로 추적한 것이다. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-do](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/worker/GameRoom.ts)

#### 영향의 정확한 범위

확인된 것은 **잘못된 임시 상태와 진행 실패**다. 이 상태가 영구 저장되어 카드가 중복 소유됐다는 증거는 없다. 현재 구조는 `apply/force`가 성공한 다음 저장하므로 저장 이전에 실패한다. 그러나 재접속은 이전 SHOP 상태를 다시 받게 되고, 같은 자동 구매는 다시 실패할 수 있다. 후보에서는 마감 뒤 상점 입력을 거부하므로 단순 재접속/잠금 해제에 의존한 정상 복구도 기대하면 안 된다. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-do](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/worker/GameRoom.ts)

#### 수정 제안 — 이번 감사에서 적용하지 않음

- 사용자 구매와 AI 구매가 같은 소유권·예약·잠금 정리 규칙을 사용하도록 내부 mutation helper를 공유한다.
- 구매되는 cardId를 `lockedShopCardIds`에서도 제거한다.
- AI의 교체 구매 경로까지 동일하게 적용한다.
- 내부 리롤 역시 “모든 카드 잠금” 조건을 공유해야 한다. 현재 AI 리롤은 일반 `rerollShop`의 방어 조건을 직접 거치지 않는다.
- **원장 검사를 삭제하거나 예외를 무시해서 다음 단계로 보내는 방식은 금지**한다.

#### 필요한 회귀시험

상점 두 장 잠금 + 미완성 손패 + 충분한 BB + 타임아웃, 잠금 1장, 자동 교체 구매, 나가기/재접속 후 AI 준비, R1/R4/R5를 확인한다. 실제 DO 시험에서는 알람 처리 후 정상 PLAYER_VIEW와 SHOWDOWN_PRIMARY를 받는지, 구매 카드가 잠금 목록에서 사라졌는지 검증해야 한다.

별도 검증 자료의 `proposed-tests/independentReleaseAudit.test.ts`에 정상 진행을 요구하는 회귀시험 초안을 포함했다. **저장소에 추가하거나 실행하지 않았다.**

---

## Missed Critical Issues

**추가로 확정한 CRITICAL: 0건.**

기존 C-01/C-02는 보고서에 있는 문제이므로 신규로 세지 않았다. 둘의 수정은 QA 후보에 있지만 main에는 없다. 저장 실패·느린 네트워크·동시 재접속 등 모든 장애 조합을 실행한 것은 아니므로 추가 Critical이 없음을 증명한 결과도 아니다.

아래 항목은 아직 **검증 과제**이며 신규 Critical로 부풀리지 않았다.

- `GameRoom.commit`의 snapshot 저장 이후 expiry 저장/알람 예약 실패 주입.
- ACK 또는 최신 PLAYER_VIEW 유실 후 같은 명령 재전송.
- 동일 좌석 교체 접속과 이전 소켓의 대기 메시지 순서.
- 실제 Cloudflare static assets 라우팅을 포함한 www 도메인 진입.

---

## Missed Major Issues

### P-M01 — 동점자의 이전 BB 순위가 사라져 잘못된 순위 변동 표시

**Severity:** MAJOR · **Status:** CONFIRMED, 원본 함수 독립 실행 재현

`createRoundSummary`는 현재 순위를 `누적 승점 ↓ → 현재 BB ↓ → 좌석 순서`로 정렬한다. 반면 `previousRank`는 `이전 승점 ↓ → 좌석 순서`로 재구성한다. **직전 라운드의 BB 순위 또는 정렬된 순위 스냅샷이 없다.** [S-summary]

예: 이전에 p1/p2가 각각 6P이고 p2의 BB가 더 많아서 p2가 앞섰다. R2에서 둘 다 +4P, BB 변화 0이면 순위는 그대로여야 한다. 실제 함수는 이전 순위를 좌석 기준으로 재구성해 p2에게 상승, p1에게 하락을 만들어냈다.

```text
정상: p2 1→1, p1 2→2
현재: p2 2→1, p1 1→2로 계산
```

또한 이전 순위를 현재 라운드 참가자 목록만으로 계산하므로, 탈락자가 빠진 라운드 간 비교에서도 “지난 전체 순위”와 다른 의미가 될 수 있다.

**수정 방향:** 직전 라운드 종료의 authoritative 순위/BB/tie 기준을 스냅샷으로 저장해 비교한다. 같은 승점에서의 좌석 순서로 역산하지 않는다. **실제 드래프트 정렬이나 컷 기준이 틀렸다는 증거는 아니므로 그 계산은 변경하지 않는다.**

### P-M02 — 생존전 재경기 후 결과 요약이 첫 보드 족보로 되돌아감

**Severity:** MAJOR · **Status:** CONFIRMED, 함수 발췌 하네스 + 실제 Omaha 판정으로 재현

`resolveSurvival`은 생존자 목록을 재경기 결과로 결정하지만 마지막 요약을 다음처럼 만든다.

```ts
combined.results = combined.boardResults[0]!.map((r) => ({
  ...r,
  place: survived.includes(r.playerId) ? 1 : 2,
}));
```

순위만 바뀌고 `hand/usedCardIds`는 첫 보드 결과다. `createMatchView`가 이를 그대로 보내며 `OnlineMatch`의 최종 설명도 이 결과를 사용한다. [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts) · [S-match-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/matchView.ts) · [S-online](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/ui/OnlineApp.tsx)

**합법적인 재현 카드**

```text
p1: A♠ K♠ 2♣ 3♦
p2: A♥ K♥ 4♣ 6♦
보드 1: Q♣ J♦ T♠ 8♠ 7♥ → 둘 다 A-high straight
보드 2: 2♥ 2♦ 3♣ Q♥ 9♠ → p1 풀하우스, p2 원페어
```

생존자는 p1로 올바르게 정해졌으나 최종 `results`의 두 족보는 다시 STRAIGHT/STRAIGHT였다. 보드는 실제 원본 evaluator로 판정했고, 생존 처리 함수 본문을 실행했다. 전체 브라우저 연출 재현은 아니다.

**수정 방향:** 각 참가자의 마지막 유효 판정 board와 hand를 함께 보존하고 요약이 어느 판정을 설명하는지 명시한다. 하이카드 추첨이면 포커 패가 아니라 추첨으로 진출했음을 구분한다. 생존자를 다시 계산할 필요는 없다.

### P-M03 — 오마하 안내가 합법적인 스트레이트를 “불가”로 설명

**Severity:** MAJOR · **Status:** CONFIRMED, 원본 evaluator 실행 재현

`RoundGuide.tsx`의 `OmahaExample`은 다음 패를 “2 원페어”로 표시하고 스트레이트가 불가능하다고 설명한다. [S-guide]

```text
홀카드: 2♦ 2♣ A♥ 9♠
보드:   3♠ 5♠ 4♣ J♥ 6♣
```

그러나 `A♥ + 2♦`와 보드의 `3♠ + 4♣ + 5♠`를 사용하면 **정확히 홀 2장 + 보드 3장의 5-high 스트레이트**다. `findBestOmaha`도 STRAIGHT, kicker 5를 반환했다. [S-evaluator]

안내문이 지적하는 2-3-4-5-6 조합의 위반 자체와 별개로, 다른 합법적인 A-2-3-4-5 조합을 빠뜨렸다. 플레이어가 실제 판정을 버그로 오해하게 만들 수 있다.

**수정 방향:** 예시에서 A를 바꾸어 정말 스트레이트가 불가능한 패로 만들거나, 현 예시는 wheel 설명으로 바꾼다. **잘못된 예시에 맞추어 evaluator를 수정하면 안 된다.** 안내에 쓰는 실제 카드와 결과를 테스트 fixture로 연결한다.

---

## Rules vs Implementation

기획 출처가 충돌하면 코드 또는 오래된 대화를 일방적으로 정답으로 선택하지 않는다. 최신 사용자 확인 사항과 첨부본의 승인 정책을 분리하고, 승인 근거가 없는 추가 변경은 결정 필요로 표시한다.

| System | Intended Rule / 근거 | Actual Implementation | Severity / 판정 | Required Action |
| --- | --- | --- | --- | --- |
| R1 | 홀덤 2장, Swiss 3회, 3/1/0P | 해당 구조 유지 | 기본 경로 일치 | 새 잠금 타임아웃 시험 추가 |
| R1 BB | report L147은 연승 +5라고 설명 | 승리 기본 10BB, R1 연승 보너스 0 | 보고서 INCORRECT | 보고서 수정, 임의 보상 증액 금지 |
| R1 Split | R2/R3와 동일하다고 가정하면 안 됨 | 현 R1은 BB/스트릭에서 보상 승리처럼 처리 | 정의 명시 필요 | R1 예외 승인/문서화 |
| R2 draft | R1 승점 낮은 순, 동점 BB 높은 순, 완전 동률 RNG | sort 및 순번 snapshot, 8장 공개, 유료 1장 | 일치 | UI 순위표의 역순과 혼동하지 않기 |
| R2 loadout | 공통 1장, 서로 다른 실제 보조 카드 2장, AAA 허용 | 3개 cardId distinct 검증, 배열 순서로 구성 | 일치 | 공개 이후 변경 불가 유지 |
| R2 runs | 각 4/2/0P, 같은 매치 덱에서 중복 없는 두 보드 | 동일. Split은 0BB/스트릭 초기화 | 일치 | replay는 표시만, 보상 재지급 금지 |
| R2 탈락 | 최신 기획: 전원 생존 | 전원 생존 | 일치 | 옛 R2 탈락안을 복원하지 않기 |
| R3 | 4장 전체 Omaha, seeded first match + Swiss 3회 | 2+2 분할 없이 exact 2+3, R3 진입 시 시드 고정 | 일치 | 이전 Double Omaha UI만 잔존 여부 추가 점검 |
| R3 BB | 승리10, 패배15+5×이전 연패, Split0/reset | 전용 분기 존재 | 일부 정책 미확정 | win_bonus와 라운드 간 스트릭 이월 범위 명시 |
| R3 cut | R1+R2+R3 누적 P 하위2, BB/hand 제외 | points만으로 경계 및 생존전 결정 | 일치 | P-M02 요약 수정, no-reward 회귀시험 |
| R4 | 16장 draft 후 shop, 5+5 자유 BEST5 | 동일; primary6/3P | 최신 소스/첨부본 일치 | README의 “draft가 shop 대체” 수정 |
| R4 winner group | 승인: distinct10/5/3, tied2nd 각3 | 후보만 반영 | main의 B-02 미수정 | 후보 기반 통합·재시험 |
| R4 cut | 생존조 패자2 탈락 | 해당 브래킷 처리 | README 문구 오류 | 누적 하위 컷이라고 안내하지 않기 |
| R5 | 4명, hole7/no board, 20/12/5/3P | 동일. 합계40P, ties ICM occupied slots | 기본 경로 일치 | “50P ladder” 등 오래된 주석 정리 |
| 최종 합산 | points+hand+augment+floor(BB/10) | 동일; 탈락자 frozen total도 함께 정렬 | 최종 순위 정책 미확정 | 탈락 순위 우선인지 점수 우선인지 승인 |
| 부족 카드 | 첨부본의 승인된 몰수패/no purchase 정책 | 후보만 반영 | main의 B-01 미수정 | 잠금 결함과 별도 회귀검증 |
| 일반 상점 | 2슬롯, R2 제외, 리롤1/2/2/3 및 구매2/2/3/3 | config 및 helper 일치 | 기본 경로 일치 | AI 구매·리롤도 같은 가드 사용 |
| 순위 변동 | 직전 라운드 실제 순위와 비교 | 이전 BB 정렬 미복원 | **P-M01 MAJOR** | 이전 순위 snapshot 저장 |
| 게임 가이드 | actual Omaha 결과와 일치 | 합법 wheel을 불가로 설명 | **P-M03 MAJOR** | 예시와 시험 연결 |

근거: [engine][S-engine], [config][S-config], [room][S-room], [README][S-readme], [guide][S-guide], [summary][S-summary].

### Legacy 코드 분류

`r2Primary`, 옛 Winner/Loser Bracket 상수와 일부 경로는 `rulesVersion !== 2`의 기존 게임을 위한 분기다. “이 문자열이 남아 있으니 최신 R2도 브래킷이다”라고 판정하지 않는다. 새 게임의 v2 경로는 `resolveSplitRuns`로 반환한다. 반면 현재 사용자에게 나오는 안내·요약의 잘못된 문구는 실제 활성 UI 문제다.

장기 저장된 v1 스냅샷이 현재 R3 Swiss로 이동하는 전체 호환성은 별도 검증이 필요하다. 오래된 상수를 남겨둔 것만으로 v1 전체 호환성이 증명되지는 않는다. 이번 출시 판정의 주 대상은 v2다.

---

## State Machine Risks

### 확인한 정상 설계

- room의 phase별 입력 검증과 `settleBarrier`가 진행을 중앙 관리한다.
- R2 `DRAFT_ORDER → OPEN_DRAFT → RUN_LOADOUT`은 서버 phase다. 카드 애니메이션 종료를 클라이언트가 게임 규칙으로 결정하는 구조가 아니다.
- 쇼다운 계산 후 결과와 시네마틱 일정을 분리하며, `presentation.endsAt`까지 확인 입력을 막는다.
- R3 생존전과 R4 그룹전은 별도 phase/encounter로 분리된다.
- 재경기는 generation을 증가시킨다. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-presentation](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/presentation.ts)

### 잔존 위험

P-B01은 바로 이 phase machine의 liveness 결함이다. “원장 불변식이 깨지면 예외를 던진다”는 보호는 존재하지만, 정상 사용자 행동이 그 예외를 만들면 방이 진행할 수 없다. **데이터 검사가 있다는 것과 게임이 끝까지 진행된다는 것은 별개의 속성**이다.

전체 사람이 나간 경우, 전원 탈락한 경우, 일부만 떠난 경우는 서로 다르다. 현재 `activeHumans`와 `controlledHumanIds`를 구별하는 구조는 합리적이지만, READY를 받을 수 있는 대상과 pending barrier 대상을 각 phase마다 표로 고정하고 시험해야 한다. 특히 SURVIVAL_READY의 타이 참가자 subset을 전체 생존 인원과 혼동하면 안 된다.

---

## Scoring / Elimination

### 독립 확인

- 스위스 계산의 승/무/패 score는 pairing용이며 실제 P와 분리되어 있다.
- R3 cut은 points만 비교한다. BB가 같은 점수의 draft/seed 순서를 결정한다고 해서 탈락도 BB로 정하지 않는다.
- R4 decider에서는 정규 Split 보상을 보존하고 승자조 진출을 결정한다.
- R5 ICM은 동률 그룹이 차지하는 지급 자리만 대상으로 한다. 현재 20/12/5/3 합계는 40P다.
- 실제 점수는 engine/room 변이에서 바뀐다. 네트워크 projection과 UI 출력이 점수를 재지급하는 직접 경로는 확인하지 못했다. [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts) · [S-icm](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/icm.ts) · [S-match-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/matchView.ts)

### 필요한 정산 규칙 명확화

`finalStandings`는 total을 먼저 비교한다. 탈락 라운드는 그보다 뒤의 타이브레이커이므로, 높은 frozen total의 탈락자가 낮은 총점의 finalist보다 위에 올 수 있다. `eliminate`는 R3에서 보유 4장만 `evaluatePartial`로 평가한다. 이는 R3 실제 Omaha 승부의 최종 hand와 다른 데이터다.

이는 이미 코드/보고서가 드러낸 정책이다. 생존자 우선 순위로 바꿀지, 현재 점수 우선 구조를 유지할지는 승인 사항이다. 다만 UI가 “살아남은 4명이 최종 1~4위”라는 인상을 준다면 설명과 계산이 충돌한다. **R5 라운드 1위와 전체 우승도 별도로 표현해야 한다.** [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts) · [S-final-row](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/ui/FinalStandingRow.tsx)

P-M01은 이동 배지, P-M02는 재경기 판정 설명의 오류다. 둘을 고치려고 점수나 실제 생존자를 다시 계산하면 안 된다.

---

## Card Pool Integrity

### 확인한 보호

원장은 52개 identity, 중복 배정, owner/reserver 역참조, AVAILABLE의 잔여 소유자, 잠금 카드가 예약 슬롯 안에 있는지 검사한다. 공개 구매/판매/리롤과 탈락 반환은 원장을 경유한다. [S-pool](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/cardPool.ts) · [S-engine](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts)

원본 `showdownDeck.ts`의 독립 시험에서 6개 OWNED 제외 후 46장, 두 보드 10장의 고유성, 제외 카드 미등장을 확인했다. 다른 매치의 소유 카드나 상점 예약 카드를 전부 제외하지 않는 것은 현재 매치별 유니버스 규칙과 일치한다. R5는 보드가 없다. [S-deck]

### 막히는 지점

P-B01은 동일 cardId 두 번 소유가 아니라, OWNED로 이동한 카드가 잠금 예약 목록에도 남는 **상태 간 불일치**다. 이 상태를 저장 전에 거부하는 것은 좋지만, 그 상태를 만드는 AI 내부 구매가 수정되지 않아 출시 blocker가 된다.

기존 `forfeit.test.ts`의 fixture는 `releasePlayerCards`로 모든 잠금을 비운다. 파산 regression도 잠금/해제를 짝으로 반복한다. 따라서 두 시험이 통과해도 잠금 구매 경로의 안전성은 보장하지 않는다. [S-forfeit](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/forfeit.test.ts) · [S-release-tests](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts)

---

## Multiplayer / Race Conditions

### 소스로 확인한 방어선

- WS 명령과 alarm이 DO의 `blockConcurrencyWhile` 경로를 사용한다.
- 접속한 attachment의 playerId로 세션을 식별한다. 명령이 임의 playerId를 지정하는 구조가 아니다.
- 프로토콜은 알려진 action과 field만 받으며 cardId, loadout 중복, requestId, turnKey 형식을 검사한다.
- 성공한 requestId 64개를 기억하고 동일 명령에 재적용 대신 ACK를 반환한다.
- 상태 저장 이후 ACK/PLAYER_VIEW를 전송하는 경로가 있다. [S-do](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/worker/GameRoom.ts) · [S-protocol](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/shared/protocol.ts)

### 아직 증명되지 않은 것

이 방어선이 모든 실행 순서에서 충분하다는 결론은 내리지 않았다. 특히 실패한 저장, 재연결 직전/직후 프레임, rate limit 경계, requestId 캐시 퇴출 뒤 재전송을 함께 시험해야 한다. 64개 중복 방지 캐시는 무제한 replay ledger가 아니다. 캐시 밖의 같은 phase 명령을 “새 행동으로 허용하는지” 역시 제품 계약으로 정리할 필요가 있다.

현재 Worker 시험은 real WS parsing/storage/eviction/alarm을 다루므로 단순 reducer 시험보다 강하다. 그러나 모든 full-game case가 네트워크 손실, UI 이중 탭, 실제 지연을 동시에 다루는 것은 아니다. 강제 타임스탬프 변경으로 진행한 시험과 실제 벽시계 smoke는 분리해야 한다. [S-worker-tests]

---

## Reconnect / Timer

C-01/C-02의 후보 수정은 유지해야 한다. main은 여전히 늦은 SHOP/AUGMENT 입력 및 재경기 키 재사용에 대한 수정을 받지 않았다. [S-main-room](https://github.com/wlghks4689/holto-chess/blob/1d5ab2f977d8c7765b108ca8eade23eefe288bad/holto-chess/src/game/room.ts) · [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts)

`barrierDeadline`은 presentation 종료를 고려하며, 현재 picker와 bot/human에 따라 draft 시간을 구별한다. 새 선택자가 되었을 때와 단순 다른 플레이어의 ready 변경을 구분하는 barrier key가 있다. 닫힌 탭이 클라이언트 타이머를 멈춰도 서버 deadline 자체는 별도로 관리된다. [S-room]

검증 우선순위는 다음과 같다.

1. 잠금 상태에서 timeout/LEAVE/reconnect를 조합해 P-B01 재현 및 수정 후 정상 완료.
2. 마감 -100ms, 정확한 마감, +100ms의 모든 decision action.
3. 늦은 alarm과 수동 draft pick 양쪽 실행 순서.
4. 재경기의 이전 generation 명령, 이전 소켓 대기 메시지, ACK 유실.
5. 새로고침 후 초기 카드를 재구매하거나 reward를 다시 주지 않는지.

`GameRoom.commit`이 snapshot 저장과 만료 메타데이터 저장을 순차 수행하는 구간은 실패 주입 대상이다. 현재 검사만으로 영구 상태 파손이 재현되었다고 주장하지 않는다.

---

## PlayerView / Privacy

### 비공개 결정 정보

`createPlayerView`는 allowlist 방식이며 살아 있는 viewer에게 `spectatorViews`를 주지 않는다. R4 private shop 단계에서 타인의 현재 owned/shop/augment choice를 직접 넣는 경로는 확인하지 못했다. seed·소유 원장·세션 토큰도 일반 view에 직렬화하지 않는다. [S-player-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/playerView.ts) · [S-protocol](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/shared/protocol.ts)

R2의 `publicHands`는 코드에 명시적인 예외다. R1에서 공개된 손패와 공용 draft로 추가된 카드라는 맥락이 있으므로 이것을 곧바로 미확인 신규 누출이라고 단정하지 않는다. 다만 “상대 손패는 언제나 비공개”라는 제품 문구와 함께 사용할 수는 없다. R2 공개 범위를 문서에 명확히 써야 한다.

### 시네마틱보다 먼저 오는 결과 데이터

visible phase가 되면 resolved boards/results, roundSummary 및 경우에 따라 final standings가 먼저 전달된다. **애니메이션에서 아직 보이지 않는다고 payload도 숨겨진 것은 아니다.** 이 정책은 보고서에서 이미 드러나 있고 이번 소스에서도 확인된다. [S-player-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/playerView.ts) · [S-presentation](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/presentation.ts) · [S-match-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/matchView.ts)

현 encounter의 구매/선택은 이미 닫힌 뒤이므로 즉시 부정한 카드를 사게 만드는 새 경로까지 입증한 것은 아니다. 그래도 결과 스포일러 및 경쟁 신뢰에는 영향을 준다. “연출 공개 시간까지 비밀”이 출시 조건이라면 서버 단계별 전달이 필요하다. 허용한다면 그 범위와 이유를 승인해야 한다.

### 관전자

탈락자는 생존자의 private perspective를 받는다. 생존 인간이 남아 있을 때 그 관전자가 BUY_CARD 등 게임 행동을 할 수 없도록 guard가 있다. 모든 인간이 탈락한 경우 READY로 진행시키는 예외는 존재한다. [S-room](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts) · [S-player-view](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/playerView.ts)

이 예외는 읽기 전용이라는 문구와 엄밀히 같지 않으며, 관전자-생존자 간 외부 통신에 의한 정보 공유도 막아주지 않는다. 안티콜루전까지 완료했다고 평가하지 않는다. 영구 랭크나 계정 시스템 추가로 우회하려 하지 않는다.

---

## Mobile / Responsive

**이번 감사의 신규 브라우저/실기기 실행: 없음.**

첨부본의 폭별 검사와 스크린샷 증거를 재검토했으나 그대로 전 기기 통과로 승격하지 않았다. 특히 report L197은 R4 그룹전, 완료 R5, 최종 표/팝업을 실제로 확인한 폭이 390×844 계열 하나이고 다른 override가 실패했음을 밝힌다.

출시 후보에서 실제 확인해야 할 화면은 R2 draft, R3 4장 상점, R4 16장 draft/3-way, R5 7장×4명, 점수 내역 팝업이다. 고정 CTA가 마지막 행이나 잠금 버튼을 가리는지, 브라우저 주소창/가상키보드가 열린 상태에서도 조작 가능한지 검사한다. 원장과 점수가 맞아도 모바일 버튼을 누를 수 없으면 정상 완주 검증에 실패한다.

M-03 포커스, N-04 작은 터치 대상, N-05 hover/click은 후속 사용성 검증에 포함한다. 기준은 실제 닫기/선택/확인 동작의 접근 가능성이며, 단순 `scrollWidth <= innerWidth`만으로 끝내지 않는다.

---

## Test Coverage Gaps

### 1. 실제 독립 실행 결과

다음은 **이번 감사에서 직접 실행한 것**이다. `REPRODUCED`는 코드가 건강하다는 PASS가 아니라 결함 재현을 뜻한다.

| Probe | 결과 | 범위 |
| --- | --- | --- |
| Git blob SHA 대조 | **7/7 일치** | cards/evaluate/cardPool/icm/roundSummary/swiss/showdownDeck 원본 모듈 |
| 5장 전체 2,598,960조합 | **PASS** | 족보 category 분포가 조합론적 예상과 일치 |
| 키커/Omaha/R4 검증 사례 | **PASS** | wheel, suit-neutral royal tie, flush 전체 kicker, exact2+3, R4 quads 유지 |
| ICM | **13개 사례 PASS** | 2/3/4명, zero/unequal stacks, 지급 합계 및 수동 2인 공식 |
| Swiss 표본 | **PASS** | 8명 3경기, 중복/누락 없는 배정과 해당 표본의 rematch 회피 |
| 매치별 덱 | **PASS** | 보유6장 제외/46장, 두 보드10장 중복 없음 |
| P-B01 | **REPRODUCED** | 실제 AI mutation 함수 발췌 + 실제 invariant; 전략 대역 사용 |
| P-M01 | **REPRODUCED** | 원본 roundSummary 직접 실행 |
| P-M02 | **REPRODUCED** | 실제 survival 함수 발췌 + 원본 Omaha 판정, 결정적 보드/매치 wrapper |
| P-M03 | **REPRODUCED** | 화면 예시의 실제 카드로 원본 Omaha 판정 |

5장 category 개수:

```text
HIGH_CARD        1,302,540
PAIR             1,098,240
TWO_PAIR           123,552
TRIPS               54,912
STRAIGHT            10,200
FLUSH                5,108
FULL_HOUSE           3,744
QUADS                  624
STRAIGHT_FLUSH          36  (ROYAL 별도)
ROYAL_FLUSH              4
합계             2,598,960
```

이 결과는 category 누락/중복을 찾는 강한 검사지만 **모든 키커 비교, 전체 경제, 모든 source 경로, 멀티플레이 동시성을 증명하지 않는다**. 로그에는 첫 시도에서 안내의 “원페어” 기대값과 실제 STRAIGHT가 달라 실패한 기록도 보존했다. 이를 조사해 발견한 것이 P-M03이며 evaluator를 고치지 않았다.

### 2. Astra 시험의 한계

| 보고된 증거 | 독립 평가 |
| --- | --- |
| 357 unit / 11 Worker PASS | 해당 시험 소스와 승인 지급 assertion은 확인. 이번 환경에서 같은 suite 재실행은 못 함 |
| 파산 full-game 성공 | 돈 없음 + 잠금 해제 상태 위주. 돈 충분 + 잠금 유지 + AI 구매를 덮지 않음 |
| 원장 invariant 반복 | 잘못된 상태를 잡는지와 그 상태에 도달하지 않는지는 별도 |
| snapshot/reconnect 반복 projection | 재지급 방어에 도움. 실제 손실/중복/순서 뒤바뀜 전부를 대체하지 않음 |
| all-client final equality | 모두 동일하게 잘못 계산해도 통과 가능. 별도의 규칙 oracle 필요 |
| golden UI/render markup | 실제 텍스트/좌표/카드 의미 일치 및 기기 조작은 별도 |
| 정상 R3 Swiss 시험 | 안내 예시의 card set과 evaluator 결과를 연결하는 검사는 빠짐 |
| 최종 결과 체계 시험 | 현재 정책을 고정한 시험. 그 정책이 사용자가 원하는 정책인지는 별도 |

### 3. 우선 추가할 회귀시험

- **P0:** 실제 DO에서 2-lock + R1 timeout + AI purchase → 저장/브로드캐스트/재접속 후 진행. 인간·AI 공통 mutation invariants.
- **P0:** main에 통합된 후보의 B-01/B-02/C-01/C-02 재실행. 실패 재현 assertion이 아닌 정상 진행·정상 지급 assertion.
- **P1:** previousRank에 이전 BB tie 및 탈락자 제외 전/후의 순위 기준 확인.
- **P1:** 생존전 1차 tie/2차 승패에서 survivor와 표시 hand/used cards의 판정 보드 일치.
- **P1:** 가이드의 모든 실제 예시 카드를 evaluator oracle로 검사.
- **P1:** ACK 유실, old socket 처리, request cache 경계, 저장/expiry/alarm 실패 주입.
- **P1:** 실제 빌드 artifact의 2/4/8클라이언트·모바일 가로/세로·재경기 smoke.

### 4. npm / Build / Deployment 상태

이번 감사에서 **미실행**이다. 첨부본의 `npm install --package-lock=false`는 깨끗한 환경에서 lockfile로 설치되는지를 증명하지 않는다. 출시 후보는 lockfile에 맞는 `npm ci`를 포함한 새 환경에서 검사해야 한다. `latest`가 적힌 manifest 자체만으로 현재 설치본이 틀렸다고 단정하지는 않지만, 어떤 해석 결과로 빌드했는지 재현성이 필요하다. [S-package]

### 5. www 라우팅 — 미확정 운영 위험, 신규 확정 결함 수에서 제외

`worker/index.ts`에는 www→apex redirect가 있다. 그러나 `wrangler.jsonc`는 static assets + SPA이며 `run_worker_first`는 `/api/*`, `/ws/*`만 포함한다. Cloudflare 공식 문서에 따르면 asset 우선 경로는 Worker 코드 실행 여부가 다르다. 따라서 **Worker 함수를 직접 호출한 redirect 시험만으로 실제 www 메인 진입의 redirect를 검증했다고 볼 수 없다**. [S-worker-index](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/worker/index.ts) · [S-wrangler](https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/wrangler.jsonc) · [S-cf-routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)

실제 www 페이지가 그대로 서빙된다면 이후 API의 apex redirect와 same-origin 검증이 충돌하는지 확인해야 한다. 별도 zone redirect 등 배포 외부 설정은 이번에 읽지 못했으므로 실제 장애라고 확정하지 않는다. 웹/연결 도구의 접근 실패도 서비스 장애 증거로 사용하지 않았다.

---

## Launch Must-Fix

| 우선순위 | 출시 전 작업 | 완료 기준 |
| --- | --- | --- |
| **1** | **P-B01: AI 구매의 잠금/예약 정리와 공통 가드 수정** | 두 카드 잠금 + timeout이 실제 DO에서 정상 진행. 원장 검사를 제거하지 않음 |
| **2** | **QA 수정과 신규 수정이 포함된 출시 커밋 확정** | main/출시 브랜치/QA 보고서/빌드 artifact의 SHA를 일치시킴. B-01/B-02/C-01/C-02 해결 확인 |
| **3** | **남은 게임·정보 공개 정책 승인** | 최종 탈락 순위, win_bonus 적용, 단계별 payload 공개, 관전자 READY 정책을 명문화하고 일치 검증 |
| **4** | **증명된 규칙·결과 표시 오류 수정** | 이전 BB 순위 변동, 생존전 최종 hand, Omaha 가이드 예시 수정. 필요한 modal/점수 팝업 조작도 확인 |
| **5** | **고정된 후보를 실제 실행 환경에서 재시험** | clean install/unit/Workers/lint/build + preview WS 2/4/8명 + 실제 모바일·재접속·www 경로·rollback 확인 |

한 번에 전체 UI를 재디자인하거나 게임 경제를 조정할 필요는 없다. 핵심은 **진행을 멈추는 버그, 아직 출시 버전에 들어오지 않은 수정, 결과를 오해시키는 표시, 검증되지 않은 배포 경계**다.

승인 후 권장 검증 명령은 프로젝트 루트 위임 구조를 확인하여 사용한다.

```sh
npm ci --prefix holto-chess
npm test
npm run test:workers
npm run lint
npm run build
```

이 명령들을 여기서 실행 완료했다고 보고하지 않는다. preview/production 배포는 별도 승인 이후 진행해야 하며 본 감사는 어떤 배포도 하지 않았다.

---

## Can Ship Later

공개 출시를 막는 항목이 해결되고 기록된 리스크를 수용한 뒤에는 다음을 후속 일정으로 둘 수 있다.

- raw card ID를 친숙한 카드 이름으로 바꾸는 문구 개선.
- 가독성을 해치지 않는 범위의 미세 glow, 배경 폴리싱, 추가 연출.
- 기본적인 합법 행동/진행 안정성 이후의 AI 강도 및 장기 밸런스 조정.
- 랭크/MMR/시즌 기능. 이번 감사의 해결 수단으로 추가하지 않음.
- 더 큰 규모의 성능 최적화. 다만 공개할 동접 규모에 대한 최소 부하/운영 한계 검증은 출시 전 필요.

작은 버튼/포커스 문제라도 실제 사용자의 진행을 막는 사례가 나오면 후순위 cosmetic으로 남길 수 없다. Severity는 실제 조작 가능성으로 다시 판단한다.

---

## Final Risk Assessment

### 요청한 8개 질문에 대한 답

**1. 오늘 공개할 때 가장 위험한 3가지**

① 잠금 카드 자동 구매로 방이 멈추는 P-B01. ② QA 후보의 수정이 들어오지 않은 main 또는 검증되지 않은 artifact를 배포하는 것. ③ 최종 순위/정보 공개/관전자 권한을 확정하지 않은 상태에서 경쟁 결과를 제공하는 것.

**2. 잘못된 게임 결과를 만들 수 있는 버그가 남아 있는가?**

main에는 알려진 R4 지급 문제와 늦은 명령/재경기 키 문제가 남는다. 후보에는 해당 수정이 있으나 진행 차단과 결과 설명 오류가 남는다. 신규 오마하 evaluator 승패 오류를 찾은 것은 아니다. P-M02의 생존자는 올바르고 요약 hand가 틀렸다.

**3. 카드 소유 원장이 깨질 가능성이 있는가?**

AI 내부 구매가 잠금-예약 불일치를 만드는 것을 재현했다. 검사에서 예외가 나므로 이를 곧바로 “영구 중복 소유 발생”이라고 말하지 않는다. 그래도 방의 진행 안전성은 깨진다.

**4. 멀티플레이 race/reconnect로 state corruption이 가능한가?**

후보의 deadline/generation/DO 직렬화는 유효한 방어다. 모든 장애를 재실행하지 않아 불가능하다고 인증할 수 없다. P-B01 이후 reconnect가 잘못된 phase를 스스로 복구해준다는 근거도 없다.

**5. private information leak 가능성이 있는가?**

확인한 live R4 decision projection에서 새로운 타인 손패/상점 누출은 확정하지 못했다. 다만 resolved-showdown 데이터의 사전 전달과 탈락자 private perspective는 실제 존재한다. 이를 허용 범위로 승인하지 않았다면 개인정보/경쟁 정보 공개 정책 gate가 남는다.

**6. 모바일 사용자가 정상적으로 R1~R5를 끝낼 수 있는가?**

Astra가 제한된 브라우저 조건에서 완주한 증거는 있다. 모든 정상 입력, 모든 요청 폭, 실기기/브라우저에 대한 완료 검증은 아니다. 이번 감사에서 새로 발견한 P-B01은 화면 크기와 무관하게 모바일도 막을 수 있다.

**7. Astra의 Verdict에 동의하는가?**

**동의한다: NOT READY.** 기존 보고서의 정책·검증 한계에 더해, 후보에 남은 신규 진행 차단 근거가 있다. 단순히 정책만 승인하거나 보고서의 OPEN 문구만 지워서 READY로 바꿀 수 없다.

**8. 출시 전/후 구분**

앞의 Launch Must-Fix 5개 gate를 먼저 완료한다. 새 아트, 더 화려한 연출, 고급 AI, 영구 랭크는 이후다. 요구사항이나 밸런스 결정을 독립 감사가 대신 확정하지 않는다.

### 결론

**이번 상태는 “큰 기능을 더 만들어야 해서 미출시”가 아니라, 기존 기능 경계의 버그와 검증·버전 불일치를 정리해야 해서 미출시다.** 우선 P-B01을 좁은 수정으로 막고, 이미 끝낸 QA 수정들을 하나의 출시 후보로 묶어 다시 검증하는 것이 우선이다.

---

## Evidence Bundle / 재현 자료

별도 파일 `PORENA_AUDIT_EVIDENCE.zip`에 다음을 포함한다.

- 첨부 보고서의 바이트 보존 사본과 revision manifest.
- Git blob SHA 대조를 통과한 7개 핵심 원본 모듈.
- AI 준비/생존전 함수의 격리 검증용 발췌. **전체 engine 복사본이 아님**.
- `isolated_probes.cjs`와 직접 실행한 JSON/stdout 결과.
- 가이드 예시 반례를 발견한 최초 assertion 실패 기록.
- 승인 후 실제 저장소에 추가할 수 있는 회귀시험 초안. **이번에는 미설치·미실행**.

독립 probe의 종료코드 0은 “정상 시험과 결함 재현 assertion이 의도대로 실행됐다”는 뜻이다. **출시 READY를 뜻하지 않는다.**

## Pinned Source References

아래 링크는 이동하는 main URL 대신 검토한 SHA로 고정했다. 코드 위치는 함수명/해당 섹션과 함께 확인한다.

- [main 커밋][S-main] / [QA 후보 커밋][S-candidate] / [차이][S-compare]
- [최초 QA 수정][S-initial-fix] / [저장소의 초기 보고서][S-repo-report]
- [게임 엔진][S-engine] / [설정][S-config] / [원장][S-pool] / [보드 덱][S-deck]
- [room 상태 머신][S-room] / [main의 room][S-main-room] / [Durable Object][S-do] / [프로토콜][S-protocol]
- [PlayerView][S-player-view] / [presentation][S-presentation] / [MatchView][S-match-view]
- [족보 평가기][S-evaluator] / [ICM][S-icm] / [스위스][S-swiss] / [순위 요약][S-summary]
- [Omaha 안내][S-guide] / [최종 순위 행][S-final-row] / [온라인 화면][S-online] / [증강][S-augments]
- [후속 몰수패 시험][S-forfeit] / [Release 회귀시험][S-release-tests] / [R4 동점 시험][S-ties] / [Workers 시험][S-worker-tests]
- [README][S-readme] / [package.json][S-package] / [Worker 진입점][S-worker-index] / [Wrangler][S-wrangler]
- [Cloudflare 공식 static assets routing][S-cf-routing]

[S-main]: https://github.com/wlghks4689/holto-chess/commit/1d5ab2f977d8c7765b108ca8eade23eefe288bad
[S-candidate]: https://github.com/wlghks4689/holto-chess/commit/8984da87228ee3e4f102fa80a131b714935822a8
[S-compare]: https://github.com/wlghks4689/holto-chess/compare/1d5ab2f977d8c7765b108ca8eade23eefe288bad...8984da87228ee3e4f102fa80a131b714935822a8
[S-initial-fix]: https://github.com/wlghks4689/holto-chess/commit/c224bd0f5118dec80ba40a8540d833e5cd076b33
[S-agents]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/AGENTS.md
[S-repo-report]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/RELEASE_QA_REPORT.md
[S-readme]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/README.md
[S-engine]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts
[S-ai-lines]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/engine.ts#L167-L227
[S-config]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/config.ts
[S-pool]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/cardPool.ts
[S-deck]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/showdownDeck.ts
[S-room]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/room.ts
[S-main-room]: https://github.com/wlghks4689/holto-chess/blob/1d5ab2f977d8c7765b108ca8eade23eefe288bad/holto-chess/src/game/room.ts
[S-do]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/worker/GameRoom.ts
[S-protocol]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/shared/protocol.ts
[S-player-view]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/playerView.ts
[S-presentation]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/presentation.ts
[S-match-view]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/matchView.ts
[S-evaluator]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/core/poker/evaluate.ts
[S-icm]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/icm.ts
[S-swiss]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/swiss.ts
[S-summary]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/roundSummary.ts
[S-guide]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/ui/RoundGuide.tsx
[S-final-row]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/ui/FinalStandingRow.tsx
[S-open-draft]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/ui/OpenDraft.tsx
[S-online]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/ui/OnlineApp.tsx
[S-augments]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/augments.ts
[S-forfeit]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/forfeit.test.ts
[S-release-tests]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseAudit.test.ts
[S-ties]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/src/game/releaseTies.test.ts
[S-worker-tests]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/tests/worker/room.test.ts
[S-package]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/package.json
[S-worker-index]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/worker/index.ts
[S-wrangler]: https://github.com/wlghks4689/holto-chess/blob/8984da87228ee3e4f102fa80a131b714935822a8/holto-chess/wrangler.jsonc
[S-cf-routing]: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
