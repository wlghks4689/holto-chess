# Final-round UI QA — 2026-10-01

Original baseline: main 4d308572537bade834305dfa7a9e240025b2d8cc. Remote later advanced to 4e7a2bf (four simulator tool files only); applied a conflict-free fast-forward. No rebase/reset/force push. Prior engine, locale, ability documents, capitalism tests/results and other untracked work remain outside the R5 commit. No R5 deployment.

## Change and scope

- App/OnlineApp provide public alive profiles to finalPrepMatchup. R5 has no server showdownPrep payload; no server contract change. Surviving perspective appears first, with a safe finalist fallback for eliminated spectators.
- FinalRoundTransition reuses four-seat/two-row loading composition. All four players, including self, render seven CardBack nodes; no rank/suit/hand/equity is read or displayed.
- FinalArenaBackdrop uses picture media <=768px and matching preload. New background is scoped to R5 loading/showdown/final standings. Existing reveal/disclosure clock, 3/2/2 batches and preparation duration are unchanged.
- ShowdownCinematic displays authoritative match.pointAwards as placement reward, e.g. 1위 +20P; competition ties retain a tied marker and real ICM decimals. Any deltaPoints difference is shown separately as BONUS. No rules or point calculation changes.
- CSS adjusts only final loading and short-desktop settlement spacing. R1–R4 stage tests remain intact. No dependency changes.
- Prep, pure finalist identity, cinematic rendering and stage tests cover privacy, spectator fallback, four ranks, tied allocations, bonus separation and responsive assets.

## Image mapping and size

Both originals visually inspected in C:\Users\USER\Desktop\porena-. 포레나 파이널 라운드_1.png (941x1672) is mobile; _2.png (1672x941) is desktop. Existing sharp WebP quality80 output: mobile750px wide **241064 bytes**, desktop1672px wide **307646 bytes**. Originals unchanged. Centered cover and dark overlay preserve the castle/floor composition and readable panels. Stable mobile resource log contains mobile only; fresh desktop contains desktop only. Resizing across breakpoint naturally loads the newly selected asset.

## Actual local UI evidence

User-PC Chrome, dedicated headless profiles and React-only local Vite. Actual App/OnlineApp components use QA state; all online room/clock traffic is mocked. No live online game or production data created. QA-only React source filter/cache resolved refresh instrumentation error; production Vite config unchanged.

- App/OnlineApp prep: 360x780,390x844,1280x720,1440x900 — 8 cases,4 names,28 backs,0 exposed faces,horizontal overflow0.
- Shared ShowdownCinematic authorized fixtures:16 cases,visible cards0/12/20/28,actual-value reward text and separately rendered BONUS. These are UI fixtures, not engine rule changes.
- Actual local App transitions through unchanged resolvePrimary on a valid four-finalist fixture and normal cinematic clock:28 private prep backs -> table0 open -> 3/2/2 reveal -> real tied first +16P each,third +5P,fourth +3P. Page reload plus state rehydration restores28 hidden prep cards. This is fixture injection, not a natural full-game playthrough.
- Long nickname truncation and four identities checked visually. No horizontal clipping/overlap at tested widths. Short-desktop document height828->744px at1280x720 after spacing fix; all four reward rows fit screenshot, ordinary24px outer-page allowance remains. Mobile document height788px for780px viewport; lower control accessible by ordinary scroll.
- Before R5 snapshots from untouched shop baseline: r5-before-prep-local-360/1280.png. After: r5-prep-local/online-{width}.png, r5-cinema-TABLE_ENTER/COMPLETE-{width}.png, r5-actual-app-transition.png. JSON and logs retained in C:\Users\USER\Documents\Codex\2026-09-30\task. No uploads.

## Tests and timeout diagnosis

- Working checkout whole suite:81 files/**579 passed**, maxWorkers2,60.88s.
- Working Worker suite:2 files/**22 passed**, maxWorkers1,12.78s.
- R5-only isolated source (prior shop HEAD + explicit R5 files, excludes unrelated dirty engine/locales and untracked capitalism tests):80 files/**557 passed**, maxWorkers2,65.66s; Workers2 files/**22 passed**, maxWorkers1,12.29s.
- Isolated type/production build passed. Related4 files/**59 passed**. git diff --check passed.
- Lint remains FAILED with the exact known baseline **react-hooks/set-state-in-effect**, OnlineApp.tsx94:49, synchronous sale-state cleanup.1 error,0 warnings. New helper refresh warning was fixed by moving the pure function to its own file. No suppression.

Before user simulator began, baseline whole576 and Workers22 passed. During its2000-game/jobs11 run, unchanged30-second limit caused releaseAudit's eight-human full-game test and disclosure's long-decider/unknown-board full-game tests to timeout. Worker reconnect tests observed changed barrier deadlines after roughly22-second stall. Simulator CPU had grown beyond41000 seconds with11 worker jobs. No timeout increase or test skip. After simulator ended, the same checks passed at their existing limits. This supports resource contention rather than an R5 behavior regression; no engine/server test repair was made.

User simulator normal completion confirmed from C:\Users\USER\Desktop\holto-chess-claude\holto-chess\tools\balance-simulator\output\ability-2000\result.json:2000 requested,2000 completed,0 failed,with saved report/rows. Simulator PID25064 and its parent ended; results untouched.

Unverified:live production/online connection and refresh/Safari/physical notch device. Online prep is mocked; natural App transition is local fixture only. No R5 deploy was requested. PC shutdown requires final remote confirmation and a non-forced Windows request; unknown unsaved apps must not be forcibly closed.

Commit message: fix(ui): mask final loading hands and show placement points.
