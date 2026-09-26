import { SUIT_SYMBOL, type Card } from "../core/poker/cards";
import { BALANCE } from "../game/config";
import { getCard } from "../game/engine";
import type { PorenaGameState } from "../game/types";
import type { ChapterId, StepText, TutorialStep } from "./tutorialTypes";
import { rankWord } from "./rankWord";

/** English lesson script overlays Korean source steps without changing their actions or checkpoints. */
export const EN_CHAPTERS: Record<ChapterId, { title: string; summary: string }> = {
  1: { title: "Build your first hand", summary: "R1 shop and poker basics" },
  2: { title: "Two runs", summary: "R2 open Draft and RUN lineup" },
  3: { title: "Exactly two hole cards", summary: "R3 Omaha and the survival cutoff" },
  4: { title: "Your BEST 5", summary: "R4 BEST 5 and brackets" },
  5: { title: "The final tally", summary: "R5 showdown and scoring" },
};

type Copy = { title: string; body: StepText; more?: StepText; goal?: string; next?: string };
const me = (game: PorenaGameState) => game.players[0]!;
const cardLabel = (card: Card) => `${rankWord(card.rank)}${SUIT_SYMBOL[card.suit]}`;
const owned = (game: PorenaGameState) => me(game).ownedCardIds.map((id) => getCard(game, id));
const shop = (game: PorenaGameState) => me(game).shopCardIds.map((id) => getCard(game, id));

const EN_STEPS: Record<string, Copy> = {
  "r1-start-card": { title: "This card is your starting point", next: "Got it", body: (game) => {
    const card = owned(game)[0];
    return card ? [`You start with ${cardLabel(card)}.`, `Its rank is ${rankWord(card.rank)} and its suit is ${SUIT_SYMBOL[card.suit]}.`, "Choose one more card to make your two-card hand."] : ["Collect your cards for this round here."];
  }, more: ["Ranks increase from 2 through 10, then J, Q, K, and A.", "Suits (♠ ♥ ♦ ♣) have no rank. Matching suits can matter for certain hands."] },
  "r1-shop": { title: "Choose one more card from the shop", next: "View shop", body: (game) => [`The shop currently offers ${shop(game).map(cardLabel).join(", ") || "no cards"}.`, "Choose a card that works with the one you own."] },
  "r1-combos": { title: "Two ways to build a hand", next: "Got it", body: (game) => {
    const mine = owned(game)[0]; const offers = shop(game);
    const pair = mine && offers.find((card) => card.rank === mine.rank);
    const suited = mine && offers.find((card) => card.suit === mine.suit && Math.abs(card.rank - mine.rank) <= 2);
    const lines = ["Two cards of the same rank make One Pair immediately.", "Nearby ranks in the same suit are not a made hand yet, but the board might complete them."];
    if (pair && mine) lines.push(`Buying ${cardLabel(pair)} would pair your ${cardLabel(mine)}.`);
    if (suited && mine) lines.push(`${cardLabel(suited)} and ${cardLabel(mine)} are nearby ranks in the same suit.`);
    return lines;
  }, more: ["A high pair is a strong start, not a guaranteed win.", "Two suited cards are not a Flush, and two consecutive cards are not a Straight. A poker hand needs five cards."] },
  "r1-buy": { title: "Buy a card you like", goal: "Buy one card from the shop", body: ["You do not have to buy the suggested card. Any available shop card is fine."], more: (game) => [`Reroll if you want different cards. It costs ${BALANCE.rerollCostBB}BB; you have ${BALANCE.rerollLimits[game.round] - (me(game).rerollsUsed ?? 0)} rerolls left this round.`, "Insufficient BB or exhausted rerolls will block the action, just as in a real game."] },
  "r1-hand": { title: "You now have two cards", next: "Play this hand", body: (game) => {
    const cards = owned(game); const [a, b] = cards;
    if (!a || !b) return ["Still collecting cards."];
    const lines = [`Your hand is ${cards.map(cardLabel).join(" ")}.`];
    if (a.rank === b.rank) lines.push(`Both are ${rankWord(a.rank)}s, so you already have One Pair.`);
    else if (a.suit === b.suit && Math.abs(a.rank - b.rank) <= 4) lines.push("Nearby ranks in the same suit could grow into a Straight or Flush with help from the board.");
    else if (a.suit === b.suit) lines.push("Matching suits give you Flush potential.");
    else if (Math.abs(a.rank - b.rank) <= 4) lines.push("Nearby ranks give you Straight potential.");
    else lines.push("These cards are not paired or connected. A strong board may still let your high card compete.");
    lines.push("The board decides which five-card hand you make."); return lines;
  } },
  "r1-bb": { title: "BB and Point are different", next: "Understood", body: (game) => [`BB pays for cards and shop rerolls. You have ${me(game).stackBB}BB.`, "Point is earned in matches and helps determine the final ranking."] },
  "r1-commit": { title: "Lock in when you are ready", goal: "Confirm your deck", body: ["After you confirm, your opponents finish choosing cards and the first match begins."] },
  "r1-rest": { title: "Remaining matches", next: "Watch next match", body: ["The remaining matches follow the same rules. Review their results and continue."] },
  "r1-rest2": { title: "Last match", next: "View round results", body: ["Each match gets a new board, so the same hole cards can lead to different outcomes."] },
  "r1-round-result": { title: "Round results", next: "Finish the basics", body: ["Point and BB earned in matches are added up.", "You have learned the basic PORENA controls."] },
  "r2-draft": { title: "Everyone picks from the same pool", next: "Wait for your turn", body: ["This round uses an open Draft instead of the shop. Everyone picks a card from the same pool.", "You cannot choose a card someone else picked first."], more: ["Players with fewer Points pick first. Ties are broken by higher BB."] },
  "r2-wait": { title: "Pick a card on your turn", goal: "Pick one open Draft card", body: ["Your turn comes after the players ahead of you. There is no time limit in this practice."] },
  "r2-anchor": { title: "One card plays in both RUNs", goal: "Set a lead card and both RUNs", body: ["Your lead card is used in both matches.", "Each of the other two cards supports RUN 1 or RUN 2 once."], more: ["Changing the lead card changes both RUN combinations. You can revise the lineup until you confirm."] },
  "r2-run1": { title: "RUN 1 result", next: "Watch RUN 2", body: ["The first board is complete. Your lead card and first support card were used."] },
  "r2-run2": { title: "RUN 2 result", next: "Continue", body: ["The lead card stayed while the support card changed.", "Points from both RUNs are added together."] },
  "r2-round-result": { title: "Round results", next: "Next round", body: ["Points from both RUNs have been added together."] },
  "r3-rule": { title: "Own four cards, use exactly two", next: "Open shop", body: ["Collect four hole cards this round.", "Your poker hand must use exactly two of them and exactly three board cards."], more: ["Four cards of one suit on the board are not enough for a Flush if you hold only one card of that suit. You must use two hole cards.", "You do not have to pick the two cards yourself. The best valid combination is calculated automatically."] },
  "r3-shop": { title: "Collect four cards", goal: "Own four cards", body: ["The shop and rerolls work like R1. Watch your remaining purchases and BB."] },
  "r3-commit": { title: "Lock in when ready", goal: "Confirm your deck", body: ["You will play three matches. Survival depends on cumulative Points."] },
  "r3-rest": { title: "Second match", next: "Watch next match", body: ["You face another opponent with the same four cards."] },
  "r3-rest2": { title: "Third match", next: "View round results", body: ["Results from all three matches are added together."] },
  "r3-survival": { title: "Cumulative Points determine survival", next: "Learn next rules", body: ["Elimination is based on cumulative Points, not one match result.", "A tie at the cutoff is settled by an extra match."] },
  "r4-draft": { title: "Another open Draft", goal: "Pick one open Draft card", body: ["It works like R2. This time, the shop also opens once after the Draft."] },
  "r4-shop": { title: "The shop opens after Draft", next: "Ready to confirm", body: (game) => [`The hand limit is ${BALANCE.handLimits[4]} cards; you currently own ${me(game).ownedCardIds.length}.`, "After your Draft pick, buy or sell in the shop to finish a five-card hand."] },
  "r4-rule": { title: "No two-hole-card restriction now", goal: "Confirm your deck", body: ["Use the strongest five cards from your five hole cards and the five-card board.", "R3's exactly-two-hole-cards rule no longer applies."] },
  "r4-group": { title: "Match 1 and your bracket", next: "Watch Match 2", body: ["Match 1 splits players into the Winner and Survival brackets.", "The Winner bracket competes for extra Points with advancement secured. The Survival bracket competes for one remaining place."] },
  "r4-enter-secondary": { title: "Check your bracket", goal: "Start Match 2", body: ["Start Match 2 when ready. This practice waits for your click."] },
  "r4-secondary": { title: "Match 2", next: "View round results", body: ["You compete again within your bracket using the same five cards."] },
  "r5-rule": { title: "No community board this time", next: "Open shop", body: ["In the final round, play only the seven cards you collected—there is no shared board.", "Your strongest five of those seven cards make your final poker hand."] },
  "r5-shop": { title: "Collect your final cards", goal: "Own seven cards", body: ["Cards bought here go directly into your final hand."] },
  "r5-commit": { title: "Begin the final showdown", goal: "Confirm your deck", body: ["All four players reveal their cards together."] },
  "r5-three": { title: "First three cards", next: "Reveal two more", body: ["Three cards cannot complete a final hand yet. Read the visible combination for now."] },
  "r5-five": { title: "Five cards revealed", next: "Reveal the last two", body: ["Five are visible, but two more cards are still coming."] },
  "r5-seven": { title: "All seven revealed", next: "See your BEST 5", body: ["All seven cards are now face up."] },
  "r5-best5": { title: "Five used, two left out", next: "View result", body: ["The bright five cards form your final hand. The dim two cards are excluded from comparison."] },
  "r5-result": { title: "Final hand comparison", next: "View total score", body: ["The four final poker hands determine placing and placement Points."] },
  "r5-score": { title: "How total score works", next: "Finish tutorial", body: ["Final score adds cumulative Points, hand score, and BB conversion.", "The winner of the last hand may differ from the overall champion."], more: ["R5 placement Points are already included in cumulative Points. They are not added twice."] },
};

const SHOWDOWN_COPY: Record<string, Copy> = {
  vs: { title: "Your cards and your opponent's", next: "Reveal board", body: ["Your opponent's cards are revealed alongside yours."] },
  flop: { title: "First three board cards · Flop", next: "See Turn", body: ["The first three board cards are open. Read your hand using only what is visible."] },
  turn: { title: "One more card · Turn", next: "See River", body: ["The fourth board card is open."] },
  river: { title: "Last board card · River", next: "See BEST 5", body: ["All five board cards are open. Your best five can now be compared."] },
  best5: { title: "The five cards actually used", next: "View result", body: ["The bright five cards were used in this comparison."] },
  result: { title: "Why this happened", next: "Continue", body: ["See how your hand formed, where it differed from your opponent's, and who won."] },
};

export function englishStepCopy(step: TutorialStep): Copy {
  const direct = EN_STEPS[step.id];
  if (direct) return direct;
  const suffix = step.id.split("-").at(-1) ?? "";
  const shared = SHOWDOWN_COPY[suffix];
  if (shared && step.id.endsWith("-vs") && step.id.startsWith("r1-")) return { ...shared,
    body: ["You and your opponent share the cards in the middle.", "Use the strongest five cards from your two hole cards and the five-card board."] };
  return shared ?? { title: step.title, body: step.body, more: step.more, goal: step.goal, next: step.next };
}
