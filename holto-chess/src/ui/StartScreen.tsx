import { useEffect, useRef, useState } from "react";
import { GameOverviewGuide } from "./GameOverviewGuide";
import { useCinematicMotion } from "./useCinematicMotion";
import "./start-screen.css";

export type StartMode = "single" | "multi";
type MenuOverlay = "mode" | "guide" | "settings" | null;

export function StartScreen({ onStart }: { onStart: (mode: StartMode) => void }) {
  const motion = useCinematicMotion();
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
        <header className="start-title"><p>POKER STRATEGY · AUTO BATTLER</p><h1><img src="/assets/start/porena-wordmark.png" alt="PORENA" /></h1><p className="start-tagline">최강의 패를 조합하여 아레나에서 승리하라</p></header>
        <div className="start-menu" aria-label="메인 메뉴">
          <button type="button" className="start-menu-primary" onClick={() => setOverlay("mode")}><span>시작하기</span></button>
          <button type="button" onClick={() => setOverlay("guide")}><span>게임 설명</span></button>
          <button type="button" onClick={() => setOverlay("settings")}><span>환경 설정</span></button>
        </div>
      </div>
      <footer className="start-footer">
        <a href={`mailto:wlghks1778@gmail.com?subject=${encodeURIComponent("[PORENA] 버그 제보")}&body=${encodeURIComponent("발생 시각:\n방 코드:\n기기 / 브라우저:\n문제 상황 및 재현 방법:\n\n비밀번호나 재접속 토큰은 보내지 마세요.")}`}>버그 제보 · wlghks1778@gmail.com</a>
        {import.meta.env.DEV ? <><span>·</span> DEVELOPMENT PREVIEW</> : null}
      </footer>
    </div>
    {overlay && <div ref={modal} className="start-overlay">
      {overlay === "mode" ? <div className="start-mode-backdrop"><section className="start-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="start-mode-title">
        <header><div><small>SELECT PLAY MODE</small><h2 id="start-mode-title">플레이 방식 선택</h2></div><button type="button" aria-label="플레이 방식 선택 닫기" onClick={() => setOverlay(null)}>×</button></header>
        <div className="start-mode-options">
          <button type="button" onClick={() => onStart("single")}><span>SINGLE PLAY</span><strong>싱글 플레이</strong><small>나 혼자 AI 7명과 바로 시작합니다.</small><i>→</i></button>
          <button type="button" onClick={() => onStart("multi")}><span>MULTIPLAYER</span><strong>멀티 플레이</strong><small>방을 만들거나 다른 플레이어의 방에 참가합니다.</small><i>→</i></button>
        </div>
      </section></div> : overlay === "guide" ? <GameOverviewGuide onClose={() => setOverlay(null)} /> :
        <div className="start-settings-backdrop"><section className="start-settings" role="dialog" aria-modal="true" aria-labelledby="start-settings-title">
          <header><div><small>PREFERENCES</small><h2 id="start-settings-title">환경 설정</h2></div><button type="button" aria-label="환경 설정 닫기" onClick={() => setOverlay(null)}>×</button></header>
          <fieldset><legend>게임 연출</legend><label>카드 회전·쇼다운 애니메이션<input type="checkbox" role="switch" checked={motion.enabled} onChange={(event) => motion.setEnabled(event.target.checked)} /></label><p className="start-settings-note">기본값은 켜짐입니다. 끄면 카드 회전·화면 이동·메이드 연출의 움직임이 줄어듭니다. 공개 순서와 게임 진행 시간은 유지됩니다. 설정은 이 브라우저에 자동 저장됩니다.</p></fieldset>
          <p>아래 준비 중인 항목은 아직 게임에 적용되지 않습니다.</p>
          <fieldset disabled><legend>사운드 · 준비 중</legend><label>전체 음량<input type="range" min="0" max="100" defaultValue="70" /></label><label>배경 음악<input type="checkbox" defaultChecked /></label><label>효과음<input type="checkbox" defaultChecked /></label></fieldset>
          <fieldset disabled><legend>화면 · 준비 중</legend><label>기본 애니메이션 속도<select defaultValue="1"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label></fieldset>
          <p className="start-settings-note">현재 쇼다운 속도는 게임 내 속도 메뉴에서 변경할 수 있습니다.</p>
          <button className="primary" type="button" onClick={() => setOverlay(null)}>닫기</button>
        </section></div>}
    </div>}
  </main>;
}
