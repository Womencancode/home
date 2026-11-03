import test from 'node:test';
import assert from 'node:assert/strict';
import { coverHero, coverStar, issueLabel, issueNumber, splitHeadline, coverQr } from '../src/pages/cover.mjs';
import { qrEncode } from '../src/qr.mjs';
import { VARIANTS } from '../src/layout.mjs';

const story = (o) => ({ slug: 's', title: 'A title', category: 'Music', people: [], countryRecord: { flag: '🇬🇧', name: 'United Kingdom' }, ...o });
const pic = { src: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A.jpg', page: 'https://commons.wikimedia.org/wiki/File:A.jpg', credit: 'A. Photographer', licence: 'CC BY 4.0' };
const portraits = { RAYE: { ...pic, portrait: true, cutout: '/covers/raye.webp' }, 'Not A Portrait': { ...pic } };
const portrait = (n) => portraits[n] || null;
const PACK = { cover: { words: [{ text: 'Black' }, { text: 'ABC', accent: true, small: true }], strap: ['Arts', { label: 'Music', href: '/stories?category=music' }, { label: 'Bad', href: 'https://evil.example/' }], since: '2026-10' } };

test('the cover is a hero variant the layout and editor know', () => { assert.ok(VARIANTS.hero.includes('cover')); });

test('the cover star is the first person with a proper portrait; else the first story with a picture; else no cover', () => {
  const a = story({ slug: 'a', people: ['Not A Portrait'] }), b = story({ slug: 'b', title: 'RAYE wins the 2026 Mercury Prize', people: ['RAYE'] });
  const star = coverStar([a, b], portrait);
  assert.equal(star.story, b); assert.equal(star.name, 'RAYE');
  const c = story({ slug: 'c', image: pic });
  assert.equal(coverStar([a, c], () => null).story, c);
  assert.equal(coverHero({ stories: [a], portrait: () => null }), '');
});

test('the full cover: two-tone masthead, strapline, issue, the star and her line, three cover lines, credit, QR, cut-out layering', () => {
  const lead = story({ slug: 'lead', title: 'RAYE wins the 2026 Mercury Prize', people: ['RAYE'] });
  const others = [story({ slug: 'mo', title: 'Mo Abudu opens EbonyLife Place', people: ['Mo Abudu'], category: 'film' }), story({ slug: 'bham', title: 'Birmingham students turn a square into a gallery', category: 'art' }), story({ slug: 'dav', title: 'Davido wins Album of the Year', people: ['Davido'] }), story({ slug: 'x', title: 'Fourth' })];
  const html = coverHero({ stories: [others[0], lead, ...others.slice(1)], moment: { name: 'Black History Month' }, now: new Date('2026-10-31T12:00:00Z'), pack: PACK, portrait });
  assert.match(html, /class="mag-masthead"[^>]*><span>Black<\/span> <span class="mh-accent mh-small">ABC<\/span>/);
  assert.match(html, /<nav class="mag-strapline" aria-label="Sections">Arts<span aria-hidden="true"> • <\/span><a href="\/stories\?category=music">Music<\/a><span aria-hidden="true"> • <\/span>Bad<\/nav>/, 'strapline words link to sections, on this site only');
  assert.match(html, /No\. 1<br>October 2026<br>Black History Month/);
  assert.match(html, /<span class="mag-line">RAYE<\/span><span class="mag-rule" aria-hidden="true"><\/span><span class="mag-under">wins the 2026 Mercury Prize<\/span>/);
  assert.match(html, /<span class="mag-head">Mo Abudu<\/span><span class="mag-sub">opens EbonyLife Place<\/span>/);
  assert.match(html, /<span class="mag-head">art<\/span><span class="mag-sub">Birmingham students/);
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.ok(!html.includes('href="/story/x"'));
  assert.ok(html.indexOf('mag-masthead') < html.indexOf('mag-cut'), 'the cut-out sits in front of the masthead');
  assert.match(html, /Photographed by A\. Photographer/);
  assert.match(html, /class="mag-qr" href="\/story\/lead"><svg class="mag-qr-code"/);
  assert.match(html, /Know someone who belongs on the cover/);
  assert.ok(!/[—–]/.test(html));
  assert.ok(!coverHero({ stories: [lead], pack: { ...PACK, cover: { ...PACK.cover, qr: false } }, portrait }).includes('mag-qr'));
});

test('issue numbers count months from the first issue; headlines split on a leading name; the QR encodes the address', () => {
  assert.equal(issueNumber(new Date('2026-10-31T00:00:00Z'), '2026-10'), 1);
  assert.equal(issueNumber(new Date('2027-03-02T00:00:00Z'), '2026-10'), 6);
  assert.equal(issueNumber(new Date('2026-09-02T00:00:00Z'), '2026-10'), null);
  assert.equal(issueNumber(new Date(), ''), null);
  assert.equal(issueLabel(new Date('2027-03-02T00:00:00Z')), 'March 2027');
  assert.deepEqual(splitHeadline('Masai Russell sets a world record', ['Masai Russell'], 'sport'), { head: 'Masai Russell', line: 'sets a world record' });
  assert.deepEqual(splitHeadline('Nigeria top the table', ['Someone'], 'sport'), { head: 'sport', line: 'Nigeria top the table' });
  const url = 'https://blackabc.com/story/raye';
  const svg = coverQr(url);
  assert.match(svg, /^<svg class="mag-qr-code" viewBox="0 0 (\d+) \1"/);
  assert.equal(qrEncode(url).size + 8, Number(/viewBox="0 0 (\d+)/.exec(svg)[1]));
  assert.equal(coverQr('x'.repeat(400)), '', 'too long to encode: no code rather than a wrong one');
  const bad = coverHero({ stories: [story({ title: 'RAYE x', people: ['RAYE'] })], portrait: () => ({ ...pic, portrait: true, cutout: 'javascript:alert(1)' }) });
  assert.ok(!bad.includes('mag-cut') && !bad.includes('javascript'));
});

test("with cover.strap 'nav' the cover's strapline is the site menu and the front page drops the header's menu and logo", async () => {
  const { navItems, layout } = await import('../src/html.mjs');
  const lead = story({ slug: 'lead', title: 'RAYE wins the 2026 Mercury Prize', people: ['RAYE'] });
  const html = coverHero({ stories: [lead], pack: { cover: { ...PACK.cover, strap: 'nav' } }, portrait });
  for (const [href, label] of navItems()) assert.ok(html.includes(`<a href="${href}">${label}</a>`), `${label} is on the cover`);
  assert.match(layout({ path: '/', body: html, cover: true }), /<body class="has-cover">/);
  assert.match(layout({ path: '/', body: html }), /<body>/, 'every other page keeps the normal header');
});
