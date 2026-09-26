// Absolute paths into the real app source so every analysis script imports
// the SAME production functions the game and UI use — never a reimplementation.
export const SRC_ROOT = "/home/user/holto-chess/holto-chess/src";
export const CARDS_MODULE = `${SRC_ROOT}/core/poker/cards.ts`;
export const EVALUATE_MODULE = `${SRC_ROOT}/core/poker/evaluate.ts`;
export const SHOWDOWN_EQUITY_MODULE = `${SRC_ROOT}/ui/showdownEquity.ts`;
export const SHOWDOWN_DECK_MODULE = `${SRC_ROOT}/game/showdownDeck.ts`;
export const RESULTS_DIR = "/home/user/holto-chess/product_doc/balance/BAL-005/artifacts/results";
