import { describe, expect, it } from "vitest";
import { enUS } from "./locales/en-US";
import { koKR } from "./locales/ko-KR";
import { detectLocale } from "./index";
import { GAME_ERROR_CODES } from "../shared/gameErrorCode";

describe("localization resources", () => {
  it("keeps the English and Korean schemas in parity with non-empty values", () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(koKR).sort());
    for (const [key, value] of Object.entries(enUS)) {
      expect(value.trim(), key).not.toBe("");
      if (key !== "language.korean") expect(value, key).not.toMatch(/[가-힣]/);
    }
  });

  it("uses the first supported browser locale and falls back to English", () => {
    expect(detectLocale(["fr-FR", "ko-KR"])).toBe("ko-KR");
    expect(detectLocale(["ja-JP"])).toBe("en-US");
    expect(detectLocale(["en-GB"])).toBe("en-US");
  });

  it("contains the same interpolation parameters in both locales", () => {
    const params = (value: string) => [...value.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(koKR) as (keyof typeof koKR)[]) expect(params(koKR[key]), key).toEqual(params(enUS[key]));
  });

  it("covers every stable server error code in both resources", () => {
    for (const code of GAME_ERROR_CODES) {
      expect(koKR[`gameError.${code}`], code).toBeTruthy();
      expect(enUS[`gameError.${code}`], code).toBeTruthy();
    }
  });
});
