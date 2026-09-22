import { useState, type ReactNode } from "react";
import type { Round } from "../game/types";
import type { PrepPresentation } from "./prepPresentation";

export function RoundProgress({ round, prep }: { round: Round; prep: PrepPresentation | null }) {
  if (prep) {
    return <div className="round-progress prep-progress" aria-label={`R${prep.completedRound} 완료, PREP 활성, 다음 R${prep.targetRound}`}>
      <span className="round-step done"><i>✓</i><span className="round-step-copy"><small>R{prep.completedRound}</small><b>완료</b></span></span>
      <span className="round-step active prep-step"><i>P</i><span className="round-step-copy"><small>PREP</small><b>준비 중</b></span></span>
      <span className="round-step upcoming"><i>{prep.targetRound}</i><span className="round-step-copy"><small>R{prep.targetRound}</small><b>다음</b></span></span>
    </div>;
  }

  return <div className="round-progress" aria-label={`현재 R${round}`}>
    {[1, 2, 3, 4, 5].map((value) => <span key={value} className={`round-step ${value === round ? "active" : value < round ? "done" : "upcoming"}`}>
      <i>{value < round ? "✓" : value}</i><span className="round-step-copy"><small>R{value}</small><b>{value < round ? "완료" : value === round ? "현재" : "예정"}</b></span>
    </span>)}
  </div>;
}

export function PrepRoundHeader({ prep, phaseLabel, phaseDetail }: {
  prep: PrepPresentation;
  phaseLabel: string;
  phaseDetail?: ReactNode;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  return <header className="round-header prep-round-header">
    <div className="prep-heading-copy">
      <h1>PREPARE FOR ROUND {String(prep.targetRound).padStart(2, "0")}</h1>
      <div className={`prep-title-row ${rulesOpen ? "is-open" : ""}`}>
        <h2>{prep.title}</h2>
        <button className="prep-rule-trigger" type="button" aria-label={`${prep.title} 규칙 보기`} aria-expanded={rulesOpen} onClick={() => setRulesOpen((open) => !open)}>?</button>
        <section className="prep-rule-popover" role="dialog" aria-label={`${prep.title} 룰북`}>
          <header><span>ROUND {String(prep.targetRound).padStart(2, "0")} RULEBOOK</span><b>{prep.title}</b></header>
          <ul>{prep.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </section>
      </div>
    </div>
    <div className="phase-badge"><small>CURRENT PHASE</small><b>{phaseLabel}</b><span>PREPARING R{String(prep.targetRound).padStart(2, "0")}</span>{phaseDetail}</div>
  </header>;
}
