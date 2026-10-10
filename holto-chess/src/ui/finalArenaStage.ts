import type { Application, Particle, Sprite, Texture } from "pixi.js";

/**
 * Pixi layer for the final round, drawn between the arena artwork and the seats so it lights the
 * room without covering a card. It only reacts to the cinematic phase; it never changes timing.
 */
const TENSION: Record<string, number> = { TURN_HAND: 0.45, RIVER_SUSPENSE: 1, RIVER: 1, FINAL_SECOND_HAND: 0.45, FINAL_LAST_REVEAL: 1 };
const RELEASE = new Set(["RIVER_SETTLE", "FINAL_SEVEN_SETTLE"]);
const WINNER = new Set(["FINAL_WINNER", "REWARD", "COMPLETE"]);

const GOLD = [0xffd56a, 0xfff1c2, 0xffb84d];
const AMBIENT = [0xffd28a, 0x7fe3d0, 0xfff1c2];

type Mote = { p: Particle; vx: number; vy: number; life: number; age: number; size: number; peak: number; seat: number };
type Seat = { x: number; y: number; w: number; h: number };

export type FinalArenaFx = { setPhase(phase: string, winnerIds: readonly string[], silent: boolean): void; destroy(): void };

function paint(pixi: typeof import("pixi.js"), w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext("2d")!);
  return pixi.Texture.from(canvas);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (list: number[]) => list[Math.floor(Math.random() * list.length)]!;
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt / 1000));

export async function createFinalArenaFx(host: HTMLElement): Promise<FinalArenaFx> {
  const pixi = await import("pixi.js");
  const { Application, Container, Particle, ParticleContainer, Rectangle, Sprite, Texture } = pixi;
  const app: Application = new Application();
  // Sprites only, so no antialias; 1.5x caps the fill cost on high-DPI phones.
  await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: false, resolution: Math.min(devicePixelRatio || 1, 1.5), autoDensity: true });
  host.appendChild(app.canvas);

  const glow = paint(pixi, 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.3, "rgba(255,255,255,.45)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
  const vignetteTex = paint(pixi, 256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 40, 128, 128, 182);
    grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  });
  const rayTex = paint(pixi, 64, 256, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,0)"); v.addColorStop(0.2, "rgba(255,255,255,.45)"); v.addColorStop(0.78, "rgba(255,255,255,.95)"); v.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = v; g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = "destination-in";
    const hz = g.createLinearGradient(0, 0, 64, 0);
    hz.addColorStop(0, "rgba(0,0,0,0)"); hz.addColorStop(0.5, "rgba(0,0,0,1)"); hz.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = hz; g.fillRect(0, 0, 64, 256);
  });
  const ringTex = paint(pixi, 128, 128, (g) => {
    g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 5; g.shadowColor = "#fff"; g.shadowBlur = 10;
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  });

  // Back to front: vignette (normal), light (add), motes (add), rings (add), flash (add).
  const vignette = new Sprite(vignetteTex); vignette.alpha = 0;
  const light = new Container(); light.blendMode = "add";
  const bounds = new Rectangle(0, 0, 8192, 8192);
  const motes = new ParticleContainer({ texture: glow, boundsArea: bounds, dynamicProperties: { position: true, color: true, vertex: true } });
  motes.blendMode = "add";
  const rings = new Container(); rings.blendMode = "add";
  const flash = new Sprite(Texture.WHITE); flash.blendMode = "add"; flash.tint = 0xffd56a; flash.alpha = 0;
  // Behind the community board while the river is pending: a slow double-beat, like a held breath.
  const focusGlow = new Sprite(glow); focusGlow.anchor.set(0.5); focusGlow.tint = 0x9fe9da; focusGlow.alpha = 0; focusGlow.blendMode = "add";
  app.stage.addChild(vignette, focusGlow, light, motes, rings, flash);
  const fit = () => {
    const { width, height } = app.screen;
    vignette.setSize(width, height); flash.setSize(width, height);
  };
  fit();
  app.renderer.on("resize", fit);

  // Ambient dust drifts through the arena the whole time; winner embers are pooled and only respawn on a win.
  const ambient: Mote[] = [];
  const embers: Mote[] = [];
  const spawnAmbient = (m: Mote, fresh: boolean) => {
    const { width, height } = app.screen;
    m.p.x = rand(0, width); m.p.y = fresh ? rand(0, height) : height + 10;
    m.vx = rand(-0.12, 0.12); m.vy = rand(-0.45, -0.12); m.life = rand(5000, 9000); m.age = fresh ? rand(0, m.life) : 0;
    m.size = rand(0.05, 0.16); m.peak = rand(0.18, 0.5); m.p.tint = pick(AMBIENT);
  };
  for (let i = 0; i < 70; i++) {
    const m: Mote = { p: new Particle({ texture: glow, anchorX: 0.5, anchorY: 0.5, alpha: 0 }), vx: 0, vy: 0, life: 1, age: 0, size: 0, peak: 0, seat: 0 };
    spawnAmbient(m, true); motes.addParticle(m.p); ambient.push(m);
  }
  for (let i = 0; i < 150; i++) {
    const m: Mote = { p: new Particle({ texture: glow, anchorX: 0.5, anchorY: 0.5, alpha: 0 }), vx: 0, vy: 0, life: 0, age: 1, size: 0, peak: 0, seat: 0 };
    motes.addParticle(m.p); embers.push(m);
  }

  let tension = 0, tensionTarget = 0, beat = 0;
  let seats: Seat[] = [];
  let winners: readonly string[] = [];
  let winning = false, winAge = 0, seatClock = 0;
  let phase = "";
  const rays: Sprite[][] = [];
  const halos: Sprite[] = [];

  const rectOf = (el: Element | null): Seat | undefined => {
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : undefined;
  };
  const focus = () => rectOf(document.querySelector(".cinema-final .final-community-board")) ?? rectOf(document.querySelector(".cinema-final .cinema-seats"));
  const measureSeats = () => {
    seats = winners.map((id) => rectOf(document.querySelector(`.cinema-final [data-player-id="${CSS.escape(id)}"]`))).filter((s): s is Seat => !!s);
  };

  const buildLight = () => {
    light.removeChildren().forEach((child) => child.destroy());
    rays.length = 0; halos.length = 0;
    for (let i = 0; i < seats.length; i++) {
      const halo = new Sprite(glow); halo.anchor.set(0.5); halo.tint = 0xffcf66; halo.alpha = 0;
      const beams = Array.from({ length: 5 }, (_, i) => {
        const ray = new Sprite(rayTex); ray.anchor.set(0.5, 0); ray.tint = i % 2 ? 0xfff1c2 : 0xffd56a; ray.alpha = 0;
        return ray;
      });
      light.addChild(halo, ...beams);
      halos.push(halo); rays.push(beams);
    }
  };

  const waves: Array<{ ring: Sprite; delay: number; size: number; age: number }> = [];
  const pulse = () => {
    const at = focus();
    if (!at) return;
    for (let i = 0; i < 2; i++) {
      const ring = new Sprite(ringTex); ring.anchor.set(0.5); ring.position.set(at.x, at.y);
      ring.tint = i ? 0x7fe3d0 : 0xfff1c2; ring.alpha = 0;
      rings.addChild(ring);
      waves.push({ ring, delay: i * 140, size: Math.max(at.w, at.h) / 128, age: 0 });
    }
  };

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS, f = dt / 16.67;
    tension = approach(tension, tensionTarget, tensionTarget > tension ? 3 : 1.6, dt);
    vignette.alpha = tension * 0.78;
    const at = tension > 0.02 ? focus() : undefined;
    beat += dt;
    if (at) {
      const cycle = (beat % 1100) / 1100;
      const thump = Math.exp(-(((cycle - 0.08) / 0.05) ** 2)) + 0.7 * Math.exp(-(((cycle - 0.28) / 0.05) ** 2));
      focusGlow.position.set(at.x, at.y);
      focusGlow.scale.set(at.w / 64 * 3, at.h / 64 * 5);
      focusGlow.alpha = tension * (0.42 + thump * 0.4);
    } else focusGlow.alpha = 0;

    for (const m of ambient) {
      m.age += dt;
      if (m.age >= m.life) spawnAmbient(m, false);
      // Under tension the dust leans toward the board, like the room holding its breath.
      if (at) { m.vx += (at.x - m.p.x) * 0.00002 * tension * f; m.vy += (at.y - m.p.y) * 0.00002 * tension * f; }
      m.vx *= 0.995 ** f; m.vy *= 0.995 ** f;
      m.p.x += m.vx * f; m.p.y += m.vy * f + Math.sin((m.age + m.life) / 900) * 0.08 * f;
      const u = m.age / m.life;
      m.p.alpha = Math.sin(Math.PI * u) * m.peak * (1 + tension * 0.6) * (winning ? 0.6 : 1);
      m.p.scaleX = m.p.scaleY = m.size;
    }

    if (winning) {
      winAge += dt; seatClock += dt;
      if (seatClock > 400) { seatClock = 0; const count = seats.length; measureSeats(); if (seats.length !== count) buildLight(); }
    }
    const rise = winning ? Math.min(1, winAge / 600) : 0;
    seats.forEach((s, i) => {
      const halo = halos[i]; const beams = rays[i];
      if (!halo || !beams) return;
      halo.position.set(s.x, s.y); halo.scale.set(s.w / 64 * 2.1, s.h / 64 * 1.7);
      halo.alpha = rise * (0.5 + Math.sin(winAge / 420) * 0.08);
      // The beams come from above the frame and land on the seat, ending just past its bottom edge.
      const source = Math.min(-40, s.y - s.h * 2.2), length = s.y + s.h * 0.55 - source;
      beams.forEach((ray, k) => {
        const spread = (k - 2) * 0.06;
        ray.position.set(s.x + (k - 2) * s.w * 0.04, source);
        ray.rotation = spread + Math.sin(winAge / 1300 + k) * 0.03;
        ray.width = s.w * (k === 2 ? 0.6 : 0.38); ray.height = length;
        ray.alpha = rise * (0.22 + Math.sin(winAge / 700 + k * 1.7) * 0.07);
      });
    });

    for (const m of embers) {
      m.age += dt;
      if (m.age >= m.life) {
        const s = winning ? seats[Math.floor(Math.random() * seats.length)] : undefined;
        if (!s) { m.p.alpha = 0; continue; }
        // Embers rise off the champion's seat edge for the rest of the scene.
        m.p.x = s.x + rand(-0.5, 0.5) * s.w; m.p.y = s.y + rand(-0.1, 0.5) * s.h;
        m.vx = rand(-0.3, 0.3); m.vy = rand(-2.6, -1); m.life = rand(1200, 2400); m.age = 0;
        m.size = rand(0.06, 0.18); m.peak = rand(0.5, 1); m.p.tint = pick(GOLD);
      }
      const u = m.age / m.life;
      m.vy *= 0.993 ** f;
      m.p.x += (m.vx + Math.sin(m.age / 260) * 0.25) * f; m.p.y += m.vy * f;
      m.p.alpha = (u < 0.15 ? u / 0.15 : (1 - u) / 0.85) * m.peak;
      m.p.scaleX = m.p.scaleY = m.size * (1 - u * 0.4);
    }

    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i]!;
      wave.age += dt;
      const u = (wave.age - wave.delay) / 900;
      if (u < 0) continue;
      if (u >= 1) { rings.removeChild(wave.ring); wave.ring.destroy(); waves.splice(i, 1); continue; }
      wave.ring.scale.set(wave.size * (0.3 + (1 - (1 - u) ** 3) * 1.5));
      wave.ring.alpha = (1 - u) ** 2 * 0.8;
    }
    flash.alpha = approach(flash.alpha, 0, 5, dt);
  });

  return {
    setPhase(next, winnerIds, silent) {
      if (next === phase) return;
      phase = next;
      tensionTarget = TENSION[next] ?? 0;
      if (RELEASE.has(next) && !silent) pulse();
      const win = WINNER.has(next);
      if (win && !winning) {
        winners = winnerIds; winning = true; seatClock = 0;
        // A reconnect that lands mid-settlement skips the entrance, not the spotlight.
        winAge = silent ? 600 : 0;
        measureSeats(); buildLight();
        if (!silent) flash.alpha = 0.16;
      } else if (!win && winning) {
        winning = false; seats = []; buildLight();
      }
    },
    destroy() {
      app.renderer.off("resize", fit);
      // Shared Texture.WHITE backs the flash, so only the textures painted here are destroyed.
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      for (const texture of [glow, vignetteTex, rayTex, ringTex]) texture.destroy(true);
    },
  };
}
