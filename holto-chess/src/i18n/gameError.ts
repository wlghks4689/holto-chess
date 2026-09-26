import { classifyGameError, GAME_ERROR_CODES } from "../shared/gameErrorCode";
import type { TranslationKey, TranslationParams } from "./index";

export type ReceivedGameError = { code: string; params?: TranslationParams; message?: string };

/** Prefer the wire code, accept old ACTION_REJECTED frames, then preserve unknown legacy text. */
export function renderGameError(error: ReceivedGameError, translate: (key: TranslationKey, params?: TranslationParams) => string): string {
  const code = (error.code === "ACTION_REJECTED" || error.code === "UNAUTHORIZED") && error.message ? classifyGameError(error.message).code : error.code;
  if (GAME_ERROR_CODES.some((known) => known === code)) return translate(`gameError.${code}` as TranslationKey, error.params);
  return error.message || translate("gameError.ACTION_REJECTED");
}
