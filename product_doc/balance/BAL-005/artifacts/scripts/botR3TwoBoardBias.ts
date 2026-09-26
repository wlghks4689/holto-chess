// botStrategy.ts's scoreHeadsUp() for round===3 (lines ~214-222) draws TWO
// independent 5-card boards from the same shuffled deck and averages the two
// win/tie/loss outcomes, for a FIXED hero/opponent Omaha hand pair, even
// though the real R3 showdown (engine.ts + showdownDeck.ts) deals only ONE
// board. This script tests whether that is a rule mismatch (biases the win
// estimate the bot uses to buy cards) or just a variance-reduction trick
// (mathematically the same expectation, less noise) — REQUEST Q1/Q2.
//
// Method: for a fixed hero/opponent pair, (A) estimate P(hero wins) with ONE
// board per sample (matches the real single-board R3 rule) at N=300,000, and
// (B) reproduce botStrategy.ts's exact two-board-per-sample loop structure at
// N=150,000 outer samples (=300,000 board evaluations, same total work). If
// A and B agree within their combined 95% CI, the two-board averaging is not
// a rule error — it is only an internal variance-reduction detail of the
// bot's OWN equity estimate, which is a different question (pre-purchase EV
// vs unknown opponent) from showdownEquity's (post-reveal, known opponent).
import { makeDeck, shuffle, type Card } from "/home/user/holto-chess/holto-chess/src/core/poker/cards.ts";
import { compareHands, findBestOmaha } from "/home/user/holto-chess/holto-chess/src/core/poker/evaluate.ts";
import { mulberry32, hashSeed, ci95HalfWidth } from "./lib/prng.ts";
import { R3_CASES } from "./lib/cases.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

function outcome(hero: Card[], opp: Card[], board: Card[]): number {
  const cmp = compareHands(findBestOmaha(hero, board), findBestOmaha(opp, board));
  return cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
}

function singleBoard(hero: Card[], opp: Card[], unseen: Card[], n: number, seed: number) {
  const rng = mulberry32(seed);
  const outs: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const d = shuffle(unseen, rng);
    outs[i] = outcome(hero, opp, d.slice(0, 5));
  }
  return outs;
}

// Mirrors botStrategy.ts scoreHeadsUp's round===3 branch exactly (same slicing,
// same averaging), reading from a fresh shuffle per outer sample.
function twoBoardAveraged(hero: Card[], opp: Card[], unseen: Card[], outerN: number, seed: number) {
  const rng = mulberry32(seed);
  const outs: number[] = new Array(outerN);
  for (let sample = 0; sample < outerN; sample += 1) {
    const d = shuffle(unseen, rng);
    let result = 0;
    for (let game = 0; game < 2; game += 1) {
      const board = d.slice(game * 5, game * 5 + 5);
      result += outcome(hero, opp, board);
    }
    outs[sample] = result / 2;
  }
  return outs;
}

function summarize(outs: number[]) {
  const mean = outs.reduce((a, b) => a + b, 0) / outs.length;
  const half = ci95HalfWidth(outs);
  return { mean: mean * 100, ci95Low: (mean - half) * 100, ci95High: (mean + half) * 100 };
}

const targets = [R3_CASES[0]!, R3_CASES[6]!]; // r3-01 (premium ds vs weak) and r3-07 (AAxx trap vs rundown)
for (const c of targets) {
  const hero = hand(c.left);
  const opp = hand(c.right);
  const known = new Set([...c.left, ...c.right]);
  const unseen = deck.filter((card) => !known.has(card.id));

  const a = summarize(singleBoard(hero, opp, unseen, 300_000, hashSeed(`single:${c.id}`)));
  const b = summarize(twoBoardAveraged(hero, opp, unseen, 150_000, hashSeed(`double:${c.id}`)));
  const gap = Math.abs(a.mean - b.mean);
  const overlap = a.ci95Low <= b.ci95High && b.ci95Low <= a.ci95High;
  console.log(`\n${c.id} ${c.label}`);
  console.log(`  (A) single-board, N=300000:      ${a.mean.toFixed(3)}% CI95=[${a.ci95Low.toFixed(3)}, ${a.ci95High.toFixed(3)}]`);
  console.log(`  (B) botStrategy two-board avg, N=150000 outer (300000 boards): ${b.mean.toFixed(3)}% CI95=[${b.ci95Low.toFixed(3)}, ${b.ci95High.toFixed(3)}]`);
  console.log(`  |A-B| = ${gap.toFixed(3)}pp, CIs overlap: ${overlap} => ${overlap ? "무편향(분산 감소 기법일 뿐, 규칙 불일치 아님)" : "편향 의심 — 추가 조사 필요"}`);
}
