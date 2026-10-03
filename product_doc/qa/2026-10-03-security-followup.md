# Security follow-up — 2026-10-03

Status: SEC-001/002/003/004/006 implemented and automatically verified in the isolated clone. Independent review/integration and manual browser playback remain pending. SEC-005 remains unresolved. This is not a full-safe or release-ready verdict.

## Target, authorization and boundaries

- Actual execution path: `C:/Users/USER/Documents/Codex/2026-10-02/task-2/security-review`; branch `fix/security-disclosure-002-003-006`; base/unchanged HEAD `09dfdef03f6136f2558c3f457849e2b6ed944db3`.
- The parent relayed and reconfirmed user approval for shop-entry BB visibility, public-time-only metadata with delayed-packet hold, and short-lived one-use existing-seat connection proof. SEC-002/003 were preserved.
- No commit, stage, push, deploy, production attack, main edits, dependency changes, game-rule/balance changes, or IP-per-person restriction. The copied source audit remains historical evidence, not a description of the final implementation.
- A resumed turn briefly followed historical CrazyGames context before the parent corrected the target. CG checks are excluded from all security results below. No CG source/index/commit/deployment mutation occurred. Its dedicated local browser/server were cleaned up. Security checks thereafter used the explicit security-review workdir.

## SEC-001: shop economy projection

- Capture server-only `shopPublicBB` on entry to SHOP, clear it when SHOP ends. Self BB is immediate; other seats' `players` and spectator private perspectives use entry BB until the last commit transitions the phase. Server accounting and purchase prices are unchanged.
- Regression covers buy, sell, commit/cancel, serialization/migration, final commit release and spectator balance projection.
- Old persisted mid-shop rooms have no historical entry baseline. Migration freezes their current balances; it cannot undo already disclosed pre-upgrade purchases. The test and approved decision explicitly record this limit.

## SEC-002/003: preserved disclosure fixes

- Normalize initial/after-run standings to each seat's before-reward ledger for the current stage/matchday. Only the viewer's table can disclose its updated rewards; completed history remains complete.
- Retain a server-only pre-resolution player snapshot during the current round's presentation. Private hand/shop/selection fields stay consistent with the public alive state until the shared end. Legacy saves recover known hand IDs and omit cleared selection/shop fields consistently.
- Coverage: eight viewers, R1/R3, alternate private outcomes, serialization/reconnect equality, exact shared-end boundary, and real eliminated-card pool release. Engine/reward computation is unchanged.

## SEC-004: prefix metadata and opaque action epochs

- Keep full authoritative schedules on the server. Public frames contain only the already authorized prefix. Future runout/decider counts, extra board arrays, tiebreak kinds, durations/offsets and actual shared endsAt are withheld until their public boundary.
- Current frame duration is disclosed for its existing countdown/animation. RUN_RESULT may publicly announce the next closed board, never the total hidden future run count. Subsequent match offset is released at the existing inter-match countdown boundary. No artificial padding, decider removal or timing changes.
- Prefix presentation version is 13. `endsAt=0` before completion, explicit completion gates results, and the client keeps the last authorized frame when packets arrive late. Future-entry metadata without its match payload cannot advance the scene. Server alarms publish reveal/completion/countdown boundaries.
- Public action `turnKey` is a cryptographically random 64-hex epoch. Internal round/phase/generation/encounter counters stay on the server; the Worker validates the public epoch before translating to the existing internal turn key. The parser retains strict legacy syntax for local fixtures; production views carry opaque epochs.
- Counterfactual tests compare eight initial payloads after changing a hidden table's decider and internal encounter count; final-placement/extra-runout variants are equal before disclosure. Runtime WebSocket tests assert opaque equal-room epochs. Completion boundary, old-save migration, reconnection and spectator projection regressions remain covered.
- UI rendering checks every authoritative frame of R2 split runs, R4 extra-board/high-card decisions and R5 placements after serialization, with a deliberately advanced client clock. They preserve each latest authorized phase. A separate gate test preserves delayed-packet holds and only releases result children on server completion.
- The R3 reconnect regression formerly expected all three future offsets immediately. It now checks one initial prefix entry/hidden end and all three entries at completion; internal full scheduling checks remain.
- These are server/runtime and React static-render regressions. They are not manual visual/audio playback or a real browser network-delay recording.

## SEC-006: bounded connection proof and reconnect capacity

- Origin-checked POST with existing seat credentials mints a random 30-second, one-use ticket; durable storage contains only its SHA-256 digest/expiry, with one outstanding ticket per seat. It is returned with no-store and carried in Sec-WebSocket-Protocol alongside porena-v1, never in a URL.
- Consume under the existing Durable Object concurrency guard before accepting. Persist consumption across hibernation; bind the proof to its room and seat; reject a mismatched JOIN_ROOM token. Replace only the same seat's older verified pending socket.
- Keep eight unverified legacy pending slots and the existing total limit 24. Authenticated reconnect capacity is protected; existing Origin/IP/message checks are unchanged. Ticket expiry and room expiry use durable alarms and clean up the ticket map.
- A proven-seat upgrade applies the new legacy bound to old rooms retaining 24 unauthenticated sockets. Keep the oldest eight and close only excess unverified legacy sockets, then accept the proven seat. Current authenticated seats are preserved. This migration fixture exercises actual hibernatable server sockets locally, not an actual old production deployment.
- Six ticket regressions: shared-IP eight seats with authenticated plus verified-pending capacity/reconnect, invalid/foreign-origin/malformed/cross-room/mismatched-seat proof, old 24-pending state, concurrent use/hibernation replay, superseded/expired one-per-seat proof, and authentication-timeout cleanup.

### Timeout diagnosis and correction

The prior 20-second failure reproduced in isolation. Instrumentation localized it to the second evictDurableObject after concurrent responses had already returned 101/401 and storage was empty. Adding JOIN_ROOM did not resolve it. The rejected 401 response body was left unread; workerd eviction waited for that HTTP request to finish. Draining non-WebSocket response bodies in the test helper resolved the hang without changing runtime locks, deleting assertions, skipping tests or increasing timeouts. The test still performs actual eviction before use and after consumption, then checks replay rejection. Temporary diagnostic console lines were removed.

The old-24 fixture also initially violated Worker I/O ownership by accepting/closing a socket from a different Durable Object context. The final fixture constructs/accepts/cleans up its legacy server sockets inside runInDurableObject. No production workaround was added for that fixture error.

## Final verification

- `holto-chess: npx vitest run --maxWorkers=2`: 94 files / 647 tests pass (final run, 71.13 seconds).
- Root `npm run test:workers`: initial final product verification 6 files / 39 tests pass (19.29 seconds); additional same-IP ticket/full-prefix integration final run 6 files / 40 tests pass (70.81 seconds). Includes 2/4/8-seat runtime games, spectator/reconnect/retention and ticket regressions.
- `npm run lint`: pass after final test edits.
- `npx tsc -b`, `npx tsc -p tsconfig.worker.json`: pass after final test edits.
- Root `npm run build`: pass once after final product edits, including cf-typegen, app/Worker types and Vite production build. Later edits only added/updated tests and documentation; standalone types/lint were rechecked.
- `git diff --check`: pass. No dependency, core evaluator, engine.ts or balance config diff.
- Earlier intermediate failures (Worker opaque-key parser mismatch, unread-response eviction timeout, old-socket fixture I/O ownership, old R3 future-entry expectation) are superseded by the final passing runs. The historical JSON failure artifact is not a final result.
- Local tests emitted missing-production-admin-secret and sandbox export-static-analysis warnings. Runtime tests exited 0; the production build and type checks succeeded. No secret values were read/set and no dependencies upgraded. Logs use task-2/security-evidence where configured.

## Remaining limitations and integration

### Additional local protocol integration (2026-10-03)

- Browser support discovery: no callable browser/node_repl/computer tool or executor browser skill; project `playwright` module is unavailable. Existing tools/multiplayer-audit.mjs requires Playwright. Its old secure-mode and termination conditions compare serverNow/Date.now against endsAt and do not handle prefix endsAt=0, so it is not valid evidence for this protocol without updating its checks. No package installation or ad hoc browser-control workaround was used.
- Extended the existing Cloudflare runtime full-game test with eight ticket-based clients all sending the same CF-Connecting-IP. They create/join, pick abilities/cards, purchase/commit, progress R1-R5, wait for final eligibility, agree on all eight standings, and rematch. Legacy 2/4/8-client runs remain present.
- For every existing authoritative cinematic frame and additional pre-entry/end boundaries, the test moves only the stored schedule epoch and uses the real alarm/broadcast path. True server outcomes, per-entry offsets and durations are retained; no fabricated match results or client GAME_RESULT fixture. Each of the eight received payloads checks completion against its actual serverNow, withholding aggregate history/results and future frames until permitted. This is accelerated-clock integration, not normal-duration browser play.
- Coverage also includes next-match entry, shorter-table waiting, hidden spectator hands/shops, reconnect at reached phases, and closing an active socket during a partial cinematic before minting a fresh ticket and reconnecting. The in-progress reconnect preserves the current hand/action epoch/match IDs. This is immediate protocol reconnection, not a measured browser UI retry/backoff.
- Initial isolated full run passed with 223 boundary samples / 1784 received views. A later full-suite run observed 208 boundaries / 1664 views, 36 distinct match entries across presentations, 20 reconnect phases, shorter-table waiting, spectators and in-cinematic disconnect/reconnect, but its subsequent end-100ms early-final assertion raced the real clock and failed. It was corrected by checking premature FINAL_RESULTS_VIEWED near the final's beginning; post-boundary acceptance is legal. Boundary assertions use received serverNow, not the earlier intended harness timestamp. Counts depend on secure random game outcomes and are not fixed requirements.
- Only test code was changed for this extension. Product code, dependencies and timing constants were untouched. Mounted UI infinite-wait/early-exit, rendering/audio quality, real browser disconnection delays and tab suspension remain unverified. Existing React rendering/gate regressions are separate evidence.
- After the corrected early-final check, the entire Worker suite passes 40/40. The successful integration asserts more than 100 public-time samples, eight-client agreement, in-cinematic disconnect/reconnect, spectator observation and more than 10 actual match entries, then finishes final release and rematch. Additional lint and Worker type checks pass; app/build results above remain the final unchanged-product validation.
- Latest read-only original-main check still has HEAD 09dfdef but now also includes another Codex's App.tsx/OnlineApp.tsx/ShowdownPrepPanel.tsx/locales and new HandScoreDisclosure files. In particular OnlineApp.tsx overlaps this security branch: integrate that file deliberately, never overwrite the original with the clone wholesale. No original files were changed by this task.

### Old mid-shop fallback and transition proposal (read-only analysis)

- With no valid `shopPublicBB` snapshot, playerView falls back to the authoritative current stackBB. Production constructor migration captures that actual balance and persists it as this shop's frozen baseline; it does not reconstruct the shop-entry amount.
- Example: entry 50BB, pre-upgrade purchase 15BB, actual balance 35BB. Migration freezes 35BB. An opponent who last saw 50 can still infer the pre-migration 15BB net spend from the first new view. A later 10BB purchase changes the owner's actual balance to 25 but opponents stay at 35 until all commit. The next SHOP captures a true entry baseline normally.
- Exposure is historical pre-migration activity in the currently active shop, including a newly revealed aggregate migration balance. Previously learned price/card information cannot be revoked and can remain useful while that hand stays private. Further live changes in that shop are frozen after migration. New rooms and subsequent shop entries receive the complete entry-baseline protection. Timing is the room's first new-code activation, not a guaranteed atomic global deploy timestamp.
- No settlement effect: migration adds only a projection snapshot. It does not refund/recharge, alter card ownership, recompute prices, change purchases/BB/rewards, or restore money to 50. Gameplay accounting stays authoritative.
- Proposal only: preserve current games with this documented one-shop transition, apply full protection from creation to new rooms and from the next shop to existing rooms. If historical leakage is unacceptable, drain existing games naturally before switching, or design separate old/new room versions (additional routing/operations work). Do not estimate/rewrite historical balances or reset ongoing games. No transition, deployment, room closure, routing or operational action was performed.

- SEC-005: seat authority is not unique-person identity. No one-seat-per-IP policy. Shared-IP eight-seat behavior is tested; competitive identity/host-approval policy is still a product decision.
- Manual supported-browser full cinematic/audio playback, real tab suspension/network-delay behavior, Discord Activity and production deployment are unverified in this security review. Automatic React frame rendering does not establish those outcomes.
- Existing stored mid-shop state cannot reconstruct historical entry BB. Legacy clients retain JOIN_ROOM access but must honor the new version/opaque epoch when receiving current views; manual stale-client rollout remains unverified.
- Room creation/join IP rate limiting still applies; proof-based room socket capacity does not remove deliberate saturation of that independent limiter.
- Original Desktop main was rechecked read-only: HEAD 09dfdef, unrelated ShopCard.tsx/ShopCard.test.ts/responsive.css/tutorial.css and TODO edits preserved, plus existing audit/handoff/config/export untracked files. Do not copy this clone's whole TODO or integrate wholesale over concurrent work.
- Final changes remain unstaged and uncommitted. Review/integrate against the current main, preserve concurrent edits, then obtain separate publication authorization.

## Authorized main integration — 2026-10-03

- User explicitly authorized committing and pushing the completed security work to main (message Sentinel_0fb0224774f48191a5d0d84a022a8406). Manual deployment remains outside this action.
- Integration base: remote main 066045fbb5c53a25576f923af08e4cd14676fd18. Preserve its R5 public hand-score disclosure, shop/focus/draft UI, and RUN 2 CARD_SWITCH_SETTLE 1000ms.
- Prefix protocol version is now 14, distinguishing it from main version 13; existing version-mismatch reload behavior is preserved. No new animation timing or game-rule change.
- Original main retains its uncommitted ShowdownPrepPanel edit/config/export/handoff files. CG worktree is untouched by this integration. SEC-005 and manual browser limitations above remain unresolved.

- Integrated verification at base 066045f: app 95 files / 666 tests, 665 passed and seed-1 openDraft timed out at the unchanged 30-second limit (full run 407.08s). Isolated exact failed test passed in 18.15s with no code, assertion or timeout changes. Workers 6 files / 40 tests passed (80.73s); lint and build including app/Worker types passed. Diff checks passed.
- Remote advanced again to 2d4b9887c1491dfcde2f932c509291dea2ae3f17 before publication; its final-hand name color UI and tests will be preserved by ordinary merge, with post-merge verification recorded below.

- Post-merge app run: 95 files / 667 tests, 666 passed and releaseAudit empty-hand final-game case timed out at the unchanged 30-second limit (418.39s). The exact failed case passed alone in 8.24s; original seed-1 openDraft passed in this full run. No timeout, assertion or gameplay change. Post-merge lint and build including both TypeScript projects passed. A serial full-app run is used to obtain a clean aggregate result.

- Final post-merge aggregate verification: npx vitest run --maxWorkers=1, 95 files / 667 tests PASS (305.38s). All original timeouts and assertions unchanged. Worker 6 files / 40 tests PASS on the integrated prefix/version-14 product code; the subsequent 2d4b988 merge changes only cinematic UI/CSS/tests/docs. Final lint, production build including app/Worker types, and staged/unstaged diff checks PASS.
- Final source scope relative to latest remote 2d4b988: approved security projections, prefix metadata/action epochs, reconnect tickets, regressions and security records only; no engine.ts, balance config or dependency changes. SEC-005 and manual supported-browser/production rollout checks remain open.
