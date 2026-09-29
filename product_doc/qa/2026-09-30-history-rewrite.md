# 저장소 히스토리 정리: .audit 제거 (2026-09-30)

## 요약

- 대상: `holto-chess/.audit` (멀티플레이 QA 자동화의 화면 캡처 1,618장·로그, 587 MB). 커밋 `4722b36`(정리 전 SHA, 2026-09-24)에 함께 들어가 저장소 pack의 대부분을 차지했다.
- 결과: 새로 clone할 때 저장소 크기 **538.5 MiB → 57.6 MiB**. 어떤 브랜치 이력에도 `.audit`이 남지 않는다.
- 파일 영향 없음: 정리 전 `main`(Codex `4e1cc55`)과 정리 후 `main`(`058bb8b`)의 파일 트리 해시가 같다(`ce1ae06`). 게임 코드·에셋·문서 내용은 바뀌지 않았다.
- 배포 영향 없음: GitHub Actions가 없고 배포는 로컬 `wrangler deploy`로 한다.

## 바뀐 브랜치

`.audit`을 포함한 4개 브랜치만 다시 썼다. 다른 8개 브랜치(balance/BAL-002, BAL-003, BAL-003-latest, BAL-004-latest, BAL-005-latest, codex/balance-latest, codex/balance-tool-repair, codex/release-audit)는 SHA가 그대로다.

| 브랜치 | 정리 전 | 정리 후 |
| --- | --- | --- |
| main | `4e1cc55` | `058bb8b` |
| balance/BAL-006-latest | `f9fa3a0` | `2b1e4c1` |
| balance/BAL-007-latest | `967e621` | `08a5a85` |
| codex/ability-avatar-profile | `0723a4b` | `2edf347` |

## 방법과 검증

- 전체 백업 번들(`--all`, 원격 13개 ref 포함)을 먼저 만들고 무결성을 확인했다. 작성자 로컬 보관.
- GitHub 미러에서 `git filter-branch --index-filter "git rm -r --cached --ignore-unmatch holto-chess/.audit"`를 위 4개 브랜치의 `4722b36` 이후 커밋에만 적용했다. 빈 커밋 제거 없이 커밋 수와 구조를 유지했다.
- 재작성된 모든 커밋을 원본과 짝지어 작성자·시각·메시지가 같고 `.audit` 외 내용이 같음을 확인했다.
- 작업 중 올라온 Codex 커밋 `4e1cc55`은 같은 트리·작성자·시각·메시지로 새 이력 위에 옮겼다(`058bb8b`).
- 원격이 예상 SHA일 때만 덮어쓰도록 `--force-with-lease`로 4개 브랜치만 푸시했다.
- GitHub에서 서명(Verified)이 있던 커밋 8개(main 5, BAL-006 2, BAL-007 1)는 내용이 바뀌므로 서명이 사라졌다.

## 다른 작업 공간에서 할 일

이 저장소를 이미 받아 둔 곳(다른 PC, Codex 작업 공간, worktree)은 옛 이력을 가지고 있다. 그대로 푸시하면 `.audit`이 되살아나거나 비정상적으로 큰 병합이 생긴다.

- 권장: 새로 clone한다.
- 기존 폴더를 쓸 때: 커밋하지 않은 작업을 따로 보관한 뒤 `git fetch origin --prune` 후 `git reset --hard origin/<브랜치>`. 로컬 `holto-chess/.audit` 폴더는 `.gitignore` 대상이라 남아 있어도 된다.
- 옛 커밋 위에 만든 브랜치가 있으면 `git rebase --onto <새 SHA> <옛 SHA> <브랜치>`로 옮긴다.

## main 커밋 SHA 대응표 (정리 전 → 정리 후)

문서 안의 SHA 참조는 새 SHA로 바꿨다(`4722b36`은 과거 사실을 가리키므로 정리 전 SHA로 둠).

| 정리 전 | 정리 후 | 날짜 | 제목 |
| --- | --- | --- | --- |
| `4722b36` | `90ad92b` | 2026-09-24 | feat: remove augment rules and migrate legacy rooms |
| `05255e3` | `7aace97` | 2026-09-24 | docs: record augment removal deployment |
| `1f06d8f` | `f87a86d` | 2026-09-24 | fix: refine draft and tiebreak UI for mobile |
| `1693437` | `e1dde7b` | 2026-09-24 | fix: remove tutorial button subtitle |
| `6b5d3e5` | `779b978` | 2026-09-24 | fix: compact final standings on mobile |
| `c81a6f9` | `33071a3` | 2026-09-24 | Sync online showdown transitions with server countdown |
| `d6181d4` | `84710e8` | 2026-09-24 | Record online showdown production deployment |
| `9233d51` | `212326f` | 2026-09-24 | fix: gate multiplayer result disclosure |
| `666279e` | `7355127` | 2026-09-24 | fix: align tutorial checkpoints with cinematic |
| `8155529` | `28f5141` | 2026-09-24 | test: remove obsolete augment tutorial branch |
| `9bd7956` | `7ef571f` | 2026-09-24 | docs: record multiplayer production release |
| `d68cf8e` | `8d38873` | 2026-09-25 | Polish R2 run loadout layout and copy |
| `cc54bec` | `c743d60` | 2026-09-25 | Improve card readability and RUN loadout UI |
| `2097591` | `6595d32` | 2026-09-25 | Remove round interstitial and gate guides |
| `fe56286` | `4271aff` | 2026-09-25 | Improve game UI and add made-hand sound effects |
| `2bf09ba` | `4b258ae` | 2026-09-26 | Localize PORENA gameplay and lower low-rank card prices |
| `96ccb7c` | `63a58d8` | 2026-09-26 | Document localization and price release |
| `2b882e3` | `d204640` | 2026-09-26 | Use R5 placement for tied final scores and remove speed controls |
| `5207f9d` | `357627e` | 2026-09-26 | Make showdown equity seed hand-order invariant |
| `d5e62cb` | `a552927` | 2026-09-26 | Record BAL-005 equity seed fix |
| `0fb6fdb` | `ec14a1f` | 2026-09-26 | Refine draft arenas and showdown labels |
| `2cce1a2` | `ee6ab84` | 2026-09-27 | Add R2 split-run showdown loading screen |
| `9b8439a` | `13b86e4` | 2026-09-27 | docs: update Claude collaboration role |
| `3c7f4ac` | `148c1cc` | 2026-09-27 | docs: remove Claude role instructions |
| `79d8668` | `acc8279` | 2026-09-27 | feat: rebuild the balance simulator around the current phase machine |
| `5c662ba` | `24d8e88` | 2026-09-27 | docs: remove Claude analysis-only instructions |
| `3fd48f5` | `5126e99` | 2026-09-27 | Merge origin/main |
| `299eb4a` | `3993613` | 2026-09-27 | Polish showdown and draft presentation |
| `985d8e1` | `b754f97` | 2026-09-28 | Add ability-only card preview |
| `d1b23af` | `cc24cde` | 2026-09-28 | fix: tighten R1/R2 pre-board equity and stop recomputing it every tick |
| `f046881` | `1b4b918` | 2026-09-28 | Implement server-authoritative ability gameplay |
| `fd1a384` | `c1dbc79` | 2026-09-28 | Record ability rules verification |
| `fef05e3` | `832576e` | 2026-09-28 | balance: raise straight flush to 35 and royal flush to 50 hand score |
| `f9c8974` | `604fc5a` | 2026-09-28 | Merge remote-tracking branch 'origin/main' |
| `36eefcb` | `64b15d5` | 2026-09-28 | Delete AGENTS.md |
| `c7ef4fb` | `ca4d063` | 2026-09-28 | Delete product_doc/TODO.md |
| `5552798` | `42f3114` | 2026-09-28 | Delete product_doc/README.md |
| `231413d` | `cbb97a8` | 2026-09-28 | Delete product_doc/balance/BAL-001 directory |
| `17259a6` | `0a7f58e` | 2026-09-28 | Delete product_doc/qa directory |
| `79d6c62` | `93ca230` | 2026-09-28 | feat: improve shop and showdown UI |
| `4afdbf7` | `83a4b82` | 2026-09-28 | Merge ability icons into showdown panels |
| `c01710a` | `0b403e0` | 2026-09-29 | feat: refine mobile poker UI and showdown flow |
| `7e358e7` | `6d30e97` | 2026-09-29 | fix: fit round two layouts and Omaha cards on mobile |
| `61def37` | `7ac76e9` | 2026-09-29 | feat: improve ability draft and responsive match presentation |
| `a797398` | `bc08198` | 2026-09-29 | feat: synchronize ability artwork and refine draft presentation |
| `ead1561` | `0bbd37c` | 2026-09-29 | docs: record ability artwork production deployment |
| `c4c69b8` | `a225775` | 2026-09-29 | feat: add Quad Core and Front Runner abilities |
| `d52d413` | `42e11dc` | 2026-09-29 | feat: split the game guide into a beginner guide and a rule book |
| `3d6ac78` | `70bd2ae` | 2026-09-29 | feat(simulator): measure ability win rates with ability-aware bots |
| `64923c3` | `4897398` | 2026-09-29 | fix: improve ability thumbnail readability and remove unused assets |
| `c54d1ea` | `94739e5` | 2026-09-29 | docs: record production deployment of renewed guide and ability UI |
| `41a46a5` | `75e078e` | 2026-09-30 | perf: cut static media ~90% and load gameplay assets on demand |
| `03978a9` | `27c560c` | 2026-09-30 | chore: stop tracking multiplayer QA audit output |
| `4e1cc55` | `058bb8b` | 2026-09-30 | fix: smooth showdown reveals and show rewards with results |
