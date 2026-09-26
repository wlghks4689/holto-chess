import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { GameAction, PlayerView } from "../shared/protocol";
import { CardView } from "./CardView";
import { DraftRuleTooltip } from "./DraftRuleTooltip";
import { DraftPrivateHand } from "./DraftPrivateHand";
import { PhaseTimer } from "./PhaseTimer";
import { DRAFT_DEAL_MS } from "./r2DraftPresentation";
import { useTranslation } from "../i18n";
import "./r4-draft-arena.css";

const dealtPools = new Set<string>();

export function R4DraftArena({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const { t } = useTranslation();
  const draft = view.draft!;
  const poolKey = `${view.gameId}:${draft.cards.map(({ card }) => card.id).join(",")}`;
  const [dealing, setDealing] = useState(() => !dealtPools.has(poolKey) && !draft.cards.some((card) => card.claimedBy));
  const arena = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!dealing) return;
    const element = arena.current!;
    const rect = element.getBoundingClientRect();
    element.querySelectorAll<HTMLElement>(".r2-card-slot").forEach((slot) => {
      const target = slot.getBoundingClientRect();
      slot.style.setProperty("--deal-x", `${rect.left + rect.width / 2 - target.left - target.width / 2}px`);
      slot.style.setProperty("--deal-y", `${rect.top + rect.height / 2 - target.top - target.height / 2}px`);
    });
    dealtPools.add(poolKey);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DRAFT_DEAL_MS;
    const timer = window.setTimeout(() => setDealing(false), duration);
    return () => window.clearTimeout(timer);
  }, [dealing, poolKey]);
  const name = (id: string) => view.players.find((player) => player.playerId === id)?.name ?? id;
  const ordering = view.phase === "DRAFT_ORDER";
  const myTurn = !ordering && draft.currentPlayerId === view.me.playerId;
  const currentIndex = draft.order.findIndex((entry) => entry.playerId === draft.currentPlayerId);
  return <section className={`panel r2-draft r4-draft ${dealing ? "is-dealing" : "is-dealt"}`} aria-label={t("draft.roundAria", { round: 4 })}>
    <header className="r2-draft-heading"><div className="draft-title-row"><h2>{t(ordering ? "draft.title" : "draft.pickOne")}</h2><DraftRuleTooltip round={4} /></div></header>
    <div className="r2-draft-layout">
      <aside className="r2-order-panel" aria-label={t("draft.pickOrder")}><h3>DRAFT ORDER <small>{t("draft.pickOrder")} · {draft.order.length}</small></h3><ol className="r2-order">{draft.order.map((entry,index) => {
        const player = view.players.find((candidate) => candidate.playerId === entry.playerId);
        const picked = !ordering && index < currentIndex;
        const current = !ordering && !picked && entry.playerId === draft.currentPlayerId;
        return <li key={entry.playerId} className={`${current ? "is-current" : ""} ${picked ? "is-picked" : ""}`} aria-current={current ? "step" : undefined}>
          <b className="r2-order-number">{String(index + 1).padStart(2,"0")}</b><span className="r2-order-name">{name(entry.playerId)}</span><span className="r2-order-stats">{player?.points ?? entry.points}P · {player?.stackBB ?? entry.stackBB}BB</span><small className="r2-order-status">{t(picked ? "draft.done" : current ? entry.playerId === view.me.playerId ? "draft.yourTurn" : "draft.picking" : "draft.waiting")}</small>
        </li>;
      })}</ol></aside>
      <div className="r2-stage">
        {(ordering || myTurn) && <PhaseTimer className="r2-clock" seconds={seconds ?? (ordering ? 3 : 20)} ariaLabel={t(ordering ? "draft.dealTimer" : "draft.pickTimer", { seconds: seconds ?? (ordering ? 3 : 20) })} />}
        {!ordering && <div className="r2-current" aria-live="polite"><small>{t("draft.currentPicker")}</small><strong>{draft.currentPlayerId ? myTurn ? t("draft.playerYourTurn", { player: name(draft.currentPlayerId) }) : name(draft.currentPlayerId) : t("draft.finished")}</strong></div>}
        <div className="r2-arena" ref={arena} aria-label={t("draft.poolAria", { count: draft.cards.length })} aria-busy={dealing}>
          <div className="r2-deal-origin" aria-hidden="true">◇</div>
          {draft.cards.map(({card,price,claimedBy},index) => {
            const enabled = view.phase === "OPEN_DRAFT" && myTurn && !disabled && !dealing && !claimedBy && view.me.stackBB >= price;
            const pick = () => { if (enabled) send({ type: "DRAFT_PICK", cardId: card.id }); };
            return <div key={card.id} className={`r2-card-slot ${claimedBy ? "is-claimed" : ""}`} style={{ "--deal-delay": `${150 + index * 55}ms` } as CSSProperties}>
              <div className="r2-offer"><CardView card={card} onClick={enabled ? pick : undefined} /><button type="button" className="r2-price" disabled={!enabled} onClick={pick} aria-label={t("draft.buyAria", { card: card.id, price })}>{price} BB</button>{!ordering && !dealing && <small className="r2-card-status">{claimedBy ? t("draft.claimedBy", { player: name(claimedBy) }) : t(view.me.stackBB < price ? "draft.insufficientBB" : myTurn && !disabled ? "draft.pickable" : "draft.waitTurn")}</small>}</div>
            </div>;
          })}
        </div>
        <DraftPrivateHand cards={view.me.ownedCards} />
      </div>
    </div>
  </section>;
}
