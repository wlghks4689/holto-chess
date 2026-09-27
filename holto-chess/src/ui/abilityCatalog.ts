export const ABILITY_CARDS = {
  "royal-blood": "royal-blood.svg",
  "target-sniper": "target-sniper.png",
  underdog: "underdog.png",
  "first-class": "first-class.png",
  "golden-hand": "golden-hand.png",
  trader: "trader.png",
  predator: "predator.png",
  architect: "architect.svg",
  capitalism: "capitalism.png",
  "zero-risk": "zero-risk.png",
} as const;

export type AbilityId = keyof typeof ABILITY_CARDS;
export const ABILITY_IDS = Object.keys(ABILITY_CARDS) as AbilityId[];
