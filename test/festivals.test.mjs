import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/site.mjs';
import { directoryConfig, festivalsOn, festivalsInNav, festivalsFor, httpUrl, CACHE_SECONDS, festivalsInComingUp, festivalEventRows, countryCodeOf, cleanRow } from '../src/partners/festivals.mjs';
import { upcoming } from '../src/events.mjs';
import { eventRow } from '../src/pages/events.mjs';
import { festivalsRoute, festivalsBlock } from '../src/pages/festivals.mjs';
import { layout } from '../src/html.mjs';
import { searchAnswer } from '../src/ask.mjs';
import { layoutEditorPage } from '../src/pages/layoutEditor.mjs';
import worker from '../src/worker.mjs';
import { COUNTRIES, countryByCode } from '../src/countries.mjs';

const CFG = { api: 'https://nationalff.com/api', site: 'https://nationalff.com', name: 'National Film Festival', query: { ai: 'accepted', submittable: 'true' }, title: 'Film festivals, open now', lead: 'Open for entries.' };
const ON = { ...PACK, festivalDirectory: CFG };
const OFF = { ...PACK, festivalDirectory: undefined };
const q = (s) => new URLSearchParams(s);
/* A national site lists only its own countries, so the tests use one the site has. */
const C = countryByCode('FR') || COUNTRIES[0];
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const ROWS = [
  { slug: 'sundance', name: 'Sundance Film Festival', website: 'https://www.sundance.org', country: 'United States', city: 'Park City', month: 1, founded: 1978, startDate: '2027-01-21', submissionUrl: 'https://filmfreeway.com/Sundance', submissionKind: 'platform' },
  { slug: 'ai-shorts', name: 'AI Shorts Prize', website: 'mailto:hello@example.test', country: 'France', city: null, month: 5, founded: 2024, startDate: null, submissionUrl: 'javascript:alert(1)', submissionKind: 'own', promotedLabel: ' Sponsored ' },
  { slug: '../evil', name: 'No page', website: 'https://example.test', country: 'Spain', city: null, month: null, founded: null, startDate: null, submissionUrl: null, submissionKind: null },
];

/** Replace global fetch for one test; returns the calls seen. */
function stubFetch(t, answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), headers: init.headers || {} }); return answer(url, init); };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}
const ok = (body) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('off when unconfigured: no config, a 404 page, no block, no fetch, and no doors', async (t) => {
  assert.equal(directoryConfig(OFF), null);
  assert.equal(directoryConfig({ festivalDirectory: { ...CFG, api: 'javascript:alert(1)' } }), null, 'a non-http api address switches it off');
  assert.equal(festivalsOn(OFF), false);
  const calls = stubFetch(t, ok({ rows: ROWS }));
  assert.equal((await festivalsRoute('/festivals', q(''), {}, null, { pack: OFF })).status, 404);
  assert.equal(await festivalsRoute('/stories', q(''), {}, null, { pack: ON }), null);
  assert.deepEqual(await festivalsFor({}, {}, { pack: OFF }), { rows: [], matched: 0, error: true });
  assert.equal(festivalsBlock({ rows: ROWS, matched: 3 }, { pack: OFF }), '');
  assert.equal(calls.length, 0);
  const shell = layout({ title: 't', path: '/', body: '' });
  const map = await (await worker.fetch(new Request('https://example.test/sitemap.xml'), {})).text();
  const llms = await (await worker.fetch(new Request('https://example.test/llms.txt'), {})).text();
  if (!festivalsOn()) {
    assert.equal((await worker.fetch(new Request('https://example.test/festivals'), {})).status, 404);
    assert.ok(!shell.includes('href="/festivals"') && !map.includes('/festivals') && !llms.includes('/festivals'));
  } else {
    assert.ok(shell.includes('<li><a href="/festivals">') && map.includes('/festivals</loc>') && llms.includes('/festivals'), 'footer, sitemap and llms.txt link it');
    assert.equal(shell.includes('<a href="/festivals">Festivals</a>'), festivalsInNav(), 'the nav links it only when the pack asks');
  }
});

test('renders rows as cards linking to the directory page, with the entry link second and the credit line', async (t) => {
  const calls = stubFetch(t, ok({ rows: ROWS, matched: 12, anonymous: true, pageSize: 5 }));
  const res = await festivalsRoute('/festivals', q(`kind=competition&country=${C.code}`), {}, null, { pack: ON });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('href="https://nationalff.com/festival/sundance"'));
  assert.ok(html.indexOf('https://nationalff.com/festival/sundance') < html.indexOf('https://filmfreeway.com/Sundance'), 'the directory page is the first link');
  assert.ok(html.includes('Sundance Film Festival') && html.includes('Park City, United States') && html.includes('Starts 21 Jan 2027') && html.includes('Usually in May'));
  assert.ok(html.includes('Open for entries') && html.includes('Film festivals, open now') && html.includes('Open for entries.'));
  assert.ok(strip(html).includes('From the National Film Festival directory: 12 listed.'));
  assert.ok(strip(html).includes('See all 12 on National Film Festival'), 'anonymous with more matched than shown links to the rest');
  const sent = new URL(calls[0].url);
  assert.equal(sent.origin + sent.pathname, 'https://nationalff.com/api/festivals');
  assert.equal(sent.searchParams.get('ai'), 'accepted'); assert.equal(sent.searchParams.get('submittable'), 'true');
  assert.equal(sent.searchParams.get('kind'), 'competition'); assert.equal(sent.searchParams.get('country'), C.name);
  assert.ok(html.includes(`class="chip active" href="/festivals?kind=competition&amp;country=${C.code}"`));
});

test('a promoted row shows its label, and its links say sponsored', async (t) => {
  stubFetch(t, ok({ rows: ROWS, matched: 3 }));
  const html = await (await festivalsRoute('/festivals', q(''), {}, null, { pack: ON })).text();
  const card = html.slice(html.indexOf('id="fest-ai-shorts"'));
  assert.ok(card.slice(0, 800).includes('<span class="fest-promoted">Sponsored</span>'));
  assert.ok(card.slice(0, 800).includes('rel="noopener sponsored"'));
  const block = festivalsBlock({ rows: [{ slug: 'x', name: 'X Fest', page: 'https://nationalff.com/festival/x', promotedLabel: 'Promoted', submissionUrl: '', website: '', country: '', city: '', month: null, startDate: '' }], matched: 1 }, { pack: ON });
  assert.ok(block.includes('Promoted') && block.includes('href="/festivals"'));
});

test('non-http urls are dropped and a row without an addressable slug is left out', async (t) => {
  stubFetch(t, ok({ rows: ROWS, matched: 3 }));
  const r = await festivalsFor({}, {}, { pack: ON });
  assert.deepEqual(r.rows.map((x) => x.slug), ['sundance', 'ai-shorts']);
  const shorts = r.rows[1];
  assert.equal(shorts.submissionUrl, ''); assert.equal(shorts.website, '');
  const html = await (await festivalsRoute('/festivals', q(''), {}, null, { pack: ON })).text();
  assert.ok(!html.includes('javascript:') && !html.includes('mailto:') && !html.includes('evil'));
  assert.equal(httpUrl('ftp://example.test/x'), ''); assert.equal(httpUrl('https://example.test/x'), 'https://example.test/x');
});

test('an API failure gives a friendly empty state with a short cache, never a 500', async (t) => {
  for (const answer of [() => { throw new Error('down'); }, () => new Response('oops', { status: 500 }), () => new Response('not json', { status: 200 })]) {
    const calls = stubFetch(t, answer);
    assert.deepEqual(await festivalsFor({}, {}, { pack: ON }), { rows: [], matched: 0, error: true });
    const res = await festivalsRoute('/festivals', q(''), {}, null, { pack: ON });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age=30\b/);
    const html = await res.text();
    assert.ok(html.includes('could not be loaded just now') && html.includes('href="https://nationalff.com/"'));
    assert.equal(festivalsBlock(await festivalsFor({}, {}, { pack: ON }), { pack: ON }), '', 'the home block leaves itself out');
    assert.ok(calls.length >= 1);
  }
  if (festivalsOn()) {
    stubFetch(t, () => { throw new Error('down'); });
    assert.equal((await worker.fetch(new Request('https://example.test/festivals'), {})).status, 200);
    assert.equal((await worker.fetch(new Request('https://example.test/'), {})).status, 200);
  }
});

test('the key is sent as a Bearer token only when it is set, and a keyed answer has no "see all" line', async (t) => {
  const calls = stubFetch(t, ok({ rows: ROWS.slice(0, 1), nextCursor: 'sundance', maxPage: 100 }));
  const anon = await festivalsFor({}, {}, { pack: ON });
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(anon.keyed, false);
  const keyed = await festivalsFor({ NATIONALFF_API_KEY: 'k-123' }, {}, { pack: ON });
  assert.equal(calls[1].headers.authorization, 'Bearer k-123');
  assert.equal(keyed.keyed, true); assert.equal(keyed.matched, 1);
  stubFetch(t, ok({ rows: ROWS.slice(0, 1), matched: 50 }));
  const html = await (await festivalsRoute('/festivals', q(''), { NATIONALFF_API_KEY: 'k-123' }, null, { pack: ON })).text();
  assert.ok(!html.includes('See all'));
});

test('the edge cache answers the second call for the same query, for six hours', async (t) => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const store = new Map(); const ttl = [];
  const cache = { match: async (k) => { const r = store.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; }, put: async (k, r) => { ttl.push(r.headers.get('cache-control')); store.set(typeof k === 'string' ? k : k.url, r); } };
  Object.defineProperty(globalThis, 'caches', { value: { default: cache }, configurable: true, writable: true });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'caches', had); else delete globalThis.caches; });
  const calls = stubFetch(t, ok({ rows: ROWS, matched: 3 }));
  const first = await festivalsFor({}, { kind: 'festival' }, { pack: ON });
  const second = await festivalsFor({}, { kind: 'festival' }, { pack: ON });
  assert.equal(calls.length, 1);
  assert.deepEqual(second, first);
  assert.ok(ttl[0].includes(`max-age=${CACHE_SECONDS}`) && CACHE_SECONDS === 21600);
  await festivalsFor({}, { kind: 'competition' }, { pack: ON });
  assert.equal(calls.length, 2, 'another query is another entry');
  let waited = null;
  await festivalsFor({}, { kind: 'competition', country: 'Spain' }, { pack: ON, ctx: { waitUntil: (p) => { waited = p; } } });
  assert.ok(waited, 'with a ctx the write runs after the response');
});

test('Ask sends festival, competition and "submit my film" questions to /festivals when the site has the directory', () => {
  assert.equal(searchAnswer(`film festivals in ${C.name}`, { festivalsOn: true }).results[0].href, `/festivals?kind=festival&country=${C.code}`);
  assert.equal(searchAnswer('any film contest open now?', { festivalsOn: true }).results[0].href, '/festivals?kind=competition');
  assert.equal(searchAnswer('where can I submit my film', { festivalsOn: true }).results[0].href, '/festivals');
  assert.equal(searchAnswer('AI competitions open to all', { festivalsOn: true }).results[0].href, '/festivals?kind=competition');
  assert.ok(!searchAnswer('film festivals in France', { festivalsOn: false }).results.some((x) => x.kind === 'festivals'));
  assert.ok(!searchAnswer('grants for founders', { festivalsOn: true }).results.some((x) => x.kind === 'festivals'));
});

test('the layout editor offers the festivals block by name', () => {
  assert.ok(layoutEditorPage({ draft: [{ block: 'cta' }], published: [{ block: 'cta' }], isDraft: false }).includes('Festivals and competitions open for entries'));
});

test('upcoming only, soonest first, and a narrow filter widens to its fallback when it finds too few', async (t) => {
  const pack = { ...PACK, festivalDirectory: { ...CFG, query: { q: 'AI film', submittable: 'true' }, fallbackQuery: { ai: 'accepted', submittable: 'true' }, upcoming: true } };
  const calls = stubFetch(t, async (url) => {
    const u = new URL(url);
    const rows = u.searchParams.get('q') ? [{ slug: 'late-ai', name: 'Late AI Film Fest', website: 'https://late.example.test', country: null, city: null, month: 9, founded: null, startDate: '2027-09-01', submissionUrl: null, submissionKind: null }]
      : [{ slug: 'soon', name: 'Soon Fest', website: 'https://soon.example.test', country: null, city: null, month: 1, founded: null, startDate: '2027-01-05', submissionUrl: null, submissionKind: null }, { slug: 'undated', name: 'Undated Fest', website: 'https://u.example.test', country: null, city: null, month: null, founded: null, startDate: null, submissionUrl: null, submissionKind: null }];
    return new Response(JSON.stringify({ rows, matched: rows.length }), { headers: { 'content-type': 'application/json' } });
  });
  const out = await festivalsFor({}, { kind: 'competition' }, { pack });
  assert.deepEqual(out.rows.map((r) => r.slug), ['soon', 'late-ai', 'undated']);
  assert.ok(calls.every((c) => /[?&]from=\d{4}-\d{2}-\d{2}/.test(c.url)), 'every request asks for upcoming editions');
  assert.ok(calls.every((c) => new URL(c.url).searchParams.get('kind') === 'competition'), 'the fallback keeps the visitor filters');
  assert.equal(calls.length, 2);
});

test('with comingUp on, dated festivals in a known country join the calendar as outward links credited to the directory', () => {
  assert.equal(festivalsInComingUp(ON), false, 'off unless the pack asks');
  const pack = { ...ON, festivalDirectory: { ...CFG, comingUp: true } };
  assert.equal(festivalsInComingUp(pack), true);
  assert.equal(countryCodeOf(C.name), C.code, 'a country the site has, by name');
  assert.equal(countryCodeOf(C.code.toLowerCase()), C.code, 'or by code');
  if (countryByCode('GB')) assert.equal(countryCodeOf('UK'), 'GB', 'common short forms');
  assert.equal(countryCodeOf('Atlantis'), '');
  const cfg = directoryConfig(pack);
  const rows = [cleanRow({ slug: 'here-fest', name: 'Here Film Festival', country: C.name, city: 'Somewhere', startDate: '2027-01-21' }, cfg), ...ROWS.slice(1).map((r) => cleanRow(r, cfg)).filter(Boolean), cleanRow({ slug: 'online-fest', name: 'Online Fest', country: 'Online', startDate: '2026-12-01' }, cfg)];
  const feed = festivalEventRows({ rows }, pack);
  assert.deepEqual(feed.map((r) => r.uid), ['here-fest'], 'undated and countryless festivals stay on /festivals');
  assert.equal(festivalEventRows({ rows, error: true }, pack).length, 0);
  assert.equal(festivalEventRows({ rows }, OFF).length, 0);
  const [e] = upcoming([], new Date('2026-11-01T00:00:00Z'), feed).filter((x) => x.feed);
  assert.ok(e, 'the festival is on the calendar');
  assert.equal(e.kind, 'film');
  const html = eventRow(e);
  assert.ok(html.includes('href="https://nationalff.com/festival/here-fest"') && html.includes('target="_blank"') && html.includes('Here Film Festival'));
});
