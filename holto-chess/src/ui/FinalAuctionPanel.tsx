import { useEffect, useRef, useState } from "react";
import type { FinalAuctionView, GameAction, PlayerView } from "../shared/protocol";
import type { ServerClock } from "./serverClock";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";
import { HandScoreDisclosure } from "./HandScoreDisclosure";
import { abilityIconUrl } from "./abilityArtworkLoader";
import { useTranslation } from "../i18n";
import "./final-auction.css";

type Offer = FinalAuctionView["cards"][number];
export function FinalAuctionPanel({ view, send, clock, disabled = false }: { view: PlayerView; send: (action: GameAction) => void; clock?: ServerClock; disabled?: boolean }) {
  const { locale } = useTranslation();
  const ko = locale === "ko-KR", copy = (kr: string, en: string) => ko ? kr : en;
  const [now, setNow] = useState(() => clock?.now() ?? Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const help = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!helpOpen) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !help.current?.contains(event.target)) setHelpOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [helpOpen]);
  const [sheet, setSheet] = useState<{ id: string; expected: number; input: string } | null>(null);
  const [draft, setDraft] = useState<{ epoch: number; ids: string[] } | null>(null);
  const gesture = useRef({ x: 0, y: 0, moved: false });
  const pendingCard = useRef<{ id: string; until: number } | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(clock?.now() ?? Date.now()), 100); return () => clearInterval(timer); }, [clock]);
  const a = view.finalAuction;
  if (!a) return null;
  const active = view.phase === "FINAL_AUCTION" && now < a.endsAt;
  const seconds = Math.max(0, Math.ceil(((view.phase === "FINAL_AUCTION" ? a.endsAt : a.loadout?.endsAt ?? now) - Math.max(now, a.startedAt)) / 1000));
  const mine = a.mine;
  const reason = (offer: Offer) => !view.me.alive ? copy("관전 중", "Spectating") : offer.isMine ? copy("내 입찰 중", "Your bid")
    : (mine?.leadingCount ?? 0) >= 2 ? copy("최대 2장의 카드에 최고 입찰 중입니다.", "Already leading on two cards.")
    : offer.minNextBid > (mine?.availableBidBB ?? 0) ? copy("입찰 가능한 BB가 부족합니다.", "Not enough available BB.") : "";
  const bid = (offer: Offer) => {
    if (!active || disabled || gesture.current.moved || pendingCard.current?.id === offer.card.id && pendingCard.current.until > now) return;
    if (offer.isMine) return;
    if (offer.hasBid) { setSelected(null); setSheet({ id: offer.card.id, expected: offer.highestAmount!, input: String(offer.minNextBid) }); return; }
    if (selected !== offer.card.id) { setSelected(offer.card.id); return; }
    if (reason(offer)) return;
    pendingCard.current = { id: offer.card.id, until: now + 700 };
    setSelected(null); send({ type: "FINAL_AUCTION_BID", cardId: offer.card.id, expectedHighestAmount: null });
  };
  const sheetOffer = active && sheet ? a.cards.find(o => o.card.id === sheet.id && !o.isMine) : undefined;
  const reveal = a.settlement && now < a.settlement.loadoutStartsAt;
  const ability = (id: string) => view.players.find(p => p.playerId === id)?.abilityId;
  const names = (id: string) => view.players.find(p => p.playerId === id)?.name ?? id;
  const loadoutIds = draft && draft.epoch === a.loadout?.startsAt ? draft.ids : a.loadout?.cardIds ?? [];
  return <section className="final-auction" onClick={() => setSelected(null)}>
    <header className="auction-hud">
      <div><span className="eyebrow">ROUND 05 · FINAL ARENA</span><div className="auction-heading"><h2>{view.phase === "FINAL_AUCTION" ? copy("카드 옥션", "FINAL AUCTION") : reveal ? "AUCTION REVEAL" : "FINAL LOADOUT"}</h2>
        {view.phase === "FINAL_AUCTION" && <div ref={help} className="auction-help" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") setHelpOpen(false); }}>
          <button type="button" aria-expanded={helpOpen} aria-label={copy("최종 경매 규칙", "Final auction rules")} onClick={() => setHelpOpen(open => !open)}>?</button>
          {helpOpen && <div className="auction-help-popover" role="tooltip"><strong>{copy("최종 경매 규칙", "Final auction rules")}</strong><ul>
            <li>{copy("R5에서는 추가 BB 수입이 없습니다.", "There is no extra BB income in R5.")}</li>
            <li>{copy("첫 입찰은 카드를 한 번 눌러 선택한 뒤, 다시 눌러 확정합니다.", "Tap a card to select it, then tap again to confirm an opening bid.")}</li>
            <li>{copy("경쟁 입찰은 현재 최고가보다 최소 5BB 높아야 합니다.", "A competing bid must exceed the current highest bid by at least 5BB.")}</li>
            <li>{copy("확정한 입찰은 취소할 수 없습니다.", "Confirmed bids cannot be cancelled.")}</li>
          </ul></div>}
        </div>}
      </div></div>
      {!reveal && <strong className={`auction-clock ${seconds <= 3 ? "is-urgent" : ""}`} role="timer">{seconds}<small>SEC</small></strong>}
      {view.phase === "FINAL_AUCTION" && mine && <dl><div><dt>{copy("보유 BB", "STACK")}</dt><dd>{mine.stackBB}</dd></div><div><dt>{copy("예약 BB", "RESERVED")}</dt><dd>{mine.reservedBB}</dd></div><div className="auction-available"><dt>{copy("입찰 가능 BB", "AVAILABLE")}</dt><dd>{mine.availableBidBB}</dd></div><div><dt>{copy("최고 입찰", "LEADING")}</dt><dd>{mine.leadingCount}<small> / 2</small></dd></div></dl>}
    </header>
    {view.phase === "FINAL_AUCTION" ? <>
      {a.outbid && <p className="auction-outbid" role="status" key={a.outbid.sequence}>{cardLabel(a.cards.find(c => c.card.id === a.outbid!.cardId)!.card)} · {copy("최고 입찰에서 밀렸습니다", "You were outbid")} · {a.outbid.amount}BB {copy("예약 해제", "released")}</p>}
      <div className="auction-grid" onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, moved: false }; }} onPointerMove={e => { if (Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 10) gesture.current.moved = true; }} onPointerCancel={() => { gesture.current.moved = true; }}>
        {a.cards.map(offer => <article key={offer.card.id} className={`auction-tile ${selected === offer.card.id && !offer.hasBid ? "is-selected" : ""} ${offer.isMine ? "is-mine" : offer.hasBid ? "has-bid" : ""}`} onClick={e => e.stopPropagation()}>
          <CardView card={offer.card} onClick={() => bid(offer)} selected={selected === offer.card.id && !offer.hasBid} />
          <strong>{offer.highestAmount ?? offer.basePrice}<small> BB</small></strong>
        </article>)}
      </div>
      <div className="auction-opponents">{view.players.filter(p => p.alive).map(p => <article key={p.playerId}>
        <header>{p.abilityId && <img src={abilityIconUrl(p.abilityId)} alt="" />}<b>{p.name}</b><span>{p.stackBB}BB · {p.points}P</span></header>
        <div>{(a.publicHands[p.playerId] ?? []).map(card => <CardView key={card.id} card={card} compact />)}</div>
      </article>)}</div>
      {sheet && sheetOffer && <aside className="auction-bid-sheet" role="dialog" aria-label={copy("경쟁 입찰", "Raise bid")} onClick={e => e.stopPropagation()}>
        <header><b>{cardLabel(sheetOffer.card)} · {copy("경쟁 입찰", "Raise bid")}</b><button className="secondary" onClick={() => setSheet(null)} aria-label={copy("닫기", "Close")}>×</button></header>
        <p>{copy("현재 최고가", "Highest")} {sheetOffer.highestAmount}BB · {copy("최소", "Minimum")} {sheetOffer.minNextBid}BB · {copy("최대", "Maximum")} {mine?.availableBidBB ?? 0}BB</p>
        {sheet.expected !== sheetOffer.highestAmount && <p role="status">{copy("가격이 변경되었습니다. 금액을 다시 확인하세요.", "Price changed. Review your bid.")}</p>}
        <div className="auction-input"><button className="secondary" onClick={() => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: String(Math.max(sheetOffer.minNextBid, Number(sheet.input) - 5)) })}>−</button><input aria-label={copy("입찰 금액", "Bid amount")} inputMode="numeric" type="number" step="1" value={sheet.input} onChange={e => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: e.target.value })} /><button className="secondary" onClick={() => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: String(Number(sheet.input) + 5) })}>+</button></div>
        <div className="auction-shortcuts">{[[copy("최소", "Min"), sheetOffer.minNextBid], ["+10", Number(sheet.input) + 10], [copy("최대", "Max"), mine?.availableBidBB ?? 0]].map(([label, amount]) => <button key={label} onClick={() => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: String(amount) })}>{label}</button>)}</div>
        <button className="primary" disabled={disabled || !!reason(sheetOffer) || !Number.isSafeInteger(Number(sheet.input)) || Number(sheet.input) < sheetOffer.minNextBid || Number(sheet.input) > (mine?.availableBidBB ?? 0)} onClick={() => send({ type: "FINAL_AUCTION_BID", cardId: sheet.id, expectedHighestAmount: sheet.expected, amount: Number(sheet.input) })}>{copy("입찰 확정", "Confirm bid")}</button>
        {reason(sheetOffer) && <p role="status">{reason(sheetOffer)}</p>}
      </aside>}
    </> : reveal ? <div className="auction-reveal">{[...a.settlement!.results].sort((x, y) => view.players.findIndex(p => p.playerId === x.playerId) - view.players.findIndex(p => p.playerId === y.playerId)).map(r => <article key={r.cardId}>
      <CardView card={a.publicHands[r.playerId]!.find(c => c.id === r.cardId)!} /><strong>{r.amount}BB</strong><span className="auction-winner">{ability(r.playerId) && <img src={abilityIconUrl(ability(r.playerId)!)} alt="" />}{names(r.playerId)}</span>
    </article>)}</div> : <div className="final-loadout">
      <p>{copy("보유 카드 중 출전할 5장을 선택하세요. 전원 확정 후 동시에 공개됩니다.", "Choose five cards. All loadouts are revealed together after everyone locks.")}</p>
      <HandScoreDisclosure />
      {view.me.alive ? <><div className="final-loadout-cards">{view.me.ownedCards.map(card => <CardView key={card.id} card={card} selected={loadoutIds.includes(card.id)} onClick={a.loadout?.locked ? undefined : () => {
        const ids = loadoutIds.includes(card.id) ? loadoutIds.filter(id => id !== card.id) : loadoutIds.length < 5 ? [...loadoutIds, card.id] : loadoutIds;
        setDraft({ epoch: a.loadout!.startsAt, ids });
        if (ids.length === 5) send({ type: "FINAL_LOADOUT", cardIds: ids });
      }} />)}</div><p>{loadoutIds.length} / 5 · {copy("선택하지 않은 카드도 보드에 나오지 않습니다 (BLOCK).", "Unselected cards also stay out of the board (BLOCK).")}</p>
      <button className="primary" disabled={disabled || a.loadout?.locked || loadoutIds.length !== 5} onClick={() => send({ type: "LOCK_FINAL_LOADOUT" })}>{a.loadout?.locked ? copy("확정 완료 · 다른 플레이어 대기", "Locked · Waiting for players") : copy("출전 5장 확정", "Lock five cards")}</button></> : <p>{copy("플레이어의 출전 확정을 기다리는 중입니다.", "Waiting for final loadouts.")}</p>}
    </div>}
  </section>;
}
