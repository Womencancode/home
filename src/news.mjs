/* "From around the web": headlines from the leading news sites of each country (data/sources.json), kept only when they read as good
 * news and tagged to every country they name. A cron runs it every two hours; a page visit after a quiet spell runs it too. Each run
 * reads the sources fetched longest ago, so no run exceeds the Worker's subrequest budget. Only headline, a short excerpt and a link
 * are kept; the story stays on its publisher's site. */
import { PACK } from './site.mjs';
import sources from '../data/sources.json' with { type: 'json' };
import demonyms from '../data/demonyms.json' with { type: 'json' };
import filter from '../data/news-filter.json' with { type: 'json' };
import { COUNTRIES, countryByCode } from './countries.mjs';

export const SOURCES = sources;
export const PER_RUN = 18;
export const STALE_MS = 3 * 60 * 60 * 1000;
export const KEEP_DAYS = 30;
const UA = `${PACK.name} news reader (+https://${PACK.domain}/about)`;

/** A whole-word, case-insensitive pattern for a word list where a trailing * matches any ending. */
export function wordPattern(words) {
  const alts = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '*' : `\\${c}`)).replace(/\s+/g, '\\s+').replace(/\*$/, '\\w*'));
  return new RegExp(`(?<![\\w-])(${alts.join('|')})(?![\\w-])`, 'i');
}
const POSITIVE = wordPattern(filter.positive);
const NEGATIVE = wordPattern(filter.negative);
const OFF_TOPIC = wordPattern(filter.offTopic);
/* A topical site (women, women in tech) also requires a word from every list in "require", in the headline itself. */
const REQUIRE = (filter.require || []).filter((l) => l.length).map(wordPattern);
/* "requireText" lists may match the excerpt too; "positiveOptional" drops the good-word gate for a topical site. */
const REQUIRE_TEXT = (filter.requireText || []).filter((l) => l.length).map(wordPattern);
const NEED_POSITIVE = !filter.positiveOptional;

/** Good news: the headline itself names something good, nothing in it is politics, foreign football, markets or filler, no
 * bad-news word appears in the headline or the excerpt, and the headline matches every "require" list. Lists: data/news-filter.json. */
export function isGoodNews(title, summary = '') {
  const text = `${title} ${summary}`;
  return (!NEED_POSITIVE || POSITIVE.test(title)) && !OFF_TOPIC.test(title) && !NEGATIVE.test(text) && REQUIRE.every((re) => re.test(title)) && REQUIRE_TEXT.every((re) => re.test(text));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: ', ', ndash: '-', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
/** Text from a feed field: CDATA unwrapped, tags removed, entities decoded, whitespace collapsed. */
export function clean(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (block, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block); return m ? m[1] : ''; };
const attr = (block, name, a) => { const m = new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i').exec(block); return m ? m[1] : ''; };
/* A news-search feed links through its own click counter; the story's address is in its url parameter. */
const unwrapRedirect = (u) => { try { const x = new URL(u); const inner = /(^|\.)bing\.com$/.test(x.hostname) && x.pathname.endsWith('/apiclick.aspx') ? x.searchParams.get('url') : null; return inner && /^https?:\/\//.test(inner) ? new URL(inner).href : u; } catch { return u; } };
const httpUrl = (s, base) => { try { const u = new URL(clean(s), base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
/* A feed sometimes names itself or a page where a picture should be; only an https address that is not the feed and does not end in a
   feed or page path counts. */
const looksLikeImage = (u, feed) => /^https:/.test(u) && u !== feed && !/(\/feed\/?|\.xml|\.rss|\/[a-z]*rss[^/]*\/?|\/rss\/[^/]*|\/xml\/?)$/i.test(u.split('?')[0]);
const atomLink = (b) => {
  const links = b.match(/<link\b[^>]*>/gi) || [];
  const pick = links.find((l) => /rel=["']alternate["']/i.test(l)) || links.find((l) => !/rel=/i.test(l)) || links[0] || '';
  const m = /href=["']([^"']+)["']/i.exec(pick);
  return m ? m[1] : '';
};
const iso = (s) => { const t = Date.parse(clean(s)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

/** Items from an RSS 2.0 or Atom document: { title, url, summary, image, published_at }. */
export function parseFeed(xml, base) {
  const text = String(xml || '');
  const atom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const blocks = text.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const guid = clean(tag(b, 'guid'));
    const link = atom ? atomLink(b) : (clean(tag(b, 'link')) || (/^https?:\/\//.test(guid) ? guid : ''));
    const image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || attr(tag(b, 'content:encoded') || tag(b, 'description'), 'img', 'src');
    return {
      title: clean(tag(b, 'title')).slice(0, 220),
      url: unwrapRedirect(httpUrl(link, base)),
      summary: clean(tag(b, atom ? 'summary' : 'description') || tag(b, 'content')).slice(0, 280),
      image: looksLikeImage(httpUrl(image, base), base) ? httpUrl(image, base) : '',
      published_at: iso(tag(b, atom ? 'updated' : 'pubDate') || tag(b, 'published') || tag(b, 'dc:date')),
    };
  }).filter((i) => i.title && i.url);
}

/** The feed a homepage advertises in its <head>, or ''. */
export function discoverFeed(html, base) {
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const l = m[0];
    if (/rel=["']?alternate/i.test(l) && /type=["']?application\/(rss|atom)\+xml/i.test(l)) { const href = /href=["']([^"']+)["']/i.exec(l); if (href) return httpUrl(href[1], base); }
  }
  return '';
}

const NAME_INDEX = (() => {
  const out = [];
  for (const c of COUNTRIES) {
    /* "Chad", "Jordan" and "Georgia" are also people and places elsewhere; for those only a demonym counts. */
    const own = (demonyms._name_alone_is_ambiguous || []).includes(c.code) ? [] : [c.name];
    const names = [...own, ...(demonyms[c.code] || [])].filter((n) => n.length >= 4);
    if (!names.length) continue;
    out.push({ code: c.code, re: new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i') });
  }
  return out;
})();

/** The countries a headline belongs to. A national outlet's headlines belong to its country; a pan-African or diaspora outlet's
 * belong to every country or demonym the text names, and to none when it names none. */
export function countriesFor(item, source) {
  if (source.country) return countryByCode(source.country) ? [source.country] : [];
  const text = `${item.title} ${item.summary}`;
  return NAME_INDEX.filter(({ re }) => re.test(text)).map(({ code }) => code);
}

/** Read one source: its feed, or the feed its homepage advertises. Returns { items, feed, error }. */
export async function readSource(source, fetcher = fetch) {
  const get = async (url) => {
    const r = await fetcher(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    return r.text();
  };
  let feed = source.feed || '';
  try {
    if (!feed) {
      feed = discoverFeed(await get(source.home), source.home);
      if (!feed) return { items: [], feed: '', error: 'no feed advertised' };
    }
    let items = parseFeed(await get(feed), feed);
    if (!items.length && source.feed && source.home) {
      const found = discoverFeed(await get(source.home), source.home);
      if (found && found !== feed) { feed = found; items = parseFeed(await get(feed), feed); }
    }
    return { items, feed, error: items.length ? '' : 'feed had no items' };
  } catch (e) {
    return { items: [], feed, error: String(e && e.message || e).slice(0, 120) };
  }
}

/** One refresh: read the PER_RUN sources fetched longest ago, keep the good news, store it, prune old items. Returns a report. */
export async function refresh(store, { fetcher = fetch, now = new Date(), all = false } = {}) {
  const seen = await store.newsSourceTimes();
  const queue = [...SOURCES].sort((a, b) => String(seen[a.home] || '').localeCompare(String(seen[b.home] || '')));
  const batch = all ? queue : queue.slice(0, PER_RUN);
  const at = now.toISOString();
  const since = new Date(now.getTime() - KEEP_DAYS * 86400000).toISOString();
  const report = { at, sources: [], kept: 0 };
  await store.setNewsMeta('last_refresh', at);
  const results = await Promise.all(batch.map((s) => readSource(s, fetcher).then((r) => [s, r])));
  for (const [s, r] of results) {
    const good = [];
    for (const item of r.items) {
      const when = item.published_at || at;
      if (when < since || !isGoodNews(item.title, item.summary)) continue;
      const countries = countriesFor(item, s);
      if (!countries.length) continue;
      good.push({ ...item, published_at: when, source: s.name, source_home: s.home, countries, fetched_at: at });
    }
    if (good.length) await store.saveNews(good);
    await store.setNewsMeta(`src:${s.home}`, at);
    report.kept += good.length;
    report.sources.push({ name: s.name, country: s.country || '', feed: r.feed, read: r.items.length, kept: good.length, error: r.error });
  }
  await store.pruneNews(since);
  /* The filter improves over time: what an earlier run kept and the current lists refuse goes. Hidden rows stay, to stay hidden. */
  const stale = (await store.newsForReview(2000)).filter((n) => !n.hidden && !isGoodNews(n.title, n.summary || '')).map((n) => n.id);
  if (stale.length) await store.deleteNews(stale);
  report.dropped = stale.length;
  await store.setNewsMeta('last_report', JSON.stringify(report));
  return report;
}

/** Start a refresh in the background when the last one is older than STALE_MS. Never blocks or breaks the page that triggered it. */
export async function refreshIfStale(store, ctx, options = {}) {
  if (!ctx || typeof ctx.waitUntil !== 'function') return false;
  const now = options.now || new Date();
  let last = null;
  try { last = await store.getNewsMeta('last_refresh'); } catch { return false; }
  if (last && now.getTime() - Date.parse(last) < STALE_MS) return false;
  /* Claim the run before it starts, so a burst of visitors starts one refresh, not one each. */
  try { await store.setNewsMeta('last_refresh', now.toISOString()); } catch { return false; }
  ctx.waitUntil(refresh(store, options).catch((e) => console.error(`${PACK.id} news`, e && e.stack || e)));
  return true;
}

/** What the reader last did, for /api/news and the owner's page: { last_refresh, report }. */
export async function status(store) {
  try {
    const raw = await store.getNewsMeta('last_report');
    return { last_refresh: await store.getNewsMeta('last_refresh'), report: raw ? JSON.parse(raw) : null };
  } catch { return { last_refresh: null, report: null }; }
}

/** The headlines a page shows: newest first, never hidden ones, and only what the current filter accepts, so a change to
 * data/news-filter.json shows at once. A storage failure shows none rather than break the page. */
export async function headlines(store, country = null, limit = 8) {
  try { return (await store.news(country, limit * 4)).filter((n) => isGoodNews(n.title, n.summary || '')).slice(0, limit).map((n) => (n.image && !looksLikeImage(n.image, '') ? { ...n, image: null } : n)); } catch { return []; }
}
