import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5195';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local harness only');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];
try {
  for (const failure of ['unsupported', 'asset-error', 'stalled']) {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(failure => {
      window.terminated = 0;
      if (failure === 'unsupported') Object.defineProperty(window, 'Worker', { value: undefined });
      if (failure === 'stalled') window.Worker = class {
        postMessage() {}
        terminate() { window.terminated++; }
      };
      window.phases = [];
      new MutationObserver(() => {
        const phase = document.querySelector('.cinema')?.getAttribute('data-phase');
        if (phase && window.phases.at(-1) !== phase) window.phases.push(phase);
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase'] });
    }, failure);
    if (failure === 'asset-error') await page.route('**/displayEquity.worker.ts?*', route => route.abort());
    await page.goto(`${origin}/tools/perf/showdown-transition.html?mode=online&round=4`);
    await page.locator('[data-testid="result"]').waitFor({ timeout: 60000 });
    const report = { failure, errors, ...await page.evaluate(() => ({ phases: window.phases, terminated: window.terminated })) };
    reports.push(report); console.log(JSON.stringify(report));
    if (errors.length || !report.phases.includes('TABLE_ENTER') || !report.phases.includes('FLOP_1') || !report.phases.includes('RIVER') || !report.phases.includes('RESULT')) throw new Error(`Worker failure blocked cinematic: ${failure}`);
    await page.close();
  }
} finally { await browser.close(); if (process.env.AUDIT_OUTPUT) fs.writeFileSync(process.env.AUDIT_OUTPUT, JSON.stringify(reports, null, 2)); }
