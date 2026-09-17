import type { Card, Rank, Suit } from "../core/poker/cards";
import type { Round } from "../game/types";
import { CardView } from "./CardView";

type Guide = {
  kicker: string;
  title: string;
  summary: string;
  steps: string[];
  scoring: string;
  caution: string;
};

const GUIDES: Record<Round, Guide> = {
  1: { kicker: "TWO HAND · SWISS 3 MATCHES", title: "클래식 쇼다운 · 스위스 대진 방식", summary: "홀카드 2장으로 상대와 총 3번 경기합니다. 탈락 없이 모두 다음 라운드로 진출합니다.", steps: ["기본 카드 1장과 상점 카드 1장으로 홀카드 2장 완성", "같은 핸드로 3경기 진행 · 매 경기 새로운 상대와 대결", "보드 5장과 홀카드로 가장 좋은 BEST5를 만들어 승부"], scoring: "승리 +3 Point · Split +1 Point · 패배 +0 Point", caution: "첫 경기는 무작위, 이후에는 비슷한 성적의 상대와 매칭됩니다. 승리 +10BB · 패배 +15BB, 연패마다 +5BB가 추가됩니다." },
  2: { kicker: "RUN IT TWICE", title: "RUN IT TWICE", summary: "보유 카드 3장 중 사용할 카드 2장을 고르고 보유한 카드를 제외한 덱으로 런 아웃을 두 번 진행하여 승자를 결정합니다.", steps: ["3장 중 홀카드 2장 선택", "RUN 1 종료 후 RUN 2 진행", "RUN 2까지 합산해 매치 승자 결정"], scoring: "1차전 승리 +6P · 승자조 +3P · 생존전 +2P", caution: "커뮤니티 카드는 두 플레이어의 보유 카드를 제외한 46장의 카드가 사용됩니다. 무승부인 경우 타이 브레이크를 진행합니다." },
  3: { kicker: "OMAHA DOUBLE", title: "정확히 홀 2장 + 보드 3장", summary: "보유 카드 4장을 2장씩 선택하여 GAME 1, GAME 2의 대표 카드로 사용합니다. 각 게임은 두 플레이어의 카드 8장을 제외한 44장의 덱을 사용합니다.", steps: ["4장을 2장씩 나누어 GAME 1과 GAME 2의 대표 카드로 사용", "Game 1과 Game 2를 독립 진행", "각 게임마다 홀 2장 + 보드 3장으로 BEST5"], scoring: "게임별 승리 +5P · Split 양쪽 +2P", caution: "Hold’em처럼 보드 4장을 가져올 수 없습니다. 아래 상황이 가장 흔한 오해입니다." },
  4: { kicker: "BEST FIVE", title: "Best Five of Ten.", summary: "홀카드 5장과 커뮤니티 보드 5장을 합쳐 자유롭게 BEST5를 만듭니다.", steps: ["상점에서 홀카드 5장 완성", "매치 전용 보드 5장 공개", "홀+보드 10장 중 자유 BEST5"], scoring: "1차전 승리 +10P · Split +5P · 생존전 패자 탈락", caution: "홀카드 또는 보드의 사용 장수 제한이 없습니다. 강한 5장만 남고 나머지는 비교에서 제외됩니다." },
  5: { kicker: "THE LAST HAND", title: "The Ultimate Five.", summary: "커뮤니티 카드 없이 보유한 7장의 카드 중 최고의 족보 5장으로 승부합니다.", steps: ["상점에서 최종 7장 구성", "각자의 7장 중 BEST5 공개", "누적 승점·족보·스택을 합산"], scoring: "R5 배치 승점 20 / 12 / 5 / 3P", caution: "7장 중 가장 강한 5장만 최종 족보로 인정됩니다. 최종 순위는 누적 승점·족보 점수·보유 BB를 합산해 결정합니다." },
};

function card(id: string): Card {
  const chars: Record<string, Rank> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  return { id, rank: (chars[id[0]!] ?? Number(id.slice(0, -1))) as Rank, suit: id.at(-1) as Suit };
}

function Cards({ ids, used }: { ids: string[]; used?: string[] }) {
  const selected = new Set(used ?? ids);
  return <div className="guide-cards">{ids.map((id) => <CardView key={id} card={card(id)} compact glow={selected.has(id)} dimmed={!selected.has(id)} />)}</div>;
}

function OmahaExample() {
  return <section className="omaha-example" aria-label="오마하 규칙 예시">
    <div className="guide-example-side"><small>홀카드 · 반드시 2장</small><Cards ids={["2d", "2c"]} /></div>
    <b className="guide-plus">+</b>
    <div className="guide-example-side"><small>보드 · 반드시 3장</small><Cards ids={["3s", "5s", "4c", "Jh", "6c"]} used={["Jh", "6c", "5s"]} /></div>
    <div className="guide-verdict"><span>가능한 BEST5</span><strong>2 원페어</strong><em>2♦ · 2♣ · J♥ · 6♣ · 5♠</em></div>
    <p><b>스트레이트 불가:</b> 2-3-4-5-6은 홀카드 1장 + 보드 4장이 필요합니다. 오마하의 <strong>정확히 2+3</strong> 규칙을 위반합니다.</p>
  </section>;
}

export function RoundGuide({ round, onClose, secondsLeft }: { round: Round; onClose: () => void; secondsLeft?: number | null }) {
  const guide = GUIDES[round];
  return <div className="round-guide-backdrop" role="presentation">
    <section className="round-guide" role="dialog" aria-modal="true" aria-labelledby="round-guide-title">
      <header><div><span>ROUND 0{round} · PLAY GUIDE</span><small>{guide.kicker}</small></div><button type="button" aria-label="안내 닫기" onClick={onClose}>×</button></header>
      <div className="round-guide-body"><span className="guide-index">0{round}</span><div className="guide-copy"><h2 id="round-guide-title">{guide.title}</h2><p>{guide.summary}</p></div>
        <ol>{guide.steps.map((step, index) => <li key={step}><i>0{index + 1}</i><span>{step}</span></li>)}</ol>
        {round === 3 ? <OmahaExample /> : <div className="guide-special"><span>RULE CHECK</span><p>{guide.caution}</p></div>}
        <div className="guide-scoring"><span>POINT RULE</span><strong>{guide.scoring}</strong></div>
      </div>
      <footer><p>{typeof secondsLeft === "number"
        // The server clock keeps running behind the guide, so say so rather than
        // letting the shop time vanish while it is being read.
        ? `라운드가 시작될 때 한 번 표시됩니다 · 남은 시간 ${secondsLeft}초`
        : "라운드가 시작될 때 한 번 표시됩니다."}</p><button className="primary" type="button" onClick={onClose}>이해했습니다 · ROUND {round} 시작 <span>→</span></button></footer>
    </section>
  </div>;
}

