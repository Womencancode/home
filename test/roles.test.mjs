import test from 'node:test';
import assert from 'node:assert/strict';
import { rolesOf, roleFrom, roleScore, byRole, fitting, roleTag, rolePicker, roleIntro, rolesBlock } from '../src/roles.mjs';
import { bodyAttrs, layout } from '../src/html.mjs';
import { learnBlock } from '../src/pages/learn.mjs';
import { writingBlock } from '../src/pages/writing.mjs';
import { speakersBlock } from '../src/pages/speakers.mjs';
import { openDoorsRail } from '../src/pages/opendoors.mjs';
import { HOME_BLOCKS } from '../src/pages/home.mjs';
import { PACK } from '../src/site.mjs';
import worker from '../src/worker.mjs';

const pack = { roles: { ask: "I'm a…", list: [
  { id: 'designer', label: 'Designer', short: 'designers', colour: '#ff5a36', ink: '#1a0b05', intro: 'Research, interfaces and the systems behind them.', topics: ['design', 'art'], tracks: ['Build and ship'], words: ['design', 'UX'], more: { href: '/learn', label: 'Start here' } },
  { id: 'engineer', label: 'Engineer', colour: '#123456', fields: ['science'], topics: ['engineering'], words: ['code', 'engineer'] },
  { id: 'all', label: 'Reserved' }, { id: '<x>', label: 'Bad' }, { id: 'nolabel' },
] } };
const designer = () => rolesOf(pack)[0];

test('roles are off by default and cleaned from the pack: reserved, malformed and unlabelled ones are dropped', () => {
  assert.deepEqual(rolesOf({}), []);
  assert.equal(rolePicker(null, {}), '');
  assert.equal(rolesBlock(null, {}), '');
  const roles = rolesOf(pack);
  assert.deepEqual(roles.map((r) => r.id), ['designer', 'engineer']);
  assert.equal(roles[1].ink, '#ffffff', 'a missing ink colour falls back to white');
  assert.equal(roles[1].short, 'Engineer');
});

test('?role= picks a known role; all, unknown and missing are no role', () => {
  assert.equal(roleFrom(new URLSearchParams('role=designer'), pack).id, 'designer');
  for (const q of ['role=all', 'role=nope', '', 'role=']) assert.equal(roleFrom(new URLSearchParams(q), pack), null, q);
});

test('scoring: shared taxonomies weigh three, each role word in the text one; ranking is stable and hides nothing', () => {
  const r = designer();
  assert.equal(roleScore(r, { topics: ['design'] }), 3);
  assert.equal(roleScore(r, { track: 'Build and ship', title: 'Make your web app installable' }), 3);
  assert.equal(roleScore(r, { title: 'A UX design sprint' }), 2);
  assert.equal(roleScore(r, { title: 'Redesigned' }), 0, 'words match at a word start, not inside another word');
  assert.equal(roleScore(null, { topics: ['design'] }), 0);
  const items = [{ id: 'a', title: 'Pay' }, { id: 'b', title: 'UX research' }, { id: 'c', topics: ['art'] }, { id: 'd', title: 'Money' }];
  assert.deepEqual(byRole(r, items).map((x) => x.id), ['c', 'b', 'a', 'd']);
  assert.equal(byRole(null, items), items);
  assert.equal(fitting(r, items), 2);
  assert.equal(roleTag(r, items, 'News'), 'For designers');
  assert.equal(roleTag(r, [{ title: 'Pay' }], 'News'), 'News', 'no claim to be for a role when nothing fits');
  assert.equal(roleTag(null, items, 'News'), 'News');
});

test('the picker: a chip per role linking to ?role=, the chosen one marked, Everyone to clear, and it works as plain links', () => {
  const off = rolePicker(null, pack);
  assert.match(off, /<nav class="role-picker"[^>]*data-roles>/);
  assert.match(off, /<a class="role-chip" href="\/\?role=designer#for-you" data-role="designer" style="--chip:#ff5a36;--chip-ink:#1a0b05">Designer<\/a>/);
  assert.match(off, /class="role-chip role-all is-on" href="\/\?role=all" data-role="all" aria-current="true"/);
  const on = rolePicker(designer(), pack);
  assert.match(on, /class="role-chip is-on" href="\/\?role=designer#for-you"[^>]*aria-current="true">Designer/);
  assert.ok(!/role-all is-on/.test(on));
  assert.ok(!/[—–]/.test(off + on));
});

test('the intro: the role in its colour block, its line and its next step; nothing without a role', () => {
  assert.equal(roleIntro(null, pack), '');
  const html = roleIntro(designer(), pack);
  assert.match(html, /<section class="role-intro" id="for-you"/);
  assert.match(html, /<h2 id="role-intro-h">Designer<\/h2>/);
  assert.match(html, /Research, interfaces and the systems behind them\./);
  assert.match(html, /<a class="role-go" href="\/learn">Start here<\/a>/);
  assert.ok(rolesBlock(designer(), pack).includes('role-intro') && !rolesBlock(null, pack).includes('role-intro'));
});

test('the body carries the role and its colour only when they are well formed', () => {
  assert.equal(bodyAttrs({}), '');
  assert.equal(bodyAttrs({ cover: true }), ' class="has-cover"');
  assert.equal(bodyAttrs({ role: designer() }), ' class="has-role" data-role="designer" style="--role-colour:#ff5a36;--role-ink:#1a0b05"');
  assert.equal(bodyAttrs({ role: { id: '"><script>', colour: 'red' } }), '');
  assert.equal(bodyAttrs({ role: { id: 'x1', colour: 'red;background:url(x)' } }), ' class="has-role" data-role="x1"');
  assert.match(layout({ path: '/', body: '', role: designer() }), /<body class="has-role" data-role="designer"/);
});

test('home blocks re-rank for a role: lessons, writing, speakers and open doors put what fits first', () => {
  const r = designer();
  const lessons = [{ id: 'pay', track: 'Pay and progress', title: 'Read a pay gap', minutes: 3, summary: '' }, { id: 'pwa', track: 'Build and ship', title: 'Make your web app installable', minutes: 6, summary: '' }];
  assert.ok(learnBlock(1, lessons).includes('/learn/pay'), 'without a role: one per track, in order');
  assert.ok(learnBlock(1, lessons, r).includes('/learn/pwa'), 'with a role: its track first');
  assert.match(learnBlock(1, lessons, r), /For designers/);
  const posts = [{ slug: 'pay', date: '2026-10-31', title: 'Pay', summary: '', sections: [] }, { slug: 'ux', date: '2026-10-01', title: 'UX writing', summary: '', sections: [] }];
  assert.ok(writingBlock(1, posts, r).includes('/writing/ux') && writingBlock(1, posts).includes('/writing/pay'));
  const speakers = [{ id: 'a', name: 'A', topics: ['policy'], country: 'GB', url: 'https://example.com/a' }, { id: 'b', name: 'B', topics: ['design'], country: 'GB', url: 'https://example.com/b' }];
  assert.ok(speakersBlock(1, speakers, r).includes('id="b"') && speakersBlock(1, speakers).includes('id="a"'));
  const doors = [{ id: 'd1', title: 'Policy room', organiser: 'X', lane: 'public-life', type: 'programme', fields: ['policy'], rolling: true, countries: [], url: 'https://example.com/1' }, { id: 'd2', title: 'Design school', organiser: 'Y', lane: 'education', type: 'programme', fields: ['design'], rolling: true, countries: [], url: 'https://example.com/2' }];
  const rail = openDoorsRail({ items: doors, role: r });
  if (rail) assert.ok(rail.indexOf('id="d2"') < rail.indexOf('id="d1"') || !rail.includes('id="d1"'), 'the fitting door leads');
  assert.equal(typeof HOME_BLOCKS.roles, 'function');
});

test('the front page renders ?role= on the server, so the picker works with scripts off', async () => {
  const env = { ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  const get = async (q) => (await worker.fetch(new Request(`https://example.test/${q}`), env)).text();
  const roles = rolesOf(PACK);
  const plain = await get('');
  if (!roles.length || !(PACK.layout && (PACK.layout.home || []).some((b) => b.block === 'roles'))) { assert.ok(!plain.includes('data-roles'), 'off by default'); return; }
  const r = roles[0];
  const html = await get(`?role=${r.id}`);
  assert.match(html, new RegExp(`<body class="[^"]*has-role[^"]*" data-role="${r.id}"`));
  assert.match(html, /class="role-intro" id="for-you"/);
  assert.match(html, new RegExp(`class="role-chip is-on" href="/\\?role=${r.id}#for-you"`));
  assert.ok(plain.includes('data-roles') && !plain.includes('class="role-intro"'));
  assert.ok(!(await get('?role=nope')).includes('class="role-intro"'));
});

test('cover.lineRoles heads each cover line with the job it shows, a different one per line, and only on a real fit', async () => {
  const { roleLines, coverHero } = await import('../src/pages/cover.mjs');
  const p = { ...pack, cover: { lineRoles: true } };
  const s = (slug, title) => ({ slug, title, people: [], category: 'business', countryRecord: { flag: '', name: '' } });
  const list = [s('a', 'A UX design studio opens'), s('b', 'An engineer writes code for the grid'), s('c', 'Another design and UX award'), s('d', 'A quiet day')];
  const lines = roleLines(list, 3, p);
  assert.deepEqual(lines.map((l) => [l.story.slug, l.head]), [['a', 'Designer'], ['b', 'Engineer'], ['c', 'Designer']]);
  assert.equal(lines[0].colour, '#ff5a36');
  assert.deepEqual(roleLines(list, 3, pack), [], 'off unless the pack asks');
  assert.deepEqual(roleLines([s('x', 'One design')], 3, p), [], 'one stray word is not enough');
  const pic = { src: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A.jpg', page: 'https://commons.wikimedia.org/wiki/File:A.jpg', credit: 'A', licence: 'CC BY 4.0', portrait: true };
  const html = coverHero({ stories: [{ ...s('star', 'Ada wins'), people: ['Ada'] }, ...list], pack: p, portrait: (n) => (n === 'Ada' ? pic : null) });
  assert.match(html, /<li data-role="designer" style="--line:#ff5a36;--line-ink:#1a0b05"><a href="\/story\/a"><span class="mag-head">Designer<\/span><span class="mag-sub">A UX design studio opens<\/span>/);
});
