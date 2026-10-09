import { useEffect, useRef, useState } from "react";
import type { FinalAuctionView, GameAction, PlayerView } from "../shared/protocol";
import type { ServerClock } from "./serverClock";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";
import { HandScoreDisclosure } from "./HandScoreDisclosure";
import { useTranslation } from "../i18n";

type Offer = FinalAuctionView["cards"][number];

/**
 * Six-round R3 rules pamphlet, open while bidding has not started. Closing it only hides the
 * pamphlet: the cards stay visible and bidding opens for everyone at the same server time.
 */
function AuctionIntro({ seconds, maxWins, minRaise, onClose, ko }: { seconds: number; maxWins: number; minRaise: number; onClose: () => void; ko: boolean }) {
  const copy = (kr: string, en: string) => ko ? kr : en;
  const steps = [
    copy(`카드 16장 중 1인당 ${maxWins}장만 낙찰받을 수 있습니다.`, `Win at most ${maxWins} of the 16 cards.`),
    copy("첫 입찰은 카드를 한 번 눌러 선택한 뒤, 다시 눌러 확정합니다.", "Tap a card to select it, then tap again to place an opening bid."),
    copy(`입찰이 있는 카드는 현재 최고가보다 최소 ${minRaise}BB 높게 입찰합니다.`, `To bid on a card that has a bid, beat the highest bid by at least ${minRaise}BB.`),
    copy("다른 카드에 입찰하면 기존 입찰은 취소되고 그 카드는 입찰 없는 상태로 돌아갑니다. 낙찰 시에만 BB가 차감됩니다.", "Bidding on another card cancels your current bid; that card goes back to no bid. BB is only spent on cards you win."),
    copy("낙찰받지 못하면 남은 카드 1장을 2배 가격에 구매합니다.", "Win nothing and you buy one leftover card at double price."),
  ];
  return <div className="auction-intro-backdrop" role="presentation" onClick={onClose}>
    <section className="auction-intro" role="dialog" aria-modal="true" aria-label={copy("카드 옥션 안내", "Card auction guide")} onClick={e => e.stopPropagation()}>
      <header><div><small>ROUND 03 · CARD AUCTION</small><h2>{copy("카드 옥션 안내", "How the auction works")}</h2></div>
        <button type="button" className="secondary" onClick={onClose} aria-label={copy("안내 닫기", "Close guide")}>×</button></header>
      <ol>{steps.map((step, index) => <li key={index}><i>{index + 1}</i><span>{step}</span></li>)}</ol>
      <footer><p>{copy("경매 시작까지", "Bidding opens in")} <strong className="auction-intro-countdown">{seconds}</strong>{copy("초", "s")}</p>
        <button type="button" className="primary" onClick={onClose}>{copy("닫기", "Close")}</button></footer>
    </section>
  </div>;
}
export function FinalAuctionPanel({ view, send, clock, disabled = false }: { view: PlayerView; send: (action: GameAction) => void; clock?: ServerClock; disabled?: boolean }) {
  const { locale } = useTranslation();
  const ko = locale === "ko-KR", copy = (kr: string, en: string) => ko ? kr : en;
  const [now, setNow] = useState(() => clock?.now() ?? Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [introClosed, setIntroClosed] = useState(false);
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
  // Six-round R3 runs this auction before the Omaha matches; it has no loadout after it.
  const cardAuction = view.round === 3;
  const bidding = view.phase === "FINAL_AUCTION" && !a.settlement;
  const opening = bidding && now < a.startedAt;
  const active = bidding && !opening && now < a.endsAt;
  const seconds = Math.max(0, Math.ceil(((view.phase === "FINAL_AUCTION" ? a.endsAt : a.loadout?.endsAt ?? now) - Math.max(now, a.startedAt)) / 1000));
  const openingSeconds = Math.max(0, Math.ceil((a.startedAt - now) / 1000));
  const mine = a.mine;
  // Six-round R3: a seat at its limit can still bid; the bid moves and its reservation is freed.
  const leadingOffer = a.cards.find(o => o.isMine);
  const moving = cardAuction && (mine?.leadingCount ?? 0) >= a.maxWins;
  const availableBB = (mine?.availableBidBB ?? 0) + (moving ? leadingOffer?.highestAmount ?? 0 : 0);
  const reason = (offer: Offer) => !view.me.alive ? copy("관전 중", "Spectating") : offer.isMine ? copy("내 입찰 중", "Your bid")
    : !moving && (mine?.leadingCount ?? 0) >= a.maxWins ? copy(`최대 ${a.maxWins}장의 카드에 최고 입찰 중입니다.`, a.maxWins === 1 ? "Already leading on a card." : `Already leading on ${a.maxWins} cards.`)
    : offer.minNextBid > availableBB ? copy("입찰 가능한 BB가 부족합니다.", "Not enough available BB.") : "";
  const moveNotice = moving && leadingOffer ? copy(`입찰하면 ${cardLabel(leadingOffer.card)} 입찰(${leadingOffer.highestAmount}BB)이 취소됩니다.`, `Bidding here cancels your ${cardLabel(leadingOffer.card)} bid (${leadingOffer.highestAmount}BB).`) : "";
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
  const names = (id: string) => view.players.find(p => p.playerId === id)?.name ?? id;
  const loadoutIds = draft && draft.epoch === a.loadout?.startsAt ? draft.ids : a.loadout?.cardIds ?? [];
  const rules = cardAuction ? [
    copy(`카드 16장 중 1인당 ${a.maxWins}장만 낙찰받을 수 있습니다.`, `Win at most ${a.maxWins} of the 16 cards.`),
    copy("첫 입찰은 카드를 한 번 눌러 선택한 뒤, 다시 눌러 확정합니다.", "Tap a card to select it, then tap again to confirm an opening bid."),
    copy(`경쟁 입찰은 현재 최고가보다 최소 ${a.minRaiseBB}BB 높아야 합니다.`, `A competing bid must exceed the current highest bid by at least ${a.minRaiseBB}BB.`),
    copy("다른 카드에 입찰하면 기존 입찰은 취소되고 그 카드는 입찰 없는 상태로 돌아갑니다.", "Bidding on another card cancels your current bid; that card goes back to no bid."),
    copy("낙찰받지 못하면 남은 카드 1장을 2배 가격에 구매합니다.", "Win nothing and you buy one leftover card at double price."),
  ] : [
    copy("R5에서는 추가 BB 수입이 없습니다.", "There is no extra BB income in R5."),
    copy("첫 입찰은 카드를 한 번 눌러 선택한 뒤, 다시 눌러 확정합니다.", "Tap a card to select it, then tap again to confirm an opening bid."),
    copy(`경쟁 입찰은 현재 최고가보다 최소 ${a.minRaiseBB}BB 높아야 합니다.`, `A competing bid must exceed the current highest bid by at least ${a.minRaiseBB}BB.`),
    copy("확정한 입찰은 취소할 수 없습니다.", "Confirmed bids cannot be cancelled."),
  ];
  return <section className="final-auction" onClick={() => setSelected(null)}>
    {cardAuction && opening && !introClosed && <AuctionIntro seconds={openingSeconds} maxWins={a.maxWins} minRaise={a.minRaiseBB} onClose={() => setIntroClosed(true)} ko={ko} />}
    <header className="auction-hud">
      <div><span className="eyebrow">{cardAuction ? "ROUND 03 · CARD AUCTION" : "ROUND 05 · FINAL ARENA"}</span><div className="auction-heading"><h2>{bidding ? copy("카드 옥션", cardAuction ? "CARD AUCTION" : "FINAL AUCTION") : a.settlement && (reveal || cardAuction) ? "AUCTION REVEAL" : "FINAL LOADOUT"}</h2>
        {bidding && <div ref={help} className="auction-help" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") setHelpOpen(false); }}>
          <button type="button" aria-expanded={helpOpen} aria-label={copy(cardAuction ? "카드 옥션 규칙" : "최종 경매 규칙", cardAuction ? "Card auction rules" : "Final auction rules")} onClick={() => setHelpOpen(open => !open)}>?</button>
          {helpOpen && <div className="auction-help-popover" role="tooltip"><strong>{copy(cardAuction ? "카드 옥션 규칙" : "최종 경매 규칙", cardAuction ? "Card auction rules" : "Final auction rules")}</strong><ul>
            {rules.map(rule => <li key={rule}>{rule}</li>)}
          </ul></div>}
        </div>}
      </div></div>
      {!reveal && !(cardAuction && a.settlement) && <strong className={`auction-clock ${seconds <= 3 ? "is-urgent" : ""}`} role="timer">{seconds}<small>SEC</small></strong>}
      {bidding && mine && <dl><div><dt>{copy("보유 BB", "STACK")}</dt><dd>{mine.stackBB}</dd></div><div><dt>{copy("예약 BB", "RESERVED")}</dt><dd>{mine.reservedBB}</dd></div><div className="auction-available"><dt>{copy("입찰 가능 BB", "AVAILABLE")}</dt><dd>{mine.availableBidBB}</dd></div><div><dt>{copy("최고 입찰", "LEADING")}</dt><dd>{mine.leadingCount}<small> / {a.maxWins}</small></dd></div></dl>}
    </header>
    {bidding ? <>
      {opening && <p className="auction-opening" role="status">{copy(`${openingSeconds}초 후 입찰이 시작됩니다. 카드를 미리 확인하세요.`, `Bidding opens in ${openingSeconds}s. Look over the cards.`)}</p>}
      {moveNotice && selected && !a.cards.find(o => o.card.id === selected)?.hasBid && <p className="auction-move-notice" role="status">{moveNotice}</p>}
      {a.outbid && <p className="auction-outbid" role="status" key={a.outbid.sequence}>{cardLabel(a.cards.find(c => c.card.id === a.outbid!.cardId)!.card)} · {copy("최고 입찰에서 밀렸습니다", "You were outbid")} · {a.outbid.amount}BB {copy("예약 해제", "released")}</p>}
      <div className="auction-grid" onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, moved: false }; }} onPointerMove={e => { if (Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 10) gesture.current.moved = true; }} onPointerCancel={() => { gesture.current.moved = true; }}>
        {a.cards.map(offer => <article key={offer.card.id} className={`auction-tile ${selected === offer.card.id && !offer.hasBid ? "is-selected" : ""} ${offer.isMine ? "is-mine" : offer.hasBid ? "has-bid" : ""}`} onClick={e => e.stopPropagation()}>
          <CardView card={offer.card} onClick={() => bid(offer)} selected={selected === offer.card.id && !offer.hasBid} />
          <strong>{offer.highestAmount ?? offer.basePrice}<small> BB</small></strong>
        </article>)}
      </div>
      <div className="auction-opponents">{view.players.filter(p => p.alive).map(p => <article key={p.playerId}>
        <header><b>{p.name}</b><span>{p.stackBB}BB · {p.points}P</span></header>
        <div>{(a.publicHands[p.playerId] ?? []).map(card => <CardView key={card.id} card={card} compact />)}</div>
      </article>)}</div>
      {sheet && sheetOffer && <aside className="auction-bid-sheet" role="dialog" aria-label={copy("경쟁 입찰", "Raise bid")} onClick={e => e.stopPropagation()}>
        <header><b>{cardLabel(sheetOffer.card)} · {copy("경쟁 입찰", "Raise bid")}</b><button className="secondary" onClick={() => setSheet(null)} aria-label={copy("닫기", "Close")}>×</button></header>
        <p>{copy("현재 최고가", "Highest")} {sheetOffer.highestAmount}BB · {copy("최소", "Minimum")} {sheetOffer.minNextBid}BB · {copy("최대", "Maximum")} {availableBB}BB</p>
        {moveNotice && <p className="auction-move-notice" role="status">{moveNotice}</p>}
        {sheet.expected !== sheetOffer.highestAmount && <p role="status">{copy("가격이 변경되었습니다. 금액을 다시 확인하세요.", "Price changed. Review your bid.")}</p>}
        <div className="auction-input"><button className="secondary" onClick={() => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: String(Math.max(sheetOffer.minNextBid, Number(sheet.input) - a.minRaiseBB)) })}>−</button><input aria-label={copy("입찰 금액", "Bid amount")} inputMode="numeric" type="number" step="1" value={sheet.input} onChange={e => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: e.target.value })} /><button className="secondary" onClick={() => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: String(Number(sheet.input) + a.minRaiseBB) })}>+</button></div>
        <div className="auction-shortcuts">{[[copy("최소", "Min"), sheetOffer.minNextBid], ["+10", Number(sheet.input) + 10], [copy("최대", "Max"), availableBB]].map(([label, amount]) => <button key={label} onClick={() => setSheet({ ...sheet, expected: sheetOffer.highestAmount!, input: String(amount) })}>{label}</button>)}</div>
        <button className="primary" disabled={disabled || !!reason(sheetOffer) || !Number.isSafeInteger(Number(sheet.input)) || Number(sheet.input) < sheetOffer.minNextBid || Number(sheet.input) > availableBB} onClick={() => send({ type: "FINAL_AUCTION_BID", cardId: sheet.id, expectedHighestAmount: sheet.expected, amount: Number(sheet.input) })}>{copy("입찰 확정", "Confirm bid")}</button>
        {reason(sheetOffer) && <p role="status">{reason(sheetOffer)}</p>}
      </aside>}
    </> : a.settlement && cardAuction && !a.settlement.results.length ? <p className="auction-opening" role="status">{copy("낙찰된 카드가 없습니다.", "No card was won.")}</p>
    : a.settlement && (reveal || cardAuction) ? <div className="auction-reveal">{[...a.settlement!.results].sort((x, y) => view.players.findIndex(p => p.playerId === x.playerId) - view.players.findIndex(p => p.playerId === y.playerId)).map(r => <article key={r.cardId}>
      <CardView card={a.publicHands[r.playerId]!.find(c => c.id === r.cardId)!} /><strong>{r.amount}BB</strong><span className="auction-winner">{names(r.playerId)}</span>
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
