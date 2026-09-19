import { useEffect, useRef, useState } from "react";
import { GameOverviewGuide } from "./GameOverviewGuide";
import "./start-screen.css";

type MenuOverlay = "guide" | "settings" | null;

export function StartScreen({ onStart }: { onStart: () => void }) {
  const [overlay, setOverlay] = useState<MenuOverlay>(null);
  const modal = useRef<HTMLDivElement>(null);

  // Keep keyboard navigation inside either menu overlay and restore its trigger.
  useEffect(() => {
    if (!overlay) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(modal.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex='0']") ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(null);
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [overlay]);

  return <main className="start-screen">
    <div className="start-content" inert={overlay !== null}>
      <div className="start-main">
        <header className="start-title"><p>POKER STRATEGY · AUTO BATTLER</p><h1 aria-label="PORENA"><span>POREN</span><span className="start-title-accent">A</span></h1><div className="start-title-line" /><p className="start-tagline">최강의 패를 조합하여 아레나에서 승리하라</p></header>
        <div className="start-menu" aria-label="메인 메뉴">
          <button type="button" className="start-menu-primary" onClick={onStart}><span>시작하기</span><i aria-hidden="true">→</i></button>
          <button type="button" onClick={() => setOverlay("guide")}>게임 설명</button>
          <button type="button" onClick={() => setOverlay("settings")}>환경 설정</button>
        </div>
      </div>
      {import.meta.env.DEV ? <footer className="start-footer">PORENA <span>·</span> DEVELOPMENT PREVIEW</footer> : null}
    </div>
    {overlay && <div ref={modal} className="start-overlay">
      {overlay === "guide" ? <GameOverviewGuide onClose={() => setOverlay(null)} /> :
        <div className="start-settings-backdrop"><section className="start-settings" role="dialog" aria-modal="true" aria-labelledby="start-settings-title">
          <header><div><small>PREFERENCES</small><h2 id="start-settings-title">환경 설정</h2></div><button type="button" aria-label="환경 설정 닫기" onClick={() => setOverlay(null)}>×</button></header>
          <p>설정 메뉴를 준비하고 있습니다.<br />아래 항목은 아직 게임에 적용되지 않습니다.</p>
          <fieldset disabled><legend>사운드 · 준비 중</legend><label>전체 음량<input type="range" min="0" max="100" defaultValue="70" /></label><label>배경 음악<input type="checkbox" defaultChecked /></label><label>효과음<input type="checkbox" defaultChecked /></label></fieldset>
          <fieldset disabled><legend>화면 · 준비 중</legend><label>기본 애니메이션 속도<select defaultValue="1"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label></fieldset>
          <p className="start-settings-note">현재 쇼다운 속도는 게임 내 속도 메뉴에서 변경할 수 있습니다.</p>
          <button className="primary" type="button" onClick={() => setOverlay(null)}>닫기</button>
        </section></div>}
    </div>}
  </main>;
}
