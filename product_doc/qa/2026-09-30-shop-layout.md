# Shop UI final QA — 2026-09-30

Checkout: `C:\Users\USER\Desktop\holto_chess`, branch `main`, starting HEAD `e17d7be8311f7110ea2f8c9b2d3b9f4d39f18926`. No commit, push or deployment. This is the shop change only; final-round image/loading/reward work has not started.

## Change ownership and review

- `src/ui/App.tsx`: only suppress the phase badge when phase is SHOP. Existing R3+ PrepRoundHeader route remains.
- `src/ui/OnlineApp.tsx`: same badge exclusion using displayView, including its existing spectator route. No message handling, state transition or action changes.
- `src/ui/ResponsivePreview.tsx`: match badge visibility in the existing QA preview; this preview was not used as proof of production App layout.
- `src/ui/responsive.css`: 38 appended lines, all scoped beneath `.game-arena .shop-page`. Header title uses one centered font contract with symmetric help-button clearance; existing help components/content remain. Panel contents wrap at fixed card widths, rather than shrinking with card count. At >=1024px panels use a 2:1 horizontal grid; narrower screens stack. Purchase/sell/lock buttons retain handlers and disabled conditions.
- `tools/shop-layout-audit.mjs`: development-only CDP measurement and fixture injection, uses Node built-ins. Requires dedicated blank Chrome CDP :9239 and React-only local Vite :5189. Run from an artifact directory; output JSON/PNG files go to the current directory. It closes its dedicated browser when done. React dev Fiber internals make this a development QA tool, not a stable production API.
- This document records verification. No dependency, lockfile, game/economy, server, score, ability or non-shop animation changes were made by this task.

Pre-existing changes in engine, translations, ability documents, TODO/DECISIONS, prior QA documents, capitalism tests/QA, .wrangler-config and varco-export were preserved. They are outside this UI diff. Final review found no unexpected product behavior change in this task. The new CSS cannot match ordinary non-shop pages because every selector requires shop-page; direct runtime regression across every other phase was not performed.

## Baseline and measured result

Before edits, App R1 used the general header while R3+ SHOP used PrepRoundHeader; OnlineApp used the general header. Baseline tests: 80 files / 576 tests passed. Baseline lint: one error at OnlineApp.tsx:94:49 (see below).

The old CSS was temporarily installed into the same fixture DOM for an isolated before/after layout comparison, then restored. This comparison is not an untouched historical build (the header badge exclusion was already present). At 1280x720, R5 maximum-card fixture:

| Measurement | Previous CSS | Final CSS |
|---|---:|---:|
| Panel arrangement | stacked | two columns |
| Document height | 1147px | 720px |
| Owned card | 79 x 111.78px | 88 x 124.52px |
| Market card | 100 x 141.50px | 88 x 124.52px |

Final single/online R1/R3/R4/R5 share title typography and centering. 360x780: h1 22px / 23.1px, weight 700, letter-spacing -0.77px, Georgia/Times New Roman/serif; centered at x=180. PC: 58px / 60.9px, spacing -2.03px. Existing round-specific title text is preserved. R1 ROUND 01 and later local prep ROUND 3 numbering format remains intentional existing content.

Cards in both panels: <=768px 62 x 87.73px; 769–1023px 79 x 111.79px; >=1024px 88 x 124.52px. Fixed 53:75 ratio; increased count wraps without shrinking. At 1023px panels stack; 1024px they share a row. Desktop 1280x720 and 1440x900 tested fixtures require no page scroll. Mobile maximum R5 (7 owned, 3 market) does require vertical scrolling: local document 834px, online 889px at 360x780. This preserves card size/readability. Sale/lock/purchase minimum height 36px; reroll 40px.

## Execution evidence and limitations

Actual installed Chrome on the user's PC, separate headless QA profile; existing browser tabs were not used. Production App and OnlineApp components were mounted through local React-only Vite. State came from existing QA fixtures; these were not naturally played matches. Online WebSocket room traffic and clock responses were mocked; no production rooms/data or live online service were exercised.

128 combinations passed: single/online x ko-KR/en-US x 360x780, 390x844, 768x1024, 769x1024, 1023x800, 1024x800, 1280x720, 1440x900 x R1/R3/R4/R5. Fixtures use hand limits 2/4/5/7 and abilityShopSize for golden-hand (3 market cards). Assertions cover title axis, badge absence, equal card dimensions, horizontal overflow, panel overlap, desktop scroll and breakpoint behavior. Eight additional mobile cases passed. Eight help and eight sale-dialog checks passed at 360/1280 for R1/R3. Long Korean and unbroken English title DOM stress passed at 360px. Representative maximum-card desktop/mobile screenshots were visually re-reviewed.

Artifacts: `C:\Users\USER\Documents\Codex\2026-09-30\task` contains shop-ui-measurements.json (128, errors 0), shop-ui-mobile-extra.json (8, errors 0), shop-ui-interactions.json, shop-ui-stress.json, shop-ui-before-css-measurements.json, after-local/online-r1/r5-360/1280/1440.png and after-help-local/online.png. Baseline and final test/lint/build logs are retained there.

Unverified: physical mobile/Safari/notch safe area, live online connection/spectator/reconnection, a natural full-game playthrough, actual buy/sell/reroll transactions. Long nickname was injected into fixture state but the regular shop does not display it; spectator nickname layout was not exercised. HTTPS was blocked in browser QA, so network-loaded webfonts were not verified. Mobile lower controls are reachable by scrolling; screenshots are viewport captures, not full-page proof.

## Final checks

- npm test: 80 files, 576 tests passed (after-tests.log; baseline same counts).
- npm run test:workers: 2 files, 22 tests passed (after-workers.log).
- npm run build: passed, including cf-typegen, tsc -b, worker TypeScript and Vite production build (final-build.log).
- node --check tools/shop-layout-audit.mjs and git diff --check: passed.
- npm run lint: FAILED, 1 existing error, 0 warnings. Overall verification is not fully green.

Exact lint rule: `react-hooks/set-state-in-effect`, OnlineApp.tsx:94:49. The existing effect synchronously calls setPendingSale(null) when view.phase leaves SHOP, causing the extra render forbidden by this rule. The same line is in starting HEAD and both baseline-lint.log and after-lint.log show the same diagnostic. It was not changed: removal or moving cleanup to network/state handlers could retain a stale sale selection or change transition timing; hiding the diagnostic would not verify behavior preservation. A dedicated cleanup change needs transition/reconnection coverage.

Recommended commit: `fix(ui): center shop titles and align desktop shop cards`. Stage only the owned files above after approval; do not include pre-existing game/ability changes.
