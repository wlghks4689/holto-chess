import { exports, env } from 'cloudflare:workers';
import worker from '../../worker/index';
import { expect, it } from 'vitest';
import { withSearchMetadata } from '../../worker/search';

it('serves sitemap XML and discoverable robots on the public host', async () => {
  const response = await exports.default.fetch('https://porena.kr/sitemap.xml');
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/xml');
  const xml = await response.text();
  expect(xml).toContain('<loc>https://porena.kr/</loc>');
  expect(xml.match(/<loc>/g)).toHaveLength(4);
  const robots = await exports.default.fetch('https://porena.kr/robots.txt');
  expect(await robots.text()).toContain('Sitemap: https://porena.kr/sitemap.xml');
});
it('preserves HEAD, rejects mutation methods and redirects www', async () => {
  const head = await exports.default.fetch('https://porena.kr/sitemap.xml', { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  expect((await exports.default.fetch('https://porena.kr/sitemap.xml', { method: 'POST' })).status).toBe(405);
  const www = await exports.default.fetch('https://www.porena.kr/sitemap.xml', { redirect: 'manual' });
  expect(www.status).toBe(301);
  expect(www.headers.get('Location')).toBe('https://porena.kr/sitemap.xml');
});
it('injects canonical before JavaScript without query strings or changes to body/auth tags', async () => {
  const html = '<html><head><meta name="verification" content="proof"></head><body><div id="root"></div></body></html>';
  const response = withSearchMetadata(new Response(html, { headers: { 'Content-Type': 'text/html' } }), new URL('https://porena.kr/?utm_source=naver&room=ABC234'));
  const body = await response.text();
  expect(body).toContain('<link rel="canonical" href="https://porena.kr/">');
  expect(body).toContain('content="proof"');
  expect(body).toContain('<div id="root"></div>');
  expect(body).not.toMatch(/utm_source|ABC234/);
});
it('does not rewrite assets, errors or preview HTML', async () => {
  for (const [path, status, contentType] of [['/fx', 200, 'text/html'], ['/', 404, 'text/html'], ['/assets/missing.js', 404, 'text/javascript']] as const) {
    const response = new Response('unchanged', { status, headers: { 'Content-Type': contentType } });
    expect(withSearchMetadata(response, new URL(`https://porena.kr${path}`))).toBe(response);
  }
  const missing = await worker.fetch(new Request('https://porena.kr/assets/missing-seo-test.js'), { ...env, ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } } as unknown as Env);
  expect(missing.status).toBe(404);
  expect(missing.headers.get('Cache-Control')).toBe('no-store');
});
