import type { GameAction, PlayerView } from "../shared/protocol";
import { CardBack, CardView } from "./CardView";
import { useLocalCountdown } from "./useLocalCountdown";
import "./open-draft.css";
import { R2DraftArena } from "./R2DraftArena";

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
    <header><small className="draft-kicker">ROUND {view.round} · {ordering ? "선택 순서 안내" : "공개 드래프트"}</small><h2>{ordering ? "낮은 순위부터 카드를 선택합니다" : "공개 카드 한 장을 선택하세요"}</h2><div className="draft-clock" role="timer" aria-label={`선택 제한 남은 시간 ${seconds ?? (ordering ? 5 : 20)}초`}><span>남은 시간</span><strong>{seconds ?? (ordering ? 5 : 20)}</strong><span>초</span></div></header>
    <p className="draft-rule"><span>승점이 낮은 순서</span><i>→</i><span>동점이면 BB가 높은 순서</span><i>→</i><span>완전 동률은 서버 추첨</span></p>
    {view.round === 4 && <div className="draft-private-inventory"><small>내 보유 카드 · 상대에게 비공개</small><div className="card-row centered">{view.me.ownedCards.map((card) => <CardView key={card.id} card={card} compact />)}</div></div>}
    <ol className="draft-order">{draft.order.map((entry, index) => <li key={entry.playerId} className={entry.playerId === draft.currentPlayerId ? "current" : ""}>
      <b>{String(index + 1).padStart(2, "0")}</b><span>{name(entry.playerId)}</span><small>{entry.points}P · {entry.stackBB}BB</small>
      <div className="draft-hand">{draft.publicHands?.[entry.playerId]
        ? draft.publicHands[entry.playerId]!.map((card) => <span className="draft-acquired" key={card.id}><CardView card={card} compact /></span>)
        : Array.from({ length: 4 + Number(draft.cards.some((c) => c.claimedBy === entry.playerId)) }, (_, i) => <CardBack key={i} compact />)}</div>
    </li>)}</ol>
    {!ordering && <><div className="draft-arena">{draft.cards.map(({ card, price, claimedBy }) => <div key={card.id} className={`draft-offer ${claimedBy ? "claimed" : ""}`}>
      <CardView card={card} onClick={myTurn && !disabled && !claimedBy && view.me.stackBB >= price ? () => send({ type: "DRAFT_PICK", cardId: card.id }) : undefined} />
      <strong className="draft-price">{price} BB</strong>
      <small>{claimedBy ? name(claimedBy) : view.me.stackBB < price ? "BB 부족" : myTurn ? "구매 가능" : "차례 대기"}</small>
    </div>)}</div><footer aria-live="polite"><small>현재 선택 차례</small><h3>{draft.currentPlayerId ? name(draft.currentPlayerId) : "드래프트 완료"}{myTurn ? " · 내 차례" : ""}</h3><p>시간 안에 선택하지 않으면 남은 카드 중 한 장을 자동으로 구매합니다.</p></footer></>}
  </section>;
}

export function TimedOpenDraftPanel({ durationSeconds, ...props }: Parameters<typeof OpenDraftPanel>[0] & { durationSeconds: number }) {
  const seconds = useLocalCountdown(durationSeconds);
  return <OpenDraftPanel {...props} seconds={seconds} />;
}

export function RunLoadoutPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
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
  return <section className="panel run-loadout"><small>RUN LOADOUT · 세 장 모두 사용</small><h2>대표 카드와 두 RUN을 설계하세요</h2>
    <div className="run-loadout-slots">{["ANCHOR · 두 RUN 공통", "RUN 1 · 보조 카드", "RUN 2 · 보조 카드"].map((label, index) => <label key={label}><b>{label}</b>
      {owned.find((c) => c.id === ids[index]) && <CardView card={owned.find((c) => c.id === ids[index])!} />}
      <select aria-label={label} disabled={disabled || ready} value={ids[index]} onChange={(e) => change(index, e.target.value)}>{owned.map((c) => <option value={c.id} key={c.id}>{c.id}</option>)}</select>
    </label>)}</div><p>대표 카드는 유지하고 보조 카드만 교체합니다. RUN 시작 후에는 변경할 수 없습니다.</p>
    <div className="action-bar run-loadout-action"><p>시간이 끝나면 미완성 배치는 자동으로 완성됩니다.</p><button className="primary" disabled={disabled || ready} onClick={() => send({ type: "LOCK_RUN_LOADOUT" })}>{ready ? "LOADOUT LOCKED" : "배치 확정 · 준비 완료"}<strong className="run-loadout-timer" role="timer">{seconds ?? 60}초</strong></button></div>
  </section>;
}

export function TimedRunLoadoutPanel({ durationSeconds, ...props }: Parameters<typeof RunLoadoutPanel>[0] & { durationSeconds: number }) {
  const seconds = useLocalCountdown(durationSeconds);
  return <RunLoadoutPanel {...props} seconds={seconds} />;
}
