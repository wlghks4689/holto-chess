import type { ReactNode } from "react";
import type { TranslationKey } from "../../i18n";
import type { BeginnerRound, GuideCopy } from "./guideCopy";
import { abilityThumb, GUIDE_ABILITIES, GUIDE_RULES, HAND_KEY, HAND_LADDER, handScore } from "./guideRules";
import { BracketScene, FinalScene, HandLadder, HoldemScene, OmahaScene, PoolScene, RunScene, ShopScene, SurvivalFlow } from "./GuideVisuals";

function Section({ kicker, title, lead, children, takeaway }: { kicker: string; title: string; lead?: string; children?: ReactNode; takeaway?: string }) {
  return <section className="pg-section">
    <header><span className="pg-kicker">{kicker}</span><h3>{title.split("\n").map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h3>{lead ? <p>{lead}</p> : null}</header>
    {children}
    {takeaway ? <p className="pg-takeaway">{takeaway}</p> : null}
  </section>;
}

function RoundCard({ index, round, cards, alive, scene, badge, labels }: { index: number; round: BeginnerRound; cards: number; alive: number; scene: ReactNode; badge?: string; labels: GuideCopy["beginner"]["rounds"]["labels"] }) {
  return <article className={`pg-round r${index}`}>
    <header><span className="pg-round-no">R{index}</span><div><strong>{round.name}</strong><p>{round.tagline}</p></div>
      <p className="pg-round-meta"><span>{labels.hole} <b>{cards}</b></span><span><b>{alive}</b>{labels.players}</span></p></header>
    {badge ? <span className="pg-badge">{badge}</span> : null}
    {scene}
    <ul>{round.bullets.map((line) => <li key={line}>{line}</li>)}</ul>
  </article>;
}

export function BeginnerGuide({ copy, t, onRules }: { copy: GuideCopy; t: (key: TranslationKey) => string; onRules: () => void }) {
  const b = copy.beginner; const labels = b.rounds.labels; const limits = GUIDE_RULES.handLimits; const alive = GUIDE_RULES.alive;
  return <div className="pg-beginner">
    <section className="pg-hero">
      <span className="pg-kicker">{b.identity.kicker}</span>
      <h3>{b.identity.title.split("\n").map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h3>
      <p>{b.identity.lead}</p>
      <ul className="pg-pillars">{b.identity.pillars.map((pillar, i) => <li key={pillar.title}><i>{["8", "52", "⇄", "R5"][i]}</i><strong>{pillar.title}</strong><span>{pillar.body}</span></li>)}</ul>
    </section>

    <Section {...b.pool}><PoolScene copy={b.pool} /><p className="pg-takeaway">{b.pool.takeaway}</p></Section>

    <Section {...b.shop} takeaway={b.shop.takeaway}>
      <ShopScene copy={b.shop} />
      <ul className="pg-actions">{b.shop.actions.map(([name, body]) => <li key={name}><strong>{name}</strong><span>{body}</span></li>)}</ul>
    </Section>

    <Section {...b.bb} takeaway={b.bb.takeaway}>
      <dl className="pg-bb">{b.bb.uses.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </Section>

    <Section {...b.hands} takeaway={b.hands.note}><HandLadder t={t} copy={b.hands} /></Section>

    <Section {...b.rounds}>
      <div className="pg-rounds">
        <RoundCard labels={labels} index={1} round={b.rounds.r1} cards={limits[1]} alive={alive[0]} scene={<HoldemScene labels={labels} />} />
        <RoundCard labels={labels} index={2} round={b.rounds.r2} cards={limits[2]} alive={alive[1]} badge={labels.draft} scene={<RunScene labels={labels} />} />
        <RoundCard labels={labels} index={3} round={b.rounds.r3} cards={limits[3]} alive={alive[1]} scene={<OmahaScene labels={labels} />} />
        <RoundCard labels={labels} index={4} round={b.rounds.r4} cards={limits[4]} alive={alive[2]} badge={labels.draft} scene={<BracketScene labels={labels} />} />
        <RoundCard labels={labels} index={5} round={b.rounds.r5} cards={limits[5]} alive={alive[3]} scene={<FinalScene labels={labels} />} />
      </div>
    </Section>

    <Section {...b.survival}>
      <SurvivalFlow />
      <ol className="pg-bands">{b.survival.placements.map((line, i) => <li key={line} className={`band${i}`}>{line}</li>)}</ol>
    </Section>

    <Section {...b.score} takeaway={b.score.abilityNote}>
      <div className="pg-score">
        <div><b>{b.score.blocks.points}</b><small>{b.score.blocks.pointsNote}</small></div><i>+</i>
        <div><b>{b.score.blocks.hand}</b><small>{b.score.blocks.handNote}</small></div><i>+</i>
        <div><b>{b.score.blocks.bb}</b><small>{b.score.blocks.bbNote}</small></div>
      </div>
      <p className="pg-formula">{b.score.formula}</p>
      <div className="pg-chips">{HAND_LADDER.map((category) => <span key={category}>{t(HAND_KEY[category])} <b>{handScore(category)}</b></span>)}</div>
    </Section>

    <Section {...b.abilities} takeaway={b.abilities.note}>
      <ul className="pg-ability-grid">{GUIDE_ABILITIES.map((ability) => <li key={ability}>
        <img src={abilityThumb(ability)} alt="" width="64" height="64" loading="lazy" decoding="async" />
        <div><strong>{t(`ability.card.${ability}.name`)}</strong><p>{t(`ability.card.${ability}.description`)}</p><em>→ {copy.abilities[ability].style}</em></div>
      </li>)}</ul>
    </Section>

    <aside className="pg-crosslink"><span>{b.toRules.text}</span><button type="button" className="primary" onClick={onRules}>{b.toRules.cta} →</button></aside>
  </div>;
}
