import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Card, Rank, Suit } from "../core/poker/cards";
import type { Round } from "../game/types";
import { ROUND_POINTS } from "../game/config";
import { CardView } from "./CardView";
import { useTranslation, type TranslationKey } from "../i18n";

type Guide = {
  kicker: TranslationKey;
  title: TranslationKey;
  summary: TranslationKey;
  steps: TranslationKey[];
  scoring: TranslationKey | { key: TranslationKey; params: Record<string, number> }[];
  caution: TranslationKey;
};

const GUIDES: Record<Round, Guide> = {
  1: { kicker: "round.r1.kicker", title: "round.r1.title", summary: "round.r1.summary", steps: ["round.r1.step1", "round.r1.step2", "round.r1.step3"], scoring: "round.r1.scoring", caution: "round.r1.caution" },
  2: { kicker: "round.r2.kicker", title: "round.r2.title", summary: "round.r2.summary", steps: ["round.r2.step1", "round.r2.step2", "round.r2.step3"], scoring: "round.r2.scoring", caution: "round.r2.caution" },
  3: { kicker: "round.r3.kicker", title: "round.r3.title", summary: "round.r3.summary", steps: ["round.r3.step1", "round.r3.step2", "round.r3.step3"], scoring: "round.r3.scoring", caution: "round.r3.caution" },
  4: { kicker: "round.r4.kicker", title: "round.r4.title", summary: "round.r4.summary", steps: ["round.r4.step1", "round.r4.step2", "round.r4.step3"], scoring: [
    { key: "round.r4.scoring.primary", params: { win: ROUND_POINTS.r4Primary.win, split: ROUND_POINTS.r4Primary.split } },
    { key: "round.r4.scoring.winner", params: { first: ROUND_POINTS.r4WinnerGroup.first, second: ROUND_POINTS.r4WinnerGroup.second, third: ROUND_POINTS.r4WinnerGroup.third } },
    { key: "round.r4.scoring.tiedSecond", params: { points: ROUND_POINTS.r4WinnerGroup.tiedSecond } },
    { key: "round.r4.scoring.loser", params: {} },
  ], caution: "round.r4.caution" },
  5: { kicker: "round.r5.kicker", title: "round.r5.title", summary: "round.r5.summary", steps: ["round.r5.step1", "round.r5.step2", "round.r5.step3"], scoring: "round.r5.scoring", caution: "round.r5.caution" },
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
  const { t } = useTranslation();
  return <section className="omaha-example" aria-label={t("round.omahaLabel")}>
    <div className="guide-example-side"><small>{t("round.holeCards")}</small><Cards ids={["2d", "2c", "Ah", "9s"]} used={["Ah", "2d"]} /></div>
    <b className="guide-plus">+</b>
    <div className="guide-example-side"><small>{t("round.boardCards")}</small><Cards ids={["3s", "5s", "4c", "Jh", "6c"]} used={["3s", "4c", "5s"]} /></div>
    <div className="guide-verdict"><span>{t("round.possibleBestFive")}</span><strong>{t("hand.highRank", { rank: "5" })} {t("hand.straight")}</strong><em>A♥ · 2♦ · 3♠ · 4♣ · 5♠</em></div>
    <p><b>{t("round.exactTwoThree")}</b> {t("round.omahaExplanation")}</p>
  </section>;
}

export function RoundGuide({ round, onClose, secondsLeft, onPreviewRound, confirmLabel, timerNotice }: { round: Round; onClose: () => void; secondsLeft?: number | null; onPreviewRound?: (round: Round) => void; confirmLabel?: string; timerNotice?: string }) {
  const { t } = useTranslation();
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
      <header><div><span>{t("round.guideTitle", { round: String(round).padStart(2, "0") })}</span><small>{t(guide.kicker)}</small></div><button type="button" aria-label={t("round.guideClose")} onClick={onClose}>×</button></header>
      {onPreviewRound && <div className="start-guide-rounds" aria-label={t("round.previewLabel")}>{([1, 2, 3, 4, 5] as const).map((value) => <button key={value} type="button" aria-pressed={round === value} onClick={() => onPreviewRound(value)}>R{value}</button>)}</div>}
      <div className="round-guide-body"><span className="guide-index">0{round}</span><div className="guide-copy"><h2 id="round-guide-title">{t(guide.title)}</h2><p>{t(guide.summary)}</p></div>
        <ol>{guide.steps.map((step, index) => <li key={step}><i>0{index + 1}</i><span>{t(step)}</span></li>)}</ol>
        {round === 3 ? <OmahaExample /> : <div className="guide-special"><span>{t("round.ruleCheck")}</span><p>{t(guide.caution)}</p></div>}
        <div className="guide-scoring"><span>{t("round.pointRule")}</span><strong>{Array.isArray(guide.scoring) ? guide.scoring.map((line) => <span key={line.key}>{t(line.key, line.params)}</span>) : t(guide.scoring)}</strong></div>
        {round === 3 && <div className="guide-special guide-match-rule"><span>{t("round.matchRule")}</span><p>{t("round.r3.matchRuleText")}</p></div>}
      </div>
      <footer className={!onPreviewRound && typeof secondsLeft !== "number" && !timerNotice ? "action-only" : undefined}>
        {(onPreviewRound || typeof secondsLeft === "number" || timerNotice) && <p className={timerNotice ? "round-guide-timer-notice" : undefined}>{timerNotice ?? (onPreviewRound ? t("round.previewPrompt") : t("round.timeRemaining", { seconds: secondsLeft ?? 0 }))}</p>}
        <button className="primary" type="button" onClick={onClose}>{confirmLabel ?? (onPreviewRound ? t("round.startScreen") : t("round.understoodStart", { round }))} <span>→</span></button>
      </footer>
    </section>
  </div>;
}

