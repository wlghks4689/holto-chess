import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5195';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Local test harness only');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];
try {
  for (const mode of ['local', 'online']) for (const round of [1, 2, 3, 4]) {
    const viewport = mode === 'local' ? { width: 1280, height: 800 } : { width: 393, height: 852 };
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.AUDIT_CPU || 6) });
    await page.addInitScript(() => {
      window.audit = { tasks: [], transitions: [], gaps: [], prepOdds: null, last: performance.now() };
      new PerformanceObserver(list => window.audit.tasks.push(...list.getEntries().map(e => ({ at: e.startTime, ms: e.duration })))).observe({ type: 'longtask', buffered: true });
      setInterval(() => { const now = performance.now(); window.audit.gaps.push({ at: window.audit.last, ms: now - window.audit.last }); window.audit.last = now; }, 40);
      let previous = '';
      new MutationObserver(() => {
        const phase = document.querySelector('.cinema')?.getAttribute('data-phase') || (document.querySelector('.showdown-prep') ? 'PREP' : '');
        const odds = [...document.querySelectorAll('.showdown-prep-equity strong,.r2-run-equity strong')].map(el => el.textContent);
        if (phase === 'PREP' && odds.length && odds.every(value => /\d+%/.test(value))) window.audit.prepOdds = { at: performance.now(), values: odds };
        if (phase && phase !== previous) { previous = phase; window.audit.transitions.push({ phase, at: performance.now() }); }
      }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-phase'] });
    });
    await page.goto(`${origin}/tools/perf/showdown-transition.html?mode=${mode}&round=${round}`);
    await page.locator('.cinema[data-phase="RIVER_SETTLE"],.cinema[data-phase="BEST5_GLOW"],.cinema[data-phase="MADE_HAND"],.cinema[data-phase="RESULT"],.cinema[data-phase="RUN_RESULT"]').first().waitFor({ timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.cinema-equity-meter')].every(el => el.getAttribute('data-equity') !== 'pending'), { timeout: 10000 });
    const report = await page.evaluate(() => ({ ...window.audit, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      equity: [...document.querySelectorAll('.cinema-equity-meter')].map(el => el.getAttribute('data-equity')) }));
    delete report.last;
    const prepAt = report.transitions.find(t => t.phase === 'PREP')?.at ?? 0;
    const row = { mode, round, viewport, errors, ...report, maxTaskMs: Math.max(0, ...report.tasks.map(t => t.ms)),
      maxPlaybackTaskMs: Math.max(0, ...report.tasks.filter(t => t.at >= prepAt).map(t => t.ms)),
      maxGapMs: Math.max(0, ...report.gaps.filter(t => t.at >= prepAt).map(t => t.ms)) };
    reports.push(row);
    console.log(JSON.stringify({ mode, round, maxTaskMs: row.maxTaskMs, maxPlaybackTaskMs: row.maxPlaybackTaskMs, maxGapMs: Math.round(row.maxGapMs), phases: row.transitions.map(t => t.phase), prepOdds: row.prepOdds, equity: row.equity, errors }));
    if (process.env.AUDIT_ASSERT === '1') {
      if (errors.length || row.maxPlaybackTaskMs > 500 || row.maxGapMs > 1000 || !row.transitions.some(t => t.phase === 'TABLE_ENTER') || !row.transitions.some(t => t.phase === 'FLOP_1') || !row.equity.length || row.equity.includes('pending')) throw new Error(`Transition regression: ${mode} R${round}`);
      if (round !== 3 && (!row.prepOdds || row.prepOdds.at >= row.transitions.find(t => t.phase === 'TABLE_ENTER').at)) throw new Error(`Prep odds not ready before cinematic: ${mode} R${round}`);
    }
    if (process.env.AUDIT_SCREENSHOT && round === 4) await page.screenshot({ path: `${process.env.AUDIT_SCREENSHOT}-${mode}.png` });
    await page.close();
  }
} finally { await browser.close(); if (process.env.AUDIT_OUTPUT) fs.writeFileSync(process.env.AUDIT_OUTPUT, JSON.stringify(reports, null, 2)); }
