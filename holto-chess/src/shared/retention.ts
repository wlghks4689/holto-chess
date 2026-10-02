// How long PORENA keeps server-side data. The Worker enforces these values and the privacy policy (/privacy)
// quotes them, so the published policy cannot drift from what the code does.

/** A started game's room is deleted at most this long after the game begins. */
export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** A finished room is deleted this long after the final standings are released. */
export const FINISHED_ROOM_LIFETIME_MS = 15 * 60 * 1000;
/** A lobby with no join/ready/leave/nickname change for this long is deleted; every lobby change restarts it. */
export const LOBBY_IDLE_LIFETIME_MS = 30 * 60 * 1000;
/** Feedback rows (message, optional reply email, locale, User-Agent) are deleted 90 days after they arrive. */
export const FEEDBACK_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
