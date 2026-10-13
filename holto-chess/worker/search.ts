import { canonicalFor, robotsText, sitemapXml } from '../src/shared/searchPages';
import { initialHomeHtml } from '../src/shared/gameIntroduction';
import { gameIntroductionHtml } from './gameIntroduction';

export function searchFile(request: Request, url: URL): Response | null {
  if (url.pathname === '/about' || url.pathname === '/about/') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname === '/about/') return Response.redirect(new URL('/about', url.origin).href, 301);
    return new Response(request.method === 'HEAD' ? null : gameIntroductionHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
    });
  }
  if (url.pathname !== '/sitemap.xml' && url.pathname !== '/robots.txt') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const xml = url.pathname === '/sitemap.xml';
  return new Response(request.method === 'HEAD' ? null : xml ? sitemapXml() : robotsText(), {
    headers: { 'Content-Type': xml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

/** Server-side canonical: crawlers see it before JavaScript; UTM never changes the preferred URL. */
export function withSearchMetadata(response: Response, url: URL): Response {
  if (!response.headers.get('Content-Type')?.includes('text/html') || response.status !== 200) return response;
  const canonical = canonicalFor(url.pathname);
  if (!canonical) return response;
  const rewriter = new HTMLRewriter().on('head', {
    element(element) { element.append(`<link rel="canonical" href="${canonical}">`, { html: true }); },
  });
  if (url.pathname === '/') rewriter.on('#root', {
    element(element) { element.setInnerContent(initialHomeHtml(), { html: true }); },
  });
  return rewriter.transform(response);
}
