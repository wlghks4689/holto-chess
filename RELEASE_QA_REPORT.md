# PORENA Release QA Report

## Tested Revision

- Date: 2026-09-22 (Asia/Seoul).
- Base: `1d5ab2f977d8c7765b108ca8eade23eefe288bad`. `main` and fetched `origin/main` matched at audit start.
- Audit branch: `codex/release-audit`. Tests below include the audit changes, not just the base revision.
- Tested implementation commit: `c224bd0` — `fix: harden release deadlines and rematch state; add QA regressions`. The report is delivered as a subsequent documentation commit.
- Runtime: **`holto-chess/`** Cloudflare Workers/Vite application. Root npm scripts delegate to it; the legacy root app was not tested as the product.
- `PORENA_README.md` does not exist. Compared root `README.md`, nested `holto-chess/README.md`, actual engine/config, tests and current UI instead.
- No repository rename, database migration, ranking/MMR/Elo/season implementation, push or production deployment was performed by this audit. Existing generated Vite cache edits remain excluded from commits.

## Release Verdict

**NOT READY**

Open release gates: **2 BLOCKER, 0 CRITICAL**. Two additional critical defects were fixed on the QA branch. There are also documented Major/Minor issues and validation limits below.

Passing tests do **not** clear the two blockers: two tests intentionally reproduce known faulty behavior. Their passing result means the defect is reproducible, not that the scenario is healthy.

## Executive Summary

- Normal latest-v2 games complete with 2 human + 6 AI, 4 + 4, and 8 humans, including timeout takeover, reconnect and rematch in the actual Workers test runtime.
- A real local HTTP/WebSocket smoke completed R1–R5 with two clients, 40 acknowledged actions and identical final standings. It took 158 seconds; observed action p50/p95 were 34/517 ms, maximum 1312 ms. This is a functional smoke, **not** a capacity benchmark or an Internet latency measurement.
- A separate local one-human + AI game was played through R1–R5 to FINAL RESULT in the browser. The player's displayed 64 total matched 28 points + 8 hand score + 4 augment + floor(242BB/10).
- The two release blockers are an economic dead end that crashes showdown and R4 winner-group settlement discarding distinct tiebreak places.
- Fixed expired SHOP/AUGMENT input, stale action keys across rematches, rematch archive identity, premature R1 points, outdated smoke actions, a misleading R2/R4 transition label and narrow-screen reward text clipping.
- Card pool, evaluator, Omaha, split-run, final-score and protocol tests pass on covered cases. This is not a proof that every random game or adversarial input is safe.
- Production health, root page, SPA route and HTML-referenced assets return HTTP 200. The QA branch was deliberately **not deployed** while blockers remain.

## Blockers

### B-01 — Legal shop spending can leave an empty hand and crash progression — OPEN

- Severity: **BLOCKER**; **DESIGN DECISION REQUIRED** for recovery policy.
- Condition: R1 human sells the initial owned card, then repeatedly pays 3BB to lock/unlock an offered card until fewer than 3BB remain. All commands are currently legal.
- Reproduction: start seeded v2 room `20260922`; sell p1's sole card; repeat `LOCK_SHOP` twice (lock/unlock) while stack >= 3; expire SHOP; expire SHOWDOWN_PRIMARY setup.
- Expected: either prevent entering an unrecoverable state under an approved rule, or finish the timeout with a legal hand/recovery outcome.
- Actual: automatic preparation leaves zero hole cards. Showdown throws `Partial hand requires between one and four cards`. The room cannot progress via the normal alarm path; retrying the same state does not repair the hand.
- Cause: `aiPrepare` may stop when it cannot afford a card. `prepareShowdown` does not require a complete hand for seats delegated to the bot; street evaluation later assumes at least one card.
- Source: `holto-chess/src/game/engine.ts` (`aiPrepare`, `prepareShowdown`, `streetHandFor`), `src/game/room.ts` (`forceBarrier`), `src/core/poker/evaluate.ts`.
- Change: no silent free cards, reserve requirement, debt or forced sale rule introduced. Those change economy/purchase policy and need approval.
- Regression/reproducer: `src/game/releaseAudit.test.ts`, known-release-blocker section. Intentionally asserts the exception and is labeled unresolved.

### B-02 — R4 winner tiebreak loses a real third place and awards 10/5/5 — OPEN

- Severity: **BLOCKER** (incorrect/ambiguous score settlement); **DESIGN DECISION REQUIRED**.
- Condition: all three Winner Group players share the regulation best five; a new board separates them into 1st, 2nd and 3rd.
- Reproduction: `src/game/releaseTies.test.ts` supplies a legal shared royal board, followed by a disjoint board on which the three players hold trips A, Q and T. The real evaluator is used, not a mocked winner.
- Expected: the configured 10/5/3 placement policy must have an explicit, consistent interpretation after the decider.
- Actual: `boardResults[1]` is `[1,2,3]`, but final `results` becomes `[1,2,2]`; awards become `[10,5,5]`, totaling 20 instead of the distinct-place ladder's 18.
- Cause: `resolveParticipants` rewrites every losing regulation leader to place 2, and `rewardMatch` pays the place-indexed amount. High-card fallback uses the same collapsing pattern. Non-first ties are also not given an explicit R4 split-pool rule.
- Source: `src/game/engine.ts` (`resolveParticipants`, `rewardMatch`, `resolveSecondary`).
- Change: no unilateral redistribution or new tiebreak policy. Decide whether deciders determine all placements or only the winner, then specify lower-place ties and the bounded fallback.
- Regression/reproducer: `src/game/releaseTies.test.ts`; asserts current erroneous settlement so the issue remains concrete. Convert to the approved expected outcome when fixed.

## Critical Issues

No additional open Critical issue was confirmed in the exercised paths. This does not negate the Blockers above.

### C-01 — SHOP/AUGMENT accepted actions after their deadline — FIXED

- Condition/reproduction: send REROLL or SELECT_AUGMENT at exactly the deadline, before a delayed alarm executes; the previous implementation accepted it. At deadline minus 100ms it should remain valid.
- Expected/actual: decisions at or beyond expiry must not mutate authoritative state; alarm ordering previously extended the effective decision window.
- Cause: only draft/loadout handlers checked expiry; other decision phases relied on alarms alone.
- Fix: authoritative deadline rejection for SHOP/AUGMENT before applying mutations; LEAVE_ROOM remains possible.
- Regression: exact-boundary and last-100ms tests in `releaseAudit.test.ts`. Draft manual-first/timeout-first paths are additionally tested for one pick and intact ownership.

### C-02 — An old game's command could be accepted in the next rematch — FIXED

- Condition/reproduction: retain an old R1 SHOP turn key, complete/rematch in the same room, submit a new-request-id REROLL using the old key.
- Expected: reject as stale. Actual before fix: both games used `1:SHOP`, so the command affected the new game.
- Cause: turn identity had only round and phase.
- Fix: optional backward-compatible `gameGeneration` in room snapshot, incremented for rematch; turn key includes generation and encounter sequence. Protocol accepts new opaque keys, and room compares the exact current key. Old persisted snapshots default to generation 0.
- Regression: rematch stale-key test; Workers full-game/rematch tests use real parsed WebSocket commands. No schema migration or client-side scoring authority added.

## Major Issues

### M-01 — Rules/documentation disagree — OPEN

- Reproduce: compare the table in Rules vs Implementation Mismatches with root/nested README and running UI.
- Expected: one approved rule description consistent with behavior. Actual: elimination, R4 shop, final bonus and timing descriptions conflict.
- Cause: old documentation and legacy-v1 tests coexist with v2 code.
- Fix status: discrepancies recorded, not silently declared in favor of either prose or code. Consolidate after policy decisions.
- Validation: source-to-source comparison; future doc assertions should target v2 rule constants.

### M-02 — “승자의 배당” promises a reward R3 does not apply — OPEN

- Condition: choose `win_bonus` after R2, then win an R3 match.
- Expected: approved text should describe its scope accurately. Actual: text promises +5BB on a win; R3's explicit reward branch pays 10BB and bypasses that augment.
- Cause: general augment description versus R3 fixed-win exception.
- Fix status: **DESIGN DECISION REQUIRED**. R3 request explicitly excludes win-streak bonus but does not clearly settle this augment exception. Do not change economy without approval.
- Validation: inspected `augments.ts` and `rewardMatch`; R3 fixed-reward tests pass. Browser confirmed this augment is selectable before R3.

### M-03 — Round guide does not contain keyboard focus — OPEN

- Reproduction: in R2 guide focus “안내 닫기”, press Shift+Tab. Browser focus moved to the background SINGLE / AI button, outside `role=dialog`.
- Expected: modal keeps keyboard focus within its controls and returns focus on close.
- Actual/cause: `RoundGuide` sets `aria-modal` but has no focus trap/background inert handling. StartScreen has these protections, but in-game RoundGuide does not.
- Fix status: left explicit for focused accessibility follow-up; no large modal refactor attempted. Mouse/touch close and confirmation remain reachable.
- Regression: manual DOM-focused-element check reproduced; no claim of a screen-reader audit.

### M-04 — R1 cinematics exposed the round's final points during Match 1 — FIXED

- Reproduction: browser Match 1 showed `0W 0D 1L` and `POINT 6`, before later wins were presented.
- Cause: only R2+ captured per-match point snapshots; R1 rendering fell back to final player profiles.
- Fix: capture before/after point snapshots for R1 as well, without changing awards.
- Regression: engine reward/snapshot equivalence and initial/result markup tests for both R1/R3.

### M-05 — Same-room rematch reused the local result archive ID — FIXED

- Reproduction: compare `PlayerView.gameId` before/after rematch; previously identical, and `saveFinalResult` replaced rows with the same ID.
- Cause: game ID equaled room ID for every game.
- Fix: rematch generation contributes to `gameId`; room routing ID is unchanged and initial-game IDs stay compatible. This changes only game identity/local result records, not permanent ranks.
- Regression: view game ID changes while room ID remains stable.

### M-06 — Operational smoke sent obsolete v1 commands — FIXED

- Reproduction: run old `tools/operations/smoke.mjs` against v2: READY during automatic phases, missing draft/loadout actions, and SELECT_CARDS in R3.
- Cause: flow did not follow current PlayerView phases. The Worker test also ignored a rejected obsolete SELECT_CARDS action.
- Fix: v2 draft/presentation/loadout handling, only eligible ready voters, stop a per-phase action loop when the phase changes, assert Worker replies instead of silently accepting errors. A first live attempt exposed a Survival Ready subset transition; the smoke was corrected accordingly.
- Regression: final local two-client smoke PASS; expanded Workers 2/4/8-client tests PASS. Nonproduction functional test only.

## Minor Issues

- **N-01 FIXED:** at 360px, heads-up reward text could clip “획득” because of 14px nowrap. Existing <=639px breakpoint now uses 12px wrap-capable reward text; desktop styling unchanged.
- **N-02 FIXED:** local R2/R4 transition CTA said “상점으로” although draft comes next. v2 uses “드래프트로”; ordinary shops/legacy rules retain their labels. Browser verified R2 changed label.
- **N-03 OPEN:** RUN loadout native selects display raw identities such as `8c`, `9c`, `6h`. Buttons are semantic but suit-symbol labels would be clearer. Source `OpenDraft.tsx`; visual/manual verification. No rules change necessary.
- **N-04 OPEN:** compact lock/exit controls are smaller than a comfortable 44px touch target; debug mode-switch buttons measured 26px (development only, not a production blocker). Main confirmation CTA measured 50px. Real device touch/zoom testing remains necessary.
- **N-05 OPEN:** a mouse click on the final total can immediately close the breakdown: pointer-enter opens it, then click toggles it closed. Reproduced on the 64-point total; keyboard Enter opened the correct breakdown. Source `FinalStandingRow.tsx` uses both handlers against the same boolean. Adopt explicit mouse-hover versus click behavior in a focused follow-up; touch behavior was not physically tested.
- Speed/Skip: `ShowdownCinematic` supports controls when requested in its preview, but normal `CinematicGate` hides them; synced multiplayer deliberately cannot skip the server clock. This is a product choice needing explicit acceptance, not an implemented release feature.

## Design Decisions Required

1. **B-01:** guarantee a complete legal hand after economic exhaustion. Choose prevention/reserve, recovery/fallback or another stated rule, including purchase-limit exhaustion. No free-card/debt policy was invented.
2. **B-02:** R4 decider placement and split-pool policy for 3-way ties, lower-place ties and high-card fallback. Match display, awards and standings must use the same decision.
3. **M-02:** does `win_bonus` apply in R3? Adjust the approved exception text or reward logic, not both speculatively.
4. **Payload reveal policy:** during resolved showdown, PlayerView includes the resolved match boards/hands/results and round summary before the cinematic reveals them. R5 front faces are also mounted but visually hidden. There are no remaining shop/draft choices for that encounter, but this is **not cryptographic/server-timed concealment**. If “hidden until animation time” is a security requirement, this is an additional privacy release gate requiring protocol/presentation design; CSS is insufficient.
5. **Spectator input policy:** with surviving humans, eliminated viewers cannot decide gameplay. When every human is eliminated, current room logic lets remaining viewers READY-advance presentation/result barriers; bots still choose cards and settle rewards. The request's strict “spectators never mutate state” conflicts with this convenience. Approve or remove spectator progression authority explicitly.
6. **Final elimination ordering:** code/tests intentionally let an eliminated player's frozen total outrank a surviving finalist. Elimination snapshots score owned cards alone (R3 partial 4-card hand), not that match's board-based Omaha hand. Approve this final-score rule or specify a different ordering/snapshot policy.

## Rules vs Implementation Mismatches

| Area | Actual implementation/test evidence | Conflict or audit result |
| --- | --- | --- |
| R1 | Hold'em 2 cards, Swiss 3 matches; +3/+1/0P; wins 10BB + prior-win*5, losses 15BB + prior-loss*5 | Match 1 random, later similar records and rematch avoidance where feasible; per-match points fixed. R1 Split is currently treated as rewarded win for BB/streak, unlike R2/R3; document explicitly. |
| R2 | 8-card public draft; points ascending, BB descending, server/seeded RNG for exact ties; all 3 owned cards used via anchor + two distinct secondaries | Current v2 matches requested structure. Old `r2Primary/r2WinnerBracket` config/tests remain for v1 snapshots, not v2 rules. |
| R2 runs | 4/2/0P per run; split 0BB/reset streaks; two boards from one encounter deck excluding all 6 owned cards | No ordinary run split causes a sudden death. Hand identity/AAA/loadout uniqueness covered by tests. |
| R3 | Frozen R1+R2 seed, BB tie-break, 1v2/3v4/5v6/7v8; Swiss 3 games, no 2+2 split; exact Omaha 2+3 | 4/2/0P; win10BB, loss15+5 per prior loss, split0/reset; win bonus augment conflict M-02. |
| R3 elimination | Cumulative-point bottom 2; boundary tie uses Omaha survival; exact 6 remain | Covered by Omaha/draft/survival tests and full-room runs. Deciders do not add normal rewards. |
| R4 | 16-card draft then 2-card personal shop; 5 owned +5 board free BEST5; primary win6/split3 each | Root Open Draft text incorrectly says R2/R4 draft replaces personal shop; R4 keeps shop. |
| R4 decider | Split participants both get 3P; up to two extra boards, then rank-only distinct high-card draw selects one Winner Group entrant | No additional decider point award. Winner Group 10/5/3, Loser Group0; B-02 violates distinct-place interpretation. Exactly 4 remain in normal tested games. |
| R4 elimination | Two Loser Group non-winners eliminated | Root Game Flow incorrectly says R3 and R4 both eliminate cumulative-point bottom players. |
| R5 | Four players;7 owned/no board;3→2→2 reveal;20/12/5/3P; ties use ICM over occupied slots | Competition places use 1,1,3 and no suit tie-break. Tests conserve total40P, including lower-place ties. Some generic ICM test names use old example ladders, not current config. |
| Final score | points + fixed category score + augmentScore + floor(BB/10) | README formula omits augmentScore; UI breakdown includes it. R5 hand winner is not necessarily overall total-score winner. |
| Final hand scores | High0,Pair1,TwoPair2,Trips5,Straight8,Flush12,FullHouse15,Quads20,StraightFlush30,Royal40 | Engine/config tests agree; eliminated owned-hand snapshot policy needs approval. |
| Timer | SHOP60s, deal-in3s, human draft20s, bot draft1.8s, loadout30s, setup3s, group10s, result30s, augment30s | NEXT_ROUND settles immediately online; README groups it under30s. Presentation time precedes result confirmation deadline. |
| Local vs online | Local round guide can pause its intro; online phases remain shared server clocks | Do not assume the debug `pauseRoundResultTimer=1` URL tests production timeout behavior. Server deadlines were tested independently. |
| Nested README | Says click card to buy;R2 choose2; timers/disconnect handling absent | All obsolete for v2. Shop uses price button, R2 uses all3, online alarms/reconnect exist. |
| Standing rank | Round table breaks equal points by BB/seat; cinema point badges show shared points rank | Values agree but rank semantics differ. This is not a suit tie-break or permanent leaderboard. Label/definition should be explicit. |

## Multiplayer / Reconnect

- Workers tests use real WebSocket parsing, Durable Object storage, eviction/constructor re-entry, alarm and broadcast paths, not just reducers.
- Expanded full-game cases: 2/4/8 human clients; concurrent initial READY; reconnect/duplicate-tab replacement once per reached round/phase; private `me`, deadline and standings unchanged; all final standings equal; same-room rematch succeeds.
- Worker time travel edits test snapshots' timestamps to avoid waiting through all cinematics. It tests actual alarm transitions but does **not** model real mobile background throttling or Internet packet loss.
- Existing tests cover concurrent purchases/rerolls, duplicate request IDs, locks, wrong player fields, hostile purchases, room isolation, foreign Origin/token, room full, rate limits, expiry and hibernation.
- New pure-room tests cover timeout takeover for 2/4/8 humans, last100ms draft input, both event orders, duplicate draft command, exact SHOP/AUGMENT deadline and stale rematch input.
- `blockConcurrencyWhile` protects command/alarm transactions; state is saved before successful publication. Request deduplication remembers only the last64 successful IDs per session; it is not an unlimited replay ledger.
- Reconnect coverage includes reached SHOP, DRAFT_ORDER, OPEN_DRAFT, RUN_LOADOUT, presentation/setup, ROUND_RESULT, AUGMENT and R5. Survival branches also have dedicated engine/liveness coverage. Not every random full-run seed necessarily visits every survival case.
- Actual local two-socket smoke uses ordinary wall clocks and no state mutation shortcuts. It passed after v2 smoke fixes. Smoke stops on GAME_RESULT data; visual completion is evaluated separately.

## Card Pool Integrity

- Actual ownership ledger uses AVAILABLE/RESERVED_IN_SHOP/OWNED, validates52 identities and bidirectional ownership/reservations. Sales, rerolls, locks and eliminated-seat release have direct tests.
- Added whole-room loop checks assert ledger integrity, nonnegative stacks and exactly6 then4 survivors at relevant boundaries; projection/refresh does not mutate rewards.
- Showdown decks are separate from ownership: exclude **all OWNED cards of original encounter participants**, not merely selected cards. Other encounters' owned cards and shop reservations are legal board candidates by current policy.
- Split-run boards draw ten distinct cards from one deck; new matches and deciders use fresh decks. Deciders still exclude the original encounter's ownership, including participants not continuing.
- R5 generates no board. All evaluator tests keep suit-neutral comparison and full kicker ordering.
- Shop size2, v2 R2 no ordinary shop, partial lock keeps the other slot rerollable, all filled slots locked blocks reroll. User/purchase/reroll limits tested in existing suites.
- **Exception:** ledger integrity can remain valid while a hand is unplayable (B-01). A52-card invariant alone does not establish game liveness.

## Scoring / Elimination

- Awards are engine/DO mutations; cinematics consume `MatchReward` and do not pay points. Repeated projection and reconnect yield unchanged state; re-resolving an already-completed phase is rejected.
- R3 boundary survival and R4 group deciders have dedicated tests for no extra ordinary point awards and correct survivor counts. R4 Winner Group placement is the unresolved exception B-02.
- R5 ICM uses occupied prize slots for tied groups at any rank and conserves40P within floating tolerance. Final total includes augment bonuses and floors BB/10 without rounding underlying points.
- Final standings are deterministic for a stored state; final place tie-break is distinct from hand-comparison suit neutrality. Existing eliminated-total behavior is explicitly tested, so it must not be changed casually.
- No permanent rank storage or new leaderboard implementation was added. Existing nonpersistent rank fields were not expanded.

## Mobile / Responsive

- Browser viewport set: **360×800,390×844,430×932,768×1024,1920×1080**.
- DOM geometry checks compare `document.documentElement.scrollWidth <= innerWidth`; these are desktop-browser CSS viewport checks, not physical-device coverage.
- Tested start, multiplayer lobby, shop, R1/R2 showdown, round result table, R2 loadout and stable dev fixtures for R2/R4 draft across all five widths. No document-level horizontal overflow in these checks. A visible narrow heads-up reward clipping defect was fixed at the existing mobile breakpoint.
- R4 bracket, completed R5 showdown and final standings/breakdown were verified at actual 390×844 (document width375px, no horizontal overflow). Later viewport override requests for these scenes did not change their measured `innerWidth`; these are **not** counted as five-size coverage. The override was reset after testing; repeat these three scenes at the other four sizes before launch.
- Manual screenshots checked dark arena/cyan continuity, hole/board visibility, selected/winning glow, lost/unused dimming, score positioning and reachable CTA. Scroll is required for long two-run content; content remains reachable.
- Local gameplay checks completed one human+AI through R1–R5 and FINAL RESULT; the R2 guide kept deal-in from completing behind it, then draft timeout and loadout timeout continued normally. R5 showed four seven-card hands, best-five glow, unused dimming, placement rewards and a reachable final-result CTA. The exact 3→2→2 intermediate sequence is covered by code/tests, not claimed as a frame-by-frame manual capture; no royal/straight-flush was dealt in this manual game. The debug pause parameter affects round-result review only and was not evidence of production timer behavior.
- Final score breakdown: player finished third with28P, straight8P, augment4P and242BB→24P, total64P; UI formula and displayed total agreed. This single outcome does not clear the separate eliminated-total policy conflict.
- Remaining physical-device validation: Safari/iOS, Android Chrome, landscape/virtual keyboard, enlarged text, real touch targets, slow GPU and edge glow clipping. No claim of pixel-perfect cross-browser certification.
- Browser error feedback: invalid `000000` room code kept Join disabled; an absent valid-shaped code displayed `방을 찾을 수 없습니다.` in an alert. R4 over-capacity purchase displayed `이번 라운드 보유 한도에 도달했습니다.` without spending BB. Locking4♣ and rerolling preserved4♣, replaced9♦ withA♦, and charged exactly3+5BB.
- Local QA play/lobby tab console check returned no captured warning/error entries at inspection time. This is not a claim about all users' sessions or all browser console history.

## Privacy / Security

- During private decision phases, `createPlayerView` explicitly allowlists data rather than spreading engine state. Live R4 viewers do not get others' current owned/shop cards; R4 draft has no publicHands. R2 ownership is intentionally public under current draft rules.
- Live viewers have no spectatorViews; eliminated viewers get approved read-only perspectives. Added regression checks live R4 payloads and rejects eliminated-seat buying. Spectator READY exception needs the decision listed above.
- Room snapshot, seed, token hash and ownership ledger are not serialized to PlayerView. Existing hostile identity/card tests pass. UI-hidden resolved-showdown data is not claimed to be payload-secret (decision4).
- Tokens are cryptographically generated, hashed in snapshot, delivered with no-store, and not embedded in WebSocket URLs. Token/Origin/room authorization, bounded frame size and rate caps are present. Routine server logs do not print session tokens.
- Security review here covers these code paths and tests, not a penetration test, infrastructure access audit, dependency-vulnerability certification or proof against colluding spectators.

## Build / Test Results

| Check | Result | Evidence / limitations |
| --- | --- | --- |
| Latest main | PASS | Fetched; base SHA above matched main/origin/main; isolated QA branch. |
| Dependency install | PASS with warnings | `npm install --package-lock=false --no-audit --no-fund`, exit0;22 installed package changes/one removal, no manifest/lockfile edits. Windows held-file cleanup and pending install-script approval warnings. Not a clean-machine npm-ci certification. |
| Baseline unit tests | PASS |47 files /320 tests. |
| Final `npm test` | PASS |49 files /332 tests,58.62s; includes two deliberately passing known-defect reproducers. |
| Final `npm run test:workers` | PASS |1 file /10 tests,11.38s.2/4/8 sockets plus existing safety tests. |
| `npm run lint` | PASS |exit0. |
| `npm run build` | PASS |Type generation, client and Worker TS, both Vite bundles;exit0. |
| Local v2 WS smoke | PASS |1 room,2 clients,40 actions,158s, reconnect, final standings agree. |
| Local human + AI browser game | PASS for normal loop |R1–R5→FINAL RESULT; final64P breakdown verified. Debug result-review pause enabled; not a timeout certification. |
| Production HTTP | PASS, read-only |health/root/SPA `/play` all200;4 HTML-referenced JS/CSS assets200. Existing deployed build, not audit changes. |
| Source whitespace | PASS |`git diff --check`; CRLF conversion notices are not whitespace errors. |

Wrangler printed sandbox log-write EPERM warnings and the Worker runner printed static-export-analysis permission warnings; the actual runs exited0 and produced/tested the bundles. The healthy build was not repeated merely to remove those warnings.

Initial reproduction tests failed as expected before fixes. One blocker assertion initially checked the wrong transition: SHOP creates the invalid hand, then SHOWDOWN_PRIMARY setup triggers the exception; corrected to the actual sequence. The expanded Worker suite initially hit shared test-IP quota, so independent test visitors now have independent test IPs without changing production rate limits.

## Changes Made

- `src/game/room.ts`: deadline guards and rematch generation/encounter-aware turn keys.
- `src/shared/protocol.ts`: accepts versioned turn-key shape while keeping legacy parser compatibility.
- `src/game/playerView.ts`: distinct rematch game identity without changing room routing.
- `src/game/engine.ts`: R1 before/after point snapshots for cinematic display, no reward change.
- `src/ui/App.tsx`: v2 draft transition CTA.
- `src/ui/cinematic.css`: mobile heads-up reward wrapping at existing639px breakpoint.
- `tools/operations/smoke.mjs`: current v2 protocol progression, timed presentations and survival subset handling.
- Test/report changes described below. No balance/economy/elimination policy, auth architecture or deployment infrastructure was changed.

## Regression Tests Added

- `src/game/releaseAudit.test.ts`: deterministic20260922 full v2 timeout loops (2/4/8 humans),52-card integrity, BB>=0,6/4 survivors, immutable projections, final consistency, draft100ms race orders, private R4 views/spectator rejection, R1 score snapshots, SHOP/AUGMENT deadline and stale rematch/game identity; known economic blocker reproduction.
- `src/game/releaseTies.test.ts`: legal physical-card fixture with real evaluator proving R4 tiebreak place collapse. Mocking is limited to choosing deterministic boards, not scoring or ranking.
- `src/ui/cinematicRendering.test.ts`: R1 and R3 pre-match/result point rendering.
- `tests/worker/room.test.ts`: real-runtime2/4/8 socket games, simultaneous READY, reconnect in each reached phase, no ignored obsolete R3 action rejection and all-client final consistency.

## Known Remaining Risks

- B-01/B-02 unresolved; do not mistake passing expected-bug tests for fixes.
- R4 ties, augment exception, elimination-final ordering, spectator progression and staged-payload secrecy need explicit approval.
- No load/soak benchmark, real Internet reconnection fault injection, distributed failover simulation, power-loss persistence test or multi-browser device lab was run.
- No production game rooms or production player state were modified for QA; no preview deployment was made. Production HTTP smoke cannot establish the audit branch's deployed behavior.
- Existing simulator uses separate policy/test infrastructure; this audit did not claim a1000-game balance run. Rules correctness evidence is scoped to recorded deterministic fixtures, existing tests and executed full games.
- Old rulesVersion1 data is still supported and appears in legacy tests. The release verdict concerns current rulesVersion2, not an instruction to delete backwards compatibility.
- UI/keyboard and physical-device gaps above remain even when source unit tests pass.

## Recommended Pre-Launch Checklist

1. Approve and implement B-01 recovery/prevention; test every round, human/AI takeover, purchase caps, no negative BB and no duplicate cards. Replace the known-error assertion with successful legal progression.
2. Approve R4 complete placement/tie policy; test 3-way regulation tie, successive narrowing, lower-place tie and capped high-card fallback; verify point/reward/UI totals and4 survivors.
3. Resolve the remaining design decisions and consolidate root/nested rule documentation. Remove unsupported promises, not backwards-compatible code.
4. Add in-game guide focus containment, verify small touch controls, hide raw card IDs in player-facing selectors and resolve final-score hover/click toggle ambiguity.
5. Re-run unit/Workers/lint/build and a freshly served built-artifact smoke after approved changes; test2/4/8 clients on real browsers with network/background throttling and refresh in each important phase.
6. Perform physical iOS/Android and desktop visual checks at the stated sizes, including R5 reveal/glow and final result details.
7. Only after release blockers are closed, authorize deployment with the existing `npm run deploy` workflow. If credentials are missing, use `npx wrangler login` first; no new infrastructure setup is required by this audit.
8. After authorized deployment, check health/assets/SPA and a bounded explicitly authorized production WebSocket game, then inspect operational errors and rollback readiness.
