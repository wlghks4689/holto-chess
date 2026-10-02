// Local Discord Activity simulation (DISCORD_ACTIVITY_REPORT.md §5). Not a substitute for the real Discord client.
//
// Stands in for Discord's proxy: https://<id>.discordsays.com/* -> the local Worker (root URL mapping "/"),
// passing the browser's Origin header through unchanged, and frames the Activity in a parent page like the
// Discord client does. No Discord client answers the SDK handshake, so ready() is expected to time out.
//
// Prerequisites (run as root: the Activity origin must be https on port 443):
//   1. npm run build, then set "DISCORD_ACTIVITY_CLIENT_IDS": "123456789012345678" in dist/porena/wrangler.json
//   2. npx vite preview --port 4173 --strictPort
//   3. PLAYWRIGHT_MODULE=<path to playwright-core> node tools/discord-activity-sim.mjs
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const ALLOWED_ID = "123456789012345678";
const FOREIGN_ID = "876543210987654321";
const UP = { host: "127.0.0.1", port: Number(process.env.UP_PORT ?? 4173) };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "porena-discord-sim-"));

execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${OUT}/key.pem`, "-out", `${OUT}/cert.pem`, "-days", "1", "-subj", "/CN=sim",
  "-addext", `subjectAltName=DNS:${ALLOWED_ID}.discordsays.com,DNS:${FOREIGN_ID}.discordsays.com,DNS:discord-sim.test`], { stdio: "ignore" });

const log = [];
const parentPage = (id) => `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>discord-sim</title><body style="margin:0"><iframe id="act" style="width:100vw;height:100vh;border:0" src="https://${id}.discordsays.com/?instance_id=i-sim&frame_id=f-sim&platform=desktop"></iframe></body>`;
const proxy = https.createServer({ key: fs.readFileSync(`${OUT}/key.pem`), cert: fs.readFileSync(`${OUT}/cert.pem`) }, (req, res) => {
  if (req.headers.host?.startsWith("discord-sim.test")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(parentPage(new URL(req.url, "https://x").searchParams.get("app") ?? ALLOWED_ID));
    return;
  }
  const entry = req.url.startsWith("/api/") ? { method: req.method, path: req.url, origin: req.headers.origin ?? null } : null;
  if (entry) log.push(entry);
  const up = http.request({ ...UP, method: req.method, path: req.url, headers: { ...req.headers, host: `localhost:${UP.port}` } }, (r) => {
    if (entry) entry.status = r.statusCode;
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  up.on("error", (error) => { res.writeHead(502); res.end(String(error)); });
  req.pipe(up);
});
proxy.on("upgrade", (req, socket, head) => {
  const entry = { method: "WS", path: req.url, origin: req.headers.origin ?? null };
  log.push(entry);
  const up = http.request({ ...UP, path: req.url, headers: { ...req.headers, host: `localhost:${UP.port}` } });
  up.on("upgrade", (r, upSocket, upHead) => {
    entry.status = r.statusCode;
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    if (upHead.length) socket.write(upHead);
    if (head.length) upSocket.write(head);
    upSocket.pipe(socket); socket.pipe(upSocket);
  });
  up.on("response", (r) => { entry.status = r.statusCode; socket.end(`HTTP/1.1 ${r.statusCode} Rejected\r\n\r\n`); });
  up.end();
});
await new Promise((resolve) => proxy.listen(443, resolve));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--host-resolver-rules=MAP *.discordsays.com 127.0.0.1, MAP discord-sim.test 127.0.0.1", "--ignore-certificate-errors", "--no-proxy-server"],
});
const out = {};
const requests = (page) => { const urls = []; page.on("request", (r) => urls.push(r.url())); return urls; };
const activity = async (page, app) => {
  await page.goto(`https://discord-sim.test/?app=${app}`);
  const frame = await (await page.waitForSelector("#act")).contentFrame();
  await frame.waitForSelector("text=시작하기", { timeout: 20000 });
  return frame;
};
const createRoom = async (frame) => {
  await frame.click("text=시작하기");
  await frame.click("button:has-text('MULTIPLAYER')");
  await frame.click("button:has-text('새 방 만들기')");
  await frame.click("form button[type=submit]");
};
try {
  // Player 1: Discord Activity, desktop viewport. Creates the room.
  const dPage = await (await browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 800 } })).newPage();
  const dRequests = requests(dPage);
  const frame = await activity(dPage, ALLOWED_ID);
  await createRoom(frame);
  await frame.waitForSelector("[data-testid=room-id]", { timeout: 15000 });
  const roomCode = (await frame.textContent("[data-testid=room-id]")).trim();
  out.room = { code: roomCode, inviteLink: await frame.inputValue(".invite-link") };

  // Player 2: normal web, mobile viewport. Joins the same room by invite.
  const wPage = await (await browser.newContext({ locale: "ko-KR", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const wRequests = requests(wPage);
  await wPage.goto(`http://localhost:${UP.port}/?room=${roomCode}`);
  await wPage.click("form button[type=submit]");
  await wPage.waitForSelector("[data-testid=room-id]", { timeout: 15000 });
  out.web = { platform: await wPage.evaluate(() => document.documentElement.dataset.platform ?? "web"), loadedSdkChunk: wRequests.some((u) => /\/assets\/discord-/.test(u)) };
  out.discord = { loadedSdkChunk: dRequests.some((u) => /\/assets\/discord-/.test(u)), externalHosts: [...new Set(dRequests.filter((u) => /^https?:/.test(u) && !/discordsays\.com|discord-sim\.test/.test(u)).map((u) => new URL(u).host))] };

  await dPage.waitForTimeout(11000); // past DISCORD_READY_TIMEOUT_MS
  out.discord.sdkStatus = await frame.evaluate(() => document.documentElement.dataset.platformStatus);
  out.discord.noticeVisible = await frame.isVisible(".platform-notice");
  await dPage.screenshot({ path: `${OUT}/discord-lobby.png` });

  await frame.click("button:has-text('READY')");
  await wPage.click("button:has-text('READY')");
  await frame.waitForFunction(() => !document.querySelector("[data-testid=room-id]"), null, { timeout: 20000 });
  await dPage.waitForTimeout(3000);
  out.discord.afterStart = (await frame.evaluate(() => document.body.innerText)).split("\n").filter(Boolean).slice(0, 3);
  await dPage.screenshot({ path: `${OUT}/discord-game.png` });

  // Another Discord application's Activity origin is not in the allowlist.
  const foreign = await activity(await (await browser.newContext({ locale: "ko-KR" })).newPage(), FOREIGN_ID);
  await createRoom(foreign);
  await foreign.waitForTimeout(2500);
  out.proxyLog = log;
  out.screenshots = OUT;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  proxy.close();
}
