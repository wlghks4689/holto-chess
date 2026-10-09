import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clearEntryIntent } from "./entryIntent";
import { useCinematicMotion } from "./useCinematicMotion";
const PORTRAIT = "(orientation: portrait) and (max-width: 820px)";
function subscribeMedia(notify: () => void) {
  const queries = [matchMedia(PORTRAIT), matchMedia("(prefers-reduced-motion: reduce)")];
  queries.forEach(query => query.addEventListener("change", notify));
  return () => queries.forEach(query => query.removeEventListener("change", notify));
}
function mediaSnapshot() { return `${matchMedia(PORTRAIT).matches}:${matchMedia("(prefers-reduced-motion: reduce)").matches}`; }
/** Selected video preloads here. Authentication and game sessions stay outside this layer. */
export function EntranceLayer({ active, preload, onComplete = clearEntryIntent, forceFailure = false, forceReducedMotion = false }: {
  active: boolean; preload: boolean; onComplete?: () => void; forceFailure?: boolean; forceReducedMotion?: boolean;
}) {
  const media = useSyncExternalStore(subscribeMedia, mediaSnapshot, () => "false:false");
  const motion = useCinematicMotion();
  const reduced = forceReducedMotion || media.endsWith(":true") || !motion.enabled;
  const mobile = media.startsWith("true:");
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"waiting" | "playing" | "exit">("waiting");
  const [fadeDuration, setFadeDuration] = useState(220);
  const complete = useRef(onComplete);
  useEffect(() => { complete.current = onComplete; }, [onComplete]);
  const [selected] = useState(() => mobile ? "mobile" : "desktop");
  const variant = active ? selected : mobile ? "mobile" : "desktop";
  const source = `/assets/start/entrance-${variant}.mp4`;
  useEffect(() => {
    if (!active) return;
    const element = video.current;
    let cancelled = false;
    let finishTimer: ReturnType<typeof setTimeout>;
    let loadTimer: ReturnType<typeof setTimeout>;
    let watchdog: ReturnType<typeof setTimeout>;
    let frames: ReturnType<typeof setInterval>;
    let exiting = false;
    const exit = (milliseconds: number) => {
      if (cancelled || exiting) return;
      exiting = true;
      clearTimeout(loadTimer); clearTimeout(watchdog);
      clearInterval(frames);
      setFadeDuration(milliseconds);
      setPhase("exit");
      finishTimer = setTimeout(() => { if (!cancelled) complete.current(); }, milliseconds);
    };
    const onTime = () => { if (element && Number.isFinite(element.duration) && element.duration - element.currentTime <= .22) exit(220); };
    const onError = () => exit(500);
    const onEnded = () => exit(220);
    const play = () => { if (element && !cancelled && !exiting) void element.play().catch(onError); };
    const onPlaying = () => {
      clearTimeout(loadTimer);
      if (cancelled || exiting) return;
      setPhase("playing");
      // timeupdate can arrive only every 250ms; sample to begin the final 220ms fade on time.
      clearInterval(frames); frames = setInterval(onTime, 33);
    };
    if (reduced) { finishTimer = setTimeout(() => exit(250), 0); }
    else if (forceFailure || !element) { finishTimer = setTimeout(onError, 150); }
    else {
      element.addEventListener("playing", onPlaying);
      element.addEventListener("timeupdate", onTime);
      element.addEventListener("ended", onEnded);
      element.addEventListener("error", onError);
      loadTimer = setTimeout(onError, 2_000);
      // Absolute limit also covers a repeatedly stalling stream.
      watchdog = setTimeout(onError, 8_000);
      finishTimer = setTimeout(play, 150);
    }
    return () => {
      cancelled = true;
      clearTimeout(finishTimer); clearTimeout(loadTimer); clearTimeout(watchdog);
      clearInterval(frames);
      element?.removeEventListener("playing", onPlaying);
      element?.removeEventListener("timeupdate", onTime); element?.removeEventListener("ended", onEnded); element?.removeEventListener("error", onError);
      element?.pause();
    };
  }, [active, source, reduced, forceFailure]);
  useEffect(() => {
    const image = new Image();
    image.src = `/assets/start/arena-${mobile ? "mobile" : "desktop"}.webp`;
  }, [mobile]);
  useEffect(() => {
    const element = video.current;
    return () => { element?.pause(); };
  }, []);
  if (!preload && !active) return null;
  return <div style={{ transitionDuration: `${fadeDuration}ms`, backgroundImage: `url('/assets/start/gate-${variant}.webp')` }} className={`entrance-layer ${active ? "is-active" : "is-preloading"} phase-${phase}${reduced ? " is-reduced" : ""}`} aria-hidden="true">
    {!reduced && <video ref={video} src={forceFailure ? "/assets/start/unavailable-entrance.mp4" : source} preload="auto" muted playsInline disablePictureInPicture poster={`/assets/start/gate-${variant}.webp`} />}
  </div>;
}
