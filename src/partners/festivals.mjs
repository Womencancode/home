/* Partner adapter: open film festivals and competitions from the portfolio's festival directory, configured per pack in site.json
 * ("festivalDirectory"; absent means off). Rows link to the directory's own festival pages. Never throws: a failure is an empty list
 * marked error. NATIONALFF_API_KEY, when set, is sent as a Bearer key for full pages; without it the directory returns a short page. */
import { PACK } from '../site.mjs';
import { COUNTRIES } from '../countries.mjs';

export const CACHE_SECONDS = 6 * 60 * 60;
/* A failure is remembered briefly too, so an outage costs one slow request per few minutes rather than one per page view. */
export const ERROR_CACHE_SECONDS = 300;
export const TIMEOUT_MS = 5000;
export const PAGE_SIZE = 24;
export const KINDS = ['festival', 'competition'];

/** An http(s) URL as a string, or '' for anything else (javascript:, mailto:, relative, junk). */
export function httpUrl(u) {
  try { const x = new URL(String(u || '')); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; }
}

/** The pack's directory settings, normalised, or null when the feature is off or its addresses are not http(s). */
export function directoryConfig(pack = PACK) {
  const c = pack && pack.festivalDirectory;
  if (!c || typeof c !== 'object') return null;
  const api = httpUrl(c.api), site = httpUrl(c.site);
  if (!api || !site) return null;
  const pick = (o) => { const q = {}; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (/^[a-zA-Z]{1,30}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) q[k] = String(v); return q; };
  const query = pick(c.query);
  const fallback = c.fallbackQuery ? pick(c.fallbackQuery) : null;
  return {
    api: api.replace(/\/+$/, ''), site: site.replace(/\/+$/, ''), name: String(c.name || new URL(site).hostname).slice(0, 80), query, fallback, upcoming: c.upcoming === true,
    title: String(c.title || 'Film festivals and competitions, open for entries'), lead: String(c.lead || ''), nav: c.nav === true,
  };
}

/** Whether /festivals and its doors exist for this pack. */
export const festivalsOn = (pack = PACK) => !!directoryConfig(pack);
/** Whether the header nav links /festivals: only when the pack asks with festivalDirectory.nav === true. */
export const festivalsInNav = (pack = PACK) => { const c = directoryConfig(pack); return !!(c && c.nav); };

/** The directory request for a query: the pack's fixed filters, then kind, country (the directory's country name) and from. */
export function directoryUrl(cfg, { kind = '', country = '', from = '', limit = PAGE_SIZE } = {}) {
  const p = new URLSearchParams(cfg.query);
  p.set('limit', String(Math.max(1, Math.min(100, Number(limit) || PAGE_SIZE))));
  if (KINDS.includes(kind)) p.set('kind', kind);
  if (country && typeof country === 'string') p.set('country', country.slice(0, 80));
  const day = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : cfg.upcoming ? new Date().toISOString().slice(0, 10) : '';
  if (day) p.set('from', day); /* upcoming only: the directory's from compares start dates, so past editions drop out */
  return `${cfg.api}/festivals?${p}`;
}

const text = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');

/** One row made safe to render, or null: a slug the festival page can be addressed by, a name, and only http(s) links. */
export function cleanRow(row, cfg) {
  if (!row || typeof row !== 'object') return null;
  const slug = typeof row.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,120}$/i.test(row.slug) ? row.slug : '';
  const name = text(row.name, 160);
  if (!slug || !name) return null;
  const month = Number.isInteger(row.month) && row.month >= 1 && row.month <= 12 ? row.month : null;
  return {
    slug, name, page: `${cfg.site}/festival/${encodeURIComponent(slug)}`,
    website: httpUrl(row.website), submissionUrl: httpUrl(row.submissionUrl),
    country: text(row.country, 80), city: text(row.city, 80), month,
    startDate: typeof row.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.startDate) ? row.startDate : '',
    promotedLabel: text(row.promotedLabel, 60),
  };
}

const cacheOf = () => { try { return (globalThis.caches && globalThis.caches.default) || null; } catch { return null; } };

/** Open festivals and competitions for `query` ({ kind, country, from, limit }): { rows, matched, keyed }, from the edge cache for six
 * hours per query URL; on any failure { rows: [], matched: 0, error: true }. `opts.ctx` lets the cache write finish after the response. */
export async function festivalsFor(env = {}, query = {}, { pack = PACK, ctx = null } = {}) {
  const fail = { rows: [], matched: 0, error: true };
  const cfg = directoryConfig(pack);
  if (!cfg) return fail;
  const key = String((env && env.NATIONALFF_API_KEY) || '').trim();
  const url = directoryUrl(cfg, query);
  const cache = cacheOf();
  const cacheKey = `${url}${key ? '&_keyed=1' : ''}`;
  try {
    const hit = cache && await cache.match(cacheKey);
    if (hit) return await hit.json();
  } catch { /* a cache miss or a broken entry: fetch instead */ }
  let out;
  try {
    const headers = { accept: 'application/json', 'user-agent': `${pack.name || 'ABC'}/1.0 (+https://${pack.domain || 'example.invalid'}/festivals)` };
    if (key) headers.authorization = `Bearer ${key}`;
    const r = await globalThis.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const j = r.ok ? await r.json() : null;
    if (!j || !Array.isArray(j.rows)) throw Error(`directory answered ${r.status}`);
    let rows = j.rows.map((x) => cleanRow(x, cfg)).filter(Boolean);
    let matched = Number.isInteger(j.matched) && j.matched >= 0 ? j.matched : rows.length;
    if (rows.length < 3 && cfg.fallback && !query._fallback) {
      /* too few for the pack's own filter (e.g. names with "AI film"): widen to its fallback filter, keeping kind, country and from */
      const wide = await festivalsFor(env, { ...query, _fallback: true }, { pack: { ...pack, festivalDirectory: { ...pack.festivalDirectory, query: pack.festivalDirectory.fallbackQuery, fallbackQuery: null } }, ctx });
      if (!wide.error) { const seen = new Set(rows.map((r) => r.slug)); rows = [...rows, ...wide.rows.filter((r) => !seen.has(r.slug))]; matched = Math.max(matched, wide.matched); }
    }
    rows.sort((x, y) => (x.startDate || '9999') .localeCompare(y.startDate || '9999')); /* soonest first; undated last */
    out = { rows, matched, keyed: !!key };
  } catch {
    out = fail;
  }
  try {
    if (cache) {
      const put = cache.put(cacheKey, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${out.error ? ERROR_CACHE_SECONDS : CACHE_SECONDS}` } }));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(Promise.resolve(put).catch(() => {})); else await put;
    }
  } catch { /* caching is best effort */ }
  return out;
}

/* The directory names countries in words ("United Kingdom"); the calendar needs codes. Common short forms are accepted too. */
const ALIASES = { usa: 'US', 'united states of america': 'US', us: 'US', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', 'south korea': 'KR', korea: 'KR', russia: 'RU', 'czech republic': 'CZ', czechia: 'CZ', 'ivory coast': 'CI', uae: 'AE' };
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));
export function countryCodeOf(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return '';
  if (/^[a-z]{2}$/.test(k) && COUNTRIES.some((c) => c.code === k.toUpperCase())) return k.toUpperCase();
  return BY_NAME.get(k) || ALIASES[k] || '';
}

/** Whether the pack wants upcoming festivals in its "Coming up" rows: festivalDirectory.comingUp === true. */
export const festivalsInComingUp = (pack = PACK) => { const c = directoryConfig(pack); return !!(c && pack.festivalDirectory.comingUp === true); };

/** Festival rows as calendar-feed rows for events.upcoming(): dated rows in a known country only, linked to the festival's page on the
 * directory and credited to it. Online or undated festivals stay on /festivals. */
export function festivalEventRows(res, pack = PACK) {
  const cfg = directoryConfig(pack);
  if (!cfg || !res || res.error || !Array.isArray(res.rows)) return [];
  return res.rows.filter((r) => r && r.startDate).map((r) => {
    const country = countryCodeOf(r.country);
    return country ? { id: `nff-${r.slug}`, source: cfg.name, source_home: cfg.site, uid: r.slug, title: r.name, start: r.startDate, end: r.startDate, city: r.city || null, country, url: r.page, summary: '', kind: 'film' } : null;
  }).filter(Boolean);
}
