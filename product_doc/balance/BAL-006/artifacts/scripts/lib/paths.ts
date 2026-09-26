// Absolute paths into the real app source in THIS worktree (checked out at the
// BAL-006 base commit d5e62cb2af4ae0f1dcd3ccccf52e18a2c48052db + REQUEST commit
// cee690b). Every analysis script imports the SAME production functions the
// game and UI use — never a reimplementation.
export const SRC_ROOT = "/home/user/holto-chess-BAL-006/holto-chess/src";
export const CARDS_MODULE = `${SRC_ROOT}/core/poker/cards.ts`;
export const EVALUATE_MODULE = `${SRC_ROOT}/core/poker/evaluate.ts`;
export const ENGINE_MODULE = `${SRC_ROOT}/game/engine.ts`;
export const CARD_POOL_MODULE = `${SRC_ROOT}/game/cardPool.ts`;
export const CONFIG_MODULE = `${SRC_ROOT}/game/config.ts`;
export const SHOWDOWN_EQUITY_MODULE = `${SRC_ROOT}/ui/showdownEquity.ts`;
export const RESULTS_DIR = "/home/user/holto-chess-BAL-006/product_doc/balance/BAL-006/artifacts/results";
