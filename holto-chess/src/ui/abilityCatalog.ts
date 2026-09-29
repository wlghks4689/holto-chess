import type { AbilityId } from "../game/abilities";
export { ABILITY_IDS, type AbilityId } from "../game/abilities";

export const ABILITY_CARDS = {
  "royal-blood": "royal-blood.png",
  "target-sniper": "target-sniper.png",
  underdog: "underdog.png",
  "first-class": "first-class.png",
  "golden-hand": "golden-hand.png",
  trader: "trader.png",
  predator: "predator.png",
  architect: "architect.png",
  capitalism: "capitalism.png",
  "zero-risk": "zero-risk.png",
  "quad-core": "quad-core.png",
  "front-runner": "front-runner.png",
} as const satisfies Record<AbilityId, string>;
