// Public search pages that exist today; private rooms and preview routes never enter this list.
// /ranking returns to this list when the ranking reopens (shared/features.ts, HOME-GATE-001).
export const PUBLIC_SEARCH_PATHS = ['/', '/about', '/privacy', '/terms'] as const;
export const SEARCH_ORIGIN = 'https://porena.kr';
export function sitemapXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + PUBLIC_SEARCH_PATHS.map(path => `  <url><loc>${SEARCH_ORIGIN}${path}</loc></url>`).join('\n') + '\n</urlset>\n';
}
export function robotsText(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /ws/\nDisallow: /admin\nDisallow: /fx\nDisallow: /phase-preview\nDisallow: /account-preview\nDisallow: /draft-preview\nSitemap: ${SEARCH_ORIGIN}/sitemap.xml\n`;
}
export function canonicalFor(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_SEARCH_PATHS.some(publicPath => publicPath === path) ? SEARCH_ORIGIN + path : null;
}
