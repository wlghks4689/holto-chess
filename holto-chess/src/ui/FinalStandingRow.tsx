import { useId, useState } from "react";
import { cardLabel } from "../core/poker/cards";
import type { FinalStandingView } from "../shared/protocol";
import { compactHandName } from "./handLabel";
import { madeTone } from "./madeTone";
import "./final-standings.css";

const display = (value: number) => Number(value.toFixed(2));

export function FinalStandingsHeader() {
  return <div className="final-standings-head" aria-hidden="true"><span>순위</span><span>닉네임</span><span>BEST 5</span><span>누적<br />승점</span><span>족보<br />점수</span><span>스택</span><span>총점</span><span>랭크<br />점수</span></div>;
}

export function FinalStandingRow({ row, name }: { row: FinalStandingView; name: string }) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const concealed = row.placement > 4 && row.eliminatedRound !== undefined;
  return <div className={`standing final-standing podium-${row.placement}`}>
    <div className="final-rank-panel"><span className="final-rank-ornament" aria-hidden="true">{row.placement === 1 ? "♛" : row.placement <= 3 ? "✦" : ""}</span><strong>{row.placement}<small>위</small></strong></div>
    <div className="final-player-name"><b>{name}</b></div>
    <div className={`final-hand made-${madeTone(row.displayName)}`} aria-label={`${name} 마지막 핸드`}>
      {(row.cards ?? []).map((card) => {
        if (concealed) return <span key={card.id} className="final-mini-card is-card-back" aria-label="비공개 카드"><i aria-hidden="true">◇</i></span>;
        const label = cardLabel(card);
        const best = row.usedCardIds?.includes(card.id);
        return <span key={card.id} aria-label={`${label}${best ? (row.usedCardIds!.length >= 5 ? " BEST 5" : " 족보 사용") : ""}`} className={`final-mini-card ${card.suit === "h" || card.suit === "d" ? "red" : ""} ${best ? "is-best" : "is-unused"}`}><b>{label.slice(0, -1)}</b><i>{label.slice(-1)}</i></span>;
      })}
    </div>
    <span className="final-score-part">{display(row.points)}</span>
    <span className="final-score-part">{row.handScore}</span>
    <span className="final-score-part">{row.stackScore}</span>
    <div className="final-total" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button type="button" aria-label={`${name} 총점 ${display(row.total)}점, 점수 내역`} aria-expanded={open} aria-controls={popupId} onClick={() => setOpen((current) => !current)}>{display(row.total)}<span className="final-total-info" aria-hidden="true">ⓘ</span></button>
      <div id={popupId} className="final-score-popover" hidden={!open} role="region" aria-label="점수 내역">
        <b>총점 계산</b><span>누적 승점 <strong>{display(row.points)}P</strong></span><span>족보 점수 <strong>{row.handScore}P</strong></span><small>{compactHandName(row.displayName) || "족보 없음"}</small>{(row.augmentScore ?? 0) > 0 && <span>증강 보너스 <strong>+{row.augmentScore}P</strong></span>}<span>BB 점수 <strong>{row.stackScore}P</strong></span><small>{display(row.stackBB)}BB ÷ 10 · 소수점 버림</small><hr /><span>총점 <strong>{display(row.total)}P</strong></span>
      </div>
    </div>
    <i className={`rank-point ${row.rankPoints > 0 ? "positive" : row.rankPoints < 0 ? "negative" : ""}`}>{row.rankPoints > 0 ? "+" : ""}{row.rankPoints}</i>
  </div>;
}
