// Network audit of one full single-player game against the production build.
//
//   npm run build
//   PLAYWRIGHT_MODULE=<path>/playwright-core CHROME_PATH=<chrome.exe> node tools/perf/asset-audit.mjs
//
// Serves dist/client like production: gzip for text assets (Cloudflare serves br/gzip; media as is), the platform
// default "max-age=0, must-revalidate" with ETag/304, and any rules in the build's _headers file. Each viewport starts
// from an empty browser cache (a first visit); the cache then works normally for the session. CACHE_DISABLED=1
// disables it entirely (every re-mounted image downloads again). Drives a local game from the start screen to
// GAME_RESULT and attributes every request to the stage that was on screen when it started. Output: <OUT>/<viewport>.json and a summary table.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(process.env.DIST || "dist/client");
const out = path.resolve(process.env.OUT || "tools/perf/output");
const maxMs = Number(process.env.AUDIT_MAX_MS || 25 * 60_000);
const viewports = (process.env.VIEWPORTS || "desktop:1440x900,mobile:390x844").split(",").map((entry) => {
  const [name, size] = entry.split(":"); const [width, height] = size.split("x").map(Number);
  return { name, width, height, mobile: width < 700 };
});
export const STAGES = ["initial", "first-click", "game-entry", "ability-draft", "r1", "match-loading", "r2-draft", "r3", "r4-draft", "r5", "game-result"];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const compressible = (type) => /^(text\/|application\/(json|manifest)|image\/svg)/.test(type);

/** Minimal _headers support: "/path/*.ext" patterns followed by indented "Name: value" lines. */
function headerRules() {
  const file = path.join(root, "_headers"); if (!fs.existsSync(file)) return [];
  const rules = []; let current;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { current = { pattern: new RegExp("^" + line.trim().split("*").map((part) => part.replaceAll(".", "\\.")).join(".*") + "$"), headers: {} }; rules.push(current); }
    else if (current) { const [name, ...value] = line.trim().split(":"); current.headers[name.toLowerCase()] = value.join(":").trim(); }
  }
  return rules;
}
const rules = headerRules();
const etags = new Map();

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    let body = fs.readFileSync(file);
    const etag = etags.get(file) ?? `"${crypto.createHash("md5").update(body).digest("hex")}"`; etags.set(file, etag);
    const headers = { "content-type": type, "cache-control": "public, max-age=0, must-revalidate", etag };
    for (const rule of rules) if (rule.pattern.test(url.pathname)) Object.assign(headers, rule.headers);
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); res.end(); return; }
    if (compressible(type) && /gzip/.test(req.headers["accept-encoding"] ?? "")) { body = zlib.gzipSync(body, { level: 9 }); headers["content-encoding"] = "gzip"; }
    res.writeHead(200, headers); res.end(body);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const kind = (url, mime = "") => {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if (/image/.test(mime) || [".png", ".webp", ".avif", ".svg", ".jpg"].includes(ext)) return "image";
  if (/audio/.test(mime) || [".wav", ".ogg", ".mp3", ".m4a"].includes(ext)) return "audio";
  if (/javascript/.test(mime) || ext === ".js") return "js";
  if (/css/.test(mime) || ext === ".css") return "css";
  if (/font/.test(mime) || ext === ".woff2") return "font";
  if (/html/.test(mime)) return "document";
  return "other";
};

async function run(browser, origin, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 3 : 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "ko-KR" });
  // Round guides pause the local game; they are UI text only and would only slow the audit.
  await context.addInitScript(() => { try { localStorage.setItem("porena.round-guide-auto", "disabled"); localStorage.setItem("porena.locale", "ko-KR"); } catch { /* ignore */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: process.env.CACHE_DISABLED === "1" });
  let stage = "initial"; const reached = { initial: 0 }; const started = Date.now();
  const advance = (next) => { if (STAGES.indexOf(next) > STAGES.indexOf(stage)) { stage = next; reached[next] = Date.now() - started; console.log(`[${vp.name}] ${next} @${Math.round(reached[next] / 1000)}s`); } };
  const requests = new Map();
  cdp.on("Network.requestWillBeSent", (e) => { if (!e.request.url.startsWith("data:")) requests.set(e.requestId, { url: e.request.url, stage, t: Date.now() - started }); });
  cdp.on("Network.responseReceived", (e) => { const r = requests.get(e.requestId); if (r) Object.assign(r, { mime: e.response.mimeType, status: e.response.status, fromCache: e.response.fromDiskCache || e.response.fromServiceWorker }); });
  cdp.on("Network.loadingFinished", (e) => { const r = requests.get(e.requestId); if (r) r.transferSize = e.encodedDataLength; });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  advance("first-click");
  await page.mouse.click(5, 5); // a first gesture on the start screen (unlocks audio)
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await page.waitForTimeout(800);
  advance("game-entry");
  await page.getByRole("button", { name: /싱글/ }).click();

  const click = async (locator) => { try { if (await locator.count() && await locator.first().isVisible() && await locator.first().isEnabled()) { await locator.first().click({ timeout: 1500 }); return true; } } catch { /* retry next tick */ } return false; };
  let done = false; let lastStage = stage; let stageSince = Date.now(); const stalls = new Set();
  while (!done && Date.now() - started < maxMs) {
    if (stage !== lastStage) { lastStage = stage; stageSince = Date.now(); }
    // A stage that stops moving is a driver bug: keep a picture and the clickable controls for diagnosis.
    if (Date.now() - stageSince > 60_000 && !stalls.has(stage)) {
      stalls.add(stage);
      await page.screenshot({ path: path.join(out, `${vp.name}-stall-${stage}.png`) }).catch(() => {});
      const buttons = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.getClientRects().length).map((b) => `${b.className}|${b.disabled ? "disabled" : ""}|${b.innerText.slice(0, 40)}`));
      console.log(`[${vp.name}] stalled in ${stage}:\n  ${buttons.join("\n  ")}`);
    }
    const s = await page.evaluate(() => {
      const top = document.querySelector("#top");
      return { round: Number(top?.getAttribute("data-round") ?? 0), header: document.querySelector(".round-number")?.textContent ?? "",
        ability: !!document.querySelector(".ability-selection"), loading: !!document.querySelector(".match-loading"), cinema: !!document.querySelector(".cinema"),
        final: !!document.querySelector(".final-results-page"), shop: !!document.querySelector(".shop-page"), dialog: !!document.querySelector("dialog[open]") };
    });
    if (s.ability) advance("ability-draft");
    if (s.round === 1 && !s.ability) advance("r1");
    if (s.round === 1 && (s.loading || s.cinema)) advance("match-loading");
    if (s.round === 2) advance("r2-draft");
    if (s.round === 3) advance("r3");
    if (s.round === 4) advance("r4-draft");
    if (s.round === 5) advance("r5");
    if (s.final) { advance("game-result"); await page.waitForTimeout(4000); done = true; break; }
    if (s.dialog) await click(page.locator("dialog[open] button.secondary"));
    else if (s.ability) await click(page.locator(".ability-card-back:enabled"));
    // The cinematic offers "next" only after a match has fully played, so every asset it uses is already requested.
    else if (s.cinema) await click(page.locator("button.primary:not(:has-text('↻'))"));
    else if (s.shop) {
      // Buy only up to the round's hand size; a full hand keeps the buy button enabled but ignores it.
      const owned = await page.locator(".card-sell-button").count();
      const bought = owned < [0, 2, 3, 4, 5, 7][s.round] && await click(page.locator(".shop-card-slot").getByRole("button", { name: /구매/ }));
      if (!bought) await click(page.locator("button.primary", { hasText: /준비|확정|→/ }));
    } else if (!s.cinema) {
      await click(page.locator(".r2-price:enabled")) || await click(page.locator(".draft-offer .playing-card:enabled"))
        || await click(page.getByRole("button", { name: "배치 확정 · 준비 완료", exact: true }))
        || await click(page.locator(".action-bar .primary:not(:has-text('↻'))"));
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const memory = await cdp.send("Performance.enable").then(() => cdp.send("Performance.getMetrics")).then((m) => Object.fromEntries(m.metrics.map((x) => [x.name, x.value]))).catch(() => ({}));
  const decoded = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("resource").map((e) => [e.name, { encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize }])));
  await context.close();
  const rows = [...requests.values()].filter((r) => r.status).map((r) => ({ ...r, kind: kind(r.url, r.mime), path: new URL(r.url).pathname,
    encodedBodySize: decoded[r.url]?.encodedBodySize ?? null, decodedBodySize: decoded[r.url]?.decodedBodySize ?? null }));
  return { viewport: vp, completed: done, seconds: (Date.now() - started) / 1000, reached, errors, jsHeapUsedMB: memory.JSHeapUsedSize ? memory.JSHeapUsedSize / 2 ** 20 : null, rows };
}

function summarize(result) {
  const byStage = STAGES.map((name) => {
    const rows = result.rows.filter((r) => r.stage === name);
    const sum = (list, key) => list.reduce((a, r) => a + (r[key] ?? 0), 0);
    const kinds = Object.fromEntries(["image", "audio", "js", "css", "font", "document", "other"].map((k) => [k, { count: rows.filter((r) => r.kind === k).length, transfer: sum(rows.filter((r) => r.kind === k), "transferSize") }]));
    return { stage: name, requests: rows.length, transfer: sum(rows, "transferSize"), encoded: sum(rows, "encodedBodySize"), decoded: sum(rows, "decodedBodySize"), kinds };
  });
  const top = [...result.rows].sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0)).slice(0, 20).map((r) => ({ path: r.path, stage: r.stage, kind: r.kind, transfer: r.transferSize, decoded: r.decodedBodySize }));
  const duplicates = Object.entries(result.rows.reduce((m, r) => ((m[r.path] = (m[r.path] ?? 0) + 1), m), {})).filter(([, n]) => n > 1);
  return { byStage, top, duplicates, total: { requests: result.rows.length, transfer: byStage.reduce((a, s) => a + s.transfer, 0), decoded: byStage.reduce((a, s) => a + s.decoded, 0) } };
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
fs.mkdirSync(out, { recursive: true });
try {
  for (const vp of viewports) {
    const result = await run(browser, origin, vp);
    const summary = summarize(result);
    fs.writeFileSync(path.join(out, `${vp.name}.json`), JSON.stringify({ ...result, summary }, null, 2));
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    console.log(`\n== ${vp.name} ${vp.width}x${vp.height} completed=${result.completed} ${result.seconds.toFixed(0)}s errors=${result.errors.length} heap=${result.jsHeapUsedMB?.toFixed(1)}MiB`);
    for (const s of summary.byStage) console.log(`${s.stage.padEnd(14)} req=${String(s.requests).padStart(3)} transfer=${kb(s.transfer).padStart(11)} decoded=${kb(s.decoded).padStart(11)}  img=${kb(s.kinds.image.transfer)} audio=${kb(s.kinds.audio.transfer)} js=${kb(s.kinds.js.transfer)} css=${kb(s.kinds.css.transfer)}`);
    console.log(`TOTAL req=${summary.total.requests} transfer=${kb(summary.total.transfer)} (${(summary.total.transfer / 2 ** 20).toFixed(2)} MiB) dup=${summary.duplicates.length}`);
  }
} finally { await browser.close(); server.close(); }
