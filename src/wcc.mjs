/* The pack's Worker entry (wrangler.json "main"). It wraps the engine's own Worker (src/worker.mjs, unchanged) rather than
 * replacing it, so engine updates keep flowing through: it adds the pack's home blocks to the engine's registry, serves /tracks and
 * /live, and puts those two pages in the menu and the sitemap. Everything else is the engine's answer, headers and all. */
import engine from './worker.mjs';
import { HOME_BLOCKS } from './pages/home.mjs';
import { WCC_BLOCKS, TRACKS, tracksRoute } from './tracks.mjs';
import { SITE, esc, htmlResponse } from './html.mjs';
import { BUILD_BLOCKS, answerHtml } from './build.mjs';
import { finaleRoute, challengeExtras, resourcesHtml, FINALE_PATHS } from './finale.mjs';
import { credentialRoute } from './certificates.mjs';
import { adminCertificatesRoute } from './certadmin.mjs';
import { certificationsPage, certificationsBlock, adminCertificationsRoute } from './certifications.mjs';

/* wcc-certifications is optional: the founder adds it to the home layout; it is filled per request so her show/hide toggles apply. */
Object.assign(HOME_BLOCKS, WCC_BLOCKS, BUILD_BLOCKS, { 'wcc-levels': () => resourcesHtml(), 'wcc-certifications': () => '<!--wcc-certifications-->' });

/** The home page answers "describe what you want to build" on the server, so it works with JavaScript off. */
export function withAnswer(html, q) {
  const t = String(q || '').trim().slice(0, 200);
  let out = html.replace('</body>', '<script src="/wcc-build.js" defer></script>\n</body>');
  if (!t) return out;
  out = out.replace(/(<input id="wcc-q"[^>]*?value=")[^"]*(")/, `$1${esc(t)}$2`);
  return out.replace('<div class="wcc-answer" id="wcc-answer" aria-live="polite"></div>', `<div class="wcc-answer" id="wcc-answer" aria-live="polite">${answerHtml(t)}</div>`);
}

/** The links this pack adds to the front of the main menu. */
export const WCC_NAV = [['/challenge', 'The 10 days'], ['/ideas', 'Ideas'], ['/cohorts', 'Wave 1'], ['/tracks', 'Go deeper']];

/** Put the pack's links at the front of every main menu, marking the current one. */
export function withNav(html, path) {
  const links = WCC_NAV.map(([href, label]) => `<a href="${href}"${path === href || path.startsWith(`${href}/`) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return html.replace(/(<nav class="site-nav" aria-label="Main">)/g, `$1${links}`);
}

/** The pack's pages for the sitemap. */
export const wccUrls = (tracks = TRACKS) => ['/tracks', '/live', '/certifications', ...FINALE_PATHS, ...tracks.map((t) => `/tracks/${t.id}`)].map((p) => `  <url><loc>https://${SITE.domain}${p}</loc></url>`).join('\n');

export default {
  ...engine,
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    /* Owner-only certificate issuing: its own guard, before the engine's admin. */
    if (path === '/admin/certificates' || path.startsWith('/admin/certificates/')) return adminCertificatesRoute(request, env);
    if (path === '/admin/certifications' || path.startsWith('/admin/certifications/')) return adminCertificationsRoute(request, env);
    const read = request.method === 'GET' || request.method === 'HEAD';
    const mine = read ? (tracksRoute(url.pathname) || finaleRoute(url.pathname) || await credentialRoute(path, env) || (path === '/certifications' ? htmlResponse(await certificationsPage(env)) : null)) : null;
    /* The pack's own pages keep the engine's redirects and security headers (withHeaders). */
    const response = mine ? await withHeaders(mine, request, env, ctx) : await engine.fetch(request, env, ctx);
    const type = response.headers.get('content-type') || '';
    if (url.pathname === '/sitemap.xml' && type.includes('xml')) {
      const xml = (await response.text()).replace('</urlset>', `${wccUrls()}\n</urlset>`);
      return new Response(xml, { status: response.status, headers: response.headers });
    }
    if (!type.includes('text/html')) return response;
    let html = withNav(await response.text(), url.pathname);
    if (url.pathname === '/') html = withAnswer(html, url.searchParams.get('build'));
    if (html.includes('<!--wcc-certifications-->')) html = html.replace('<!--wcc-certifications-->', await certificationsBlock(env));
    if (url.pathname === '/admin' && response.status === 200) html = html.replace('<main id="main">', '<main id="main"><p class="wcc-admin-door"><a class="button small ghost" href="/admin/certificates">Certificates: issue and revoke</a> <a class="button small ghost" href="/admin/certifications">Certifications on the site</a></p>');
    if (url.pathname === '/tracks') html = html.replace('</main>', '<section class="section"><p>Want a certification from the companies that make the tools? <a href="/certifications">See industry certifications, with free prep</a>.</p></section></main>');
    if (url.pathname === '/challenge') html = html.replace('<section class="section ch-faq">', `${challengeExtras()}<section class="section ch-faq">`);
    const headers = new Headers(response.headers); headers.delete('content-length');
    return new Response(request.method === 'HEAD' ? null : html, { status: response.status, headers });
  },
};

/** Our page with the engine's security headers and its redirect rules: ask the engine for the same URL first; a redirect wins. */
async function withHeaders(mine, request, env, ctx) {
  const probe = await engine.fetch(new Request(request.url, { method: 'HEAD', headers: request.headers }), env, ctx);
  if (probe.status >= 300 && probe.status < 400) return probe;
  const headers = new Headers(mine.headers);
  for (const [k, v] of probe.headers) if (!headers.has(k) && !/^(content-|cache-control|etag|last-modified)/i.test(k)) headers.set(k, v);
  return new Response(mine.body, { status: mine.status, headers });
}
