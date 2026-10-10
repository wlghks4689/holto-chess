import { createAbilityGame, createGame, finishAbilityDeal, finishAbilitySelection } from "../game/engine";
import type { PorenaGameState } from "../game/types";
import { autoStep } from "../tutorial/practiceState";
import { settleFinalAuction } from "../game/finalAuction";

export function phasePreviewStates(sixRounds = true): PorenaGameState[] {
  const states = new Map<string, PorenaGameState>();
  // Sample legal games to include conditional survival/tiebreak screens as well as the main path.
  for (let seed = 1; seed <= (sixRounds ? 3 : 2); seed++) {
    let game = !sixRounds && seed === 2 ? createGame(seed, "seeded", 1, false, false) : createAbilityGame(seed === 3 ? 2 : seed, "seeded", sixRounds);
    for (let step = 0; step < 400; step++) {
      const detail = game.phase === "FINAL_AUCTION" && game.finalAuction?.settledAt !== null ? "reveal"
        : game.phase === "OPPONENT_SELECT" && game.opponentSelect?.opponentId ? "reveal" : "";
      const key = `${game.round}:${game.phase}:${detail}`;
      if (!states.has(key)) states.set(key, game);
      if (game.phase === "GAME_RESULT") break;
      game = game.phase === "ABILITY_DEAL" ? finishAbilityDeal(game)
        : game.phase === "ABILITY_REVEAL" ? finishAbilitySelection(game)
        : seed === 2 && sixRounds && game.phase === "FINAL_AUCTION" && game.finalAuction!.settledAt === null
          ? settleFinalAuction(game, game.finalAuction!.endsAt) : autoStep(game);
      if (step === 399) throw new Error("페이즈 미리보기 생성이 완료되지 않았습니다.");
    }
  }
  if (!sixRounds && ![...states.values()].some(game => game.phase === "SURVIVAL_READY")) {
    // shortcut: a fixed legacy tie fixture; use a recorded match when reproducing a specific tiebreak bug.
    const source = [...states.values()].find(game => game.round === 3 && game.phase === "ROUND_RESULT")!;
    const survival = structuredClone(source);
    survival.phase = "SURVIVAL_READY";
    survival.survival = { playerIds: survival.players.filter(player => !player.eliminated).slice(0, 2).map(player => player.id), eliminateCount: 1 };
    states.set("3:SURVIVAL_READY:fixture", survival);
  }
  const phases = ["ABILITY_DEAL", "ABILITY_REVEAL", "OPPONENT_SELECT", "FINAL_AUCTION", "FINAL_LOADOUT", "DRAFT_ORDER", "OPEN_DRAFT", "SHOP", "DECK_SELECT", "RUN_LOADOUT", "SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "SURVIVAL_READY", "ROUND_RESULT", "NEXT_ROUND", "GAME_RESULT"];
  return [...states.values()].sort((a, b) => a.round - b.round || phases.indexOf(a.phase) - phases.indexOf(b.phase)).map(game => {
    const viewer = game.players.find(p => !p.eliminated);
    if (!game.players[0]!.eliminated || !viewer) return game;
    // The local UI uses p1/players[0]; swap the preview seat with a survivor without changing the engine game.
    const swapped: PorenaGameState = JSON.parse(JSON.stringify(game).replaceAll('"p1"', '"__previewSeat__"').replaceAll(JSON.stringify(viewer.id), '"p1"').replaceAll('"__previewSeat__"', JSON.stringify(viewer.id)));
    swapped.players.sort((a, b) => Number(b.id === "p1") - Number(a.id === "p1"));
    return swapped;
  });
}
