import type { ChapterId, StepText, TutorialStep } from "./tutorialTypes";

export const EN_CHAPTERS: Record<ChapterId, { title: string; summary: string }> = {
  1: { title: "Your first match", summary: "Buy two cards → ready up → watch → review" },
  2: { title: "Two runs", summary: "Open Draft · lead card and RUN lineups" },
  3: { title: "Auction and Omaha", summary: "Card auction · double-price buy · Omaha 2+3 · survival" },
  4: { title: "Your BEST 5", summary: "Unrestricted BEST 5 · winner and survival brackets" },
  5: { title: "Three hands, three runs", summary: "Leader picks an opponent · six cards · three RUNs · one out" },
  6: { title: "The three-way final", summary: "Boardless BEST 5 · five to seven cards · final score" },
};

type Copy = { title: string; body: StepText; more?: StepText; goal?: string; next?: string };
const EN_STEPS: Record<string, Copy> = {
  "r1-buy": {
    title: "Buy two cards", goal: "Buy two cards from the shop",
    body: ["R1 starts with an empty hand. Buy two of the four cards in your shop to build it. Two of the same rank start you with One Pair.", "High cards are strong but expensive. BB you keep pays for later rounds and counts toward your final score."],
    more: ["BB pays for cards and rerolls. Check the price on each buy button.", "Ranks increase from 2 to 10, then J, Q, K, A. Two matching suits alone are not a Flush."],
  },
  "r1-commit": { title: "Ready to play these two cards?", goal: "Press Ready", body: ["Your strongest five cards from two hole cards and five shared board cards compete automatically. Press Ready to begin."] },
  "r1-round-result": { title: "Points for rank, BB for your next hand", next: "Finish the basics", body: ["This table totals all three matches. Points determine ranking; BB buys cards for the next round."], more: ["Practice shows the first match in detail and automatically settles the other two.", "A real game runs from R1 to R6 with different rules. You choose an ability in the real game."] },
  "r2-wait": { title: "Choose from the shared card pool", goal: "Pick one open Draft card", body: ["We have brought you to your turn. Choose one remaining card, without a time limit."], more: ["Lower cumulative Points pick first, then higher BB breaks ties. First Class holders have priority."] },
  "r2-anchor": { title: "One lead card plays twice", goal: "Choose a lead and support cards, then ready up", body: ["Lead + RUN 1 support, then lead + RUN 2 support: two boards against the same opponent."], more: ["The support cards must be different. You can adjust the lineup before confirming."] },
  "r2-run1": { title: "First board result", next: "Watch RUN 2", body: ["Your lead and RUN 1 support were used. Next, the support card and board change while the lead stays."] },
  "r2-run2": { title: "Both RUNs count", next: "View round standings", body: ["A RUN win is +2P and a split +1P. Win both RUNs of a match for a +2P sweep bonus.", "The same lineup then plays one more match against a new opponent. Practice settles that second match automatically."] },
  "r2-round-result": { title: "Nobody is eliminated in R2", next: "Finish practice", body: ["Review the Points earned across both matches, four RUNs in all. Survival becomes part of the next round."] },
  "r3-auction": { title: "A card auction instead of a shop", goal: "Try a bid, then close the auction (bidding is optional)", body: ["R3 has no personal shop. In a 16-card auction each player wins at most one card, their fourth.", "Tap a card to select it, then tap again to bid its base price. On a card that already has a bid, bid at least 3BB above it."], more: ["A live auction opens after a 10-second intro and runs 40 seconds; bids in the last three seconds extend it up to 55 seconds. Practice closes it by button.", "Bids can't be cancelled, and only cards you win cost BB."] },
  "r3-buyback": { title: "No win? Double price", goal: "Buy one leftover card (continues on its own if you won)", body: (game) => game.players[0]!.ownedCardIds.length >= 4
    ? ["You won a card at auction. Players who won nothing buy one leftover card at double price."]
    : ["Players who won nothing buy one leftover card at double price, in draft order. Pick one."], more: ["Lower total points pick first, then more BB. No ability discount applies, and selling the card later uses its base price."] },
  "r3-omaha": { title: "Collect four, use exactly two", next: "Watch the match", body: ["Exactly two hole cards + exactly three board cards form your hand. The best valid combination is chosen automatically.", "Three matches add to cumulative Points. Watch which two hole cards are used in the first match."], more: ["Four matching suits on the board do not make a Flush if you hold only one of that suit."] },
  "r3-survival": { title: "The bottom two are eliminated", next: "Finish practice", body: ["All three matches and any survival tiebreak are settled automatically here. A tie at the cutoff is decided by that extra match."] },
  "r4-draft": { title: "Strengthen your hand in the Draft", goal: "Pick one open Draft card", body: ["The Draft works like R2. This time, a shop opens afterwards."] },
  "r4-shop": { title: "Swap cards if you want", next: "Continue with this hand", body: ["Keep your hand if you like it. To swap, sell a card you own and buy one from the shop."] },
  "r4-rule": { title: "The 2+3 restriction is gone", goal: "Prepare five cards and press Ready", body: ["Use the strongest five cards freely from your five hole cards and five board cards."] },
  "r4-enter-secondary": { title: "Check your bracket", goal: "Start the second stage", body: ["The winner bracket has qualified and competes for extra Points. The survival bracket fights for one remaining place."] },
  "r4-secondary": { title: "Same hand, bracket match", next: "Finish practice", body: ["This is your bracket match result. Four survivors reach the next round."] },
  "r5-pick": { title: "1st place picks an opponent", goal: "Check the pairings and open the shop", body: (game) => game.opponentSelect?.chooserId === "p1"
    ? ["You lead the standings, so you choose who to face. The other two play each other."]
    : ["The points leader chooses who to face. The other two play each other."], more: ["Every survivor's cards are shown on this screen. In a live game, 4th place is picked if no choice is made in 15 seconds."] },
  "r5-shop": { title: "Collect six cards", goal: "Own six cards", body: ["Your shop offers three cards and up to three buys, with two rerolls.", "R5 needs exactly six cards. In a live game, missing cards are bought from your own shop when time runs out."] },
  "r5-commit": { title: "Now split them into three hands", goal: "Press Ready", body: ["Press Ready to place two cards in each of RUN 1, 2 and 3."] },
  "r5-loadout": { title: "Which two cards play each RUN?", goal: "Lock RUN 1, 2 and 3", body: ["A recommended split is already in place. Tap a card, then the card it should trade places with.", "Each RUN's cards are revealed only when that RUN starts. Stack your strength or spread it: that is this round's strategy."], more: ["A RUN win pays +5P and a split +2P. Win all three RUNs with no split for +15P more."] },
  "r5-run1": { title: "A new board every RUN", next: "Watch the next RUN", body: ["RUN 1's two cards played a fresh five-card board. Next RUN, both cards change and a new board opens."] },
  "r5-runs": { title: "Three RUNs add up", next: "View round standings", body: ["A RUN win pays +5P and a split +2P. Win all three RUNs with no split for +15P more."] },
  "r5-elimination": { title: "The lowest total is eliminated", next: "Finish practice", body: ["Equal points go to BB: fewer BB is out. Equal BB too means a tiebreak with RUN 1, 2, then 3 hands, then a high-card draw."] },
  "r6-shop": { title: "Hold five to seven, play five", next: "Continue with this hand", body: ["In R6 you play five of your five to seven cards; the best five of those and the five-card community board make your hand.", "Your shop offers four cards and up to five buys. Sell and swap if you need to."], more: ["Fewer than five cards is a forfeit. In a live game you are topped up to five when time runs out."] },
  "r6-commit": { title: "Check the five you will play", goal: "Press Ready", body: ["Ready opens the lineup step. Holding exactly five, you play them as they are."] },
  "r6-lineup": { title: "Your five and your BURN cards", goal: "Confirm your five", body: ["Your strongest five are already in. Tap a BURN card and a played card in turn to swap them.", "In a live game you have 10 seconds; when time runs out the five on screen play."], more: ["BURN cards are shown to every player from the match screen on. Your five are revealed in the showdown."] },
  "r6-best5": { title: "The BEST 5 of your five and the board", next: "View match result", body: ["Your five plus the five-card board make ten cards; the strongest five of them is your hand. The bright cards are it."] },
  "r6-result": { title: "The final hand ranking", next: "View total score", body: ["The three hands decide the places and final points. Next, check the overall game score."] },
  "r6-score": { title: "Best final hand does not always win overall", next: "Finish practice", body: ["Total score = cumulative Points + hand score + BB conversion."], more: ["Every 10 BB converts to one point; the remainder is discarded. Final placement Points are already included in cumulative Points."] },
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
