import type { TranslationKey } from "../i18n";

/**
 * Seat names the engine assigns (`createGame`) are stored in Korean. Both language forms map to one
 * key, so relabelling is idempotent and switching languages mid-game round-trips cleanly.
 */
const NAME_KEYS: Record<string, TranslationKey> = {
  "나": "botName.me", "You": "botName.me",
  "리버 폭스": "botName.riverFox", "River Fox": "botName.riverFox",
  "블러프 캣": "botName.bluffCat", "Bluff Cat": "botName.bluffCat",
  "스페이드 울프": "botName.spadeWolf", "Spade Wolf": "botName.spadeWolf",
  "턴 샤크": "botName.turnShark", "Turn Shark": "botName.turnShark",
  "클럽 레이븐": "botName.clubRaven", "Club Raven": "botName.clubRaven",
  "다이아 바이퍼": "botName.diamondViper", "Diamond Viper": "botName.diamondViper",
  "올인 베어": "botName.allInBear", "All-in Bear": "botName.allInBear",
};
/** Fields that carry a seat name: player/profile `name`, and log `params.player`. */
const NAME_FIELDS = new Set(["name", "player"]);

/**
 * Returns a copy of a game state or player view with built-in seat names in the current language.
 * ponytail: matches names by exact text, so a human nicknamed "River Fox" is relabelled too; key bots by
 * seat id on the server if that ever matters.
 */
export function localizeSeatNames<T>(value: T, translate: (key: TranslationKey) => string): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([key, child]) =>
      [key, NAME_FIELDS.has(key) && typeof child === "string" && NAME_KEYS[child] ? translate(NAME_KEYS[child]) : walk(child)]));
  };
  return walk(value) as T;
}
