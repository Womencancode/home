import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAnswer, spread, recency, ASK_LIMIT, PER_KIND } from '../src/ask.mjs';
import { storeFor } from '../src/store.mjs';
import { isGoodNews } from '../src/news.mjs';
import { countryByCode } from '../src/countries.mjs';
import worker from '../src/worker.mjs';

const now = new Date('2026-10-29T12:00:00Z');
const day = (n) => new Date(now.getTime() - n * 86400000).toISOString();
const kinds = (r) => r.results.map((x) => x.kind);
const find = (r, kind) => r.results.find((x) => x.kind === kind);

const data = {
  now,
  opportunities: [{ id: 'op-1', title: 'Quokka prize for founders', organiser: 'Quokka Trust', eligibility: 'Open worldwide', countries: [], fields: ['business'], prize: '5,000 pounds' }],
  events: [{ id: 'ev-1', name: 'Quokka night', blurb: 'An evening', city: 'Perth', country: 'AU', countryRecord: { name: 'Australia' } }],
  stories: [{ slug: 'st-1', title: 'Quokka rescue wins a medal', summary: 'A story', country: 'AU', countryRecord: { name: 'Australia' }, date: day(3) }],
  news: [{ url: 'https://news.example.com/a/1', title: 'Quokka sanctuary opens', summary: 'A new home', source: 'Example News', country: 'AU', published_at: day(1) }],
  works: [{ slug: 'wk-1', title: 'Narwhal Songs', creator: 'Ada Example', medium: 'album', blurb: 'Songs about narwhals', tags: ['sea'], country: 'GB' }],
  talent: [{ name: 'Okapi Okafor', disciplines: ['film'], countries: [{ code: 'NG', name: 'Nigeria' }], works: [] }],
  lessons: [{ id: 'axolotl-basics', track: 'Basics', title: 'Axolotl basics in four steps', summary: 'Plain words', minutes: 4 }],
  openDoors: [{ id: 'door-1', title: 'Pangolin Ballet summer school', organiser: 'Pangolin Ballet', lane: 'culture', eligibility: 'Young dancers', whatToExpect: 'Free classes', countries: ['GB'], fields: ['arts'] }],
  speakers: [{ id: 'sp-1', name: 'Lemur Larsen', role: 'Researcher', org: 'Example Lab', topics: ['privacy'], country: 'GB', url: 'https://example.com/l', source: 'Example' }],
};

test('Ask finds one hit of each kind the site has, each with its own page', () => {
  const hit = (q, kind) => { const x = find(searchAnswer(q, data), kind); assert.ok(x, `${kind} for "${q}"`); assert.ok(x.title && x.href && 'note' in x, `${kind} has title, href and note`); return x; };
  assert.equal(hit('quokka prize', 'opportunity').href, '/opportunities#op-1');
  assert.equal(hit('quokka night in perth', 'event').href, '/event/ev-1');
  assert.equal(hit('quokka rescue', 'story').href, '/story/st-1');
  assert.equal(hit('quokka sanctuary', 'news').href, 'https://news.example.com/a/1');
  assert.equal(hit('narwhal songs', 'work').href, '/work/wk-1');
  assert.equal(hit('okapi', 'talent').href, '/talent?q=Okapi%20Okafor');
  assert.equal(hit('axolotl', 'lesson').href, '/learn/axolotl-basics');
  assert.equal(hit('pangolin ballet', 'door').href, '/open-doors?country=GB#door-1');
  assert.equal(hit('lemur larsen', 'speaker').href, '/speakers#sp-1');
});

test('an open door links with its own country so the card is on the page, preferring the country asked about', () => {
  const d = { ...data, openDoors: [{ ...data.openDoors[0], countries: ['NG', 'GB'] }] };
  assert.equal(find(searchAnswer('pangolin ballet', d), 'door').href, '/open-doors?country=NG#door-1');
  assert.equal(find(searchAnswer(`pangolin ballet in ${countryByCode('GB').name}`, d), 'door').href, '/open-doors?country=GB#door-1');
  const worldwide = { ...data, openDoors: [{ ...data.openDoors[0], countries: [] }] };
  assert.equal(find(searchAnswer('pangolin ballet', worldwide), 'door').href, '/open-doors#door-1');
});

test('news links out to the article with kind news, and only to http(s) addresses', () => {
  const r = searchAnswer('quokka sanctuary', data);
  const n = find(r, 'news');
  assert.equal(n.kind, 'news');
  assert.equal(n.href, 'https://news.example.com/a/1');
  assert.ok(!n.href.startsWith('/'), 'not an on-site path');
  assert.equal(n.note, 'Example News');
  const bad = searchAnswer('quokka sanctuary', { ...data, news: [{ ...data.news[0], url: 'javascript:alert(1)' }, { ...data.news[0], url: '' }] });
  assert.ok(!kinds(bad).includes('news'));
});

test('the browser engine still answers with no data for the new kinds', () => {
  const r = searchAnswer('quokka', { stories: data.stories });
  assert.deepEqual(kinds(r), ['story']);
  assert.deepEqual(searchAnswer('quokka', {}).results, []);
});

test('results are capped at 10 and no more than 4 of one kind, so a question gets a spread', () => {
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const big = {
    now,
    stories: many(9, (i) => ({ slug: `s${i}`, title: `Quokka story ${i}`, summary: '', country: 'AU', date: day(1) })),
    news: many(9, (i) => ({ url: `https://news.example.com/n${i}`, title: `Quokka headline ${i}`, source: 'X', country: 'AU', published_at: day(1) })),
    works: many(9, (i) => ({ slug: `w${i}`, title: `Quokka work ${i}`, creator: 'A', medium: 'film', country: 'AU' })),
    lessons: many(9, (i) => ({ id: `l${i}`, track: 'T', title: `Quokka lesson ${i}`, minutes: 3 })),
    speakers: many(9, (i) => ({ id: `p${i}`, name: `Quokka Person ${i}`, topics: ['ai'], country: 'AU' })),
  };
  const r = searchAnswer('quokka', big);
  assert.equal(r.results.length, ASK_LIMIT);
  const per = {}; for (const x of r.results) per[x.kind] = (per[x.kind] || 0) + 1;
  assert.ok(Object.values(per).every((n) => n <= PER_KIND), JSON.stringify(per));
  assert.ok(Object.keys(per).length >= 3, 'a spread of kinds');
  assert.equal(PER_KIND, 4);
  assert.deepEqual(spread(Array.from({ length: 20 }, () => ({ kind: 'a' }))).length, 4);
});

test('the festivals shortcut leads and the cap still holds with it', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ slug: `s${i}`, title: `Quokka film festival story ${i}`, summary: '', country: 'AU' }));
  const news = Array.from({ length: 12 }, (_, i) => ({ url: `https://news.example.com/f${i}`, title: `Quokka film festival headline ${i}`, source: 'X', country: 'AU', published_at: day(1) }));
  const r = searchAnswer('quokka film festival', { stories: many, news, festivalsOn: true, now });
  assert.equal(r.results[0].kind, 'festivals');
  assert.ok(r.results.length <= ASK_LIMIT);
  assert.ok(r.results.filter((x) => x.kind === 'story').length <= PER_KIND);
});

test('recent news and stories get a small lift, but only when they already match', () => {
  assert.equal(recency(day(2), now), 1);
  assert.equal(recency(day(30), now), 0.5);
  assert.equal(recency(day(200), now), 0);
  assert.equal(recency('', now), 0);
  const news = [
    { url: 'https://news.example.com/old', title: 'Quokka old headline', source: 'X', published_at: day(200) },
    { url: 'https://news.example.com/new', title: 'Quokka new headline', source: 'X', published_at: day(1) },
    { url: 'https://news.example.com/fresh-unrelated', title: 'Something else entirely', source: 'X', published_at: day(0) },
  ];
  const r = searchAnswer('quokka', { news, now });
  assert.deepEqual(r.results.map((x) => x.href), ['https://news.example.com/new', 'https://news.example.com/old']);
  const stories = [{ slug: 'old', title: 'Quokka old', summary: '', date: '2020-01-01' }, { slug: 'new', title: 'Quokka new', summary: '', date: day(2).slice(0, 10) }];
  assert.deepEqual(searchAnswer('quokka', { stories, now }).results.map((x) => x.href), ['/story/new', '/story/old']);
  assert.ok(find(searchAnswer('quokka', { stories: [{ slug: 'z', title: 'Zebra', summary: '', date: day(0).slice(0, 10) }], now }), 'story') === undefined);
});

test('a question about opportunities or events keeps to them, and country and fields still rank', () => {
  const opp = searchAnswer('quokka prize to apply for', data);
  assert.equal(opp.results[0].kind, 'opportunity');
  assert.ok(kinds(opp).every((k) => k === 'opportunity' || k === 'door'), kinds(opp).join());
  assert.deepEqual(kinds(searchAnswer('quokka event on this week', data)), ['event']);
  const two = [{ slug: 'a', title: 'Quokka in Wales', summary: '', country: 'GB' }, { slug: 'b', title: 'Quokka in Australia', summary: '', country: 'AU' }];
  assert.equal(searchAnswer('quokka australia', { stories: two }).results[0].href, '/story/b');
});

test('a speakers question still goes to /speakers first, and a named speaker is found otherwise', () => {
  assert.equal(searchAnswer('speakers on privacy', { ...data, speakersOn: true }).results[0].href, '/speakers?topic=privacy');
  assert.equal(searchAnswer('speakers on privacy', { ...data, speakersOn: true }).results.length, 1);
  assert.equal(find(searchAnswer('lemur larsen', { ...data, speakersOn: true }), 'speaker').title, 'Lemur Larsen');
});

test('/api/ask answers over the whole site, with news from the store linking to the publisher', async () => {
  const store = storeFor({});
  const title = 'Women win first AI award for health research';
  await store.saveNews([{ title, url: 'https://news.example.com/ask-test', summary: 'Quokkafoundation women AI health', source: 'Ask Test News', source_home: 'https://news.example.com', countries: ['GB'], published_at: new Date().toISOString(), fetched_at: new Date().toISOString() }]);
  const res = await worker.fetch(new Request('https://example.test/api/ask?q=' + encodeURIComponent('first award health research')), {}, { waitUntil() {} });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.ok(Array.isArray(j.results) && j.results.length <= ASK_LIMIT);
  assert.equal(j.engine, 'browser');
  for (const x of j.results) assert.ok(x.kind && x.title && x.href, JSON.stringify(x));
  /* This pack's own news filter decides whether the sample headline is kept; when it is, it must be there and link out. */
  if (isGoodNews(title, 'Quokkafoundation women AI health')) {
    const n = j.results.find((x) => x.kind === 'news' && x.href === 'https://news.example.com/ask-test');
    assert.ok(n, 'the stored headline is searched');
  }
  assert.equal((await worker.fetch(new Request('https://example.test/api/ask?q='), {}, { waitUntil() {} })).status, 400);
});
