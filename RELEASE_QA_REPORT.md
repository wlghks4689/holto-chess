# PORENA Release QA Report

## Tested Revision

- Date: 2026-09-23 (Asia/Seoul).
- Base: `1d5ab2f977d8c7765b108ca8eade23eefe288bad`. `main` and fetched `origin/main` matched at audit start.
- Audit branch: `codex/release-audit`. Tests below include the audit changes, not just the base revision.
- Tested implementation commits: `c224bd0`, `8984da8`, and independent-audit remediation `1318827a5feec312f9f645414e64eced4e998527`.
- Production currently contains candidate `8984da8` (Cloudflare Version ID `758e8fc5-ff55-4bce-a185-7c93b382ad7f`). Remediation `1318827` is validated and pushed with this report but is not deployed by this request.
- Runtime: **`holto-chess/`** Cloudflare Workers/Vite application. Root npm scripts delegate to it; the legacy root app was not tested as the product.
- `PORENA_README.md` does not exist. Compared root `README.md`, nested `holto-chess/README.md`, actual engine/config, tests and current UI instead.
- No repository rename, database migration, ranking/MMR/Elo/season implementation or new production deployment was performed by this follow-up. Existing generated Vite cache edits remain excluded from commits.

## Release Verdict

**NOT READY — broader policy/validation gates remain**

Initial audit: **2 BLOCKER, 0 CRITICAL**. The independent audit added **P-B01**, also a BLOCKER. All three confirmed blockers are **FIXED in `1318827`** (0 still open in these addressed paths); the two critical fixes remain intact. The 2026-09-23 policy follow-up also fixes elimination-order bands and removes spectator READY authority. Staged-payload policy, device/load/fault evidence and the remaining augment decision are still open, so this report does not independently certify release readiness.

The two original known-fault assertions have been replaced with successful-progression and approved-payout regressions. They no longer pass by expecting the old crash or 10/5/5 settlement.

## Executive Summary

- Normal latest-v2 games complete with 2 human + 6 AI, 4 + 4, and 8 humans, including timeout takeover, reconnect and rematch in the actual Workers test runtime.
- A real local HTTP/WebSocket smoke completed R1–R5 with two clients, 40 acknowledged actions and identical final standings. It took 158 seconds; observed action p50/p95 were 34/517 ms, maximum 1312 ms. This is a functional smoke, **not** a capacity benchmark or an Internet latency measurement.
- A separate local one-human + AI game was played through R1–R5 to FINAL RESULT in the browser. The player's displayed 64 total matched 28 points + 8 hand score + 4 augment + floor(242BB/10).
- The two initial release blockers were economic exhaustion crashing showdown and an undefined R4 tied-runner-up payout. User-approved policies now permit empty/incomplete-hand forfeits and pay3P each for a1/2/2 R4 finish.
- Fixed expired SHOP/AUGMENT input, stale action keys across rematches, rematch archive identity, premature R1 points, outdated smoke actions, AI locked-card purchases, previous-BB rank movement, survival summary hands, the Omaha example, guide focus containment and the final-total hover/click conflict.
- Card pool, evaluator, Omaha, split-run, final-score and protocol tests pass on covered cases. This is not a proof that every random game or adversarial input is safe.
- Production candidate `8984da8` is deployed. On 2026-09-23, health/root/SPA `/play` returned HTTP200 and `www` redirected to apex with HTTP301. Remediation `1318827` is not deployed; remaining policy/validation gates are still recorded below.

## Blockers

### B-01 — Legal shop spending can leave an empty hand and crash progression — FIXED

- Original severity: **BLOCKER**. Recovery policy explicitly approved by the user.
- Condition: R1 human sells the initial owned card, then repeatedly pays 3BB to lock/unlock an offered card until fewer than 3BB remain. All commands are currently legal.
- Reproduction: start seeded v2 room `20260922`; sell p1's sole card; repeat `LOCK_SHOP` twice (lock/unlock) while stack >= 3; expire SHOP; expire SHOWDOWN_PRIMARY setup.
- Approved outcome: keep actual held cards (including zero); an incomplete required hand forfeits every match/RUN, with0P/0BB. A legal opponent wins; if all contenders forfeit and advancement is required, use the existing high-card draw for advancement only, still0P/0BB.
- Before fix: automatic preparation left zero hole cards; showdown threw `Partial hand requires between one and four cards`, stopping the normal alarm path.
- Cause: `aiPrepare` may stop when it cannot afford a card. `prepareShowdown` does not require a complete hand for seats delegated to the bot; street evaluation later assumes at least one card.
- Source: `holto-chess/src/game/engine.ts` (`aiPrepare`, `prepareShowdown`, `streetHandFor`), `src/game/room.ts` (`forceBarrier`), `src/core/poker/evaluate.ts`.
- Fix: a below-legal-hand forfeit result, zero awards, safe empty-hand street/elimination snapshots, R2 partial-loadout progression, and next-round draft support. Unaffordable draft timeouts record an explicit no-purchase pick (`cardId:null`, price0), without reserving or inventing a card. Normal early shop confirmation still requires a full hand. No free cards, debt or forced sale rule added.
- Regression: `forfeit.test.ts` covers0 and limit-minus-one in R1–R5, all-forfeit Swiss/survival/brackets/final, draft skips and R5 no hand-bonus rewards. `releaseAudit.test.ts` now completes the original legal spending scenario through GAME_RESULT; `tests/worker/room.test.ts` verifies persisted alarm/broadcast/reconnect behavior. Cinematic tests render empty hands through every frame.

### B-02 — R4 tied-second settlement awards10/5/5 — FIXED

- Original severity: **BLOCKER** (incorrect/ambiguous score settlement). User approved3P per tied runner-up.
- Condition: all three Winner Group players share the regulation best five; a new board separates them into 1st, 2nd and 3rd.
- Reproduction: `src/game/releaseTies.test.ts` supplies a legal shared royal board, followed by a disjoint board on which the three players hold trips A, Q and T. The real evaluator is used, not a mocked winner.
- Approved outcome: the winner-only decider can retain final places `[1,2,2]`, paying `[10,3,3]`. Ordinary distinct `[1,2,3]` retains `[10,5,3]`.
- Before fix: `[1,2,2]` paid `[10,5,5]`. The latest policy resolves this by changing tied-second awards, not by forcing a distinct third place from the decider board.
- Cause: `resolveParticipants` rewrites every losing regulation leader to place 2, and `rewardMatch` pays the place-indexed amount. High-card fallback uses the same collapsing pattern. Non-first ties are also not given an explicit R4 split-pool rule.
- Source: `src/game/engine.ts` (`resolveParticipants`, `rewardMatch`, `resolveSecondary`).
- Fix: centralized `r4WinnerGroup.tiedSecond=3`, engine settlement and shared-place award copy; root README, nested README note and both rule guides updated. No extra decider reward.
- Regression: `releaseTies.test.ts` covers regulation tied seconds, a winner-only extra-board decider, capped high-card fallback and the unchanged distinct10/5/3 ladder; checks player totals and reward deltas, not just display text.

### P-B01 — AI purchase of a locked shop card broke the ownership invariant — FIXED

- Condition: use the R1 reroll, lock both shop cards, leave the hand incomplete and let the shop timer expire with enough BB to buy.
- Before fix: the AI moved a purchased card to `OWNED` but left its ID in `lockedShopCardIds`; `assertPoolIntegrity` rejected the stale reservation and the room could not advance.
- Fix: human and AI purchases share `transferReservedCardToOwned`, which clears the purchased lock and reservation atomically. AI rerolls also require an unlocked or missing slot.
- Regression: `releaseAuditRemediation.test.ts` covers the engine mutation. The Workers suite covers the actual Durable Object alarm, persisted snapshot, broadcast and reconnect path after two locked cards.

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

### M-01 — Rules/documentation disagree — PARTIALLY FIXED

- Reproduce: compare the table in Rules vs Implementation Mismatches with root/nested README and running UI.
- Expected: one approved rule description consistent with behavior. Actual: elimination, R4 shop, final bonus and timing descriptions conflict.
- Cause: old documentation and legacy-v1 tests coexist with v2 code.
- Fix status: R4 draft→shop, final augment score, current online timers/disconnect handling and the incorrect R1 win-streak statement are aligned with code. Unapproved economy/elimination/privacy choices remain documented rather than guessed.
- Validation: source-to-source comparison; future doc assertions should target v2 rule constants.

### M-02 — “승자의 배당” promises a reward R3 does not apply — OPEN

- Condition: choose `win_bonus` after R2, then win an R3 match.
- Expected: approved text should describe its scope accurately. Actual: text promises +5BB on a win; R3's explicit reward branch pays 10BB and bypasses that augment.
- Cause: general augment description versus R3 fixed-win exception.
- Fix status: **DESIGN DECISION REQUIRED**. R3 request explicitly excludes win-streak bonus but does not clearly settle this augment exception. Do not change economy without approval.
- Validation: inspected `augments.ts` and `rewardMatch`; R3 fixed-reward tests pass. Browser confirmed this augment is selectable before R3.

### M-03 — Round guide does not contain keyboard focus — FIXED

- Reproduction: in R2 guide focus “안내 닫기”, press Shift+Tab. Browser focus moved to the background SINGLE / AI button, outside `role=dialog`.
- Expected: modal keeps keyboard focus within its controls and returns focus on close.
- Actual/cause before fix: `RoundGuide` set `aria-modal` but had no focus trap or focus restoration.
- Fix: opening focuses the first dialog control; Tab/Shift+Tab wrap inside the dialog; Escape closes it; unmount restores the prior focus target.
- Regression: TypeScript, lint and server rendering pass. A physical screen-reader audit remains outstanding.

### P-M01 — Previous rank ignored the previous BB tie-break — FIXED

- Before fix: current rank used points→BB→seat, but `previousRank` reconstructed tied points with seat order only, creating false up/down movement.
- Fix: the first reward ledger's `beforeBB` is used after the authoritative `standingsBefore` points snapshot.
- Regression: `roundSummary.test.ts` holds two players tied on points with the higher-BB player first before and after the round; both remain unchanged.

### P-M02 — Survival rematch summary reused first-board hands — FIXED

- Before fix: survivor IDs came from the deciding rematch, but final `results` always copied `boardResults[0]`.
- Fix: each participant's latest actually played board result supplies the displayed hand/used cards, while the existing survivor/elimination places remain authoritative.
- Regression: a legal first-board straight tie followed by a full-house-versus-pair board reports the deciding full house and pair.

### P-M03 — Omaha guide called a legal wheel impossible — FIXED

- Before fix: the guide's A♥/2♦ plus 3♠/4♣/5♠ cards were labelled as a pair despite forming a legal exact-2+3 wheel.
- Fix: the same cards now teach the actual 5-high straight and highlight the evaluator-consistent BEST5.
- Regression: `RoundGuide.test.ts` checks the corrected hand and excludes the old pair/impossible copy.

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
- **N-05 FIXED:** the final total breakdown now uses one explicit click/keyboard toggle. Mouse pointer-enter/leave no longer mutates the same boolean, so the first click cannot immediately close an auto-opened popover. Physical touch testing remains part of device QA.
- Speed/Skip: `ShowdownCinematic` supports controls when requested in its preview, but normal `CinematicGate` hides them; synced multiplayer deliberately cannot skip the server clock. This is a product choice needing explicit acceptance, not an implemented release feature.

## Design Decisions Required

1. **RESOLVED B-01:** progress with current/empty cards and forfeit with no points/BB. The user also explicitly approved high-card advancement when every contender forfeits; no reward for that advancement.
2. **RESOLVED B-02:** R4 final1/2/2 pays10/3/3; distinct1/2/3 pays10/5/3. Existing winner-only decider placement remains.
3. **M-02:** does `win_bonus` apply in R3? Adjust the approved exception text or reward logic, not both speculatively.
4. **Payload reveal policy:** during resolved showdown, PlayerView includes the resolved match boards/hands/results and round summary before the cinematic reveals them. R5 front faces are also mounted but visually hidden. There are no remaining shop/draft choices for that encounter, but this is **not cryptographic/server-timed concealment**. If “hidden until animation time” is a security requirement, this is an additional privacy release gate requiring protocol/presentation design; CSS is insufficient.
5. **RESOLVED spectator input policy:** eliminated viewers never enter `waitingOn` and cannot send an accepted READY action, including when every human is eliminated. The server timer alone advances spectator-only presentation/result barriers.
6. **RESOLVED final elimination ordering:** R5 finalists always occupy 1st-4th by final total. R4 eliminations are frozen into 5th-6th and R3 eliminations into 7th-8th; each elimination band is ordered by points at elimination, with player ID only as a deterministic exact-tie display order.

## Rules vs Implementation Mismatches

| Area | Actual implementation/test evidence | Conflict or audit result |
| --- | --- | --- |
| R1 | Hold'em 2 cards, Swiss 3 matches; +3/+1/0P; wins 10BB with no R1 win-streak bonus, losses 15BB + prior-loss*5 | Match 1 random, later similar records and rematch avoidance where feasible; per-match points fixed. R1 Split is currently treated as rewarded win for BB/streak, unlike R2/R3; document explicitly. |
| R2 | 8-card public draft; points ascending, BB descending, server/seeded RNG for exact ties; all 3 owned cards used via anchor + two distinct secondaries | Current v2 matches requested structure. Old `r2Primary/r2WinnerBracket` config/tests remain for v1 snapshots, not v2 rules. |
| R2 runs | 4/2/0P per run; split 0BB/reset streaks; two boards from one encounter deck excluding all 6 owned cards | No ordinary run split causes a sudden death. Hand identity/AAA/loadout uniqueness covered by tests. |
| R3 | Frozen R1+R2 seed, BB tie-break, 1v2/3v4/5v6/7v8; Swiss 3 games, no 2+2 split; exact Omaha 2+3 | 4/2/0P; win10BB, loss15+5 per prior loss, split0/reset; win bonus augment conflict M-02. |
| R3 elimination | Cumulative-point bottom 2; boundary tie uses Omaha survival; exact 6 remain | Covered by Omaha/draft/survival tests and full-room runs. Deciders do not add normal rewards. |
| R4 | 16-card draft then 2-card personal shop; 5 owned +5 board free BEST5; primary win6/split3 each | Root README now states that R4 keeps the shop after its draft. |
| R4 decider | Split participants both get 3P; up to two extra boards, then rank-only distinct high-card draw selects one Winner Group entrant | No additional decider point award. Winner Group10/5/3, tied seconds each3; Loser Group0. All-forfeit advancement receives no awards; exactly4 remain. |
| R4 elimination | Two Loser Group non-winners eliminated | Root Game Flow incorrectly says R3 and R4 both eliminate cumulative-point bottom players. |
| R5 | Four players;7 owned/no board;3→2→2 reveal;20/12/5/3P; ties use ICM over occupied slots | Competition places use 1,1,3 and no suit tie-break. Tests conserve total40P, including lower-place ties. Some generic ICM test names use old example ladders, not current config. |
| Final score | points + fixed category score + augmentScore + floor(BB/10) | README and UI breakdown now include augmentScore. R5 hand winner is not necessarily overall total-score winner. |
| Final hand scores | High0,Pair1,TwoPair2,Trips5,Straight8,Flush12,FullHouse15,Quads20,StraightFlush30,Royal40 | Engine/config tests agree. Hand/BB snapshot data remains displayable but cannot move an eliminated player outside the approved 5-6 or 7-8 band. |
| Timer | SHOP60s, deal-in3s, human draft20s, bot draft1.8s, loadout30s, setup3s, group10s, result30s, augment30s | NEXT_ROUND settles immediately online; README groups it under30s. Presentation time precedes result confirmation deadline. |
| Local vs online | Local round guide can pause its intro; online phases remain shared server clocks | Do not assume the debug `pauseRoundResultTimer=1` URL tests production timeout behavior. Server deadlines were tested independently. |
| Nested README | Short operator guide | Timer/disconnect wording now reflects the authoritative server barrier and AI takeover; detailed round rules remain in the root README. |
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
- A52-card invariant alone does not establish game liveness. Insufficient owned-card counts now resolve as explicit forfeits instead of evaluator exceptions; ownership stays unchanged until ordinary elimination/release.

## Scoring / Elimination

- Awards are engine/DO mutations; cinematics consume `MatchReward` and do not pay points. Repeated projection and reconnect yield unchanged state; re-resolving an already-completed phase is rejected.
- R3 boundary survival and R4 group deciders have dedicated tests for no extra ordinary point awards and correct survivor counts. R4 tied-second awards now follow the approved3P policy; all-forfeit matches have no score/BB awards.
- R5 ICM uses occupied prize slots for legal tied hands and conserves40P when all four hands are legal. Forfeited placement slots are unpaid, not redistributed. R5 forfeits receive no hand/augment hand bonus; prior points and BB conversion remain. Final total otherwise includes augment bonuses and floors BB/10 without rounding underlying points.
- Final standings are deterministic for a stored state. R5 finalists use total/final-place/hand rules; eliminated players use elimination round and frozen points, then player ID only for an exact tie. Hand-comparison suit neutrality remains separate.
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
- Live viewers have no spectatorViews; eliminated viewers get approved read-only perspectives. Eliminated seats cannot buy or READY, and spectator-only barriers retain viewing time through the server deadline.
- Room snapshot, seed, token hash and ownership ledger are not serialized to PlayerView. Existing hostile identity/card tests pass. UI-hidden resolved-showdown data is not claimed to be payload-secret (decision4).
- Tokens are cryptographically generated, hashed in snapshot, delivered with no-store, and not embedded in WebSocket URLs. Token/Origin/room authorization, bounded frame size and rate caps are present. Routine server logs do not print session tokens.
- Security review here covers these code paths and tests, not a penetration test, infrastructure access audit, dependency-vulnerability certification or proof against colluding spectators.

## Build / Test Results

| Check | Result | Evidence / limitations |
| --- | --- | --- |
| Latest main | PASS | Fetched; base SHA above matched main/origin/main; isolated QA branch. |
| Dependency install | PASS with warnings | `npm install --package-lock=false --no-audit --no-fund`, exit0;22 installed package changes/one removal, no manifest/lockfile edits. Windows held-file cleanup and pending install-script approval warnings. Not a clean-machine npm-ci certification. |
| Baseline unit tests | PASS |47 files /320 tests. |
| Initial audit `npm test` | PASS |49 files /332 tests,58.62s; at that time included two known-fault reproducers. These assertions have now been replaced. |
| Policy follow-up `npm test` | PASS |50 files /357 tests,52.37s; includes the full all-bankrupt-room regression and both approved blocker fixes. |
| Policy follow-up `npm run test:workers` | PASS |1 file /11 tests,17.51s;2/4/8 sockets plus empty-hand alarm persistence/broadcast/reconnect and existing safety tests. |
| Independent-audit remediation `npm test` | PASS |51 files /360 tests,58.06s; AI lock transfer, previous-BB movement, deciding survival hand and guide oracle included. |
| Independent-audit remediation `npm run test:workers` | PASS |1 file /12 tests,12.65s; adds the actual2-lock→timeout→AI purchase→persist/broadcast/reconnect path. |
| `npm run lint` | PASS |exit0. |
| `npm run build` | PASS |Type generation, client and Worker TS, both Vite bundles;exit0. |
| Local v2 WS smoke | PASS |1 room,2 clients,40 actions,158s, reconnect, final standings agree. |
| Local human + AI browser game | PASS for normal loop |R1–R5→FINAL RESULT; final64P breakdown verified. Debug result-review pause enabled; not a timeout certification. |
| Production HTTP | PASS, read-only |2026-09-23 health/root/SPA `/play` all200; `www` returned301 to `https://porena.kr/`. This checks deployed `8984da8`, not remediation `1318827`. |
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
- Policy follow-up: `engine.ts`, `types.ts`, `botStrategy.ts`, `config.ts` implement approved forfeits, draft no-purchase progression and tied-second awards. UI shows a clear forfeit reason and shop warning, with updated rule copy. Only these explicitly approved rules changed; auth architecture and deployment infrastructure were untouched.
- Independent-audit remediation `1318827`: shared human/AI shop transfer, locked-slot reroll guard, previous-BB rank movement, deciding survival hand summaries, evaluator-consistent Omaha guide, modal focus containment and explicit final-score popover interaction. Root/nested README mismatches fixed without changing scoring or elimination policy.

## Regression Tests Added

- `src/game/releaseAudit.test.ts`: deterministic20260922 full v2 timeout loops (2/4/8 humans),52-card integrity, BB>=0,6/4 survivors, immutable projections, final consistency, draft100ms race orders, private R4 views/spectator rejection, R1 score snapshots, SHOP/AUGMENT deadline and stale rematch/game identity; original bankrupt-player case now successfully completes the whole game.
- `src/game/forfeit.test.ts`:18 focused cases for partial/empty hands in all rounds, no-forfeit rewards, bounded advancement, empty elimination, R5 scoring and unaffordable draft skips.
- `src/game/releaseTies.test.ts`:4 legal physical-card fixtures with the real evaluator for approved tied-second and unchanged distinct awards. Mocking is limited to deterministic boards, not scoring/ranking. Old high-card tests now have complete legal hands rather than one R1 card carried into R4.
- `src/ui/cinematicRendering.test.ts`: R1 and R3 pre-match/result point rendering.
- `tests/worker/room.test.ts`: real-runtime2/4/8 socket games, simultaneous READY, reconnect in each reached phase, no ignored obsolete R3 action rejection and all-client final consistency.
- `src/game/releaseAuditRemediation.test.ts`: locked AI purchase invariant and deciding survival-hand summary.
- `src/game/roundSummary.test.ts` / `src/ui/RoundGuide.test.ts`: previous-BB rank movement and exact-2+3 guide result.
- `tests/worker/room.test.ts`: persisted two-lock timeout purchase, broadcast and reconnect regression.

## Known Remaining Risks

- B-01/B-02 are deployed in production candidate `8984da8`. P-B01 and display/accessibility remediations in `1318827` are pushed but not deployed by this request.
- Augment exception and staged-payload secrecy still need explicit approval. Physical-device, load and fault-injection evidence is also outstanding.
- No load/soak benchmark, real Internet reconnection fault injection, distributed failover simulation, power-loss persistence test or multi-browser device lab was run.
- No production game rooms or production player state were modified for this follow-up. Production HTTP smoke confirms route availability, not `1318827` gameplay behavior.
- Existing simulator uses separate policy/test infrastructure; this audit did not claim a1000-game balance run. Rules correctness evidence is scoped to recorded deterministic fixtures, existing tests and executed full games.
- Old rulesVersion1 data is still supported and appears in legacy tests. The release verdict concerns current rulesVersion2, not an instruction to delete backwards compatibility.
- UI/keyboard and physical-device gaps above remain even when source unit tests pass.

## Recommended Pre-Launch Checklist

1. Review the approved B-01 forfeit and P-B01 locked-purchase implementations; exercise both timeout presentations in real mobile browsers before deploying `1318827`.
2. Review the approved R4 tied-second3P regression evidence for regulation ties, extra boards and high-card fallback; verify presentation and four survivors on the deployed candidate.
3. Resolve the remaining design decisions and consolidate root/nested rule documentation. Remove unsupported promises, not backwards-compatible code.
4. Verify the new guide focus containment and final-score click toggle in real browsers; enlarge small touch controls and hide raw card IDs in player-facing selectors.
5. Re-run unit/Workers/lint/build and a freshly served built-artifact smoke after approved changes; test2/4/8 clients on real browsers with network/background throttling and refresh in each important phase.
6. Perform physical iOS/Android and desktop visual checks at the stated sizes, including R5 reveal/glow and final result details.
7. Only after release blockers are closed, authorize deployment with the existing `npm run deploy` workflow. If credentials are missing, use `npx wrangler login` first; no new infrastructure setup is required by this audit.
8. After authorized deployment, check health/assets/SPA and a bounded explicitly authorized production WebSocket game, then inspect operational errors and rollback readiness.
