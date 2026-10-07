import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { TranslationKey } from "../../i18n";
import type { GuideCopy, RoundSpec, Row } from "./guideCopy";
import { abilityThumb, CARD_PRICES, GUIDE_ABILITIES, GUIDE_RULES, HAND_KEY, HAND_LADDER, handScore } from "./guideRules";

const ROUNDS = GUIDE_RULES.rounds;
const rankLabel = (rank: number) => ({ 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" } as Record<number, string>)[rank] ?? String(rank);

function Rule({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return <section className="pg-rule" id={`pg-rule-${index}`} data-rule={index}>
    <h3><span>{String(index).padStart(2, "0")}</span>{title}</h3>
    {children}
  </section>;
}

const Items = ({ items }: { items: string[] }) => <ul className="pg-items">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
const Pairs = ({ rows }: { rows: Row[] }) => <dl className="pg-pairs">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return <div className="pg-table-wrap"><table className="pg-table">
    <thead><tr>{head.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

function RoundSpecCard({ round, spec }: { round: number; spec: RoundSpec }) {
  return <article className="pg-spec">
    <header><span>ROUND {round}</span><strong>{spec.name}</strong><small>{spec.tagline}</small></header>
    <dl>{spec.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <Items items={spec.details} />
  </article>;
}

/** The last section whose heading has scrolled up to the sticky contents bar. */
function useActiveRule(scroller: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>): number {
  const [active, setActive] = useState(1);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const update = () => {
      const line = (bar.current?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top) + 24;
      let current = 1;
      root.querySelectorAll<HTMLElement>("[data-rule]").forEach((node) => { if (node.getBoundingClientRect().top <= line) current = Number(node.dataset.rule); });
      // At the very bottom the last short sections can never reach the bar, so the final one wins.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) current = root.querySelectorAll("[data-rule]").length;
      setActive(current);
    };
    // Ten rectangle reads per scroll event is cheap enough to skip frame throttling.
    root.addEventListener("scroll", update, { passive: true });
    return () => root.removeEventListener("scroll", update);
  }, [scroller, bar]);
  return active;
}

export function RuleBook({ copy, t, scroller, onBeginner }: { copy: GuideCopy; t: (key: TranslationKey) => string; scroller: RefObject<HTMLElement | null>; onBeginner: () => void }) {
  const r = copy.rules;
  const nav = useRef<HTMLElement>(null);
  const active = useActiveRule(scroller, nav);
  // Scroll each axis on its own element: scrollIntoView would also move the page and cancel a jump in progress.
  useEffect(() => {
    const bar = nav.current; const chip = bar?.querySelector<HTMLElement>(`[data-target="${active}"]`);
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
  }, [active]);
  const jump = (index: number) => {
    const root = scroller.current; const target = root?.querySelector<HTMLElement>(`#pg-rule-${index}`);
    if (!root || !target) return;
    const offset = target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - (nav.current?.offsetHeight ?? 0) - 8;
    root.scrollTo({ top: offset, behavior: "smooth" });
  };
  const limits = GUIDE_RULES;
  return <div className="pg-rules">
    <header className="pg-rules-head"><span className="pg-kicker">{r.kicker}</span><h3>{r.title}</h3><p>{r.lead}</p></header>
    <nav ref={nav} className="pg-toc" aria-label={r.title}>
      {r.nav.map((label, i) => <button key={label} type="button" data-target={i + 1} aria-current={active === i + 1 ? "true" : undefined} onClick={() => jump(i + 1)}><b>{String(i + 1).padStart(2, "0")}</b>{label}</button>)}
    </nav>

    <Rule index={1} title={r.basics.title}>
      <Pairs rows={r.basics.rows} />
      <h4>{r.basics.perRound.title}</h4>
      <Table head={[r.basics.perRound.round, ...ROUNDS.map((n) => `R${n}`)]} rows={[
        // R6 holds five to seven cards; R2 and R3 have no shop (draft and auction).
        [r.basics.perRound.hand, ...ROUNDS.map((n) => limits.minHands[n] === limits.handLimits[n] ? String(limits.handLimits[n]) : `${limits.minHands[n]}~${limits.handLimits[n]}`)],
        [r.basics.perRound.buys, ...ROUNDS.map((n) => (limits.shopSizes[n] ? String(limits.purchaseLimits[n]) : r.basics.perRound.noShop))],
        [r.basics.perRound.rerolls, ...ROUNDS.map((n) => (limits.shopSizes[n] ? String(limits.rerollLimits[n]) : "—"))],
      ]} />
      <h4>{r.basics.prices}</h4>
      <div className="pg-prices">{CARD_PRICES.map(({ rank, price }) => <span key={rank}><b>{rankLabel(rank)}</b>{price}</span>)}</div>
    </Rule>

    <Rule index={2} title={r.pool.title}><Items items={r.pool.items} /></Rule>

    <Rule index={3} title={r.economy.title}>
      <Pairs rows={r.economy.income} />
      <h4>{r.economy.matchTitle}</h4>
      <Table head={r.economy.matchHead} rows={r.economy.matchRows} />
      <Items items={r.economy.notes} />
    </Rule>

    <Rule index={4} title={r.rounds.title}>
      <div className="pg-specs">{ROUNDS.map((n) => <RoundSpecCard key={n} round={n} spec={r.rounds[`r${n}`]} />)}</div>
    </Rule>

    <Rule index={5} title={r.draft.title}>
      <ol className="pg-order">{r.draft.order.map((line) => <li key={line}>{line}</li>)}</ol>
      <Items items={r.draft.items} />
    </Rule>

    <Rule index={6} title={r.points.title}><Table head={r.points.head} rows={r.points.rows} /></Rule>

    <Rule index={7} title={r.elimination.title}><Items items={r.elimination.items} /></Rule>

    <Rule index={8} title={r.final.title}>
      <p className="pg-formula">{r.final.formula}</p>
      <h4>{r.final.handTitle}</h4>
      <div className="pg-chips">{HAND_LADDER.map((category) => <span key={category}>{t(HAND_KEY[category])} <b>{handScore(category)}</b></span>)}</div>
      <h4>{r.final.placementTitle}</h4>
      <Items items={r.final.items} />
    </Rule>

    <Rule index={9} title={r.abilities.title}>
      <Items items={r.abilities.intro} />
      <div className="pg-accordion">{GUIDE_ABILITIES.map((ability) => {
        const entry = copy.abilities[ability];
        return <details key={ability}>
          <summary><img src={abilityThumb(ability)} alt="" width="36" height="36" loading="lazy" decoding="async" /><strong>{t(`ability.card.${ability}.name`)}</strong><span>{entry.timing}</span></summary>
          <dl><div><dt>{r.abilities.effect}</dt><dd>{entry.effect}</dd></div><div><dt>{r.abilities.timing}</dt><dd>{entry.timing}</dd></div>
            {entry.notes.length ? <div><dt>{r.abilities.notes}</dt><dd><ul>{entry.notes.map((note) => <li key={note}>{note}</li>)}</ul></dd></div> : null}</dl>
        </details>;
      })}</div>
    </Rule>

    <Rule index={10} title={r.ties.title}><Items items={r.ties.items} /></Rule>

    <aside className="pg-crosslink"><button type="button" className="secondary" onClick={onBeginner}>← {r.toBeginner}</button></aside>
  </div>;
}
