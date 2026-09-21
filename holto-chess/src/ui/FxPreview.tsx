import { useState } from "react";
import { makeDeck, type Card } from "../core/poker/cards";
import { findBestFive } from "../core/poker/evaluate";
import { CardView } from "./CardView";
import { ShowdownHand } from "./ShowdownHand";
import { madeTone } from "./madeTone";
import { cinemaSeatClass, MADE_TONE_SAMPLES } from "./madeFxClasses";
import "./cinematic.css";
import "./fx-preview.css";

const DECK = new Map(makeDeck().map((card) => [card.id, card]));
const card = (id: string): Card => {
  const found = DECK.get(id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
};

/**
 * Five real cards per category, evaluated by the real evaluator. Nothing here
 * hard-codes a hand name, so a change to the evaluator shows up on this page.
 */
const SAMPLE_HANDS: Record<string, string[]> = {
  "하이카드": ["Ah", "Jd", "9c", "7s", "3h"],
  "원페어": ["Qh", "Qd", "9c", "7s", "3h"],
  "투페어": ["Qh", "Qd", "9c", "9s", "3h"],
  "트립스": ["Qh", "Qd", "Qc", "9s", "3h"],
  "스트레이트": ["9h", "8d", "7c", "6s", "5h"],
  "플러시": ["Ah", "Jh", "9h", "7h", "3h"],
  "풀하우스": ["Qh", "Qd", "Qc", "9s", "9h"],
  "포카드": ["Qh", "Qd", "Qc", "Qs", "9h"],
  "스트레이트 플러시": ["9h", "8h", "7h", "6h", "5h"],
  "로열 플러시": ["Ah", "Kh", "Qh", "Jh", "Th"],
};

type Context = "cinema" | "recap";

function Sample({ name, context, leading }: { name: string; context: Context; leading: boolean }) {
  const cards = SAMPLE_HANDS[name]!.map(card);
  const hand = findBestFive(cards);
  const tone = madeTone(hand.displayName);
  const used = hand.bestFive.map((entry) => entry.id);

  if (context === "recap") {
    return <div className="fx-sample">
      <header><b>{hand.displayName}</b><code>made-{tone}</code></header>
      {/* Wrapped exactly as the recap does, including .match-card's overflow
          clip, so a halo that would be cut in game is cut here too. */}
      <article className="match-card">
        <div className="boards">
          <div className={`board made-${tone}`}>
            <small>COMMUNITY BOARD</small>
            <div className="card-row centered">
              {cards.map((entry) => <CardView key={entry.id} card={entry} compact glow={used.includes(entry.id)} dimmed={!used.includes(entry.id)} />)}
            </div>
          </div>
        </div>
        <div className="combatants">
          <div className={`combatant ${leading ? "winner" : ""}`}>
            <ShowdownHand cards={cards} usedCardIds={used} winner={leading} displayName={hand.displayName} category={hand.category} kickers={hand.kickers} />
          </div>
        </div>
      </article>
    </div>;
  }

  // Mirrors a live cinematic seat: same wrapper classes, same card component.
  return <div className="fx-sample">
    <header><b>{hand.displayName}</b><code>made-{tone}</code></header>
    <div className="cinema">
      <div className={cinemaSeatClass({ tone, placement: leading ? "cinema-winner" : "cinema-loser", made: true, leading })}>
        <div className="cinema-profile"><span className="player-avatar">1</span><b>SAMPLE</b>
          <span className="cinema-victory">{leading ? "WIN" : "LOSS"}</span></div>
        <div className="cinema-hole-cards">
          {cards.map((entry) => <CardView key={entry.id} card={entry} compact glow={used.includes(entry.id)} />)}
        </div>
        <div className="cinema-made"><strong>{hand.displayName}</strong></div>
      </div>
    </div>
  </div>;
}

export function FxPreview() {
  const [context, setContext] = useState<Context>("cinema");
  const [leading, setLeading] = useState(true);
  const [onlyFx, setOnlyFx] = useState(true);
  const [replay, setReplay] = useState(0);
  const [previewMotion, setPreviewMotion] = useState(false);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const names = MADE_TONE_SAMPLES.filter((name) => !onlyFx || madeTone(name) !== "default");

  return <main className={`fx-preview${previewMotion ? " fx-motion-preview" : ""}`}>
    <header className="fx-preview-head">
      <div><small>DEVELOPMENT</small><h1>메이드 핸드 이펙트</h1>
        <p>실제 평가기와 실제 카드 컴포넌트로 그립니다. 족보 이름과 톤 클래스는 게임과 같은 함수에서 나옵니다.</p></div>
      <div className="fx-controls">
        <div role="group" aria-label="표시 맥락">
          <button type="button" className={context === "cinema" ? "locked" : ""} onClick={() => setContext("cinema")}>시네마틱</button>
          <button type="button" className={context === "recap" ? "locked" : ""} onClick={() => setContext("recap")}>결과 리캡</button>
        </div>
        <div role="group" aria-label="승패 상태">
          <button type="button" className={leading ? "locked" : ""} onClick={() => setLeading(true)}>승자</button>
          <button type="button" className={!leading ? "locked" : ""} onClick={() => setLeading(false)}>패자</button>
        </div>
        <label><input type="checkbox" checked={onlyFx} onChange={(e) => setOnlyFx(e.target.checked)} />전용 연출만</label>
        {reduced && <label><input type="checkbox" checked={previewMotion} onChange={(e) => { setPreviewMotion(e.target.checked); setReplay((n) => n + 1); }} />이 미리보기에서만 동작 허용</label>}
        <button type="button" className="primary" onClick={() => setReplay((n) => n + 1)}>다시 재생</button>
      </div>
    </header>
    {reduced && !previewMotion && <p className="fx-warning" role="status">
      이 브라우저가 <code>prefers-reduced-motion: reduce</code> 상태라 애니메이션이 정지됩니다. 확인하려면 ‘이 미리보기에서만 동작 허용’을 선택하세요. 실제 게임 설정은 바뀌지 않습니다.
    </p>}
    <div className="fx-grid" key={`${context}-${leading}-${replay}`}>
      {names.map((name) => <Sample key={name} name={name} context={context} leading={leading} />)}
    </div>
  </main>;
}
