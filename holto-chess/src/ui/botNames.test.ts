import { describe, expect, it } from "vitest";
import { enUS } from "../i18n/locales/en-US";
import { koKR } from "../i18n/locales/ko-KR";
import { createGame } from "../game/engine";
import { localizeSeatNames } from "./botNames";

const en = (key: keyof typeof enUS) => enUS[key];
const ko = (key: keyof typeof koKR) => koKR[key];

describe("seat name localization", () => {
  it("relabels every engine seat name, nested profiles and log params, and leaves other text alone", () => {
    const game = createGame(7);
    const view = { players: game.players.map((p) => ({ playerId: p.id, name: p.name })),
      logs: [{ event: "CARD_PURCHASED", params: { player: "리버 폭스", card: "As" } }], nick: { name: "철수" }, title: "리버 폭스" };
    const shown = localizeSeatNames(view, en);
    expect(shown.players.map((p) => p.name)).toEqual(["You", "River Fox", "Bluff Cat", "Spade Wolf", "Turn Shark", "Club Raven", "Diamond Viper", "All-in Bear"]);
    expect(shown.logs[0]!.params).toEqual({ player: "River Fox", card: "As" });
    expect(shown.nick.name).toBe("철수"); // a human nickname is not a seat name
    expect(shown.title).toBe("리버 폭스"); // only name/player fields are touched
    expect(view.players[1]!.name).toBe("리버 폭스"); // input is not mutated
  });

  it("round-trips when the language switches back", () => {
    const view = { players: [{ name: "나" }, { name: "올인 베어" }] };
    expect(localizeSeatNames(localizeSeatNames(view, en), ko)).toEqual(view);
    expect(localizeSeatNames(localizeSeatNames(view, en), en)).toEqual(localizeSeatNames(view, en));
  });

  it("translates both participants in the R5 opponent-choice log without mutating saved names", () => {
    const log = { event: "OPPONENT_CHOSEN", params: { player: "나", opponent: "리버 폭스" } };
    const english = localizeSeatNames(log, en);
    expect(english.params).toEqual({ player: "You", opponent: "River Fox" });
    expect(localizeSeatNames(english, ko)).toEqual(log);
    expect(log.params.opponent).toBe("리버 폭스");
  });
});
