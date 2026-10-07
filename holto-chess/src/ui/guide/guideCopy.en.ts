import type { GuideCopy } from "./guideCopy";
import { ABILITY_DECK_SIZE, ABILITY_NUMBERS as A, GUIDE_RULES as R } from "./guideRules";

const P = R.points;
const T = R.tripleRun;
const [f1, f2, f3] = R.finalPlacement;

export const guideCopyEn: GuideCopy = {
  title: "How to Play", close: "Close", home: "Back to guide start",
  chooser: {
    kicker: "GAME GUIDE", title: "New to PORENA?", lead: "Read only as much as you need.",
    beginner: { title: "Learn from the start", lead: "No poker experience needed. One scene at a time, from buying cards to the final score.", cta: "Beginner guide" },
    rules: { title: "See the full rules", lead: "Already know poker? Look up PORENA's rounds, scoring, economy and abilities.", cta: "Rule book" },
  },
  tabs: { beginner: "Beginner guide", rules: "Rule book" },
  beginner: {
    identity: {
      kicker: "01 · PORENA", title: "Don't wait for good cards.\nCollect the ones you need.",
      lead: "PORENA is a strategy poker game where you design your own hand.",
      pillars: [
        { title: `${R.players} players`, body: "Empty seats are filled by AI, so every game has eight." },
        { title: `One ${R.poolSize}-card pool`, body: "Everyone takes cards from the same single deck." },
        { title: "Buy, sell, pick", body: "Build your hand through the shop and the draft." },
        { title: "New rules each round", body: "Collect points over six rounds and aim for first." },
      ],
    },
    pool: {
      kicker: "02 · SHARED POOL", title: "Everyone shares the cards", lead: "One deck of 52 is all there is. A card someone owns cannot belong to anyone else.",
      mine: "Your cards", other: "Another player", shop: "Your shop", blocked: "9♥ is already owned by someone else, so it never shows up in your shop.",
      takeaway: "Reading what others have taken is part of the strategy.",
    },
    shop: {
      kicker: "03 · SHOP", title: "Build your hand in the shop", lead: "Each round your shop offers cards. Pay BB to add them to your hand.",
      current: "Your card", offer: "Shop",
      tags: ["Highest card", "Makes a pair", "Straight & flush link"],
      actions: [["Buy", "Pay BB and take the card."], ["Sell", "Sell a card you own for part of its BB back."], ["Reroll", "Pay BB to draw new shop cards."], ["Lock", "Keep a card you like through the next reroll."]],
      takeaway: "An ace is not always the answer. The best card depends on the hand you are building.",
    },
    bb: {
      kicker: "04 · BB", title: "BB is the game's money", lead: "You spend it on cards and the shop, and earn it by winning matches and reaching new rounds.",
      uses: [["Spend on", "Cards · rerolls · locks"], ["Earn from", "Round income · match rewards · selling"], ["At the end", "Part of your leftover BB becomes final score"]],
      takeaway: "Buying a strong card now or saving BB is a strategic choice.",
    },
    hands: { kicker: "05 · HAND RANKING", title: "Poker hands", lead: "Combinations of five cards. Lower in the list means stronger.", low: "Weaker", high: "Stronger", note: "The number is the hand score you earn in the final round." },
    rounds: {
      kicker: "06 · ROUNDS", title: "Every round changes the rules", lead: "All six rounds are a different kind of poker. Take them one at a time.",
      r1: { name: "TWO HAND", tagline: "Start with familiar Hold'em.", bullets: ["You fight with your two cards.", "Five board cards open in the middle.", "The best five of those seven cards (BEST 5) decides the winner.", "Three matches, and nobody is eliminated yet."] },
      r2: { name: "RUN IT TWICE", tagline: "Three cards, two fights.", bullets: ["Pick one card in the open draft to make three.", "One card is the anchor used in both runs.", "The other two are used once each, in RUN 1 and RUN 2.", "You play two matches with that lineup against different opponents; every run scores."] },
      r3: { name: "AUCTION · OMAHA", tagline: "Win your fourth card at auction; four cards, but you can't pick freely.", bullets: [`Win one card in a ${R.auction.cardCount}-card auction, one card per player.`, "Won nothing? Buy one leftover card at double price.", "Always exactly 2 of your cards + 3 board cards.", "Three matches; the bottom two in points leave."] },
      r4: { name: "BEST FIVE", tagline: "Your 5 cards and 5 board cards: best 5 of 10.", bullets: ["The first match splits players into a winner group and a survival group.", "The winner group plays for extra points.", "Only one of the three in the survival group stays."] },
      r5: { name: "RUN IT THREE TIMES", tagline: "Six cards split into three hands, three fights.", bullets: ["1st place picks an opponent; the other two play each other.", "Reach six cards in the shop and place two in each of RUN 1, 2 and 3.", "Each RUN gets a new board. Both players see all RUN cards and estimated odds on the match loading screen.", `A RUN win pays +${T.win}P, a 3:0 adds +${T.sweepBonus}P. Afterwards the lowest total leaves.`] },
      r6: { name: "THE LAST HAND", tagline: "Play five of your five to seven cards; BEST 5 with the board.", bullets: ["The last three players face off at once.", "Hold five to seven cards from the shop and pick the five you play. The rest are shown as BURN cards.", "The strongest five of your five and the community board decide it, then the final score is calculated."] },
      labels: { hole: "Your cards", board: "Board", best: "BEST 5", anchor: "Anchor", run: "RUN", mine: "Up to 7 owned cards", players: " players", noBoard: "No board", lineup: "Five played",
        primary: "First match · 1v1 ×3", winnerGroup: "Winner group · 3", survivalGroup: "Survival group · 3", winnerNote: "Extra points", survivalNote: "1 survives · 2 out", draft: "Starts with an open draft",
        auction: "Starts with a card auction", pick: "1st place picks an opponent" },
    },
    survival: {
      kicker: "07 · SURVIVAL", title: "When are players eliminated?", lead: "Everyone survives R1 and R2. Two players leave in R3, two in R4 and one in R5.",
      placements: ["The three who reach R6: 1st–3rd by final score", "Out in R5: 4th", "Out in R4: 5th–6th", "Out in R3: 7th–8th"],
    },
    score: {
      kicker: "08 · FINAL SCORE", title: "The final score adds three things", lead: "After R6, these are added up to set the ranking.",
      blocks: { points: "Total points", pointsNote: "Points earned in R1–R6", hand: "Hand score", handNote: "Your R6 BEST 5", bb: "Leftover BB", bbNote: `1 point per ${R.stackScoreUnitBB} BB` },
      abilityNote: "Points and BB earned from abilities are already included.",
      formula: `Final score = total points + R6 hand score + ⌊leftover BB ÷ ${R.stackScoreUnitBB}⌋`,
    },
    abilities: { kicker: "09 · ABILITY", title: "Your own ability", lead: "At the start you pick a face-down card and gain one ability. It shapes what you buy, how you manage BB and which hands you chase.", note: "All eight players get a different ability." },
    toRules: { text: "Want the exact numbers and edge cases?", cta: "Open the full rule book" },
  },
  rules: {
    kicker: "RULE BOOK", title: "PORENA Rule Book", lead: "Assumes you know poker hands and BEST 5. PORENA-specific rules and numbers only.", toBeginner: "Prefer to learn the flow first? Open the beginner guide",
    nav: ["Basics", "Card pool", "Economy", "Rounds", "Draft", "Points", "Elimination", "Final score", "Abilities", "Ties & edge cases"],
    basics: {
      title: "Basics",
      rows: [["Players", `${R.players} · AI fills empty seats`], ["Card pool", `${R.poolSize} unique cards, shared`], ["Starting BB", `${R.startBB} BB · no starting card (buy both R1 cards)`], ["Round income", `+${R.roundIncomeBB} BB to survivors at the start of R2–R6`], ["Shop cards", `R1 ${R.shopSizes[1]} · R4 ${R.shopSizes[4]} · R5 ${R.shopSizes[5]} · R6 ${R.shopSizes[6]}`], ["Reroll / lock", `${R.rerollCostBB} BB / ${R.lockCostBB} BB`], ["Selling", `${R.sellPercent}% of base price (rounded down)`], ["Time limits", `Shop ${R.timers.shop}s · draft pick ${R.timers.draftPick}s · R3 auction ${R.timers.auction}s (${R.timers.auctionIntro}s intro) · R5 opponent pick ${R.timers.opponentPick}s · RUN loadout ${R.timers.runLoadout}s`]],
      perRound: { title: "Limits by round", round: "Round", hand: "Hand size", buys: "Buys", rerolls: "Rerolls", noShop: "No shop" },
      prices: "Card prices (BB)",
    },
    pool: {
      title: "Card pool",
      items: ["Each of the 52 cards exists once. A card someone owns never appears in another player's shop or draft.", "A card sitting in your shop is also withheld from other players while it is there.", "Sold cards and the cards of eliminated players return to the pool.", "Opponents' cards stay hidden until the showdown reveals them.", "Board cards never overlap with cards owned by that match's players."],
    },
    economy: {
      title: "Economy",
      income: [["Start", `${R.startBB} BB`], ["Round income", `+${R.roundIncomeBB} BB (R2–R6)`], ["Leftover BB score", `⌊BB ÷ ${R.stackScoreUnitBB}⌋`]],
      matchTitle: "BB for regulation matches", matchHead: ["Round", "Win", "Loss"],
      matchRows: [
        ["R1", "0", `+${R.matchBB.r1.base} (+${R.matchBB.r1.step} × loss streak)`],
        ["R2 runs", "0", "0"],
        ["R3", "0", `+${R.matchBB.r3.base} (+${R.matchBB.r3.step} × loss streak)`],
        ["R4 · R5 · R6", "0", "0"],
      ],
      notes: ["Only the losing player earns match BB. Wins and splits earn points only.", "A loss streak counts the losses in a row earlier in this round; it restarts every round.", "A forfeit for missing cards earns no BB and no points.", "Buy and reroll limits reset every round."],
    },
    rounds: {
      title: "Rounds",
      r1: { name: "HOLD'EM SWISS", tagline: "Hold'em · 3 Swiss matches", specs: [["Players", "8"], ["Cards", "2"], ["Matches", "1v1 Swiss ×3"], ["Points", `Win +${P.r1.win}P · Split +${P.r1.split}P`], ["Rule", "BEST 5 of 2 hole + 5 board"], ["Elimination", "None"]],
        details: ["The same two cards play all three matches. Matches 2 and 3 pair players with similar records."] },
      r2: { name: "RUN IT TWICE", tagline: `${R.draftCards[2]}-card open draft → split runs`, specs: [["Players", "8"], ["Cards", "3"], ["Matches", "1v1 × 2 matches (new opponent) · 2 runs each"], ["Points", `Per run: win +${P.r2Run.win}P · split +${P.r2Run.split}P · match sweep +${P.r2Run.sweepBonus}P`], ["Rule", "Anchor 1 + support 1 + board 5"], ["Elimination", "None"]],
        details: ["No personal shop. The third card comes from the draft.", "RUN 1 = anchor + support 1, RUN 2 = anchor + support 2, on different boards.", `An unfinished loadout is completed automatically after ${R.timers.runLoadout}s.`] },
      r3: { name: "AUCTION · OMAHA SWISS", tagline: `${R.auction.cardCount}-card auction → Omaha · 3 Swiss matches`, specs: [["Players", "8"], ["Cards", "4"], ["Matches", "1v1 Swiss ×3"], ["Points", `Win +${P.r3.gameWin}P · Split +${P.r3.gameSplit}P`], ["Rule", "Exactly 2 hole + exactly 3 board"], ["Elimination", "Bottom 2 in points"]],
        details: [`No personal shop. A ${R.auction.cardCount}-card auction (${R.timers.auction}s, extended by bids in the last 3s up to 55s) lets each player win ${R.auction.maxWins} card.`, `An opening bid is the base price; a competing bid must beat the highest by ${R.auction.minRaiseBB}BB or more. Bids can't be cancelled, and only cards you win cost BB.`, `Players who won nothing buy one leftover card at ${R.auction.buybackMultiplier}× price in draft order. No ability discount applies, and selling it later uses the base price.`, `A ${R.timers.auctionIntro}s rules intro comes first; bidding opens for everyone at the same moment.`, "Match 1 pairings follow total points (then BB)."] },
      r4: { name: "BEST FIVE OF TEN", tagline: "Open draft → shop → bracket", specs: [["Players", "6"], ["Cards", "5"], ["Matches", "1v1 ×3 → two 3-player groups"], ["Points", `First match: win +${P.r4Primary.win}P · split +${P.r4Primary.split}P`], ["Rule", "BEST 5 of 5 hole + 5 board"], ["Elimination", "2 from the survival group"]],
        details: [`Take one card from the draft (${R.draftCards[4]} revealed), then the personal shop opens.`, "The three first-match winners form the winner group; the three losers form the survival group.", `Winner group: 1st +${P.r4WinnerGroup.first}P · 2nd +${P.r4WinnerGroup.second}P · 3rd +${P.r4WinnerGroup.third}P. Tied 2nd pays +${P.r4WinnerGroup.tiedSecond}P each.`, `Survival group: only 1st survives (+${P.r4LoserGroup.survive}P); two are eliminated.`] },
      r5: { name: "RUN IT THREE TIMES", tagline: "Opponent pick → shop → three-hand loadout", specs: [["Players", "4"], ["Cards", "6 (three pairs)"], ["Matches", "1v1 · 3 runs"], ["Points", `RUN win +${T.win}P · split +${T.split}P · 3:0 +${T.sweepBonus}P`], ["Rule", "Each RUN: 2 hole + a new 5-card board"], ["Elimination", "Lowest total, 1 player"]],
        details: [`1st place (points, then BB) picks an opponent; with no pick in ${R.timers.opponentPick}s, 4th place is chosen. The other two play each other.`, `Shop ${R.shopSizes[5]} cards · ${R.purchaseLimits[5]} buys · ${R.rerollLimits[5]} rerolls to reach exactly six. At time-out, missing cards are bought from your own shop.`, `Place two cards in each of RUN 1, 2 and 3 (${R.timers.runLoadout}s; the recommended split otherwise). Both players see all RUN cards and estimated odds on the match loading screen after placement is locked.`, `Any split cancels the 3:0 bonus. Without six cards every RUN is a forfeit, and the opponent gets only the ${T.win * T.runs}P for the RUNs.`, "A points tie at the cut goes to BB (fewer BB is out). Equal BB too: a new-board tiebreak with RUN 1, 2, then 3 hands, then a high-card draw."] },
      r6: { name: "THE LAST HAND", tagline: "Shop → five played → three-way final", specs: [["Players", "3"], ["Cards", `Own ${R.minHands[6]}–${R.handLimits[6]} · play 5`], ["Matches", "All three at once · one board"], ["Points", `+${f1} / +${f2} / +${f3}P`], ["Rule", "BEST 5 of your five and the board · rest shown as BURN"], ["Elimination", "Final ranking"]],
        details: [`Shop ${R.shopSizes[6]} cards · ${R.purchaseLimits[6]} buys · ${R.rerollLimits[6]} rerolls. At time-out you are topped up to ${R.minHands[6]} cards.`, "Tied places pool their points and split them, giving more to the player with more BB."] },
    },
    draft: {
      title: "Open draft",
      order: ["The First Class holder", "Lower total points", "Same points: more BB", "Still tied: random"],
      items: [`R2 reveals ${R.draftCards[2]} cards and R4 reveals ${R.draftCards[4]}; each player takes one.`, "The R3 double-price buyback for players who won no auction card uses the same order.", "Draft cards cost their price in BB. With nothing affordable, your turn is skipped.", `Each turn lasts ${R.timers.draftPick}s; a card is picked automatically when time runs out.`],
    },
    points: {
      title: "Points", head: ["Round", "Match", "Points"],
      rows: [
        ["R1", "Swiss match", `Win +${P.r1.win} · Split +${P.r1.split}`],
        ["R2", "Every run (2 matches · 4 runs)", `Win +${P.r2Run.win} · Split +${P.r2Run.split} · both runs of a match won +${P.r2Run.sweepBonus}`],
        ["R3", "Swiss match", `Win +${P.r3.gameWin} · Split +${P.r3.gameSplit}`],
        ["R4", "First match", `Win +${P.r4Primary.win} · Split +${P.r4Primary.split} each`],
        ["R4", "Winner group", `+${P.r4WinnerGroup.first} / +${P.r4WinnerGroup.second} / +${P.r4WinnerGroup.third} (tied 2nd +${P.r4WinnerGroup.tiedSecond} each)`],
        ["R4", "Survival group", `Survive +${P.r4LoserGroup.survive}`],
        ["R5", "Every run (1v1 · 3 runs)", `Win +${T.win} · Split +${T.split} · all three runs won +${T.sweepBonus}`],
        ["R6", "Final placement", `+${f1} / +${f2} / +${f3}`],
      ],
    },
    elimination: {
      title: "Elimination",
      items: [`Players remaining: ${R.alive.join(" → ")}`, "R3: after three matches, the bottom two in total points are eliminated.", "A tie on the R3 cut line triggers a survival tiebreak on a new board. It awards no points or BB and only decides who survives. In R3, BB never breaks the tie.", `If all ${R.maxSuddenDeathBoards + 1} tiebreak boards tie, a random rank draw decides.`, "R4: only the top player of the three-player survival group stays; two are eliminated.", "R5: the lowest total is eliminated. Equal points go to BB; equal BB too goes to a RUN 1, 2, 3 hand tiebreak.", "Eliminated players' cards return to the pool, and their placement is fixed by their points at that time."],
    },
    final: {
      title: "Final score", formula: `Total points + R6 hand score + ⌊leftover BB ÷ ${R.stackScoreUnitBB}⌋`, handTitle: "Hand score", placementTitle: "Final placement",
      items: ["The three R6 players take 1st–3rd by final score. On equal scores, the better R6 placement ranks higher.", "The R5 exit takes 4th, R4 exits take 5th–6th and R3 exits take 7th–8th, ordered by points when eliminated. BB and hands never reorder those bands.", "Ability rewards are not added separately: the points and BB they paid are already in the formula.", `The rank points on the result screen (${R.rankPoints.map((v) => (v > 0 ? `+${v}` : `${v}`)).join(" / ")}) mark 1st–8th for display and are not added to the final score.`],
    },
    abilities: {
      title: "Abilities",
      intro: [`Before the game, players take turns choosing one of ${ABILITY_DECK_SIZE} face-down cards. All ${R.players} get a different ability.`, "When time runs out, one of the remaining cards is chosen automatically.", "Match-reward abilities only trigger in regulation matches. Tiebreak boards never pay ability rewards."],
      effect: "Effect", timing: "When", notes: "Notes",
    },
    ties: {
      title: "Ties & edge cases",
      items: ["Equal hands compare every kicker. Suits never break ties; fully equal hands split.", `If an R4 first match splits, both players get +${P.r4Primary.split}P and only the group placement is decided on new boards (up to ${R.maxSuddenDeathBoards}, then a random rank draw). That decider awards no extra points.`, "Ties in the R4 winner group decide 1st only; tied 2nd places each receive the tied-2nd points.", `A split R5 RUN pays both players +${T.split}P, and any split cancels the 3:0 bonus.`, "Tied R6 places share their points in proportion to leftover BB (ICM).", "Missing the required number of cards forfeits that match with no points or BB. No free cards or debt are created. In R5 and R6, missing cards are bought from your shop at time-out to avoid a forfeit.", "When a timer ends, unfinished actions are completed automatically so the game never stalls."],
    },
  },
  abilities: {
    "royal-blood": { style: "Start with a high card and collect expensive ranks cheaply.", effect: `Your starting card is an A, K, Q, J or T. Cards of those ranks cost ${A["royal-blood"].discountPercent}% (rounded down) in the shop and draft.`, timing: "Game start · every purchase", notes: ["Example: Q 15 BB → 7 BB, A 20 BB → 10 BB."] },
    "target-sniper": { style: "Guard your free starting card and win with it.", effect: `Start R1 with one free random card. Win a regulation match outright with it in your BEST 5: +${A["target-sniper"].bb} BB.`, timing: "Every regulation win · each R2 and R5 run", notes: ["No hand requirement; a high-card win counts.", "Splits and tiebreak wins after a split do not count.", "Selling your starting card turns it off; buying it back turns it on again."] },
    underdog: { style: "Collect the cheapest cards, the 2s, for one final strike.", effect: `In the R6 final, a BEST 5 that contains a 2 and is a straight or better earns +${A.underdog.points}P.`, timing: "R6 final · win or lose", notes: ["Does not trigger in R1–R5."] },
    "first-class": { style: "Take the card you want before anyone else in the draft.", effect: "Picks first in the R2 and R4 open drafts and the R3 double-price buyback, regardless of standing.", timing: "R2 and R4 drafts · R3 buyback", notes: ["Everyone else keeps the normal order.", "No advantage in R3 auction bidding."] },
    "golden-hand": { style: "Swap cards often and keep your hand flexible.", effect: `+${A["golden-hand"].extraShop} personal shop card. Selling refunds ${A["golden-hand"].refundPercent}% of the base price.`, timing: "Rounds with a personal shop · when selling", notes: ["R2 and R3 have no personal shop, so no extra card there.", "Your starting card also sells at 100%."] },
    trader: { style: "Reroll freely until the right card appears.", effect: `Personal shop rerolls and locks are free. +${A.trader.extraRerolls} reroll each shop phase.`, timing: "Personal shop phases", notes: ["Not active in R2 and R3, which have no personal shop."] },
    predator: { style: "Chain wins and let the BB snowball.", effect: `Each solo regulation win adds 1 to your streak; from a ${A.predator.fromStreak}-win streak, every win pays streak × ${A.predator.bbPerStreak} BB.`, timing: "Every regulation win", notes: ["2 in a row +10 BB, 3 +15 BB, 4 +20 BB, and so on.", "The streak carries across rounds.", "A split or loss resets it to 0; tiebreak wins do not count."] },
    architect: { style: "Stack trips and pairs to engineer a full house.", effect: `When a regulation match ends in exactly a full house, +${A.architect.bb} BB.`, timing: "Every regulation match · win or lose · each R2 and R5 run", notes: ["Quads and higher hands do not count."] },
    capitalism: { style: "Bank BB and grow it with interest.", effect: `At the end of each round you survive, gain ${A.capitalism.percent}% of your BB (rounded down).`, timing: "Round end · once per round", notes: ["Not paid in the round you are eliminated.", "Also paid after R6."] },
    "quad-core": { style: "Complete quads in the final to double your placement points.", effect: `In the R6 final, any quads pay your final placement points ×${A["quad-core"].multiplier}.`, timing: "R6 final · placement scoring", notes: ["Any quads count.", "Only placement points are doubled.", "Quads in R1–R5 do not count."] },
    "front-runner": { style: "Hold first place every round and widen the gap.", effect: `Bonus points when you lead at the end of a round: ${R.rounds.map((n) => `R${n} +${A["front-runner"][`r${n}`]}P`).join(" · ")}.`, timing: "Round end · once per round", notes: ["In R1–R5 only the single top survivor on the standings (points → BB → seat) qualifies.", "In R6 it follows the final match placement, not the total score; every tied first place is paid."] },
    "zero-risk": { style: "Get paid back when a favoured fight goes wrong.", effect: `In R1–R5 1v1 regulation matches, losing with ${A["zero-risk"].equity60}%+ pre-match equity pays BB by tier.`, timing: "R1–R5 regulation 1v1 losses · each R2 and R5 run", notes: [`${A["zero-risk"].equity60}%+ +${A["zero-risk"].bb60} BB · ${A["zero-risk"].equity70}%+ +${A["zero-risk"].bb70} BB · ${A["zero-risk"].equity80}%+ +${A["zero-risk"].bb80} BB`, "Equity is the value shown on the match screen, rounded down.", "Does not apply to splits, the R6 final or tiebreaks."] },
  },
};
