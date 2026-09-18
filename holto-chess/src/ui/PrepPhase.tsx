import type { ReactNode } from "react";
import type { Round } from "../game/types";
import type { PrepPresentation } from "./prepPresentation";

export function RoundProgress({ round, prep }: { round: Round; prep: PrepPresentation | null }) {
  if (prep) {
    return <div className="round-progress prep-progress" aria-label={`R${prep.completedRound} 완료, PREP 활성, 다음 R${prep.targetRound}`}>
      <span className="done"><i>✓</i><small>R{prep.completedRound}</small></span>
      <span className="active prep-step"><i>P</i><small>PREP</small></span>
      <span><i>{prep.targetRound}</i><small>R{prep.targetRound}</small></span>
    </div>;
  }

  return <div className="round-progress" aria-label={`현재 R${round}`}>
    {[1, 2, 3, 4, 5].map((value) => <span key={value} className={`${value === round ? "active" : ""} ${value < round ? "done" : ""}`}>
      <i>{value < round ? "✓" : value}</i><small>R{value}</small>
    </span>)}
  </div>;
}

export function PrepRoundHeader({ prep, phaseLabel, phaseDetail }: {
  prep: PrepPresentation;
  phaseLabel: string;
  phaseDetail?: ReactNode;
}) {
  return <header className="round-header prep-round-header">
    <div className="prep-heading-copy">
      <div className="prep-status-line"><span className="round-number">ROUND {String(prep.completedRound).padStart(2, "0")} COMPLETE</span><b>PREP PHASE</b></div>
      <h1>PREPARE FOR ROUND {String(prep.targetRound).padStart(2, "0")}</h1>
      <h2>{prep.title}</h2>
      <ul className="prep-rule-list">{prep.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
    </div>
    <div className="phase-badge"><small>CURRENT PHASE</small><b>{phaseLabel}</b><span>PREPARING R{String(prep.targetRound).padStart(2, "0")}</span>{phaseDetail}</div>
  </header>;
}
