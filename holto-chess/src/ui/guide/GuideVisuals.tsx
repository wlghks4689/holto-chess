import type { HandCategory } from "../../core/poker/evaluate";
import { cardPrice } from "../../game/config";
import type { TranslationKey } from "../../i18n";
import type { GuideCopy } from "./guideCopy";
import { GUIDE_RULES, HAND_KEY, HAND_LADDER, handScore } from "./guideRules";

/**
 * Static example scenes. They draw fixed cards only: nothing here evaluates hands or touches game
 * state, so the guide can never drift into a second implementation of the rules.
 */
const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function GCard({ code, on, off, tag }: { code: string; on?: boolean; off?: boolean; tag?: string }) {
  const rank = code.slice(0, -1).replace("T", "10"); const suit = code.slice(-1);
  const red = suit === "h" || suit === "d";
  return <span className={`pg-card${red ? " red" : ""}${on ? " on" : ""}${off ? " off" : ""}`} aria-label={`${rank}${SUITS[suit]}`}>
    <b>{rank}</b><i>{SUITS[suit]}</i>{tag ? <small>{tag}</small> : null}
  </span>;
}

export function GCards({ codes, on = [], off = [], label }: { codes: string[]; on?: string[]; off?: string[]; label?: string }) {
  return <div className="pg-cardset">
    {label ? <span className="pg-cardset-label">{label}</span> : null}
    <div className="pg-cards">{codes.map((code) => <GCard key={code} code={code} on={on.includes(code)} off={off.includes(code)} />)}</div>
  </div>;
}

export function PoolScene({ copy }: { copy: GuideCopy["beginner"]["pool"] }) {
  return <figure className="pg-scene pg-pool">
    <div className="pg-pool-row"><GCards label={copy.mine} codes={["7h", "6h"]} /><GCards label={copy.other} codes={["9h", "9s"]} /></div>
    <div className="pg-pool-shop"><GCards label={copy.shop} codes={["5h", "Kc"]} /><span className="pg-ghost" aria-hidden="true"><GCard code="9h" off /></span></div>
    <figcaption>{copy.blocked}</figcaption>
  </figure>;
}

export function ShopScene({ copy }: { copy: GuideCopy["beginner"]["shop"] }) {
  const offers: [string, number, string][] = [["Ac", cardPrice(14), copy.tags[0]], ["7s", cardPrice(7), copy.tags[1]], ["6h", cardPrice(6), copy.tags[2]]];
  return <figure className="pg-scene pg-shop">
    <GCards label={copy.current} codes={["7h"]} on={["7h"]} />
    <div className="pg-cardset"><span className="pg-cardset-label">{copy.offer}</span>
      <div className="pg-offers">{offers.map(([code, price, tag], index) => <div key={code} className={`pg-offer${index ? " fit" : ""}`}><GCard code={code} /><strong>{price} BB</strong><small>{tag}</small></div>)}</div>
    </div>
  </figure>;
}

const LADDER_EXAMPLES: Record<HandCategory, string[]> = {
  HIGH_CARD: ["As", "Jd", "8c", "6h", "3s"], PAIR: ["9s", "9h", "Kd", "7c", "4s"], TWO_PAIR: ["Js", "Jd", "5c", "5h", "As"],
  TRIPS: ["8s", "8h", "8d", "Kc", "3s"], STRAIGHT: ["9c", "8d", "7s", "6h", "5c"], FLUSH: ["Ah", "Jh", "9h", "6h", "2h"],
  FULL_HOUSE: ["Qs", "Qh", "Qd", "4c", "4s"], QUADS: ["7s", "7h", "7d", "7c", "Ks"], STRAIGHT_FLUSH: ["9s", "8s", "7s", "6s", "5s"], ROYAL_FLUSH: ["Ad", "Kd", "Qd", "Jd", "Td"],
};
/** Which cards make the hand, so the example highlights the pattern rather than all five. */
const LADDER_FOCUS: Partial<Record<HandCategory, string[]>> = {
  HIGH_CARD: ["As"], PAIR: ["9s", "9h"], TWO_PAIR: ["Js", "Jd", "5c", "5h"], TRIPS: ["8s", "8h", "8d"], QUADS: ["7s", "7h", "7d", "7c"],
};

export function HandLadder({ t, copy }: { t: (key: TranslationKey) => string; copy: GuideCopy["beginner"]["hands"] }) {
  return <figure className="pg-scene pg-ladder">
    <span className="pg-ladder-end">{copy.low} ↓</span>
    <ol>{HAND_LADDER.map((category, index) => {
      const cards = LADDER_EXAMPLES[category];
      return <li key={category}><span className="pg-ladder-rank">{String(index + 1).padStart(2, "0")}</span><strong>{t(HAND_KEY[category])}</strong>
        <div className="pg-cards mini">{cards.map((code) => <GCard key={code} code={code} on={(LADDER_FOCUS[category] ?? cards).includes(code)} />)}</div>
        <em>{handScore(category)}</em></li>;
    })}</ol>
    <span className="pg-ladder-end">{copy.high}</span>
  </figure>;
}

type Labels = GuideCopy["beginner"]["rounds"]["labels"];

export function HoldemScene({ labels }: { labels: Labels }) {
  const best = ["Kh", "Qh", "Jh", "Ts", "9c"];
  return <figure className="pg-scene"><GCards label={labels.hole} codes={["Kh", "Qh"]} on={best} /><span className="pg-op">+</span>
    <GCards label={labels.board} codes={["Jh", "7c", "Ts", "2d", "9c"]} on={best} off={["7c", "2d"]} /><span className="pg-op eq">=</span>
    <GCards label={labels.best} codes={best} on={best} /></figure>;
}

export function RunScene({ labels }: { labels: Labels }) {
  return <figure className="pg-scene pg-run" aria-label="K♠ + 10♦ → RUN 1, K♠ + 8♦ → RUN 2">
    <div className="pg-run-anchor"><GCard code="Ks" on tag={labels.anchor} /></div>
    <svg className="pg-run-lines" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M100 0 L40 40 M100 0 L160 40" /></svg>
    <div className="pg-run-split">
      <div><GCard code="Td" /><strong>{labels.run} 1</strong><small>K♠ + 10♦</small></div>
      <div><GCard code="8d" /><strong>{labels.run} 2</strong><small>K♠ + 8♦</small></div>
    </div>
  </figure>;
}

export function OmahaScene({ labels }: { labels: Labels }) {
  const hole = ["Ah", "Kh"]; const board = ["Qh", "Jh", "9h"];
  return <figure className="pg-scene"><GCards label={`${labels.hole} · 2`} codes={["Ah", "Kh", "7c", "7d"]} on={hole} off={["7c", "7d"]} /><span className="pg-op">+</span>
    <GCards label={`${labels.board} · 3`} codes={["Qh", "Jh", "2s", "9h", "3d"]} on={board} off={["2s", "3d"]} /><span className="pg-op eq">=</span>
    <GCards label={labels.best} codes={[...hole, ...board]} on={[...hole, ...board]} /></figure>;
}

export function BracketScene({ labels }: { labels: Labels }) {
  return <figure className="pg-scene pg-bracket">
    <div className="pg-bracket-top"><span className="pg-dots" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span><strong>{labels.primary}</strong></div>
    <div className="pg-bracket-split">
      <div className="pg-group win"><strong>{labels.winnerGroup}</strong><small>{labels.winnerNote}</small></div>
      <div className="pg-group survive"><strong>{labels.survivalGroup}</strong><small>{labels.survivalNote}</small></div>
    </div>
    <div className="pg-bracket-foot">6 → 4</div>
  </figure>;
}

/** R5: six cards split into three two-card hands, each playing its own RUN. */
export function TripleRunScene({ labels }: { labels: Labels }) {
  const runs = [["As", "Ad"], ["Kh", "Qh"], ["9c", "8c"]];
  return <figure className="pg-scene pg-run pg-triple-run" aria-label="A♠ A♦ → RUN 1, K♥ Q♥ → RUN 2, 9♣ 8♣ → RUN 3">
    <GCards label={labels.hole} codes={runs.flat()} on={runs.flat()} />
    <div className="pg-run-split">{runs.map((codes, index) => <div key={codes[0]}><GCards label={`${labels.run} ${index + 1}`} codes={codes} on={codes} /></div>)}</div>
  </figure>;
}

/** R6: five of up to seven owned cards play (the other two are BURN), then BEST 5 with the board. */
export function SevenCardScene({ labels }: { labels: Labels }) {
  const played = ["9c", "9d", "4h", "4c", "Ks"]; const board = ["9s", "4d", "Jh", "3c", "8d"];
  const best = ["9c", "9d", "9s", "4h", "4c"];
  return <figure className="pg-scene"><GCards label={labels.mine} codes={[...played, "2d", "7s"]} on={played} off={["2d", "7s"]} /><span className="pg-op eq">→</span>
    <GCards label={labels.lineup} codes={played} on={best} /><span className="pg-op">+</span>
    <GCards label={labels.board} codes={board} on={best} /></figure>;
}

export function SurvivalFlow() {
  return <ol className="pg-flow" aria-label={GUIDE_RULES.alive.map((n, i) => `R${i + 1} ${n}`).join(", ")}>
    {GUIDE_RULES.alive.map((alive, index) => <li key={index} className={index > 0 && alive < GUIDE_RULES.alive[index - 1]! ? "cut" : ""}>
      <span>R{index + 1}</span><b>{alive}</b><i aria-hidden="true">{Array.from({ length: GUIDE_RULES.players }, (_, seat) => <em key={seat} className={seat < alive ? "in" : ""} />)}</i>
    </li>)}
  </ol>;
}
