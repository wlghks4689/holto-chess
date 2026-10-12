import { expect, it } from 'vitest';
import { canonicalFor, PUBLIC_SEARCH_PATHS, robotsText, sitemapXml } from './searchPages';
it('lists only implemented public pages with production canonical URLs', () => {
  expect(sitemapXml().match(/<loc>/g)).toHaveLength(4);
  for (const path of PUBLIC_SEARCH_PATHS) expect(sitemapXml()).toContain(`<loc>https://porena.kr${path}</loc>`);
  expect(sitemapXml()).not.toMatch(/about|guide|rules|api|ws|admin|room|lastmod/);
  expect(canonicalFor('/ranking/')).toBe('https://porena.kr/ranking');
  expect(canonicalFor('/fx')).toBeNull();
});
it('lets crawlers discover the sitemap without exposing private API or previews', () => {
  expect(robotsText()).toContain('Sitemap: https://porena.kr/sitemap.xml');
  expect(robotsText()).toContain('Allow: /');
  for (const path of ['/api/', '/ws/', '/admin', '/fx']) expect(robotsText()).toContain(`Disallow: ${path}`);
});
