// Calls the REAL shipped showdownEquity() (src/ui/showdownEquity.ts) — the
// exact function ShowdownPrepPanel.tsx renders — on every case, plus
// repeatability/order-sensitivity checks (REQUEST Q6).
import { writeFileSync, mkdirSync } from "node:fs";
import { makeDeck, type Card } from "/home/user/holto-chess/holto-chess/src/core/poker/cards.ts";
import { showdownEquity } from "/home/user/holto-chess/holto-chess/src/ui/showdownEquity.ts";
import { R1_CASES, R3_CASES, R4_CASES, validateCases, type Case } from "./lib/cases.ts";
import { RESULTS_DIR } from "./lib/paths.ts";

validateCases(R1_CASES, 2);
validateCases(R3_CASES, 4);
validateCases(R4_CASES, 5);

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const asCards = (ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

function run(round: 1 | 3 | 4, cases: Case[]) {
  const results = cases.map((c) => {
    const left = asCards(c.left);
    const right = asCards(c.right);
    const shown = showdownEquity(round, left, right)!;
    // Repeatability: same arrays, same call, must be identical (pure function of inputs).
    const repeat = showdownEquity(round, left, right)!;
    const repeatable = shown[0] === repeat[0] && shown[1] === repeat[1];
    // Order sensitivity: same SET of cards, hero hand internally reversed.
    // showdownEquity's seed string is built from known.map(id).join(":"), which
    // depends on element order, so this checks whether a re-ordered — but
    // logically identical — hand still produces the same displayed number.
    const reorderedLeft = [...left].reverse();
    const reordered = showdownEquity(round, reorderedLeft, right)!;
    const orderStable = shown[0] === reordered[0] && shown[1] === reordered[1];
    return {
      id: c.id, round, label: c.label, category: c.category, left: c.left, right: c.right,
      shownLeftPercent: shown[0], shownRightPercent: shown[1],
      sumTo100: shown[0] + shown[1] === 100,
      repeatable, orderStable, reorderedLeftPercent: reordered[0],
    };
  });
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(`${RESULTS_DIR}/production_equity_r${round}.json`, JSON.stringify({ round, results }, null, 2));
  const unstable = results.filter((r) => !r.orderStable);
  const nonSum = results.filter((r) => !r.sumTo100);
  console.log(`R${round}: ${results.length} cases, sum!=100: ${nonSum.length}, order-unstable: ${unstable.length}`);
  if (unstable.length) console.log("  order-unstable cases:", unstable.map((r) => `${r.id}(${r.shownLeftPercent}->${r.reorderedLeftPercent})`).join(", "));
  return results;
}

run(1, R1_CASES);
run(3, R3_CASES);
run(4, R4_CASES);
console.log("Done. Wrote production_equity_r1.json, production_equity_r3.json, production_equity_r4.json");
