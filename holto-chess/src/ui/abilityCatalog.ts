import type { AbilityId } from "../game/abilities";
export { ABILITY_IDS, type AbilityId } from "../game/abilities";

export const ABILITY_CARDS = {
  "royal-blood": "royal-blood.webp",
  "target-sniper": "target-sniper.webp",
  underdog: "underdog.webp",
  "first-class": "first-class.webp",
  "golden-hand": "golden-hand.webp",
  trader: "trader.webp",
  predator: "predator.webp",
  architect: "architect.webp",
  capitalism: "capitalism.webp",
  "zero-risk": "zero-risk.webp",
  "quad-core": "quad-core.webp",
  "front-runner": "front-runner.webp",
} as const satisfies Record<AbilityId, string>;
