# Localization Report — 2026-09-26

## Scope and status

The existing typed `src/i18n` architecture remains the source of truth. Korean and English each have **697 keys** (404 added to the original 293-key base). Automated parity, empty-value, placeholder, leakage, browser-detection, and persistence checks pass. No additional locale or game rule was introduced.

I18N-001 and I18N-002 code migrations are implemented. One mixed-locale multiplayer run reached R5 and exercised reconnect/spectator behavior. Release-level QA remains **NOT VERIFIED**: the Korean participant was eliminated after R3 (then observed R4/R5), a second full Korean participant run was not completed, five genuine responsive viewport sizes were not verified, and native-speaker review remains open.

The user requested and authorized release despite these remaining QA gaps. Code commit `4b258ae` was pushed to `origin/main` and deployed to Cloudflare Worker `porena` as Version ID `32d66834-bd57-495f-bd9b-c39c43c065a3`; the health endpoint returned HTTP 200 and the live HTML referenced the new client asset. Deployment does not change the NOT VERIFIED items into passes.

## UI coverage

Home, settings, guide, local and online game, lobby, shop, draft, R2 loadout, showdown and preparation, round results, survival, spectator, reconnect, final standings, match history, tutorial, dialogs, tooltips, empty/waiting states, and accessibility labels use the current locale. Tutorial chapter source data stays Korean for the Korean path; `src/tutorial/englishCopy.ts` provides complete English chapter/step copy without changing lesson logic.

There are **56 Korean-containing TSX lines** under `src/ui` after migration (down from the initial audit of about 285). The audit found **0 unlocalized production user-facing Korean strings in those TSX files**. The 56 lines are developer previews/fixtures (51), internal hand-result sentinel comparisons (3), the intentional native language label `한국어` (1), and the default human nickname chosen from locale (1). This is a source audit, not a guarantee that every runtime path was visually exercised. Other Korean `.ts` text is classified below.

| File / group | String example | Classification | Action |
| --- | --- | --- | --- |
| `src/ui/DraftPreview.tsx`, `FxPreview.tsx`, `ShowdownCardPreview.tsx` | preview player names, controls, sound labels | DEV_ONLY | Kept for local QA routes; production game flow does not mount these views. |
| `src/ui/StartScreen.tsx` | `한국어` | ALLOWED_INTERNAL | Native language name in locale picker. |
| `src/ui/OnlineApp.tsx` | `플레이어` fallback nickname | ALLOWED_INTERNAL | Human nickname default only; AI names and identities were not changed. |
| `ShowdownCinematic.tsx`, `ShowdownHand.tsx`, `handLabel.ts`, `madeTone.ts`, `madeFxClasses.ts`, `madeSound.ts` | `몰수패`, hand category names | ALLOWED_INTERNAL | Existing engine/display-name matching; UI labels are translated. Sound names surface only in dev preview. |
| `src/ui/prepPresentation.ts` | Korean rule data | ALLOWED_INTERNAL | Production `PrepPhase` renders matching typed translation keys; legacy data retained for compatible tests. |
| `src/ui/playerEventFeed.ts`, `rewardDetail.ts` | Korean legacy log/detail patterns | ALLOWED_INTERNAL | Parse persisted old data, render structured/new content through locale keys. |
| `src/ui/finalResultArchive.ts`, `roomInvite.ts`, `survivalReadyPresentation.ts` | Korean exceptions / old action label | LEGACY | Exceptions are caught and localized at UI boundary; old action helper is not mounted in production. |
| `src/game/engine.ts`, `room.ts`, `shared/gameErrorCode.ts` | Korean engine errors and old log message | ALLOWED_INTERNAL | Backward-compatible message retained; new wire code and structured log events drive client localization. |
| `src/tutorial/chapters.ts`, `showdownExplainer.ts`, `rankWord.ts` | Korean tutorial copy | ALLOWED_INTERNAL | Korean lesson source and native hand explanation; English overlay/branch covers the same chapter IDs and beats. |

## Server errors and player log

`ServerMessage.ERROR` now carries a stable semantic `code` and optional `params` while retaining `message` for older clients. `GameRoom` maps existing engine/room rejection messages at the boundary without changing rejection conditions. The client translates known codes, classifies legacy `ACTION_REJECTED`/`UNAUTHORIZED` frames where possible, and falls back to legacy `message` for unknown future codes. The stable inventory is in `src/shared/gameErrorCode.ts`.

`GameLog` retains required `message` and adds optional `event`, `params`, and `playerId`; new engine events populate both forms. The player feed translates structured entries at render time, including after a locale change. Old snapshots containing only `message` remain readable and display the original text. The snapshot version was not changed; these fields are optional, so reconnect to an old `RoomSnapshot` does not require a destructive migration. `message` is deliberately not removed in this release.

## QA evidence

- Automated: 463 app tests and 13 Worker tests pass; `npm run lint` and `npm run build` (including TypeScript checks) pass. The full-suite locale-neutral full-game simulation uses a 60-second test limit because concurrent suites occasionally exceeded the previous 30-second default; it passed on the final full run. Worker tests emit a Wrangler debug-log `EPERM` warning in the sandbox, but the suite passes.
- Seeded online-room simulation: the same room/seed was advanced R1→R5 in each locale; game snapshots and final placements matched. Legacy log JSON round-trip passed. This is automated logic QA, **not** a manual multiplayer playthrough.
- Browser: desktop-size ko/en Home, Settings, Game Guide, preview scenes, tutorial, lobby, and live online R1/R2 were exercised. The in-app browser's viewport override returned successfully but `window.innerWidth` remained 1280px (including a newly opened tab). Therefore the previously recorded five-size responsive sweep was invalid and is **NOT VERIFIED**; no mobile/tablet pass is claimed. No font-size-only fit workaround was used.
- Live online room `V3SPRJ`: one Korean and one English human joined the same local Worker room. Both played R1–R3; the Korean seat was eliminated before R4 and observed the English seat to the end. The English seat completed every round and reached the final standings. Both clients briefly returned to the lobby after source hot reload, then rejoined their saved seats; room state and the current phase were restored. The R4 bracket, showdown, and R5 final standings aligned across the two locales. All eight final placements and score components matched. English→Korean→English switching on the final standings kept the room and eight results unchanged.
- Language switch: en survived reload; a second tab received ko via storage sync. In a live single-player R1 shop, switching ko→en preserved the owned cards, visible shop card, and 30BB stack; an existing structured purchase log re-rendered in English.
- **NOT VERIFIED:** a Korean human participant surviving through R5, all listed scenes in both locales (especially error states and every tiebreak variant), five real mobile/tablet/desktop viewports, and language switches during Draft and live Showdown. These are release gates, not inferred passes.

## Terminology and review

See `LOCALIZATION_GLOSSARY.md` for fixed terms and `TRANSLATION_REVIEW_REQUIRED.md` for remaining product/natural-language decisions. Internal poker enums and card IDs remain unchanged. Augment is historical only and was not reintroduced.

## Home language buttons and copy audit — 2026-10-13

Base checkout for implementation QA: `main` at `781e141`. No commit, push or deployment had been performed at that point. The historical 2026-09-26 evidence above remains a separate run.

- Replaced the settings language select with always-visible `한국어 / English` buttons at the top of `StartScreen`. They appear during account loading, anonymous/unavailable sign-in, initial nickname setup, guest home and authenticated home. Native language names, `lang`, keyboard-operable buttons and `aria-pressed` communicate the current selection. Existing browser detection, persistence and document language remain in use.
- The account controls stay beside the language buttons when space permits and wrap on smaller screens. On short phones the title/menu use normal vertical layout so all six menu buttons and legal links remain separate; scrolling is allowed when content is taller than the viewport.
- Fixed the R5 `OPPONENT_CHOSEN` log's untranslated built-in opponent name. The presentation helper now translates `params.opponent` as well as `params.player`, without changing the saved game state.
- Reviewed the English resources, tutorial and guide against current implementation. Corrected obsolete ability-card notes (R3 auction, no shops in R2/R3, interest through R6), Target Sniper's BEST 5 requirement and resale behavior, per-RUN reward notes, and Protector's percentage ranges. Corrected tutorial auction increments/timing from current configuration and R5 card reveal timing, removed the obsolete boardless R6 summary, and aligned the guide's English lead-card term. Korean copy was corrected alongside English where it described the same obsolete rules. Guide BB income copy now describes match rewards rather than claiming ordinary wins earn BB.
- Current resources have **952 keys per locale**. Parity, nonempty English values, matching placeholders, server error coverage and English resource leakage checks pass. An AST audit of production TSX (excluding administrator/dev-preview/test files) found only the two intentional `한국어` button labels and the internal `몰수패` sentinel outside explicit bilingual branches. This does not prove every dynamic runtime payload is translated. English guide and tutorial coverage tests also pass.

### Validation

- `npm test -- src/i18n src/ui/AccountLogin.test.ts src/ui/botNames.test.ts src/tutorial`: **10 files / 43 tests passed**, including locale-neutral tournament simulation.
- Follow-up `npm test -- src/ui/guide/guideRules.test.ts src/tutorial/englishCopy.test.ts src/ui/botNames.test.ts src/i18n/i18n.test.ts src/ui/AccountLogin.test.ts`: **5 files / 22 tests passed**. These overlap the earlier run and are not counted as 65 unique tests.
- TypeScript, ESLint for all changed TS/TSX files, production `npm run build` and `git diff --check`: passed. Build warns about missing local auth/admin secrets and the existing large client chunk.
- Browser: English non-login screen and Korean/English guest home at **375×667, 390×844, 768×1024, 1280×720, 1440×900**. Read back actual `innerWidth/innerHeight`; no horizontal overflow. Both home locales had no topbar/title/menu/footer overlap. English selection survived reload; button selection and `document.lang` changed immediately. Settings no longer contain the language select.
- English game-guide chooser rendered in English; its only Korean body text was the intentional native language-button label in the inert home underneath. All 12 English ability reverse faces were checked at 390×844; no list item exceeded its text area. Development-preview controls/captions remain Korean by design.
- Browser captures: `language-home-desktop.jpg`, `language-home-mobile.jpg`, `language-login-desktop.jpg` in the chat's visualization output directory.

### Remaining limitations

The sandboxed Worker startup and Vitest temp-file rename initially failed with permission errors. The supported frontend-only server and permitted local test/build execution completed the UI checks; a subsequent Worker server could start, but local account verification remained unavailable. Actual Google sign-in, authenticated-home visual inspection and initial nickname setup in a live authenticated session were **not** exercised; the latter two states are covered by component rendering tests. No credentials or database configuration were changed.

Human nicknames are user content and may remain Korean. Persisted legacy message-only logs and unknown future server error payloads retain their original fallback text; they are not retroactively translated by this change. Full online R1–R6 playthrough in both locales, all error/tiebreak branches and independent native-speaker review remain open. The five-size pass here is scoped to entry/home, not every game screen.

### Main delivery validation — 2026-10-13

The user authorized committing and pushing this work to `main`. A fresh fetch found five newer commits ending at `32cd8ee`; the language change was rebased onto them without conflicts. The newer game-introduction link, search metadata and solo-RP policy were preserved. Only this feature's 13 source/test/document files are included; pre-existing untracked `assets/` and `product_doc/crowdfunding/` remain outside the commit.

After integration, `npm test -- src/i18n src/ui/AccountLogin.test.ts src/ui/botNames.test.ts src/tutorial src/ui/guide/guideRules.test.ts src/shared/searchMetadata.test.ts` passed **12 files / 54 tests**. Changed-file ESLint, `git diff --check` and a fresh production build passed. The English login screen was rechecked at a measured 375×667 viewport with the new About link retained: document width 375px, footer width 335.8px, and no horizontal overflow. This integration check does not replace the remaining full-flow/native-speaker gates. No manual Worker deployment is part of the delivery; automatic deployment status is checked separately after the push.
