/**
 * Login and ranking are closed for now (decision HOME-GATE-001, 2026-10-26): the home page must not ask a visitor for
 * anything before they see the game. Everyone plays as a guest. The code stays so both can return later.
 * Reopening needs this switch and the Worker's ACCOUNTS_ENABLED variable (worker/accountGate.ts) together.
 */
export const ACCOUNTS_ENABLED = false;
/** The season ranking is closed with the accounts and will be redesigned separately. */
export const RANKING_ENABLED = false;
/**
 * The feedback form asks for a reply email only while accounts are open: until login returns the game collects no
 * contact details (HOME-GATE-001, 2026-10-26). The Worker refuses an email under the same ACCOUNTS_ENABLED switch.
 */
export const FEEDBACK_EMAIL_ENABLED = ACCOUNTS_ENABLED;
