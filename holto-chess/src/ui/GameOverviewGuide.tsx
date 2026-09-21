import { BALANCE, FINAL_ROUND_PLACEMENT_POINTS, ROUND_POINTS } from "../game/config";

const HAND_SCORES = [
  ["하이카드", BALANCE.handScores.HIGH_CARD],
  ["원페어", BALANCE.handScores.PAIR],
  ["투페어", BALANCE.handScores.TWO_PAIR],
  ["트립스", BALANCE.handScores.TRIPS],
  ["스트레이트", BALANCE.handScores.STRAIGHT],
  ["플러시", BALANCE.handScores.FLUSH],
  ["풀하우스", BALANCE.handScores.FULL_HOUSE],
  ["포카드", BALANCE.handScores.QUADS],
  ["스트레이트 플러시", BALANCE.handScores.STRAIGHT_FLUSH],
  ["로열 스트레이트 플러시", BALANCE.handScores.ROYAL_FLUSH],
] as const;

const ROUND_ROWS = [
  { round: "R1", cards: "사용 카드 : 2장", format: "홀덤 · 스위스 3경기", points: `경기 승 ${ROUND_POINTS.r1.win}P · Split ${ROUND_POINTS.r1.split}P`, result: "전원 생존" },
  { round: "R2", cards: "대표 카드 + RUN별 보조 카드 · 3장 모두 사용", format: "8장 공개 드래프트 · Run It Twice", points: `RUN별 승 ${ROUND_POINTS.r2Run.win}P · Split ${ROUND_POINTS.r2Run.split}P`, result: "전원 생존" },
  { round: "R3", cards: "사용 카드 : 보유 4장 중 정확히 2장", format: "오마하 Swiss · 3매치", points: `매치별 승 ${ROUND_POINTS.r3.gameWin}P · Split ${ROUND_POINTS.r3.gameSplit}P`, result: "누적 승점 하위 2명 탈락" },
  { round: "R4", cards: "사용 카드 : 5장", format: "10장 중 BEST5", points: `1차 승 ${ROUND_POINTS.r4Primary.win}P · Split ${ROUND_POINTS.r4Primary.split}P · 승자조 1위 ${ROUND_POINTS.r4WinnerGroup.first}P`, result: "2명 탈락" },
  { round: "R5", cards: "사용 카드 : 7장 중 5장", format: "보드 없는 결승", points: `배치 ${FINAL_ROUND_PLACEMENT_POINTS[1]} / ${FINAL_ROUND_PLACEMENT_POINTS[2]} / ${FINAL_ROUND_PLACEMENT_POINTS[3]} / ${FINAL_ROUND_PLACEMENT_POINTS[4]}P`, result: "최종 집계" },
] as const;

export function GameOverviewGuide({ onClose }: { onClose: () => void }) {
  return <div className="game-guide-backdrop" role="presentation">
    <section className="game-guide" role="dialog" aria-modal="true" aria-labelledby="game-guide-title">
      <header className="game-guide-header">
        <div><span>HOW TO PLAY · CORE RULES</span><h2 id="game-guide-title">게임 진행 안내</h2></div>
        <button type="button" aria-label="게임 설명 닫기" onClick={onClose}>×</button>
      </header>

      <div className="game-guide-body">
        <section className="game-guide-intro">
          <div><span className="game-guide-kicker">PORENA</span><h3>카드를 사고 조합해<br />5라운드를 살아남는 전략 포커 게임</h3></div>
          <p>8명이 52장으로 구성된 카드 풀을 공유합니다. 라운드마다 달라지는 규칙으로 대결하세요.</p>
        </section>

        <section className="game-guide-section game-flow-section" aria-labelledby="game-flow-title">
          <div className="game-guide-section-title"><span>01</span><div><small>GAME FLOW</small><h3 id="game-flow-title">한 라운드는 이렇게 진행됩니다</h3></div></div>
          <ol className="game-flow">
            <li><i>1</i><div><strong>구매단계</strong><span>게임 내 재화인 BB를 통해 카드를 사고 덱을 조합하세요.</span></div></li>
            <li><i>2</i><div><strong>구성 확정</strong><span>이번 라운드에 사용할 카드 선택</span></div></li>
            <li><i>3</i><div><strong>쇼다운</strong><span>각 라운드 규칙에 따라서 승패-생존 결정</span></div></li>
            <li><i>4</i><div><strong>보상과 다음 라운드</strong><span>승점·BB 획득, R2·R4 뒤 증강 선택</span></div></li>
          </ol>
        </section>

        <div className="game-guide-two-column">
          <section className="game-guide-section bb-guide" aria-labelledby="bb-guide-title">
            <div className="game-guide-section-title"><span>02</span><div><small>ECONOMY</small><h3 id="bb-guide-title">BB는 무엇인가요?</h3></div></div>
            <p><strong>BB는 게임 운영에 사용되는 게임 내 재화</strong>입니다. 카드 구매, 상점 리셋, 카드 잠금, 최종 점수 환산 등에 사용됩니다.</p>
            <dl>
              <div><dt>시작 자금</dt><dd>{BALANCE.startStackBB} BB</dd></div>
              <div><dt>카드 구매</dt><dd>랭크별 5–20 BB</dd></div>
              <div><dt>상점 리롤 / 카드 잠금</dt><dd>{BALANCE.rerollCostBB} BB / {BALANCE.cardLockCostBB} BB</dd></div>
              <div><dt>다음 라운드 기본 수입</dt><dd>생존자 +{BALANCE.roundIncomeBB} BB</dd></div>
              <div><dt>최종 점수 환산</dt><dd>10 BB마다 +1점</dd></div>
            </dl>
            <p className="game-guide-note">카드는 기준가의 {Math.round(BALANCE.sellRate * 100)}%에 판매됩니다. 남긴 BB도 최종 점수이므로 전부 쓰는 것이 항상 정답은 아닙니다.</p>
          </section>

          <section className="game-guide-section hand-score-guide" aria-labelledby="hand-score-title">
            <div className="game-guide-section-title"><span>03</span><div><small>HAND SCORE</small><h3 id="hand-score-title">족보 점수</h3></div></div>
            <p>최종 BEST5의 족보가 아래 점수로 환산됩니다.</p>
            <div className="hand-score-list">{HAND_SCORES.map(([name, score]) => <div key={name}><span>{name}</span><strong>{score}</strong></div>)}</div>
            <p className="game-guide-note">쇼다운 승패는 점수가 아니라 실제 포커 족보와 모든 키커로 비교하며, 완전히 같으면 Split입니다. 문양에 따른 승패 우선순위가 없습니다.</p>
          </section>
        </div>

        <section className="game-guide-section round-score-guide" aria-labelledby="round-score-title">
          <div className="game-guide-section-title"><span>04</span><div><small>ROUND SCORE</small><h3 id="round-score-title">라운드별 진행과 획득 승점</h3></div></div>
          <div className="round-score-table" role="table" aria-label="라운드별 진행과 승점">
            <div className="round-score-head" role="row"><span>라운드</span><span>게임 방식</span><span>획득 승점</span><span>결과</span></div>
            {ROUND_ROWS.map((row) => <div className="round-score-row" role="row" key={row.round}>
              <div><strong>{row.round}</strong><small>{row.cards}</small></div>
              <span>{row.format}</span><span>{row.points}</span><em>{row.result}</em>
            </div>)}
          </div>
        </section>

        <section className="game-guide-victory" aria-labelledby="victory-title">
          <div><span>05 · FINAL VICTORY</span><h3 id="victory-title">최종 게임 승리 조건</h3><p>R5까지의 모든 판단이 하나의 총점으로 합쳐집니다.</p></div>
          <div className="victory-formula" aria-label="최종 점수 공식">
            <span><b>누적 승점</b><small>R1–R5</small></span><i>+</i>
            <span><b>족보 점수</b><small>최종 BEST5</small></span><i>+</i>
            <span><b>⌊BB ÷ 10⌋</b><small>남은 자금</small></span><i>=</i>
            <strong>총점 1위<br /><small>우승</small></strong>
          </div>
          <p className="game-guide-note">탈락자는 탈락 시점의 승점·족보·BB로 최종 집계합니다. 총점이 같으면 R5 등수 등 엔진의 순위 규칙으로 결정합니다.</p>
        </section>
      </div>

      <footer><p>라운드별 세부 규칙은 각 라운드 시작 시 다시 안내됩니다.</p><button className="primary" type="button" onClick={onClose}>확인 · 시작 화면으로 <span>→</span></button></footer>
    </section>
  </div>;
}
