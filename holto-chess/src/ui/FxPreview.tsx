import { useEffect, useState } from "react";
import { makeDeck, type Card } from "../core/poker/cards";
import { findBestFive } from "../core/poker/evaluate";
import { CardView } from "./CardView";
import { ShowdownHand } from "./ShowdownHand";
import { madeTone } from "./madeTone";
import { cinemaSeatClass, MADE_TONE_SAMPLES } from "./madeFxClasses";
import { MADE_SOUND_TRACKS, playMadeSound, stopMadeAudio, type MadeSoundId } from "./madeSound";
import "./cinematic.css";
import "./fx-preview.css";

const DECK = new Map(makeDeck().map((card) => [card.id, card]));
const card = (id: string): Card => {
  const found = DECK.get(id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
};

/**
 * Five real cards per category, evaluated by the real evaluator. Nothing here
 * hard-codes a hand name, so a change to the evaluator shows up on this page.
 */
const SAMPLE_HANDS: Record<string, string[]> = {
  "하이카드": ["Ah", "Jd", "9c", "7s", "3h"],
  "원페어": ["Qh", "Qd", "9c", "7s", "3h"],
  "투페어": ["Qh", "Qd", "9c", "9s", "3h"],
  "트립스": ["Qh", "Qd", "Qc", "9s", "3h"],
  "스트레이트": ["9h", "8d", "7c", "6s", "5h"],
  "플러시": ["Ah", "Jh", "9h", "7h", "3h"],
  "풀하우스": ["Qh", "Qd", "Qc", "9s", "9h"],
  "포카드": ["Qh", "Qd", "Qc", "Qs", "9h"],
  "스트레이트 플러시": ["9h", "8h", "7h", "6h", "5h"],
  "로열 플러시": ["Ah", "Kh", "Qh", "Jh", "Th"],
};

type Context = "cinema" | "recap";

const CINEMA_SEQUENCE = MADE_TONE_SAMPLES.filter((name) => madeTone(name) !== "default");
const CINEMA_SEQUENCE_STEP_MS = 2_900;
const VIDEO_SAMPLES = ["스트레이트", "플러시", "풀하우스", "포카드", "로열 플러시"] as const;
type VideoSample = typeof VIDEO_SAMPLES[number];

function waitForFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function recordClip(stream: MediaStream, restart: () => void) {
  return new Promise<Blob>((resolve, reject) => {
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      reject(new Error("이 브라우저는 WebM 영상 녹화를 지원하지 않습니다."));
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("영상 녹화 중 오류가 발생했습니다."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.start();
    restart();
    window.setTimeout(() => recorder.stop(), 2600);
  });
}

function Sample({ name, context, leading }: { name: string; context: Context; leading: boolean }) {
  const cards = SAMPLE_HANDS[name]!.map(card);
  const hand = findBestFive(cards);
  const tone = madeTone(hand.displayName);
  const used = hand.bestFive.map((entry) => entry.id);

  if (context === "recap") {
    return <div className="fx-sample">
      <header><b>{hand.displayName}</b><code>made-{tone}</code></header>
      {/* Wrapped exactly as the recap does, including .match-card's overflow
          clip, so a halo that would be cut in game is cut here too. */}
      <article className="match-card">
        <div className="boards">
          <div className={`board made-${tone}`}>
            <small>COMMUNITY BOARD</small>
            <div className="card-row centered">
              {cards.map((entry) => <CardView key={entry.id} card={entry} compact glow={used.includes(entry.id)} dimmed={!used.includes(entry.id)} />)}
            </div>
          </div>
        </div>
        <div className="combatants">
          <div className={`combatant ${leading ? "winner" : ""}`}>
            <ShowdownHand cards={cards} usedCardIds={used} winner={leading} displayName={hand.displayName} category={hand.category} kickers={hand.kickers} />
          </div>
        </div>
      </article>
    </div>;
  }

  // Mirrors a live cinematic seat: same wrapper classes, same card component.
  return <div className="fx-sample">
    <header><b>{hand.displayName}</b><code>made-{tone}</code></header>
    <div className="cinema">
      <div className={cinemaSeatClass({ tone, placement: leading ? "cinema-winner" : "cinema-loser", made: true, leading })}>
        <div className="cinema-profile"><span className="player-avatar">1</span><b>SAMPLE</b>
          <span className="cinema-victory">{leading ? "WIN" : "LOSS"}</span></div>
        <div className="cinema-hole-cards">
          {cards.map((entry) => <CardView key={entry.id} card={entry} compact glow={used.includes(entry.id)} />)}
        </div>
        <div className="cinema-made"><strong>{hand.displayName}</strong></div>
      </div>
    </div>
  </div>;
}

export function FxPreview() {
  const [context, setContext] = useState<Context>("cinema");
  const [leading, setLeading] = useState(true);
  const [onlyFx, setOnlyFx] = useState(true);
  const [replay, setReplay] = useState(0);
  const [previewMotion, setPreviewMotion] = useState(false);
  const [playingSound, setPlayingSound] = useState<MadeSoundId | null>(null);
  const [captureName, setCaptureName] = useState<VideoSample | null>(null);
  const [captureMode, setCaptureMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [clips, setClips] = useState<Array<{ name: VideoSample; url: string }>>([]);
  const [sequenceActive, setSequenceActive] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState<number | null>(null);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!sequenceActive || sequenceIndex === null || sequenceIndex >= CINEMA_SEQUENCE.length - 1) return;
    const timeout = window.setTimeout(() => {
      setSequenceIndex((current) => current === null ? null : current + 1);
      setReplay((current) => current + 1);
    }, CINEMA_SEQUENCE_STEP_MS);
    return () => window.clearTimeout(timeout);
  }, [sequenceActive, sequenceIndex]);

  const names = captureMode && captureName
    ? [captureName]
    : sequenceActive && context === "cinema"
      ? [CINEMA_SEQUENCE[sequenceIndex ?? 0]!]
      : MADE_TONE_SAMPLES.filter((name) => !onlyFx || madeTone(name) !== "default");

  function startCinematicSequence() {
    setContext("cinema");
    setSequenceActive(true);
    setSequenceIndex(0);
    setReplay((current) => current + 1);
  }

  function showRecap() {
    setSequenceActive(false);
    setSequenceIndex(null);
    setContext("recap");
    setReplay((current) => current + 1);
  }

  async function recordMadeAnimations() {
    if (!navigator.mediaDevices?.getDisplayMedia || !("MediaRecorder" in window)) {
      window.alert("이 브라우저에서는 화면 녹화를 지원하지 않습니다.");
      return;
    }
    setRecording(true);
    setClips([]);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, displaySurface: "browser" },
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
      setContext("cinema");
      setLeading(true);
      setOnlyFx(true);
      setPreviewMotion(true);
      setSequenceActive(false);
      setSequenceIndex(null);
      setCaptureName(VIDEO_SAMPLES[0]);
      setCaptureMode(true);
      const generated: Array<{ name: VideoSample; url: string }> = [];
      for (const name of VIDEO_SAMPLES) {
        setCaptureName(name);
        setReplay((value) => value + 1);
        await waitForFrame();
        await waitForFrame();
        const blob = await recordClip(stream, () => setReplay((value) => value + 1));
        generated.push({ name, url: URL.createObjectURL(blob) });
        setClips([...generated]);
      }
      setCaptureName(null);
      setCaptureMode(false);
    } catch (error) {
      setCaptureName(null);
      setCaptureMode(false);
      const message = error instanceof Error ? error.message : "화면 녹화를 완료하지 못했습니다.";
      window.alert(message);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setRecording(false);
    }
  }

  return <main className={`fx-preview${previewMotion ? " fx-motion-preview" : ""}${captureMode ? " fx-video-capture" : ""}`}>
    {import.meta.env.DEV && <section className="fx-video-tools" aria-label="메이드 연출 영상 제작">
      <div><b>메이드 연출 영상</b><small>스트레이트 플러시 제외 · 족보별 2.6초 WebM</small></div>
      <button type="button" className="primary" onClick={() => void recordMadeAnimations()} disabled={recording}>
        {recording ? `녹화 중 · ${captureName ?? "준비"}` : "5개 영상 만들기"}
      </button>
      {clips.length > 0 && <div className="fx-video-downloads" role="status">
        {clips.map(({ name, url }) => <a key={name} href={url} download={`porena-made-${madeTone(name)}.webm`}>{name} 영상 다운로드</a>)}
      </div>}
    </section>}
    {captureMode && captureName && <div className="fx-capture-title">{captureName}</div>}
    <header className="fx-preview-head">
      <div><small>DEVELOPMENT</small><h1>메이드 핸드 이펙트</h1>
        <p>실제 평가기와 실제 카드 컴포넌트로 그립니다. 족보 이름과 톤 클래스는 게임과 같은 함수에서 나옵니다.</p></div>
      <div className="fx-controls">
        <div role="group" aria-label="표시 맥락">
          <button type="button" className={context === "cinema" ? "locked" : ""} onClick={startCinematicSequence}>시네마틱</button>
          <button type="button" className={context === "recap" ? "locked" : ""} onClick={showRecap}>결과 리캡</button>
        </div>
        {sequenceActive && sequenceIndex !== null && <span className="fx-sequence-status" role="status" aria-live="polite">
          시네마틱 연속 재생 · {sequenceIndex + 1}/{CINEMA_SEQUENCE.length}{sequenceIndex === CINEMA_SEQUENCE.length - 1 ? " · 완료" : ""}
        </span>}
        <div role="group" aria-label="승패 상태">
          <button type="button" className={leading ? "locked" : ""} onClick={() => setLeading(true)}>승자</button>
          <button type="button" className={!leading ? "locked" : ""} onClick={() => setLeading(false)}>패자</button>
        </div>
        <label><input type="checkbox" checked={onlyFx} onChange={(e) => setOnlyFx(e.target.checked)} />전용 연출만</label>
        {reduced && <label><input type="checkbox" checked={previewMotion} onChange={(e) => { setPreviewMotion(e.target.checked); setReplay((n) => n + 1); }} />이 미리보기에서만 동작 허용</label>}
        <button type="button" className="primary" onClick={() => setReplay((n) => n + 1)}>다시 재생</button>
      </div>
    </header>
    <section className="fx-sound-preview" aria-labelledby="fx-sound-title">
      <div><h2 id="fx-sound-title">메이드 효과음 미리듣기</h2><p>버튼을 누르면 선택한 음원만 재생합니다. 다른 음원이 시작되면 앞의 잔향은 짧게 정리됩니다.</p></div>
      <div className="fx-sound-buttons">{MADE_SOUND_TRACKS.map((track) => <button type="button" key={track.id} onClick={() => { setPlayingSound(track.id); void playMadeSound(track.id).then(() => window.setTimeout(() => setPlayingSound((current) => current === track.id ? null : current), 1800)); }}>{playingSound === track.id ? `재생 중 · ${track.label}` : `▶ ${track.label}`}</button>)}<button type="button" className="secondary" onClick={() => { stopMadeAudio(); setPlayingSound(null); }}>정지</button></div>
    </section>
    {reduced && !previewMotion && <p className="fx-warning" role="status">
      이 브라우저가 <code>prefers-reduced-motion: reduce</code> 상태라 애니메이션이 정지됩니다. 확인하려면 ‘이 미리보기에서만 동작 허용’을 선택하세요. 실제 게임 설정은 바뀌지 않습니다.
    </p>}
    <div className="fx-grid" key={`${context}-${leading}-${replay}`}>
      {names.map((name) => <Sample key={name} name={name} context={context} leading={leading} />)}
    </div>
  </main>;
}
