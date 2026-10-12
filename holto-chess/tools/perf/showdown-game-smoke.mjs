// Exercises the built app and real local Durable Object/WebSocket. No production rooms or credentials in output.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:8795';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Local rooms only');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const seats = [];
async function click(locator) {
  if (await locator.count() && await locator.first().isVisible() && await locator.first().isEnabled()) {
    await locator.first().click({ timeout: 1500 }); return true;
  }
  return false;
}
async function enter(mode, create = false, roomId) {
  const page = await browser.newPage({ viewport: mode === 'multi' && !create ? { width: 393, height: 852 } : { width: 1280, height: 800 } });
  const seat = { mode, page, errors: [], phases: [], workerAssets: [], view: null };
  seats.push(seat);
  page.on('pageerror', error => seat.errors.push(error.message));
  page.on('response', response => { if (response.url().includes('displayEquity.worker')) seat.workerAssets.push(response.status()); });
  page.on('websocket', ws => ws.on('framereceived', frame => {
    try { const message = JSON.parse(frame.payload); if (message.type === 'PLAYER_VIEW') seat.view = message.payload; } catch {}
  }));
  await page.addInitScript(() => { localStorage.setItem('porena.round-guide-auto', 'disabled'); });
  await page.goto(origin);
  await page.getByRole('button', { name: /게스트로 플레이/ }).click();
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await page.getByRole('button', { name: mode === 'multi' ? /멀티\s*플레이/ : /싱글\s*플레이/ }).click();
  if (mode === 'multi') {
    await page.getByRole('button', { name: create ? /새 방 만들기/ : /방 찾기/ }).click();
    await page.getByRole('textbox', { name: '닉네임', exact: true }).fill(create ? 'QA HOST' : 'QA MOBILE');
    if (!create) await page.getByRole('textbox', { name: '방 코드', exact: true }).fill(roomId);
    await page.locator('#room-entry-form button[type="submit"]').click();
    await page.getByTestId('room-id').waitFor({ timeout: 20000 });
  }
  return seat;
}
try {
  if (process.env.AUDIT_MODES !== 'single') {
    const host = await enter('multi', true);
    const roomId = await host.page.getByTestId('room-id').innerText();
    const guest = await enter('multi', false, roomId);
    await host.page.locator('.waiting-actions button').click();
    await guest.page.locator('.waiting-actions button').click();
  }
  if (process.env.AUDIT_MODES !== 'multi') await enter('single');
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline && !seats.every(seat => seat.complete)) {
    for (const seat of seats) {
      if (seat.complete) continue;
      const p = seat.page;
      const phase = await p.locator('.cinema').count() ? await p.locator('.cinema').first().getAttribute('data-phase') : null;
      if (phase && seat.phases.at(-1) !== phase) { seat.phases.push(phase); console.log(seat.mode, phase); }
      if (phase) {
        if (['RESULT', 'REWARD', 'COMPLETE'].includes(phase)) {
          if (seat.mode === 'single') await click(p.locator('.cinema-footer .primary'));
        }
        continue;
      }
      if (seat.phases.includes('RIVER') && !await p.locator('.showdown-prep').count()) { seat.complete = true; continue; }
      const buys = p.locator('.shop-card-slot .card-purchase');
      if (seat.mode === 'multi' && seat.view?.phase === 'SHOP' && !seat.view.me.committed) {
        if (seat.view.me.ownedCards.length < seat.view.me.handLimit) await click(buys);
        else await click(p.locator('.shop-ready-bar > button'));
      } else if (seat.mode === 'single') {
        if (await p.locator('.empty-card').count()) await click(buys);
        else await click(p.locator('.action-bar .primary'));
      }
    }
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  const report = seats.map(({ mode, errors, phases, workerAssets, complete }) => ({ mode, errors, phases, workerAssets, complete: !!complete }));
  console.log(JSON.stringify(report));
  if (process.env.AUDIT_OUTPUT) fs.writeFileSync(process.env.AUDIT_OUTPUT, JSON.stringify(report, null, 2));
  if (report.some(row => !row.complete || row.errors.length || !row.phases.includes('TABLE_ENTER') || !row.phases.includes('FLOP_1') || !row.workerAssets.includes(200))) throw new Error('Built game transition smoke failed');
} finally { await browser.close(); }
