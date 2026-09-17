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
  1: { kicker: "TWO HAND · SWISS 3 MATCHES", title: "클래식 쇼다운 · 스위스 대진 방식", summary: "동일한 핸드로 각기 다른 상대와 3경기 진행합니다. 모든 플레이어는 탈락 없이 매 경기 한 번씩 참여합니다.", steps: ["기본 제공 1장과 상점 구매로 총 2장 완성 · MATCH 1은 무작위 대진", "MATCH 2~3은 비슷한 성적끼리 매칭 · 재대결을 우선 피하고 필요하면 인접 성적과 매칭", "매 경기 홀 2장과 보드 5장 중 자유 BEST5 · 3경기 후 전원 R2 진출"], scoring: "경기마다 승리 시 +3 Point / Split +1 Point / 패배 시 0 Point", caution: "대진용 성적은 승리 1·Split 0.5·패배 0으로 게임 Point와 별도입니다. 홀카드는 0~2장 사용 가능합니다. BB 보상과 연승·연패는 각 경기마다 적용됩니다." },
  2: { kicker: "RUN IT TWICE", title: "RUN IT TWICE", summary: "보유 카드 3장 중 사용할 카드 2장을 고르고 보유한 카드를 제외한 덱으로 런 아웃을 두 번 진행하여 승자를 결정합니다.", steps: ["3장 중 홀카드 2장 선택", "RUN 1 종료 후 RUN 2 진행", "RUN 2까지 합산해 매치 승자 결정"], scoring: "1차전 승리 +6P · 승자조 +3P · 생존전 +2P", caution: "커뮤니티 카드는 두 플레이어의 보유 카드를 제외한 46장의 카드가 사용됩니다. 무승부인 경우 타이 브레이크를 진행합니다." },
  3: { kicker: "OMAHA DOUBLE", title: "정확히 홀 2장 + 보드 3장", summary: "보유 4장을 Game 1용 2장과 Game 2용 2장으로 나눕니다. 각 게임은 별도의 fresh board를 사용합니다.", steps: ["4장을 중복 없이 2장씩 분할", "Game 1과 Game 2를 독립 진행", "각 게임마다 홀 2장 + 보드 3장으로 BEST5"], scoring: "게임별 승리 +5P · Split 양쪽 +2P", caution: "Hold’em처럼 보드 4장을 가져올 수 없습니다. 아래 상황이 가장 흔한 오해입니다." },
  4: { kicker: "BEST FIVE", title: "10장 중 가장 강한 5장을 고릅니다", summary: "홀카드 5장과 커뮤니티 보드 5장을 합쳐 자유롭게 BEST5를 만듭니다. Omaha의 2+3 제한은 사라집니다.", steps: ["상점에서 홀카드 5장 완성", "매치 전용 보드 5장 공개", "홀+보드 10장 중 자유 BEST5"], scoring: "1차전 승리 +10P · Split +5P · 생존전 패자 탈락", caution: "홀카드 또는 보드의 사용 장수 제한이 없습니다. 강한 5장만 남고 나머지는 비교에서 제외됩니다." },
  5: { kicker: "THE LAST HAND", title: "보드 없이 보유 7장으로 결승", summary: "마지막 네 플레이어가 각자 보유한 7장만 공개합니다. 커뮤니티 보드는 생성되지 않습니다.", steps: ["상점에서 최종 7장 구성", "각자의 7장 중 BEST5 공개", "누적 승점·족보·스택을 합산"], scoring: "R5 배치 승점 20 / 12 / 5 / 3P", caution: "최종 순위는 누적 승점 + 족보 점수 + ⌊BB÷10⌋입니다. 로열 플러시는 일반 스트레이트 플러시와 별도 족보입니다." },
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

export function RoundGuide({ round, onClose }: { round: Round; onClose: () => void }) {
  const guide = GUIDES[round];
  return <div className="round-guide-backdrop" role="presentation">
    <section className="round-guide" role="dialog" aria-modal="true" aria-labelledby="round-guide-title">
      <header><div><span>ROUND 0{round} · PLAY GUIDE</span><small>{guide.kicker}</small></div><button type="button" aria-label="안내 닫기" onClick={onClose}>×</button></header>
      <div className="round-guide-body"><span className="guide-index">0{round}</span><div className="guide-copy"><h2 id="round-guide-title">{guide.title}</h2><p>{guide.summary}</p></div>
        <ol>{guide.steps.map((step, index) => <li key={step}><i>0{index + 1}</i><span>{step}</span></li>)}</ol>
        {round === 3 ? <OmahaExample /> : <div className="guide-special"><span>RULE CHECK</span><p>{guide.caution}</p></div>}
        <div className="guide-scoring"><span>POINT RULE</span><strong>{guide.scoring}</strong></div>
      </div>
      <footer><p>라운드가 시작될 때 한 번 표시됩니다.</p><button className="primary" type="button" onClick={onClose}>이해했습니다 · ROUND {round} 시작 <span>→</span></button></footer>
    </section>
  </div>;
}
