// Absolute paths into the real app source in THIS worktree (checked out at
// BAL-007's base commit 2cce1a2e63573556124c167337b1294020c68a4a + REQUEST
// commit f62ce673dd5875c79e858d8f1652da53240e7b2a). Every analysis script
// imports the SAME production functions the game and UI use — never a
// reimplementation.
export const SRC_ROOT = "/home/user/holto-chess-BAL-007/holto-chess/src";
export const CARDS_MODULE = `${SRC_ROOT}/core/poker/cards.ts`;
export const EVALUATE_MODULE = `${SRC_ROOT}/core/poker/evaluate.ts`;
export const ENGINE_MODULE = `${SRC_ROOT}/game/engine.ts`;
export const CARD_POOL_MODULE = `${SRC_ROOT}/game/cardPool.ts`;
export const SHOWDOWN_DECK_MODULE = `${SRC_ROOT}/game/showdownDeck.ts`;
export const SHOWDOWN_EQUITY_MODULE = `${SRC_ROOT}/ui/showdownEquity.ts`;
export const RESULTS_DIR = "/home/user/holto-chess-BAL-007/product_doc/balance/BAL-007/artifacts/results";
