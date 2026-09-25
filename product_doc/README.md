# PORENA 협업 계약

## 역할과 문서 정본

- 사용자: 게임 방향·규칙·밸런스 변경의 최종 승인자.
- Codex: 전체 기획·개발·테스트·통합 책임자. 공통 TODO, 확정 규칙, DECISIONS 관리.
- Claude: 근거 있는 밸런스 분석·시뮬레이션·검증 보조. 전체 설계 권한이나 직접 게임 개발 권한 없음.
- DOC_ROOT는 저장소 루트의 `product_doc/`. 조사 시 `product_doc/`, `product-doc/`와 동등한 협업 문서가 없어 신설했다.
- 개발 기준 브랜치에 커밋된 확정 문서가 정본이다. 현재 확인한 기준 브랜치는 `main`이지만 후속 작업마다 재확인한다.
- Claude 브랜치의 보고서·실험은 제안이다. 보고서 제출이나 커밋만으로 게임 규칙이 확정되지 않는다.
- 기존 README와 구현 보고서는 코드 위치·과거 이력을 이해하는 참고 자료다. 승인 이력이 불명확한 수치를 새 승인으로 간주하지 않는다.
- 구현과 문서가 다르면 양쪽 출처와 버전을 기록한다. 임의로 어느 쪽도 수정하지 않는다.

문서 안내: [작업 목록](TODO.md), [승인 결정](DECISIONS.md), [첫 분석 의뢰](balance/BAL-001/REQUEST.md).

## 반복 밸런스 분석 운영

사용자가 매번 분석 질문을 직접 작성하지 않아도 Codex가 다음 순환을 주도한다.

1. 사용자 관찰, 플레이 로그, 최근 보고서의 미확인 가설을 수집하고 현재 구현과 승인 문서를 대조한다.
2. 기존 분석 ID와 충돌하지 않는 `BAL-###`를 발급해 목적·가설·비교군·지표·실행 제한을 REQUEST에 고정한다.
3. Claude에는 분석 브랜치와 REQUEST의 읽기 전용 기준, 허용 쓰기 경로를 전달한다. Claude는 REPORT와 산출물만 제출한다.
4. Codex는 보고서의 기준 SHA·분모·실패 표본·재현 명령을 검토하고, 도구 결함과 게임 변경 제안을 분리한다.
5. 수치·규칙 변경은 사용자 승인을 받을 때까지 실행하지 않는다. 승인 전에는 도구 복구·검증만 진행하고, 승인 후에만 구현·회귀 테스트·DECISIONS 기록을 수행한다.

자동으로 분석을 시작할 수 있는 신호는 반복 관찰된 승률/가격/탈락 편향, 신규 경제 수치 후보, 시뮬레이터 신뢰성 결함, 또는 직전 보고서의 미확인 가설이다. 신호가 없으면 현재 규칙의 검증 가능성 진단을 우선한다. 이 절차는 질문을 줄이지만 사용자 승인 게이트를 없애지 않는다.

## 작업 및 쓰기 경계

Claude는 지정된 `balance/<분석ID>` 브랜치에서 해당 분석 폴더의 `REPORT.md`와 REQUEST가 허용한 산출물만 작성한다.
게임 소스·설정·테스트·기존 시뮬레이터·공통 문서 변경은 Codex에게 개선안으로 제출한다.
분석용 실험 코드도 지정 폴더 안에만 작성하고 게임 엔진을 복제하거나 수정된 실험 규칙을 현행 규칙처럼 보고하지 않는다.
승인되지 않은 균형 수치 변경과 운영 배포는 금지한다. 이번 구축 작업은 문서와 의뢰 준비까지다.

TODO는 목표 → 단계 → 작업 묶음 → 검증 가능한 실행 항목의 4-depth로 관리한다.
각 최하위 항목에는 ID·담당자·완료 조건·의존성·상태를 적는다.
상태는 TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE. 검증 증거가 있는 항목만 체크한다.
보고서 제출, Codex 검토, 사용자 승인, 구현, 검증·통합을 별도로 추적한다.

## 인계와 공유

1. Codex가 실제 브랜치·HEAD·upstream·원격·미커밋 변경·다른 작업을 확인한다.
2. 의뢰서를 준비한 뒤 문서만 선택적으로 커밋한다. 기존 다른 작업은 커밋·되돌림·stash하지 않는다.
3. 커밋·push는 그 시점의 사용자 승인 범위를 따른다. 과거 완료된 작업의 승인을 영구 승인으로 확대하지 않는다. 배포는 별도다.
4. REQUEST가 포함된 커밋의 전체 SHA를 `BASE_COMMIT`으로 인계 메시지에 고정한다. 같은 문서 커밋에 자기 SHA를 미리 기입하지 않는다.
5. Claude 환경에서 그 SHA와 REQUEST를 실제로 읽을 수 있음을 확인한 후에만 READY로 표시한다. 원격에 있다는 사실만으로 Claude의 저장소 권한을 추정하지 않는다.
6. 같은 PC라면 다른 경로의 worktree를 사용한다. 같은 폴더에서 두 AI가 브랜치를 번갈아 전환하지 않는다. 이미 독립된 clone이면 재사용한다.

공유 완료 후 실행할 명령 예시(자리표시자는 실제 인계 값으로 교체):

```powershell
git fetch origin
git cat-file -e '<BASE_COMMIT>^{commit}'
git show '<BASE_COMMIT>:product_doc/balance/BAL-001/REQUEST.md'
git worktree add -b balance/BAL-001 C:/Users/USER/Desktop/porena-balance-BAL-001 <BASE_COMMIT>
```

경로·브랜치가 이미 존재하면 덮어쓰지 말고 기존 독립 공간의 기준 SHA를 확인한다.
위 명령은 안내이며 이번에 worktree나 분석 브랜치를 생성하지 않았다.

## 보고서 수령 → 독립 검토 → 승인 → 구현

- 필요 시 원격을 fetch하고 보고서의 정확한 커밋 SHA를 고정한다.
- `git show <REPORT_COMMIT>:product_doc/balance/<ID>/REPORT.md`와 `git diff`로 읽는다.
- 분석 브랜치를 개발 브랜치로 pull·merge·rebase·cherry-pick하지 않는다.
- 분석 브랜치의 게임 코드나 실험 코드를 무검토로 복사하지 않는다.
- 보고서 BASE_COMMIT과 현재 개발 HEAD 사이의 관련 코드 diff를 확인한다. 규칙·경제·판정 변경이 있으면 영향과 재검증 필요 여부를 명시한다.
- 측정값과 가정, 표본·분모, seed, 실패 게임 처리, 실행 방법, 버전, 코드 근거를 검토하고 필요한 최소 재현을 수행한다.
- 제안마다 채택 권고·보류·기각과 이유를 사용자에게 보고한다. 권고에 자동으로 따르거나 자동으로 반대하지 않는다.
- 사용자 승인 전 실제 수치·규칙을 바꾸지 않는다. 승인된 변경만 Codex가 기존 구조에 맞게 직접 구현하고 테스트한다.
- DECISIONS에 승인 근거, 원본 보고서 SHA·경로, 구현 SHA, 검증 명령·결과를 남긴다. 미정 필드는 미정으로 둔다.
- 이는 분석 브랜치의 무검토 통합 금지이며 개발 브랜치 자체의 정상적인 원격 동기화는 금지하지 않는다.

## 이번 조사 상태 — 2026-09-24

- 프로젝트 이름은 PORENA, 저장소명은 holto-chess. 앱은 `holto-chess/`; root npm 명령은 위임용.
- 조사 HEAD: `5db158a9bf8495175ebfcbd0da50a06e71f1e109`, 브랜치 `main`, upstream `origin/main`.
- 원격: `https://github.com/wlghks4689/holto-chess.git`. `git ls-remote`로 원격 main도 위 SHA임을 확인했다.
- 별도 worktree: `C:/Users/USER/.codex/worktrees/release-audit-latest/holto_chess`, 조사 당시 detached `607718d`.
- 다른 활성 작업 `Pull하고 개발 서버 열기`에서 UI 작업 중임을 확인했다. 이 문서 작업과 쓰기 경로가 겹치지 않아 계속 진행한다.
- 시작 시 미커밋: `holto-chess/src/ui/ShowdownCinematic.tsx`, `cinematic.css`, `cinematicRendering.test.ts`; 미추적 `holto-chess/LAYOUT_AUDIT.md`. 의존성 캐시 변경도 있음. 모두 이번 작업에서 제외·보존.
- `holto-chess/docs/`는 현재 screenshots 폴더이며 기획 정본으로 표시된 문서는 찾지 못했다.
- 기존 운영·배포 이력은 `holto-chess/OPERATIONS.md` 참고. 이번에 운영 사이트·배포·전체 테스트·빌드는 실행하지 않았다.
- 문서 작성 시 공유 상태: **BLOCKED**. 이후 사용자가 이번 문서의 커밋·push를 승인했다. 실제 결과와 BASE_COMMIT은 실행 후 인계 메시지로 제공한다. Claude 환경 접근은 별도 확인 전까지 미확인이다. 조사 HEAD를 의뢰서 포함 BASE_COMMIT으로 사용하면 안 된다.
