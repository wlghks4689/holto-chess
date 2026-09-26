import { BALANCE, FINAL_ROUND_PLACEMENT_POINTS, ROUND_POINTS } from "../game/config";
import { useTranslation, type TranslationKey } from "../i18n";

const HAND_SCORES: [TranslationKey, number][] = [
  ["hand.highCard", BALANCE.handScores.HIGH_CARD],
  ["hand.pair", BALANCE.handScores.PAIR],
  ["hand.twoPair", BALANCE.handScores.TWO_PAIR],
  ["hand.trips", BALANCE.handScores.TRIPS],
  ["hand.straight", BALANCE.handScores.STRAIGHT],
  ["hand.flush", BALANCE.handScores.FLUSH],
  ["hand.fullHouse", BALANCE.handScores.FULL_HOUSE],
  ["hand.quads", BALANCE.handScores.QUADS],
  ["hand.straightFlush", BALANCE.handScores.STRAIGHT_FLUSH],
  ["hand.royalFlush", BALANCE.handScores.ROYAL_FLUSH],
] as const;

export function GameOverviewGuide({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const roundRows = [
    { round: "R1", cards: t("guide.roundCards", { count: 2 }), format: t("guide.r1Format"), points: t("guide.r1Points", { win: ROUND_POINTS.r1.win, split: ROUND_POINTS.r1.split }), result: t("guide.allSurvive") },
    { round: "R2", cards: t("guide.r2Cards"), format: t("guide.r2Format"), points: t("guide.r2Points", { win: ROUND_POINTS.r2Run.win, split: ROUND_POINTS.r2Run.split }), result: t("guide.allSurvive") },
    { round: "R3", cards: t("guide.r3Cards"), format: t("guide.r3Format"), points: t("guide.r3Points", { win: ROUND_POINTS.r3.gameWin, split: ROUND_POINTS.r3.gameSplit }), result: t("guide.r3Result") },
    { round: "R4", cards: t("guide.roundCards", { count: 5 }), format: t("guide.r4Format"), points: t("guide.r4Points", { win: ROUND_POINTS.r4Primary.win, split: ROUND_POINTS.r4Primary.split, first: ROUND_POINTS.r4WinnerGroup.first, second: ROUND_POINTS.r4WinnerGroup.second, third: ROUND_POINTS.r4WinnerGroup.third, tiedSecond: ROUND_POINTS.r4WinnerGroup.tiedSecond }), result: t("guide.r4Result") },
    { round: "R5", cards: t("guide.roundCards", { count: 5 }), format: t("guide.r5Format"), points: t("guide.r5Points", { first: FINAL_ROUND_PLACEMENT_POINTS[1], second: FINAL_ROUND_PLACEMENT_POINTS[2], third: FINAL_ROUND_PLACEMENT_POINTS[3], fourth: FINAL_ROUND_PLACEMENT_POINTS[4] }), result: t("guide.finalTally") },
  ];
  return <div className="game-guide-backdrop" role="presentation">
    <section className="game-guide" role="dialog" aria-modal="true" aria-labelledby="game-guide-title">
      <header className="game-guide-header">
        <div><span>HOW TO PLAY · CORE RULES</span><h2 id="game-guide-title">{t("guide.title")}</h2></div>
        <button type="button" aria-label={`${t("home.guide")} · ${t("common.close")}`} onClick={onClose}>×</button>
      </header>

      <div className="game-guide-body">
        <section className="game-guide-intro">
          <div><span className="game-guide-kicker">PORENA</span><h3>{t("guide.introTitle").split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h3></div>
          <p>{t("guide.introDescription")}</p>
        </section>

        <section className="game-guide-section game-flow-section" aria-labelledby="game-flow-title">
          <div className="game-guide-section-title"><span>01</span><div><small>GAME FLOW</small><h3 id="game-flow-title">{t("guide.flow")}</h3></div></div>
          <ol className="game-flow">
            <li><i>1</i><div><strong>{t("guide.shopStep")}</strong><span>{t("guide.shopStepDescription")}</span></div></li>
            <li><i>2</i><div><strong>{t("guide.lockStep")}</strong><span>{t("guide.lockStepDescription")}</span></div></li>
            <li><i>3</i><div><strong>{t("guide.showdownStep")}</strong><span>{t("guide.showdownStepDescription")}</span></div></li>
            <li><i>4</i><div><strong>{t("guide.rewardStep")}</strong><span>{t("guide.rewardStepDescription")}</span></div></li>
          </ol>
        </section>

        <div className="game-guide-two-column">
          <section className="game-guide-section bb-guide" aria-labelledby="bb-guide-title">
            <div className="game-guide-section-title"><span>02</span><div><small>{t("guide.economy")}</small><h3 id="bb-guide-title">{t("guide.bbTitle")}</h3></div></div>
            <p>{t("guide.bbDescription")}</p>
            <dl>
              <div><dt>{t("guide.startingStack")}</dt><dd>{BALANCE.startStackBB} BB</dd></div>
              <div><dt>{t("guide.cardPurchase")}</dt><dd>{t("guide.cardPriceRange")}</dd></div>
              <div><dt>{t("guide.shopRerollLock")}</dt><dd>{BALANCE.rerollCostBB} BB / {BALANCE.cardLockCostBB} BB</dd></div>
              <div><dt>{t("guide.roundIncome")}</dt><dd>{t("guide.survivorIncome", { amount: BALANCE.roundIncomeBB })}</dd></div>
              <div><dt>{t("guide.finalConversion")}</dt><dd>{t("guide.tenBbPoint")}</dd></div>
            </dl>
            <p className="game-guide-note">{t("guide.sellNote", { rate: Math.round(BALANCE.sellRate * 100) })}</p>
          </section>

          <section className="game-guide-section hand-score-guide" aria-labelledby="hand-score-title">
            <div className="game-guide-section-title"><span>03</span><div><small>{t("guide.handScore")}</small><h3 id="hand-score-title">{t("guide.handScore")}</h3></div></div>
            <p>{t("guide.handScoreDescription")}</p>
            <div className="hand-score-list">{HAND_SCORES.map(([key, score]) => <div key={key}><span>{t(key)}</span><strong>{score}</strong></div>)}</div>
            <p className="game-guide-note">{t("guide.handComparisonNote")}</p>
          </section>
        </div>

        <section className="game-guide-section round-score-guide" aria-labelledby="round-score-title">
          <div className="game-guide-section-title"><span>04</span><div><small>ROUND SCORE</small><h3 id="round-score-title">{t("guide.roundScores")}</h3></div></div>
          <div className="round-score-table" role="table" aria-label={t("guide.roundTableLabel")}>
            <div className="round-score-head" role="row"><span>{t("guide.roundColumn")}</span><span>{t("guide.formatColumn")}</span><span>{t("guide.pointsColumn")}</span><span>{t("guide.resultColumn")}</span></div>
            {roundRows.map((row) => <div className="round-score-row" role="row" key={row.round}>
              <div><strong>{row.round}</strong><small>{row.cards}</small></div>
              <span>{row.format}</span><span>{row.points}</span><em>{row.result}</em>
            </div>)}
          </div>
        </section>

        <section className="game-guide-victory" aria-labelledby="victory-title">
          <div><span>05 · FINAL VICTORY</span><h3 id="victory-title">{t("guide.victory")}</h3><p>{t("guide.victoryDescription")}</p></div>
          <div className="victory-formula" aria-label={t("guide.finalScoreFormulaAria")}>
            <span><b>{t("guide.cumulativePoints")}</b><small>R1–R5</small></span><i>+</i>
            <span><b>{t("guide.handScore")}</b><small>{t("guide.finalBestFive")}</small></span><i>+</i>
            <span><b>⌊BB ÷ 10⌋</b><small>{t("guide.remainingStack")}</small></span><i>=</i>
            <strong>{t("guide.firstPlaceWins")}</strong>
          </div>
          <p className="game-guide-note">{t("guide.placementNote")}</p>
        </section>
      </div>

      <footer><p>{t("guide.roundRulesNote")}</p><button className="primary" type="button" onClick={onClose}>{t("guide.returnToStart")} <span>→</span></button></footer>
    </section>
  </div>;
}
