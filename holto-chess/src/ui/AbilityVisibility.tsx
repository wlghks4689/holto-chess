import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AbilityBenefitView, AbilityCue, AbilityId } from "../game/abilities";
import { cardLabel, type Card } from "../core/poker/cards";
import { useTranslation } from "../i18n";
import { abilityIconUrl } from "./abilityArtworkLoader";
import { abilityUx, cueAmount } from "./abilityPresentation";
import { useCinematicMotion } from "./useCinematicMotion";
import "./ability-visibility.css";

export function AbilityBenefitSummary({ ability, benefit }: { ability: AbilityId; benefit?: AbilityBenefitView }) {
  const { t } = useTranslation();
  const metric = abilityUx[ability].metric;
  if (metric === "order") return <span className="ability-benefit">{benefit?.draftPositions.length
    ? benefit.draftPositions.map(position => <span className="ability-draft-position" key={position.round}>{t("ability.ux.order", { round: position.round, position: position.originalPosition })}</span>)
    : t("ability.ux.orderPending")}</span>;
  const amounts = [metric === "bb" || benefit?.bb ? `${t("ability.ux.earned")} +${benefit?.bb ?? 0}BB` : "",
    metric === "points" || benefit?.points ? `${t("ability.ux.earned")} +${benefit?.points ?? 0}P` : "",
    ["saved", "sale"].includes(metric) || benefit?.savedBB ? `${t(metric === "sale" ? "ability.ux.sale" : "ability.ux.saved")} +${benefit?.savedBB ?? 0}BB` : ""];
  return <span className="ability-benefit">{amounts.filter(Boolean).join(" · ")}</span>;
}

export function AbilityBadge({ ability, cue, age = 0, catchUp = false, compact = false }: {
  ability: AbilityId; cue?: AbilityCue; age?: number; catchUp?: boolean; compact?: boolean;
}) {
  const { t } = useTranslation();
  const motion = useCinematicMotion();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 250 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = hovered || pinned;
  const name = t(`ability.card.${ability}.name`);
  const close = () => { setHovered(false); setPinned(false); };
  const locate = () => {
    clearTimeout(closeTimer.current);
    const rect = button.current?.getBoundingClientRect(); if (!rect) return;
    const width = Math.min(300, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 16;
    const height = Math.min(280, Math.max(below, rect.top - 16));
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: below >= height ? rect.bottom + 8 : Math.max(12, rect.top - height - 8), maxHeight: height });
  };
  const leave = () => { closeTimer.current = setTimeout(() => setHovered(false), 120); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!button.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); button.current?.focus(); } };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape);
    window.addEventListener("resize", close); window.addEventListener("scroll", close);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); window.removeEventListener("resize", close); window.removeEventListener("scroll", close); };
  }, [open]);
  return <span className={`ability-badge ${compact ? "is-compact" : ""} ${cue ? "has-cue" : ""} ${catchUp || !motion.enabled ? "is-still" : ""}`}
    style={{ "--ability-age": `-${age}ms` } as CSSProperties}>
    <button ref={button} type="button" className="ability-badge-button" aria-label={t("ability.ux.view", { name })} aria-expanded={open} aria-controls={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType === "mouse") { locate(); setHovered(true); } }} onPointerLeave={leave}
      onClick={() => { locate(); if (pinned) close(); else setPinned(true); }}>
      <img src={abilityIconUrl(ability)} alt="" width="36" height="36" />
    </button>
    {cue && <span className="ability-activation" key={cue.id}>{t("ability.ux.active")}{cueAmount(cue) && ` · ${cueAmount(cue)}`}</span>}
    {open && createPortal(<div id={id} ref={popover} className="ability-popover" role="region" aria-label={name} style={position}
      onPointerEnter={() => { clearTimeout(closeTimer.current); setHovered(true); }} onPointerLeave={leave}>
      <strong>{name}</strong><p>{t(`ability.card.${ability}.description`)}</p>
      <button type="button" className="ability-popover-close" onClick={() => { close(); button.current?.focus(); }}>{t("ability.ux.close")}</button>
    </div>, document.body)}
  </span>;
}

export function ShopAbilityPanel({ ability, benefit, startingCard, compact = false }: { ability?: AbilityId; benefit?: AbilityBenefitView; startingCard?: Card; compact?: boolean }) {
  const { t } = useTranslation();
  if (!ability) return null;
  return <aside className={`shop-ability-panel ${compact ? "is-compact" : ""}`}>
    <AbilityBadge ability={ability} compact={compact} />
    <div className="shop-ability-copy"><strong>{t(`ability.card.${ability}.name`)}</strong>
      {ability === "target-sniper" && startingCard && <span className="shop-ability-effect">{t("ability.ux.startingCard", { card: cardLabel(startingCard) })}</span>}
      {!compact && <span className="shop-ability-effect">{t(`ability.card.${ability}.description`)}</span>}
      {benefit && <AbilityBenefitSummary ability={ability} benefit={benefit} />}
    </div>
  </aside>;
}

export function RoundAbilityBenefits({ cues, identityId }: { cues?: AbilityCue[]; identityId: string }) {
  const { t } = useTranslation();
  const own = cues?.filter(cue => cue.playerId === identityId) ?? [];
  if (!own.length) return null;
  return <aside className="round-ability-benefits">{own.map(cue => <div key={cue.id}><AbilityBadge ability={cue.abilityId} />
    <span>{t(`ability.card.${cue.abilityId}.name`)} · {cueAmount(cue)}<small>{t("ability.ux.included")}</small></span></div>)}</aside>;
}
