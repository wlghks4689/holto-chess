import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { GameAction, PlayerView } from "../shared/protocol";
import { CardView } from "./CardView";
import "./r2-draft-arena.css";
import { canPickR2Card, DRAFT_DEAL_MS } from "./r2DraftPresentation";
import { PhaseTimer } from "./PhaseTimer";
import { DraftRuleTooltip } from "./DraftRuleTooltip";

const dealtPools = new Set<string>();

export function R2DraftArena({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
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
  const myTurn = draft.currentPlayerId === view.me.playerId;
  return <section className={`panel r2-draft ${dealing ? "is-dealing" : "is-dealt"}`} aria-label="R2 공개 드래프트">
    <header className="r2-draft-heading"><div className="draft-title-row"><h2>{ordering ? "공개 드래프트" : "카드 한 장을 선택하세요"}</h2><DraftRuleTooltip round={2} /></div>{(ordering || myTurn) && <PhaseTimer className="r2-clock" seconds={seconds ?? (ordering ? 3 : 20)} ariaLabel={`${ordering ? "Deal-In" : "선택"} 남은 시간 ${seconds ?? (ordering ? 3 : 20)}초`} />}</header>
    <div className="r2-draft-layout">
      <aside className="r2-order-panel" aria-label="드래프트 선택 순서"><h3>DRAFT ORDER <small>선택 순서</small></h3><ol className="r2-order">{draft.order.map((entry, index) => {
        const player = view.players.find((candidate) => candidate.playerId === entry.playerId);
        const picked = draft.cards.some((card) => card.claimedBy === entry.playerId);
        const current = !picked && entry.playerId === draft.currentPlayerId;
        return <li key={entry.playerId} className={`${current ? "is-current" : ""} ${picked ? "is-picked" : ""}`} aria-current={current ? "step" : undefined}>
          <b className="r2-order-number">{String(index + 1).padStart(2, "0")}</b><span className="r2-order-name">{name(entry.playerId)}</span><span className="r2-order-stats">{player?.points ?? entry.points}P · {player?.stackBB ?? entry.stackBB}BB</span><small className="r2-order-status">{picked ? "✓ 완료" : current ? entry.playerId === view.me.playerId ? "내 차례" : "선택 중" : "대기"}</small>
        </li>;
      })}</ol></aside>
      <div className="r2-stage">
        {!ordering && <div className="r2-current" aria-live="polite"><small>현재 선택 차례</small><strong>{draft.currentPlayerId ? name(draft.currentPlayerId) : "선택 완료"}{myTurn ? " · 내 차례" : ""}</strong></div>}
        <div className="r2-arena" ref={arena} aria-label="공용 카드 8장" aria-busy={dealing}>
          <div className="r2-deal-origin" aria-hidden="true">◇</div>
          {draft.cards.map(({ card, price, claimedBy }, index) => {
            const enabled = canPickR2Card(view, price, claimedBy, disabled, dealing);
            const pick = () => { if (enabled) send({ type: "DRAFT_PICK", cardId: card.id }); };
            return <div key={card.id} className={`r2-card-slot ${claimedBy ? "is-claimed" : ""}`} style={{ "--deal-delay": `${150 + index * 90}ms`, "--arc": `${Math.abs(index - 3.5) ** 2 * 2.6}px` } as CSSProperties}>
              <div className="r2-offer"><CardView card={card} onClick={enabled ? pick : undefined} /><button type="button" className="r2-price" disabled={!enabled} onClick={pick} aria-label={`${card.id} ${price}BB 구매`}>{price} BB</button>{!ordering && !dealing && <small className="r2-card-status">{claimedBy ? `✓ ${name(claimedBy)}` : view.me.stackBB < price ? "BB 부족" : myTurn && !disabled ? "선택 가능" : "차례 대기"}</small>}</div>
            </div>;
          })}
        </div>
      </div>
    </div>
  </section>;
}
