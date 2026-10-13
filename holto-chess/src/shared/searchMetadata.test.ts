import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { koKR } from '../i18n/locales/ko-KR';
import { enUS } from '../i18n/locales/en-US';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const meta = (key: string) => html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]+)"`))?.[1];

it('preserves the improved description when the language initializes', () => {
  expect(koKR['document.description']).toBe(meta('description'));
  expect(koKR['document.description'].length).toBeLessThanOrEqual(80);
  expect(enUS['document.description'].length).toBeLessThanOrEqual(160);
  for (const word of ['PORENA', '포레나', 'poker', 'deck-building', 'six rounds']) {
    expect(enUS['document.description']).toContain(word);
  }
});

it('includes the Korean brand and accurate game description in initial HTML', () => {
  const title = '포레나 PORENA | 포커 덱빌딩 오토배틀 전략 게임';
  expect(html).toContain(`<title>${title}</title>`);
  expect(meta('og:title')).toBe(title);
  expect(meta('twitter:title')).toBe(title);
  for (const word of ['포레나', 'PORENA', '포커', '덱빌딩', '오토배틀', '6라운드']) {
    expect(meta('description')).toContain(word);
  }
  expect(meta('naver-site-verification')).toBeTruthy();
  expect(meta('msvalidate.01')).toMatch(/^[A-F0-9]{32}$/);
  expect(html).not.toMatch(/name="robots"[^>]*noindex/);
});

it('provides valid site-name structured data without invented search or rating claims', () => {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  expect(json).toBeTruthy();
  const site = JSON.parse(json!);
  expect(site).toMatchObject({ '@context': 'https://schema.org', '@type': 'WebSite', name: '포레나 PORENA', url: 'https://porena.kr/', alternateName: ['포레나', 'PORENA'] });
  expect(site).not.toHaveProperty('potentialAction');
  expect(site).not.toHaveProperty('aggregateRating');
  expect(meta('og:url')).toBe(site.url);
});

it('keeps the displayed main heading discoverable under both brand names', () => {
  const screen = readFileSync(new URL('../ui/StartScreen.tsx', import.meta.url), 'utf8');
  expect(screen).toMatch(/<h1><img[^>]+alt="포레나 PORENA"/);
  expect(screen).not.toContain('GAME_INTRO[locale].summary');
  expect(screen).toContain('href="/about"');
});
