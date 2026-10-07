import type { AbilityId } from "../../game/abilities";
import type { Locale } from "../../i18n";
import { guideCopyEn } from "./guideCopy.en";
import { guideCopyKo } from "./guideCopy.ko";

type Titled = { kicker: string; title: string; lead: string };
export type Row = [label: string, value: string];
export type RoundSpec = { name: string; tagline: string; specs: Row[]; details: string[] };
export type BeginnerRound = { name: string; tagline: string; bullets: string[] };
export type AbilityCopy = { style: string; effect: string; timing: string; notes: string[] };

/**
 * Guide copy lives beside the guide instead of the global locale tables: it is long, only needed
 * when the guide opens, and both locales share this type so a missing field fails the typecheck.
 */
export type GuideCopy = {
  title: string; close: string; home: string;
  chooser: Titled & { beginner: { title: string; lead: string; cta: string }; rules: { title: string; lead: string; cta: string } };
  tabs: { beginner: string; rules: string };
  beginner: {
    identity: Titled & { pillars: { title: string; body: string }[] };
    pool: Titled & { mine: string; other: string; shop: string; blocked: string; takeaway: string };
    shop: Titled & { current: string; offer: string; tags: [high: string, pair: string, draw: string]; actions: Row[]; takeaway: string };
    bb: Titled & { uses: Row[]; takeaway: string };
    hands: Titled & { low: string; high: string; note: string };
    rounds: Titled & { r1: BeginnerRound; r2: BeginnerRound; r3: BeginnerRound; r4: BeginnerRound; r5: BeginnerRound; r6: BeginnerRound;
      labels: { hole: string; board: string; best: string; anchor: string; run: string; mine: string; players: string; noBoard: string; lineup: string;
        primary: string; winnerGroup: string; survivalGroup: string; winnerNote: string; survivalNote: string; draft: string; auction: string; pick: string } };
    survival: Titled & { placements: string[] };
    score: Titled & { blocks: { points: string; pointsNote: string; hand: string; handNote: string; bb: string; bbNote: string }; abilityNote: string; formula: string };
    abilities: Titled & { note: string };
    toRules: { text: string; cta: string };
  };
  rules: {
    kicker: string; title: string; lead: string; toBeginner: string; nav: string[];
    basics: { title: string; rows: Row[]; perRound: { title: string; round: string; hand: string; buys: string; rerolls: string; noShop: string }; prices: string };
    pool: { title: string; items: string[] };
    economy: { title: string; income: Row[]; matchTitle: string; matchHead: [string, string, string]; matchRows: [string, string, string][]; notes: string[] };
    rounds: { title: string; r1: RoundSpec; r2: RoundSpec; r3: RoundSpec; r4: RoundSpec; r5: RoundSpec; r6: RoundSpec };
    draft: { title: string; order: string[]; items: string[] };
    points: { title: string; head: [string, string, string]; rows: [string, string, string][] };
    elimination: { title: string; items: string[] };
    final: { title: string; formula: string; handTitle: string; placementTitle: string; items: string[] };
    abilities: { title: string; intro: string[]; effect: string; timing: string; notes: string };
    ties: { title: string; items: string[] };
  };
  abilities: Record<AbilityId, AbilityCopy>;
};

export const GUIDE_COPY: Record<Locale, GuideCopy> = { "ko-KR": guideCopyKo, "en-US": guideCopyEn };
