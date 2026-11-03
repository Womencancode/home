/* The app store: installable web apps (PWAs) made by this site's community. Each listing is read from the app's own manifest and the app
 * installs from the maker's own site; this site only points at it. A pack switches the store on in site.json with
 * "appStore": { "title", "lead", "categories": [{ "id", "label" }], "nav": true }; without it there is no /apps, no admin view and no
 * door to it. Storage: migrations/0011_apps.sql (apps and app_help).
 *
 * checkApp reads a page and its manifest as text, server side. Only public https:// addresses are fetched, every redirect hop is checked
 * again, each read stops at a size cap and a 5 second timeout, and nothing fetched is ever run: scripts are only searched as text. */
import { PACK } from './site.mjs';
import { ontoldOn } from './ask.mjs';

export const PAGE_CAP = 1024 * 1024;
export const MANIFEST_CAP = 256 * 1024;
export const SCRIPT_CAP = 512 * 1024;
export const TIMEOUT_MS = 5000;
export const APP_LIMITS = { idea: 600, audience: 200, name: 60, short_name: 30, maker_name: 120, url: 500, support: 200, question: 1000, reply: 2000, draftsPerHour: 5, helpPerHour: 10 };
export const APP_STATUSES = ['draft', 'pending', 'approved', 'declined'];

/** The walkthrough, in order. Each step is its own page under /apps/publish/<id>. */
export const STEPS = [
  { id: 'idea', label: 'Idea' },
  { id: 'name', label: 'Name and icon' },
  { id: 'build', label: 'Build' },
  { id: 'check', label: 'Check' },
  { id: 'listing', label: 'Listing' },
  { id: 'terms', label: 'Terms' },
  { id: 'submit', label: 'Submit' },
  { id: 'live', label: 'Live' },
];
export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

/** The pack's app store settings, cleaned, or null when the pack has none. */
export function appStoreConfig(pack = PACK) {
  const c = pack && pack.appStore;
  if (!c || typeof c !== 'object') return null;
  const categories = (Array.isArray(c.categories) ? c.categories : []).filter((x) => x && /^[a-z0-9-]{1,40}$/.test(x.id || '') && typeof x.label === 'string' && x.label.trim());
  return {
    title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : 'App store',
    lead: typeof c.lead === 'string' ? c.lead.trim() : '',
    categories: categories.length ? categories : [{ id: 'other', label: 'Other' }],
    nav: c.nav === true,
    terms: termsConfig(c.terms),
  };
}

/** What a pack offers makers, from "terms": { "cofounder": { "offered", "equity", "vesting" }, "revenueShare": { "offered", "basis",
 * "split" } }. Numbers are the founder's to set: a value that is not a non-empty string is null, and a null is never shown as a number. */
export function termsConfig(t) {
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const o = t && typeof t === 'object' ? t : {};
  const co = o.cofounder && typeof o.cofounder === 'object' ? o.cofounder : null;
  const rs = o.revenueShare && typeof o.revenueShare === 'object' ? o.revenueShare : null;
  return {
    cofounder: co && co.offered === true ? { equity: s(co.equity), vesting: s(co.vesting) } : null,
    revenueShare: rs && rs.offered === true ? { basis: s(rs.basis), split: s(rs.split) } : null,
  };
}

/** Help questions a human founder always decides, whatever the AI agent says first: equity, money, legal and publish approval.
 * Returns the reason ('equity', 'money', 'legal' or 'publish-approval') or ''. */
export function mustEscalate(question) {
  const q = String(question || '').toLowerCase();
  if (/\b(equity|shares?|stake|vest(ing|ed)?|cofounder track|co-founder track|ownership|own part)\b/.test(q)) return 'equity';
  if (/\b(money|pay|paid|payment|payout|price|pricing|charge|fees?|revenue|income|earn(ing|ings|s)?|tax|invoice|cost|refund)\b|[£$€]/.test(q)) return 'money';
  if (/\b(legal|law|lawyer|solicitor|contract|agreement|sign(ing|ed)?|liabilit(y|ies)|licen[cs]e|copyright|trade ?mark|gdpr|terms)\b/.test(q)) return 'legal';
  if (/\b(approv\w*|publish\w*|go(es)? live|review\w*|reject\w*|declin\w*|take (it )?down|remov\w*|unlist\w*)\b/.test(q)) return 'publish-approval';
  return '';
}
export const ESCALATION_LABEL = { equity: 'equity', money: 'money', legal: 'legal', 'publish-approval': 'publish approval', 'no-ai': 'no AI agent configured', 'ai-unavailable': 'the AI agent could not answer', agent: 'the AI agent asked for the founder' };
/** Whether the pack has an app store: the pages, the doors and the admin view exist only then. */
export const appStoreOn = (pack = PACK) => !!appStoreConfig(pack);
export const appStoreInNav = (pack = PACK) => { const c = appStoreConfig(pack); return !!(c && c.nav); };
export const categoryLabel = (id, pack = PACK) => { const c = appStoreConfig(pack); const k = c && c.categories.find((x) => x.id === id); return k ? k.label : id || ''; };

/** Is this host private, local or otherwise not a public website? Literal addresses are judged by range; names by their ending. A
 * Worker cannot reach private networks anyway, so this is the first of two walls, and it keeps tests and local runs honest too. */
export function privateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|intranet|home\.arpa|corp)$/.test(h)) return true;
  if (h.includes(':')) {
    if (h === '::' || h === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h) || h.startsWith('::ffff:') || h.startsWith('64:ff9b:') || h.startsWith('2001:db8:') || h.startsWith('100::')) return true;
    return false;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  return !h.includes('.');
}

/** A public https:// address, or the reason it is not one: { ok, url } or { ok: false, reason }. */
export function publicHttps(raw) {
  let u;
  try { u = new URL(String(raw ?? '').trim()); } catch { return { ok: false, reason: 'That is not a full web address. It should start with https://' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Only https:// addresses can be checked. Browsers only install web apps from a secure address.' };
  if (u.username || u.password) return { ok: false, reason: 'An address with a user name or password in it cannot be checked.' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'Use the normal https:// address, without a port number.' };
  if (privateHost(u.hostname)) return { ok: false, reason: 'That address is on a private or local network. Use the public address people will open.' };
  u.hash = '';
  return { ok: true, url: u };
}

class CheckError extends Error {}
const UA = `Mozilla/5.0 (compatible; ${PACK.name || 'ABC'} app checker; +https://${PACK.domain || 'example.com'}/apps/check)`;

/** Read a response body as text, stopping at `cap` bytes. */
async function readCapped(res, cap) {
  if (!res.body || typeof res.body.getReader !== 'function') { const t = await res.text(); if (t.length > cap) throw new CheckError(`It is larger than ${Math.round(cap / 1024)} KB.`); return t; }
  const reader = res.body.getReader(); const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > cap) { await reader.cancel().catch(() => {}); throw new CheckError(`It is larger than ${Math.round(cap / 1024)} KB.`); }
    chunks.push(value);
  }
  const all = new Uint8Array(n); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** GET a public https:// address as text: redirects followed by hand (each hop checked again, three at most), 5 seconds, capped. */
async function fetchText(fetcher, href, cap, accept) {
  let at = href;
  for (let hop = 0; hop <= 3; hop += 1) {
    const safe = publicHttps(at);
    if (!safe.ok) throw new CheckError(hop ? `It sent us on to an address we cannot check. ${safe.reason}` : safe.reason);
    let res;
    try { res = await fetcher(safe.url.href, { method: 'GET', redirect: 'manual', headers: { accept, 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch (e) { throw new CheckError(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'It took longer than 5 seconds to answer.' : 'It could not be reached.'); }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { try { at = new URL(loc, safe.url).href; } catch { throw new CheckError('It redirected to an address that does not make sense.'); } continue; }
    if (!res.ok) throw new CheckError(`It answered with status ${res.status}.`);
    if (Number(res.headers.get('content-length') || 0) > cap) throw new CheckError(`It is larger than ${Math.round(cap / 1024)} KB.`);
    return { url: safe.url.href, text: await readCapped(res, cap) };
  }
  throw new CheckError('It redirected too many times.');
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attrs(s) {
  const o = {}; const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g; let m;
  while ((m = re.exec(s))) o[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return o;
}
/** The attributes of every <name ...> tag in some HTML, read as text. */
function tags(html, name) {
  const out = []; const re = new RegExp(`<${name}\\b([^>]*)>`, 'gi'); let m;
  while ((m = re.exec(html)) && out.length < 300) out.push(attrs(m[1]));
  return out;
}
const SW = /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(|\bserviceWorker\s*\.\s*register\s*\(/;
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]{1,60}\))$/i;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const safeColor = (v) => { const s = clean(v, 80); return COLOR.test(s) ? s : ''; };
const words = (v) => clean(v, 200).toLowerCase().split(' ').filter(Boolean);

/** Resolve a manifest address against the manifest's own URL; only http(s) results count. */
function absolute(src, base) {
  if (typeof src !== 'string' || !src.trim()) return '';
  try { const u = new URL(src.trim(), base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
}

/** The listing a manifest describes: text cleaned and capped, icons and screenshots as absolute http(s) addresses only. */
export function deriveListing(m, manifestUrl, pageUrl) {
  const list = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object');
  const icons = list(m.icons).slice(0, 40).map((i) => ({ src: absolute(i.src, manifestUrl), sizes: clean(i.sizes, 80), type: clean(i.type, 40), purpose: clean(i.purpose, 40) })).filter((i) => i.src).slice(0, 12);
  const screenshots = list(m.screenshots).slice(0, 40).map((s) => ({ src: absolute(s.src, manifestUrl), sizes: clean(s.sizes, 40), type: clean(s.type, 40), label: clean(s.label, 160), form_factor: clean(s.form_factor, 10) })).filter((s) => s.src).slice(0, 8);
  const start = startOf(m, manifestUrl, pageUrl);
  return {
    name: clean(m.name, 120),
    short_name: clean(m.short_name, 40),
    description: clean(m.description, 1000),
    icons,
    screenshots,
    categories: (Array.isArray(m.categories) ? m.categories : []).map((c) => clean(c, 30).toLowerCase()).filter(Boolean).slice(0, 8),
    start_url: start && start.start && /^https?:$/.test(start.start.protocol) ? start.start.href : pageUrl,
    theme_color: safeColor(m.theme_color),
    background_color: safeColor(m.background_color),
    id: clean(m.id, 300),
  };
}

/** The manifest's start_url and scope as URLs (null start when unset or unreadable). */
function startOf(m, manifestUrl, pageUrl) {
  let start = null, scope = null;
  try { if (typeof m.start_url === 'string' && m.start_url.trim()) start = new URL(m.start_url.trim(), manifestUrl); } catch { start = null; }
  try { scope = typeof m.scope === 'string' && m.scope.trim() ? new URL(m.scope.trim(), manifestUrl) : new URL('.', start || pageUrl); } catch { scope = null; }
  return { start, scope };
}

/** The icon to show for an app: the smallest one with purpose "any" at 192 or more, else any icon. '' when none. */
export function bestIcon(icons = [], want = 192) {
  const size = (i) => Math.max(0, ...String(i.sizes || '').split(/\s+/).map((t) => Number((/^(\d+)x\d+$/i.exec(t) || [])[1] || 0)));
  const any = icons.filter((i) => !i.purpose || words(i.purpose).includes('any'));
  const pool = any.length ? any : icons;
  const big = pool.filter((i) => size(i) >= want).sort((a, b) => size(a) - size(b));
  return (big[0] || pool.slice().sort((a, b) => size(b) - size(a))[0] || { src: '' }).src;
}

const j = (o) => JSON.stringify(o, null, 2).replace(/^\{\n|\n\}$/g, '');
/** Every check, in the order the checker shows them. `fix` is the plain how-to; `snippet(ctx)` is something to copy. */
export const CHECKS = [
  { id: 'https', required: true, label: 'Served over HTTPS from a public address', fix: 'Browsers only install web apps from a secure https:// address that anyone can open. Turn on HTTPS with your host (most include a free certificate), then paste the https:// address here.' },
  { id: 'manifest', required: true, label: 'A web app manifest, linked from the page', fix: 'The manifest is a small JSON file that tells the browser what your app is called, how it opens and which icons to use. Save one as manifest.webmanifest next to your home page and link it from the <head> of every page.', snippet: (c) => `<link rel="manifest" href="/manifest.webmanifest">\n\n/* manifest.webmanifest */\n{\n${j({ id: '/', name: c.title || 'My App', short_name: (c.title || 'My App').slice(0, 12), description: 'What it does and who it is for, in a sentence or two.', start_url: '/', scope: '/', display: 'standalone', theme_color: c.theme || '#4f46e5', background_color: '#ffffff', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] })}\n}` },
  { id: 'names', required: true, label: 'A name and a short name', fix: 'name is the full name people see when they install. short_name is what fits under the icon on a home screen, so keep it to about 12 characters.', snippet: (c) => j({ name: c.title || 'My App', short_name: (c.title || 'My App').slice(0, 12) }) },
  { id: 'start_url', required: true, label: 'A start address inside the app\'s scope', fix: 'start_url is where your app opens. It has to be on the same site as the page, inside scope (the part of the site that belongs to the app). Using "/" for both is the simplest.', snippet: () => j({ start_url: '/', scope: '/' }) },
  { id: 'display', required: true, label: 'Opens like an app (standalone, fullscreen or minimal-ui)', fix: 'display decides how your app opens once installed. standalone hides the browser bar so it feels like a real app.', snippet: () => j({ display: 'standalone' }) },
  { id: 'icons', required: true, label: 'Icons at 192 and 512 pixels', fix: 'Add square PNG icons at 192 by 192 and 512 by 512 pixels. They are what people see on their home screen and in this store.', snippet: () => j({ icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }) },
  { id: 'maskable', required: false, label: 'A maskable icon (recommended)', fix: 'Phones crop icons into circles and rounded squares. A maskable icon fills the whole square with its background and keeps the important part in the middle, so nothing gets cut off.', snippet: () => j({ icons: [{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }) },
  { id: 'colors', required: true, label: 'A theme colour and a background colour', fix: 'theme_color tints the title bar around your app. background_color fills the splash screen while it loads.', snippet: (c) => j({ theme_color: c.theme || '#4f46e5', background_color: '#ffffff' }) },
  { id: 'description', required: true, label: 'A description', fix: 'One or two sentences on what your app does and who it is for. This becomes the description on your listing.', snippet: () => j({ description: 'What it does and who it is for, in a sentence or two.' }) },
  { id: 'screenshots', required: false, label: 'Screenshots (recommended)', fix: 'Screenshots show people what they are about to install, here and in the browser\'s own install window. Add a phone one (narrow) and a desktop one (wide) if you can.', snippet: () => j({ screenshots: [{ src: '/screenshot-phone.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'The home screen' }, { src: '/screenshot-desktop.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'The home screen on a laptop' }] }) },
  { id: 'service_worker', required: false, label: 'Works offline: a service worker is registered (recommended)', fix: 'A service worker is a small script the browser keeps in the background, so your app can open without a connection and load fast. We look for navigator.serviceWorker.register in your page and its scripts as text; we never run them.', snippet: () => `<script>\n  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');\n</script>\n\n/* sw.js: keep the home page for offline use */\nself.addEventListener('install', (e) => e.waitUntil(caches.open('v1').then((c) => c.addAll(['/']))));\nself.addEventListener('fetch', (e) => e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))));` },
  { id: 'id', required: false, label: 'A stable app id (recommended)', fix: 'id keeps your app the same app for everyone who installed it, even if you move start_url later. Set it once and leave it.', snippet: () => j({ id: '/' }) },
];

/** Check a web app: is it served over HTTPS from a public address, does its page link a manifest, and does that manifest describe an
 * installable app? Returns { url, ok, error, items, listing, manifestUrl, checkedAt }; ok means every required item passed. Each item
 * is { id, ok, required, label, fix, snippet, detail }. `fetcher` is fetch, or a stub in tests. Nothing fetched is ever run. */
export async function checkApp(raw, fetcher = fetch, { now = new Date() } = {}) {
  const found = {}; const detail = {};
  const ctx = { title: '', theme: '' };
  let error = '', listing = null, manifestUrl = '', pageUrl = '';
  const safe = publicHttps(raw);
  found.https = safe.ok;
  if (!safe.ok) { detail.https = safe.reason; error = safe.reason; }
  let page = null;
  if (safe.ok) {
    try { page = await fetchText(fetcher, safe.url.href, PAGE_CAP, 'text/html,application/xhtml+xml'); } catch (e) { error = `We could not open that page. ${e instanceof CheckError ? e.message : 'It could not be reached.'}`; detail.manifest = error; }
  }
  let manifest = null; let html = '';
  if (page) {
    pageUrl = page.url;
    html = page.text.replace(/<!--[\s\S]*?-->/g, '');
    ctx.title = clean(decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || ''), 60);
    ctx.theme = safeColor((tags(html, 'meta').find((a) => (a.name || '').toLowerCase() === 'theme-color') || {}).content);
    const link = tags(html, 'link').find((a) => words(a.rel).includes('manifest') && a.href);
    if (!link) detail.manifest = 'The page has no <link rel="manifest"> in it.';
    else {
      try { manifestUrl = new URL(link.href, pageUrl).href; } catch { manifestUrl = ''; }
      if (!manifestUrl) detail.manifest = 'The manifest link does not point at a real address.';
      else {
        try {
          const got = await fetchText(fetcher, manifestUrl, MANIFEST_CAP, 'application/manifest+json,application/json');
          manifestUrl = got.url;
          const parsed = JSON.parse(got.text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) manifest = parsed; else detail.manifest = 'The manifest is not a JSON object.';
        } catch (e) { detail.manifest = e instanceof CheckError ? `We could not read the manifest. ${e.message}` : 'The manifest is not valid JSON.'; }
      }
    }
  }
  found.manifest = !!manifest;
  if (manifest) {
    const m = manifest;
    listing = deriveListing(m, manifestUrl, pageUrl);
    found.names = !!(listing.name && listing.short_name);
    if (!found.names) detail.names = `Missing: ${[!listing.name && 'name', !listing.short_name && 'short_name'].filter(Boolean).join(' and ')}.`;
    const { start, scope } = startOf(m, manifestUrl, pageUrl);
    const origin = new URL(pageUrl).origin;
    found.start_url = !!(start && scope && start.protocol === 'https:' && start.origin === origin && scope.origin === start.origin && start.pathname.startsWith(scope.pathname));
    if (!found.start_url) detail.start_url = !start ? 'start_url is not set.' : start.origin !== origin ? 'start_url is on a different site from the page.' : 'start_url is outside scope.';
    const modes = ['standalone', 'fullscreen', 'minimal-ui'];
    found.display = modes.includes(clean(m.display, 30)) || (Array.isArray(m.display_override) && m.display_override.some((d) => modes.includes(d)));
    if (!found.display) detail.display = m.display ? `display is "${clean(m.display, 30)}".` : 'display is not set, so it opens as a browser tab.';
    const anyIcons = listing.icons.filter((i) => !i.purpose || words(i.purpose).includes('any'));
    const has = (n) => anyIcons.some((i) => words(i.sizes).includes(`${n}x${n}`));
    found.icons = has(192) && has(512);
    if (!found.icons) detail.icons = `Missing: ${[!has(192) && '192x192', !has(512) && '512x512'].filter(Boolean).join(' and ')}.`;
    found.maskable = listing.icons.some((i) => words(i.purpose).includes('maskable'));
    found.colors = !!(listing.theme_color && listing.background_color);
    if (!found.colors) detail.colors = `Missing: ${[!listing.theme_color && 'theme_color', !listing.background_color && 'background_color'].filter(Boolean).join(' and ')}.`;
    found.description = listing.description.length >= 10;
    found.screenshots = listing.screenshots.length > 0;
    found.id = !!listing.id;
  } else for (const id of ['names', 'start_url', 'display', 'icons', 'maskable', 'colors', 'description', 'screenshots', 'id']) { found[id] = false; detail[id] = 'Needs the manifest first.'; }
  /* The offline heuristic: the page, then up to four of its own scripts, searched as text for a service worker being registered. */
  found.service_worker = false;
  if (page) {
    found.service_worker = SW.test(html);
    if (!found.service_worker) {
      const origin = new URL(pageUrl).origin;
      const srcs = [...new Set(tags(html, 'script').map((a) => { try { return a.src ? new URL(a.src, pageUrl).href : ''; } catch { return ''; } }).filter((s) => s && new URL(s).origin === origin))].slice(0, 4);
      for (const s of srcs) {
        try { if (SW.test((await fetchText(fetcher, s, SCRIPT_CAP, 'text/javascript,application/javascript,*/*')).text)) { found.service_worker = true; break; } } catch { /* a script we cannot read is simply not counted */ }
      }
    }
  }
  const items = CHECKS.map((c) => ({ id: c.id, ok: !!found[c.id], required: c.required, label: c.label, fix: c.fix, snippet: c.snippet ? c.snippet(ctx) : '', detail: found[c.id] ? '' : detail[c.id] || '' }));
  return { url: safe.ok ? safe.url.href : String(raw ?? '').slice(0, 500), ok: !error && items.every((i) => !i.required || i.ok), error, items, listing, manifestUrl, checkedAt: now.toISOString() };
}

/** A stored apps row as an app: the JSON columns parsed (a broken one reads as empty). */
export function appFromRow(r) {
  if (!r) return null;
  const parse = (s, d) => { try { const v = JSON.parse(s || ''); return v ?? d; } catch { return d; } };
  return { ...r, icons: parse(r.icons_json, []), screenshots: parse(r.screenshots_json, []), categories: parse(r.categories_json, []), checks: parse(r.checks_json, []), paid: Number(r.paid || 0) };
}

/** The columns a check writes: the listing as the manifest describes it, and the checklist. */
export function listingColumns(result) {
  const l = result.listing || {};
  const out = { checks_json: JSON.stringify(result.items.map(({ id, ok, required, label, detail }) => ({ id, ok, required, label, detail }))), checked_at: result.checkedAt };
  if (result.listing) Object.assign(out, { start_url: l.start_url, name: l.name || null, short_name: l.short_name || null, description: l.description || null, icons_json: JSON.stringify(l.icons), screenshots_json: JSON.stringify(l.screenshots), categories_json: JSON.stringify(l.categories), theme_color: l.theme_color || null });
  return out;
}

/** A URL slug from a name: lower-case letters, digits and single hyphens, 60 at most. */
export function slugify(name) {
  const s = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'app';
}

/** A support contact: an email address or an https:// page. Returns the cleaned value or ''. */
export function supportContact(raw) {
  const s = clean(raw, APP_LIMITS.support);
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s)) return s;
  const u = publicHttps(s);
  return u.ok ? u.url.href : '';
}

/** Check one walkthrough step's form. Returns { ok, errors, value } where value is the columns to save. */
export function validateStep(step, input, pack = PACK) {
  const errors = {}; const value = {};
  const text = (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
  if (step === 'idea') {
    const idea = text('idea', APP_LIMITS.idea), audience = text('audience', APP_LIMITS.audience);
    if (idea.length < 15) errors.idea = 'Give me a little more: a sentence on what it does.';
    else if (idea.length > APP_LIMITS.idea) errors.idea = `Keep it under ${APP_LIMITS.idea} characters.`;
    if (audience.length < 3) errors.audience = 'Who is it for? A few words is plenty.';
    else if (audience.length > APP_LIMITS.audience) errors.audience = `Keep it under ${APP_LIMITS.audience} characters.`;
    Object.assign(value, { idea, audience });
  } else if (step === 'name') {
    const name = text('name', APP_LIMITS.name), short = text('short_name', APP_LIMITS.short_name);
    if (name.length < 2 || name.length > APP_LIMITS.name) errors.name = `A name between 2 and ${APP_LIMITS.name} characters.`;
    if (short.length > APP_LIMITS.short_name) errors.short_name = 'Keep the short name short: about 12 characters fits under an icon.';
    Object.assign(value, { name, short_name: short || name.slice(0, 12) });
  } else if (step === 'build') {
    const u = publicHttps(text('url', APP_LIMITS.url));
    if (!u.ok) errors.url = u.reason; else value.url = u.url.href;
  } else if (step === 'listing') {
    const cfg = appStoreConfig(pack) || { categories: [] };
    const category = text('category', 40), maker = text('maker_name', APP_LIMITS.maker_name), makerUrl = text('maker_url', APP_LIMITS.url);
    if (!cfg.categories.some((c) => c.id === category)) errors.category = 'Pick the shelf it belongs on.';
    if (maker.length < 2 || maker.length > APP_LIMITS.maker_name) errors.maker_name = 'Your name, or your studio\'s, as you want it on the listing.';
    if (makerUrl) { try { const u = new URL(makerUrl); if (u.protocol !== 'https:' && u.protocol !== 'http:') throw Error('scheme'); value.maker_url = u.href; } catch { errors.maker_url = 'A full web address starting with https://, or leave it blank.'; } } else value.maker_url = null;
    Object.assign(value, { category, maker_name: maker });
  } else if (step === 'terms') {
    const support = supportContact(text('support', APP_LIMITS.support));
    if (!support) errors.support = 'An email address or an https:// help page where people can reach you about the app.';
    if (String(input.consent ?? '') !== 'yes') errors.consent = 'Tick this to say the app is yours, or that you are allowed to list it.';
    /* Interest in an offer is recorded as interest only: nothing is accepted or binding here. An offer the pack does not make is 0. */
    const terms = (appStoreConfig(pack) || { terms: termsConfig() }).terms;
    Object.assign(value, { support, consent: 1, cofounder_interest: terms.cofounder && String(input.cofounder_interest ?? '') === 'yes' ? 1 : 0, revenue_interest: terms.revenueShare && String(input.revenue_interest ?? '') === 'yes' ? 1 : 0 });
  }
  return { ok: !Object.keys(errors).length, errors, value };
}

/** Is a draft ready to send for review? The steps that still need something, in order. */
export function missingSteps(app) {
  const out = [];
  if (!app.idea || !app.audience) out.push('idea');
  if (!app.name) out.push('name');
  if (!app.url) out.push('build');
  if (!app.checked_at || !(app.checks || []).length || (app.checks || []).some((c) => c.required && !c.ok)) out.push('check');
  if (!app.category || !app.maker_name) out.push('listing');
  if (!app.support || !Number(app.consent)) out.push('terms');
  return out;
}

export const AI_LABEL = 'AI cofounder agent';
export const AI_NOTE = 'This answer is from an AI agent. A human founder reviews the big decisions.';
export const FOUNDER_WILL_REPLY = 'The founder will reply';

/** Ask the founder's AI cofounder agent. With no AI engine configured (AI_ENGINE not "on", or no URL or token) nothing is called and
 * the question goes straight to the founder. Equity, money, legal and publish-approval questions are always escalated, even when the
 * agent answers first. Returns { answer, escalated, reason }: answer is '' when the agent did not answer. */
export async function cofounderAgent(question, { step = '', app = null, env = {}, fetcher = fetch, pack = PACK } = {}) {
  const must = mustEscalate(question);
  if (!ontoldOn(env)) return { answer: '', escalated: true, reason: must || 'no-ai' };
  try {
    const context = { site: pack.name, step, stepLabel: (STEPS.find((s) => s.id === step) || {}).label || step, app: app ? { name: app.name || '', idea: app.idea || '', audience: app.audience || '', url: app.url || '', status: app.status || 'draft', failing: (app.checks || []).filter((c) => c.required && !c.ok).map((c) => c.label) } : null, escalate: !!must, rules: 'Answer as the founder\'s AI cofounder agent, warm and direct, in plain words. Never promise equity, money, legal outcomes or approval: a human founder decides those.' };
    const r = await fetcher(env.AI_ENGINE_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AI_ENGINE_TOKEN}` }, body: JSON.stringify({ app: pack.id || 'abc', task: 'cofounder', question, context }), signal: AbortSignal.timeout(15000) });
    const j = r.ok ? await r.json() : null;
    const answer = j && typeof j.answer === 'string' ? j.answer.replace(/[\u2013\u2014]/g, ', ').trim().slice(0, APP_LIMITS.reply) : '';
    if (!answer) return { answer: '', escalated: true, reason: must || 'ai-unavailable' };
    const asked = !!(j && j.escalate === true);
    return { answer, escalated: !!must || asked, reason: must || (asked ? 'agent' : '') };
  } catch { return { answer: '', escalated: true, reason: must || 'ai-unavailable' }; }
}
