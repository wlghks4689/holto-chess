# Localization Report — 2026-09-26

## Scope and status

The existing typed `src/i18n` architecture remains the source of truth. Korean and English each have **697 keys** (404 added to the original 293-key base). Automated parity, empty-value, placeholder, leakage, browser-detection, and persistence checks pass. No additional locale or game rule was introduced.

I18N-001 and I18N-002 code migrations are implemented. One mixed-locale multiplayer run reached R5 and exercised reconnect/spectator behavior. Release-level QA remains **NOT VERIFIED**: the Korean participant was eliminated after R3 (then observed R4/R5), a second full Korean participant run was not completed, five genuine responsive viewport sizes were not verified, and native-speaker review remains open.

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

- Automated: 463 app tests and 13 Worker tests pass; `npm run lint` and `npm run build` (including TypeScript checks) pass. The full-suite locale-neutral R1–R5 simulation uses a 60-second test limit because concurrent suites occasionally exceeded the previous 30-second default; it passed on the final full run. Worker tests emit a Wrangler debug-log `EPERM` warning in the sandbox, but the suite passes.
- Seeded online-room simulation: the same room/seed was advanced R1→R5 in each locale; game snapshots and final placements matched. Legacy log JSON round-trip passed. This is automated logic QA, **not** a manual multiplayer playthrough.
- Browser: desktop-size ko/en Home, Settings, Game Guide, preview scenes, tutorial, lobby, and live online R1/R2 were exercised. The in-app browser's viewport override returned successfully but `window.innerWidth` remained 1280px (including a newly opened tab). Therefore the previously recorded five-size responsive sweep was invalid and is **NOT VERIFIED**; no mobile/tablet pass is claimed. No font-size-only fit workaround was used.
- Live online room `V3SPRJ`: one Korean and one English human joined the same local Worker room. Both played R1–R3; the Korean seat was eliminated before R4 and observed the English seat through R5. The English seat completed R1–R5 and reached the final standings. Both clients briefly returned to the lobby after source hot reload, then rejoined their saved seats; room state and the current phase were restored. The R4 bracket, showdown, and R5 final standings aligned across the two locales. All eight final placements and score components matched. English→Korean→English switching on the final standings kept the room and eight results unchanged.
- Language switch: en survived reload; a second tab received ko via storage sync. In a live single-player R1 shop, switching ko→en preserved the owned cards, visible shop card, and 30BB stack; an existing structured purchase log re-rendered in English.
- **NOT VERIFIED:** a Korean human participant surviving through R5, all listed scenes in both locales (especially error states and every tiebreak variant), five real mobile/tablet/desktop viewports, and language switches during Draft and live Showdown. These are release gates, not inferred passes.

## Terminology and review

See `LOCALIZATION_GLOSSARY.md` for fixed terms and `TRANSLATION_REVIEW_REQUIRED.md` for remaining product/natural-language decisions. Internal poker enums and card IDs remain unchanged. Augment is historical only and was not reintroduced.
