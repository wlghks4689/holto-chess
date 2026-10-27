import { exports, env } from 'cloudflare:workers';
import worker from '../../worker/index';
import { expect, it } from 'vitest';
import { withSearchMetadata } from '../../worker/search';
import { GAME_INTRO } from '../../src/shared/gameIntroduction';

it('serves sitemap XML and discoverable robots on the public host', async () => {
  const response = await exports.default.fetch('https://porena.kr/sitemap.xml');
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/xml');
  const xml = await response.text();
  expect(xml).toContain('<loc>https://porena.kr/</loc>');
  expect(xml.match(/<loc>/g)).toHaveLength(4);
  expect(xml).toContain('<loc>https://porena.kr/about</loc>');
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
  expect(body).toContain('<h1>포레나 PORENA</h1>');
  expect(body).not.toContain(GAME_INTRO['ko-KR'].summary);
  expect(body).toContain('<a href="/about">게임 소개</a>');
  expect(body).not.toMatch(/utm_source|ABC234/);
});
it('serves a readable public introduction without JavaScript, account cookies or crawler-specific content', async () => {
  const response = await exports.default.fetch('https://porena.kr/about?utm_source=naver');
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('text/html');
  expect(response.headers.get('Set-Cookie')).toBeNull();
  const html = await response.text();
  expect(html).toContain('<link rel="canonical" href="https://porena.kr/about">');
  for (const text of ['포커 덱빌딩', '오토 배틀러', '전략 포커', '포커라이크', '발라트로 같은 게임', '여섯 라운드', 'href="/"']) expect(html).toContain(text);
  const withoutData = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  expect(withoutData).not.toMatch(/<script|utm_source|noindex/);
  for (const ua of ['Mozilla/5.0', 'Yeti/1.1', 'bingbot/2.0']) {
    const other = await exports.default.fetch('https://porena.kr/about', { headers: { 'User-Agent': ua } });
    expect(await other.text()).toBe(html);
  }
});
it('explains the actual game without obsolete rules or misleading Balatro claims', async () => {
  const html = await (await exports.default.fetch('https://porena.kr/about')).text();
  expect(html.match(/<h1>/g)).toHaveLength(1);
  expect(html).toContain('같은 52장을 나눠 씁니다');
  expect(html).toContain('내 카드 3장과 새 보드 5장');
  expect(html).toContain('남은 3명이 결승');
  expect(html).toContain('서로 별개의 게임');
  expect(html).not.toMatch(/중심 카드|보조 카드|로그라이크 덱빌딩|공식 후속작|최고의 게임/);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const anchor of html.matchAll(/href="#([^"]+)"/g)) expect(ids.has(anchor[1]!)).toBe(true);
});
it('describes PORENA consistently in metadata and structured data without invented endorsements', async () => {
  const html = await (await exports.default.fetch('https://porena.kr/about')).text();
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!);
  expect(json).toMatchObject({ '@type': 'AboutPage', url: 'https://porena.kr/about', mainEntity: { '@type': 'VideoGame', name: '포레나 PORENA', url: 'https://porena.kr/' } });
  expect(html).toContain(`<meta name="description" content="${json.description}">`);
  expect(html).toContain(`<meta property="og:description" content="${json.description}">`);
  expect(json.mainEntity).not.toHaveProperty('aggregateRating');
  expect(json.mainEntity).not.toHaveProperty('offers');
  expect(json.mainEntity).not.toHaveProperty('sameAs');
  expect(json.name).not.toMatch(/발라트로|Balatro/);
});
it('keeps introduction routing, HEAD and write protection consistent', async () => {
  const head = await exports.default.fetch('https://porena.kr/about', { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  const write = await exports.default.fetch('https://porena.kr/about', { method: 'POST' });
  expect(write.status).toBe(405);
  expect(write.headers.get('Allow')).toBe('GET, HEAD');
  const slash = await exports.default.fetch('https://porena.kr/about/', { redirect: 'manual' });
  expect(slash.status).toBe(301);
  expect(slash.headers.get('Location')).toBe('https://porena.kr/about');
  const www = await exports.default.fetch('https://www.porena.kr/about', { redirect: 'manual' });
  expect(www.headers.get('Location')).toBe('https://porena.kr/about');
});
it('does not put the homepage introduction inside other SPA pages', async () => {
  const html = '<html><head></head><body><div id="root"></div></body></html>';
  const response = withSearchMetadata(new Response(html, { headers: { 'Content-Type': 'text/html' } }), new URL('https://porena.kr/privacy'));
  const body = await response.text();
  expect(body).toContain('<div id="root"></div>');
  expect(body).not.toContain(GAME_INTRO['ko-KR'].summary);
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
