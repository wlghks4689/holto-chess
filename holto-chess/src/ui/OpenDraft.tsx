import type { CSSProperties } from "react";
import { cardLabel } from "../core/poker/cards";
import type { GameAction, PlayerView } from "../shared/protocol";
import { CardView } from "./CardView";
import { useLocalCountdown } from "./useLocalCountdown";
import "./open-draft.css";
import { R2DraftArena } from "./R2DraftArena";
import { PhaseTimer } from "./PhaseTimer";
import { DraftRuleTooltip } from "./DraftRuleTooltip";

export function OpenDraftPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const draft = view.draft;
  if (!draft) return null;
  if (view.round === 2) return <R2DraftArena view={view} send={send} disabled={disabled} seconds={seconds} />;
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const ordering = view.phase === "DRAFT_ORDER";
  const myTurn = !ordering && draft.currentPlayerId === view.me.playerId;
  return <section className="open-draft panel" aria-label={`R${view.round} 공개 드래프트`}>
    <header><small className="draft-kicker">ROUND {view.round} · DRAFT PHASE</small><div className="draft-title-row"><h2>{ordering ? "공개 드래프트" : "카드 한 장을 선택하세요"}</h2><DraftRuleTooltip round={view.round} /></div>{(ordering || myTurn) && <PhaseTimer className="draft-clock" seconds={seconds ?? (ordering ? 3 : 20)} ariaLabel={`${ordering ? "Deal-In" : "선택 제한"} 남은 시간 ${seconds ?? (ordering ? 3 : 20)}초`} />}</header>
    {view.round === 4 && <div className="draft-private-inventory"><small>내 보유 카드 · 상대에게 비공개</small><div className="card-row centered">{view.me.ownedCards.map((card) => <CardView key={card.id} card={card} compact />)}</div></div>}
    <ol className="draft-order">{draft.order.map((entry, index) => <li key={entry.playerId} className={entry.playerId === draft.currentPlayerId ? "current" : ""}>
      <b>{String(index + 1).padStart(2, "0")}</b><span>{name(entry.playerId)}</span><small>{entry.points}P · {entry.stackBB}BB</small>
    </li>)}</ol>
    <><div className={`draft-arena ${ordering ? "is-dealing" : ""}`}><div className="draft-deal-origin" aria-hidden="true">◇</div>{draft.cards.map(({ card, price, claimedBy }, index) => <div key={card.id} className={`draft-offer ${claimedBy ? "claimed" : ""}`} style={{ "--deal-delay": `${150 + index * 90}ms` } as CSSProperties}>
      <CardView card={card} onClick={myTurn && !disabled && !claimedBy && view.me.stackBB >= price ? () => send({ type: "DRAFT_PICK", cardId: card.id }) : undefined} />
      <strong className="draft-price">{price} BB</strong>
      {!ordering && <small>{claimedBy ? name(claimedBy) : view.me.stackBB < price ? "BB 부족" : myTurn ? "구매 가능" : "차례 대기"}</small>}
    </div>)}</div>{!ordering && <footer aria-live="polite"><small>현재 선택 차례</small><h3>{draft.currentPlayerId ? name(draft.currentPlayerId) : "드래프트 완료"}{myTurn ? " · 내 차례" : ""}</h3><p>시간 안에 선택하지 않으면 남은 카드 중 한 장을 자동으로 구매합니다.</p></footer>}</>
  </section>;
}

export function TimedOpenDraftPanel({ durationSeconds, ...props }: Parameters<typeof OpenDraftPanel>[0] & { durationSeconds: number }) {
  const seconds = useLocalCountdown(durationSeconds);
  return <OpenDraftPanel {...props} seconds={seconds} />;
}

export function RunLoadoutPanel({ view, send, disabled, seconds, showTimer = true }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null; showTimer?: boolean;
}) {
  const owned = view.me.ownedCards;
  const selected = view.me.selectedCardIds;
  const ids = selected.length === 3 ? selected : owned.map((c) => c.id);
  const ready = !!view.players.find((p) => p.playerId === view.me.playerId)?.ready;
  const change = (slot: number, id: string) => {
    const next = [...ids]; const previous = next.indexOf(id);
    if (previous >= 0) [next[slot], next[previous]] = [next[previous]!, next[slot]!];
    send({ type: "RUN_LOADOUT", cardIds: next });
  };
  return <section className="panel run-loadout">
    <h2 className="run-loadout-heading">대표 카드 1장과 각 RUN에 사용할<br className="run-loadout-mobile-break" /> 보조 카드 1장을 선택해주세요</h2>
    <div className="run-loadout-content">
      {showTimer && <div className="run-loadout-timer"><PhaseTimer seconds={seconds ?? 30} ariaLabel={`배치 확정 남은 시간 ${seconds ?? 30}초`} /></div>}
      <div className="run-loadout-slots">{["대표 카드", "RUN 1 보조 카드", "RUN 2 보조 카드"].map((label, index) => <label key={label}>
        <span className="run-loadout-slot-title" role="heading" aria-level={3}>{label}</span>
        {owned.find((c) => c.id === ids[index]) && <CardView card={owned.find((c) => c.id === ids[index])!} />}
        <select aria-label={label} disabled={disabled || ready} value={ids[index]} onChange={(e) => change(index, e.target.value)}>{owned.map((c) => <option value={c.id} key={c.id}>{cardLabel(c)}</option>)}</select>
      </label>)}</div>
      <p className="run-loadout-help">대표 카드는 두 RUN에서 공통으로 사용됩니다.</p>
    </div>
    <div className="action-bar run-loadout-action"><button className="primary" disabled={disabled || ready} onClick={() => send({ type: "LOCK_RUN_LOADOUT" })}>{ready ? "LOADOUT LOCKED" : "배치 확정 · 준비 완료"}</button></div>
  </section>;
}

export function TimedRunLoadoutPanel({ durationSeconds, ...props }: Parameters<typeof RunLoadoutPanel>[0] & { durationSeconds: number }) {
  const seconds = useLocalCountdown(durationSeconds);
  return <RunLoadoutPanel {...props} seconds={seconds} />;
}
