import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Card, Rank, Suit } from "../core/poker/cards";
import type { Round } from "../game/types";
import { ROUND_POINTS } from "../game/config";
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
  1: { kicker: "TEXAS HOLD'EM · SWISS 3 MATCHES", title: "Classic Hold'em", summary: "2장의 카드로 커뮤니티 보드와 조합하여 승패 결정", steps: ["기본으로 지급하는 카드 1장과 상점에 등장하는 카드 중 1장을 구매하여 총 2장의 카드를 사용합니다.", "2장의 핸드로 3경기를 SWISS 스테이지로 진행", "2장의 카드와 커뮤니티 보드를 조합하여 BEST 5를 만들어 승패를 결정"], scoring: "승리 +3 Point · Split +1 Point · 패배 +0 Point", caution: "텍사스 홀덤 규칙, 첫 경기는 무작위 매칭 이후에는 비슷한 성적의 상대와 대결하는 스위스 대진 방식으로 진행합니다." },
  2: { kicker: "OPEN DRAFT · SPLIT HAND", title: "RUN IT TWICE", summary: "총 3장의 카드를 두장의 조합으로 나누어 2번 승부.", steps: ["기존 카드 2장 + 드래프트 1장 = 3장", "대표 카드 1장과 + RUN별 보조 카드 배치", "각각의 조합으로 두번의 RUN을 진행, 승패 결정"], scoring: "RUN별 승리 +4P · Split +2P · 패배 +0P", caution: "두 플레이어의 보유 6장을 제외한 46장의 카드로 커뮤니티 보드가 생성됩니다. RUN1에 등장한 카드는 RUN2에 등장하지 않습니다. 카드 배치는 ROUND 시작 후 변경 불가." },
  3: { kicker: "OMAHA SWISS", title: "Omaha Swiss Stage", summary: "홀카드 4장을 보유하고, 매 경기 그중 정확히 2장과 독립 보드 3장으로 Swiss 3경기를 진행합니다.", steps: ["Match 1: R3 진입 시 누적 승점·BB 순 시드 인접 매칭", "Match 2·3: Swiss Score가 가까운 상대와 재매칭을 피해 대결", "홀카드 4장 중 정확히 2장 + 보드 5장 중 정확히 3장으로 BEST5"], scoring: "매치 승리 +4P · Split +2P · 3승 최대 +12P", caution: "Omaha는 홀카드 4장을 보유하고 정확히 2장, 보드에서 정확히 3장을 사용합니다." },
  4: { kicker: "OPEN DRAFT · BEST FIVE", title: "Best Five of Ten.", summary: "16장 공개 풀에서 누적 승점이 낮은 순으로 한 장씩 구매합니다. 상대의 보유 카드는 비공개입니다.", steps: ["6명 순차 드래프트 · 홀카드 5장 완성", "개인 상점 2장 · 리롤 2회 · 구매 3회", "홀 5장 + 보드 5장 중 자유 BEST5"], scoring: `1차전 승리 +${ROUND_POINTS.r4Primary.win}P · Split +${ROUND_POINTS.r4Primary.split}P · 승자조 1/2/3위 +${ROUND_POINTS.r4WinnerGroup.first}/+${ROUND_POINTS.r4WinnerGroup.second}/+${ROUND_POINTS.r4WinnerGroup.third}P (공동 2위는 각 +${ROUND_POINTS.r4WinnerGroup.tiedSecond}P) · 기본 BB는 1위만 20BB (연승·연패 보너스 적용) · 패자조 BB·승점 보상 없음, 패자 탈락`, caution: "보유 한도는 5장입니다. 상점에서 교체 구매하려면 먼저 판매하세요. 드래프트 구매는 상점 구매 횟수와 별도입니다." },
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
    <div className="guide-example-side"><small>홀카드 4장 · 정확히 2장 사용</small><Cards ids={["2d", "2c", "Ah", "9s"]} used={["Ah", "2d"]} /></div>
    <b className="guide-plus">+</b>
    <div className="guide-example-side"><small>보드 · 반드시 3장</small><Cards ids={["3s", "5s", "4c", "Jh", "6c"]} used={["3s", "4c", "5s"]} /></div>
    <div className="guide-verdict"><span>가능한 BEST5</span><strong>5 하이 스트레이트</strong><em>A♥ · 2♦ · 3♠ · 4♣ · 5♠</em></div>
    <p><b>정확히 2+3:</b> 홀카드 A♥·2♦와 보드 3♠·4♣·5♠를 사용해 A-2-3-4-5 스트레이트를 완성합니다.</p>
  </section>;
}

export function RoundGuide({ round, onClose, secondsLeft, onPreviewRound }: { round: Round; onClose: () => void; secondsLeft?: number | null; onPreviewRound?: (round: Round) => void }) {
  const guide = GUIDES[round];
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? [])];
    if (!focusable.length) return;
    const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="round-guide-backdrop" role="presentation">
    <section ref={dialogRef} className="round-guide" role="dialog" aria-modal="true" aria-labelledby="round-guide-title" onKeyDown={handleDialogKeyDown}>
      <header><div><span>ROUND 0{round} · PLAY GUIDE</span><small>{guide.kicker}</small></div><button type="button" aria-label="안내 닫기" onClick={onClose}>×</button></header>
      {onPreviewRound && <div className="start-guide-rounds" aria-label="설명할 라운드">{([1, 2, 3, 4, 5] as const).map((value) => <button key={value} type="button" aria-pressed={round === value} onClick={() => onPreviewRound(value)}>R{value}</button>)}</div>}
      <div className="round-guide-body"><span className="guide-index">0{round}</span><div className="guide-copy"><h2 id="round-guide-title">{guide.title}</h2><p>{guide.summary}</p></div>
        <ol>{guide.steps.map((step, index) => <li key={step}><i>0{index + 1}</i><span>{step}</span></li>)}</ol>
        {round === 3 ? <OmahaExample /> : <div className="guide-special"><span>RULE CHECK</span><p>{guide.caution}</p></div>}
        <div className="guide-scoring"><span>POINT RULE</span><strong>{guide.scoring}</strong></div>
        {round === 3 && <p>누적 승점 하위 2명이 탈락합니다. 탈락선 동점자만 보유 4장 중 정확히 2장을 쓰는 오마하 생존전을 진행합니다. 추가 타이브레이크 2회 후에도 동점이면 안내 후 하이카드 드로우로 필요한 탈락자만 결정합니다.</p>}
      </div>
      <footer className={!onPreviewRound && typeof secondsLeft !== "number" ? "action-only" : undefined}>
        {(onPreviewRound || typeof secondsLeft === "number") && <p>{onPreviewRound ? "각 라운드를 선택해 규칙을 확인하세요." : `남은 시간 ${secondsLeft}초`}</p>}
        <button className="primary" type="button" onClick={onClose}>{onPreviewRound ? "시작 화면으로" : `이해했습니다 · ROUND ${round} 시작`} <span>→</span></button>
      </footer>
    </section>
  </div>;
}

