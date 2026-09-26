# Translation Review Required — 2026-09-25

| Item | Status | Current choice / next decision |
| --- | --- | --- |
| R1 “Classic Hold'em”, R3 “Omaha Swiss Stage”, R4 “Best Five of Ten”, R5 “The Ultimate Five” | KEEP_REVIEW | Branded English round names need product-owner approval. Gameplay terminology is already clear. |
| R2 대표 카드 → “Lead card” | KEEP_REVIEW | Confirm whether “lead”, “anchor”, or “primary” best reflects intended player language. Current UI uses “Lead card”. |
| R4 패자조 → “Survival bracket” | RESOLVED | This distinguishes the elimination purpose from a conventional losers' bracket and follows the glossary. |
| 누적 승점 → “Round points” / “cumulative points” | RESOLVED | Tournament points remain distinct from hand score and BB score. |
| Split explanation for beginners | KEEP_REVIEW | Keep the poker result term “Split”; decide whether a first-use explanatory hint is desirable. |
| Shop, draft, match history, spectator, errors, event log | RESOLVED for code coverage; KEEP_REVIEW for native copy | All current production strings are localized, but idiomatic English review across a live game has not been performed. |
| Augment terminology | OBSOLETE | Historical only; the current engine has no AUGMENT phase and localization must not revive it. |

Three product wording decisions remain (round names, Lead card, Split hint), plus one cross-screen native-speaker review gate. No translation uncertainty is being used to alter game rules.
