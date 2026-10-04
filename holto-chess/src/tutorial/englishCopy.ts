import type { ChapterId, StepText, TutorialStep } from "./tutorialTypes";

export const EN_CHAPTERS: Record<ChapterId, { title: string; summary: string }> = {
  1: { title: "Your first match", summary: "Buy two cards → ready up → watch → review" },
  2: { title: "Two runs", summary: "Open Draft · lead card and RUN lineups" },
  3: { title: "Exactly two hole cards", summary: "Omaha 2+3 · cumulative Points and survival" },
  4: { title: "Your BEST 5", summary: "Unrestricted BEST 5 · winner and survival brackets" },
  5: { title: "Final hand and score", summary: "Seven hole cards · final hand and total score" },
};

type Copy = { title: string; body: StepText; more?: StepText; goal?: string; next?: string };
const EN_STEPS: Record<string, Copy> = {
  "r1-buy": {
    title: "Buy two cards", goal: "Buy two cards from the shop",
    body: ["R1 starts with an empty hand. Buy two of the four cards in your shop to build it. Two of the same rank start you with One Pair.", "High cards are strong but expensive. BB you keep pays for later rounds and counts toward your final score."],
    more: ["BB pays for cards and rerolls. Check the price on each buy button.", "Ranks increase from 2 to 10, then J, Q, K, A. Two matching suits alone are not a Flush."],
  },
  "r1-commit": { title: "Ready to play these two cards?", goal: "Press Ready", body: ["Your strongest five cards from two hole cards and five shared board cards compete automatically. Press Ready to begin."] },
  "r1-round-result": { title: "Points for rank, BB for your next hand", next: "Finish the basics", body: ["This table totals all three matches. Points determine ranking; BB buys cards for the next round."], more: ["Practice shows the first match in detail and automatically settles the other two.", "A real game runs from R1 to R5 with different rules. You choose an ability in the real game."] },
  "r2-wait": { title: "Choose from the shared card pool", goal: "Pick one open Draft card", body: ["We have brought you to your turn. Choose one remaining card, without a time limit."], more: ["Lower cumulative Points pick first, then higher BB breaks ties. First Class holders have priority."] },
  "r2-anchor": { title: "One lead card plays twice", goal: "Choose a lead and support cards, then ready up", body: ["Lead + RUN 1 support, then lead + RUN 2 support: two boards against the same opponent."], more: ["The support cards must be different. You can adjust the lineup before confirming."] },
  "r2-run1": { title: "First board result", next: "Watch RUN 2", body: ["Your lead and RUN 1 support were used. Next, the support card and board change while the lead stays."] },
  "r2-run2": { title: "Both RUNs count", next: "View round standings", body: ["Losing one RUN does not stop you earning Points in the other. Both results count."] },
  "r2-round-result": { title: "Nobody is eliminated in R2", next: "Finish practice", body: ["Review the Points and BB earned across both RUNs. Survival becomes part of the next round."] },
  "r3-shop": { title: "Collect four, use exactly two", goal: "Own four cards", body: ["Exactly two hole cards + exactly three board cards form your hand. The best valid combination is chosen automatically."], more: ["Four matching suits on the board do not make a Flush if you hold only one of that suit."] },
  "r3-commit": { title: "Try the 2+3 rule", goal: "Press Ready", body: ["Three matches add to cumulative Points. Watch which two hole cards are used in the first match."] },
  "r3-survival": { title: "The bottom two are eliminated", next: "Finish practice", body: ["All three matches and any survival tiebreak are settled automatically here. A tie at the cutoff is decided by that extra match."] },
  "r4-draft": { title: "Strengthen your hand in the Draft", goal: "Pick one open Draft card", body: ["The Draft works like R2. This time, a shop opens afterwards."] },
  "r4-shop": { title: "Swap cards if you want", next: "Continue with this hand", body: ["Keep your hand if you like it. To swap, sell a card you own and buy one from the shop."] },
  "r4-rule": { title: "The 2+3 restriction is gone", goal: "Prepare five cards and press Ready", body: ["Use the strongest five cards freely from your five hole cards and five board cards."] },
  "r4-enter-secondary": { title: "Check your bracket", goal: "Start the second stage", body: ["The winner bracket has qualified and competes for extra Points. The survival bracket fights for one remaining place."] },
  "r4-secondary": { title: "Same hand, bracket match", next: "Finish practice", body: ["This is your bracket match result. Four survivors reach the final round."] },
  "r5-shop": { title: "No shared board in the final", goal: "Own seven cards", body: ["Build your strongest five from seven hole cards alone. Buy cards to complete your final hand."] },
  "r5-commit": { title: "Four players, one final showdown", goal: "Press Ready", body: ["Cards reveal in sequence and each player's strongest five are highlighted."] },
  "r5-best5": { title: "Your bright five form the final hand", next: "View match result", body: ["The five bright cards are used. The two dim cards are excluded from hand comparison."] },
  "r5-result": { title: "The final hand ranking", next: "View total score", body: ["The four hands determine placing and placement Points. Next, check the overall game score."] },
  "r5-score": { title: "Best final hand does not always win overall", next: "Finish practice", body: ["Total score = cumulative Points + hand score + BB conversion."], more: ["Every 10 BB converts to one point; the remainder is discarded. R5 placement Points are already included in cumulative Points."] },
};
const SHOWDOWN_COPY: Record<string, Copy> = {
  vs: { title: "Your hand plays automatically", next: "Watch the board reveal", body: ["The community board is shared by both players. No betting or card clicking is needed; just watch the reveal."], more: ["Three cards (Flop), one (Turn), then one (River) are revealed."] },
  best5: { title: "The bright five cards form your hand", next: "View match result", body: ["The game picks your strongest five automatically. Look at the highlighted cards and hand name."] },
  result: { title: "Check the result and rewards", next: "View round standings", body: ["Hands are compared to decide the result. The BB and Points actually earned appear below."], more: ["Equal hand types compare their ranks, then remaining high cards (kickers) if needed. Suits have no rank."] },
};

export function englishStepCopy(step: TutorialStep): Copy {
  return EN_STEPS[step.id] ?? SHOWDOWN_COPY[step.id.split("-").at(-1) ?? ""] ??
    { title: step.title, body: step.body, more: step.more, goal: step.goal, next: step.next };
}
