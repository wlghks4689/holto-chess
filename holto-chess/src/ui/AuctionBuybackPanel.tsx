import type { GameAction, PlayerView } from "../shared/protocol";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";
import { abilityIconUrl } from "./abilityArtworkLoader";
import { useTranslation } from "../i18n";

/**
 * Six-round R3 buyback, shown as the tail of the auction screen rather than a page of its own: the
 * same HUD, card grid and seat list, with the unsold cards at double price. Seats that won nothing
 * buy one each, in draft order, with a short turn.
 */
export function AuctionBuybackPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const { t, locale } = useTranslation();
  const copy = (kr: string, en: string) => locale === "ko-KR" ? kr : en;
  const draft = view.draft;
  if (!draft) return null;
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const current = draft.currentPlayerId;
  const myTurn = !!current && current === view.me.playerId;
  const buyers = new Set(draft.order.map((entry) => entry.playerId));
  const bought = (id: string) => draft.cards.find((offer) => offer.claimedBy === id)?.card;
  return <section className="final-auction is-buyback">
    <header className="auction-hud">
      <div><span className="eyebrow">ROUND 03 · AUCTION BUYBACK</span><div className="auction-heading"><h2>{t("draft.buybackTitle")}</h2></div></div>
      {current && seconds !== null && <strong className={`auction-clock ${seconds <= 3 ? "is-urgent" : ""}`} role="timer" aria-label={copy(`남은 시간 ${seconds}초`, `${seconds} seconds left`)}>{seconds}<small>SEC</small></strong>}
      <p className="auction-buyback-turn" aria-live="polite"><b>{current
        ? myTurn ? copy("내 차례 · 카드 1장을 고르세요", "Your turn · pick one card") : copy(`${name(current)} 구매 중`, `${name(current)} is buying`)
        : t("draft.finished")}</b><small>{myTurn ? t("draft.autoPurchase") : t("draft.buybackHelp")}</small></p>
    </header>
    {/* Same grid and card size as the auction itself. */}
    <div className="auction-grid">{draft.cards.map(({ card, price, claimedBy }) => {
      const affordable = view.me.stackBB >= price;
      return <article key={card.id} className={`auction-tile ${claimedBy ? "is-claimed" : ""} ${claimedBy === view.me.playerId ? "is-mine" : ""}`}>
        <CardView card={card} dimmed={!!claimedBy} onClick={myTurn && !disabled && !claimedBy && affordable ? () => send({ type: "DRAFT_PICK", cardId: card.id }) : undefined} />
        <strong>{claimedBy ? name(claimedBy) : <>{price}<small> BB</small></>}</strong>
      </article>;
    })}</div>
    <div className="auction-opponents">{view.players.filter((p) => p.alive).map((p) => {
      const card = bought(p.playerId);
      const status = !buyers.has(p.playerId) ? copy("낙찰", "Won") : card ? cardLabel(card)
        : p.playerId === current ? copy("구매 중", "Buying") : copy("대기", "Waiting");
      return <article key={p.playerId} className={p.playerId === current ? "is-buying" : !buyers.has(p.playerId) ? "is-settled" : ""}>
        <header>{p.abilityId && <img src={abilityIconUrl(p.abilityId)} alt="" />}<b>{p.name}</b><span>{status}</span></header>
        <div>{(draft.publicHands?.[p.playerId] ?? []).map((owned) => <CardView key={owned.id} card={owned} compact />)}</div>
      </article>;
    })}</div>
  </section>;
}
