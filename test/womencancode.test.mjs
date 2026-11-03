import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import worker from '../src/wcc.mjs';
import { PACK } from '../src/site.mjs';
import { TRACKS, validTrack, instructorHtml } from '../src/tracks.mjs';
import { matchProject, EXAMPLES } from '../src/build.mjs';
import { CERTS } from '../src/certificates.mjs';
import { challengeConfig } from '../src/challenge.mjs';
import { cohortsConfig } from '../src/cohorts.mjs';

const exists = (name) => { const u = new URL(`../public/${name}`, import.meta.url); return existsSync(u) && statSync(u).isFile(); };
const assets = { fetch: async (req) => { const name = decodeURIComponent(new URL(req.url).pathname.slice(1)); return name && !name.includes('..') && exists(name) ? new Response('ok', { status: 200 }) : new Response('nope', { status: 404 }); } };
const get = (path) => worker.fetch(new Request(`https://womencancode.com${path}`), { ASSETS: assets }, { waitUntil() {} });
const text = async (path) => (await get(path)).text();
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

test('the pack is womencancode.com, not canonical, with the Ontold MCP on', () => {
  assert.equal(PACK.id, 'womencancode');
  assert.equal(PACK.domain, 'womencancode.com');
  assert.equal(PACK.canonical, false);
  assert.deepEqual(PACK.ontold, { mcp: true });
});

test('every track is a real free course: credited to its provider, linked on https, with a quote from its own page that says free', () => {
  assert.ok(TRACKS.length >= 6);
  const providers = new Set(TRACKS.map((t) => t.course.provider));
  for (const p of ['The Odin Project', 'freeCodeCamp', 'Harvard University', 'MDN (Mozilla)', 'Charles Severance, University of Michigan', 'GitHub Skills']) assert.ok(providers.has(p), p);
  for (const t of TRACKS) {
    assert.ok(validTrack(t), t.id);
    assert.equal(t.course.free, true);
    assert.match(t.course.freeEvidence.url, /^https:\/\//);
    assert.ok(t.sources.every((s) => /^https:\/\//.test(s.url)));
  }
});

test('a track page says plainly the course is theirs and free, links out and rehosts nothing', async () => {
  for (const t of TRACKS) {
    const html = await text(`/tracks/${t.id}`);
    assert.ok(html.includes(`is made and run by <a href="${t.course.url}" rel="noopener">${t.course.provider.replace(/&/g, '&amp;')}</a>, and it is free. We do not host or copy it`), t.id);
    assert.ok(!/<iframe|<video/.test(html), `${t.id} embeds nothing`);
  }
  assert.equal((await get('/tracks/not-a-track')).status, 404);
});

test('the 10 days come in two 5-day levels: Try it on day 1, a launch at the end of each level, a certificate per level', async () => {
  const cfg = challengeConfig();
  assert.equal(cfg.days.length, 10);
  assert.equal(PACK.cohorts.challenge.freeDays, 1);
  assert.match(cfg.days[0].title, /first live page/i);
  assert.match(cfg.days[4].title, /^Launch Level 1/);
  assert.match(cfg.days[9].title, /launch/i);
  assert.deepEqual(cfg.levels.map((l) => [l.id, l.title, l.days]), [['level-1', 'Build it', [1, 2, 3, 4, 5]], ['level-2', 'Make it real', [6, 7, 8, 9, 10]]]);
  for (const d of cfg.days) assert.ok(d.follows && d.link, `day ${d.n} links a credited free resource`);
  for (const d of cfg.days) assert.ok(/^https:\/\/github\.com\/skills\//.test(d.link) === /^GitHub Skills, /.test(d.follows), `day ${d.n} says honestly whether it is GitHub Skills`);
  assert.ok(cfg.days.filter((d) => /^No GitHub Skills course for this day/.test(d.follows)).length >= 1);
  const html = await text('/challenge');
  assert.ok(html.includes('Try it: Day 1 is open now. Start with Level 1.'));
  assert.ok(!/open to everyone/i.test(html), 'Try it replaces "open to everyone"');
  assert.equal((html.match(/class="ch-day is-free"/g) || []).length, 1);
  assert.equal((html.match(/class="ch-day is-locked"/g) || []).length, 9);
  assert.ok(html.indexOf('id="level-1"') < html.indexOf('id="day-5"') && html.indexOf('id="day-5"') < html.indexOf('id="level-2"') && html.indexOf('id="level-2"') < html.indexOf('id="day-6"'), 'two grouped blocks');
  for (const s of ['Finish Level 1, get your Level 1 certificate', 'Finish Level 2, get your Level 2 certificate', 'src="/img/seal-level-1.svg"', 'src="/img/seal-level-2.svg"']) assert.ok(html.includes(s), s);
  assert.ok(!/£|\$\d|a month|Eventbrite/.test(html), 'no price and no Eventbrite while booking is off');
  for (const k of ['challenge', 'challenge-level-1', 'challenge-level-2', 'challenge-day-2', 'challenge-day-10']) assert.ok(html.includes(`data-interest="${k}">Register interest`), k);
  for (const s of ['Day 10: the finale', 'What Builders Really Use', 'id="free-product"', 'id="group-night-owls"', 'venue to be announced']) assert.ok(html.includes(s), s);
  assert.ok(html.indexOf('group-night-owls') < html.indexOf('group-day-group'), 'Night Owls lead');
  const home = await text('/');
  assert.equal((home.match(/Finish Level 1, get your Level 1 certificate/g) || []).length, 2, 'on the Wave panel and the 10 days panel');
  assert.equal((home.match(/Finish Level 2, get your Level 2 certificate/g) || []).length, 2);
  assert.ok(home.includes('10 days</b> in two 5-day levels'));
});

test('Wave 1 is two groups, Night Owls first, each with its own Register interest while booking is off', async () => {
  const cfg = cohortsConfig();
  assert.equal(cfg.booking, false);
  assert.equal(cfg.price, '', 'the price stays in config but is not shown');
  assert.deepEqual(cfg.items.map((i) => i.id), ['night-owls', 'day-group']);
  const html = await text('/cohorts');
  assert.equal((html.match(/<dd>To be announced<\/dd>/g) || []).length, cfg.items.length * 3);
  const home = await text('/');
  for (const k of ['cohort-night-owls', 'cohort-day-group', 'free-product']) assert.ok(home.includes(`data-interest="${k}">Register interest`), k);
  assert.ok(!/£|\$\d|a month|Eventbrite|Booking opens soon/.test(home), 'no price on the home page');
  assert.ok(!/£|\$\d|a month|Eventbrite/.test(await text('/live')), 'no price on /live');
  assert.ok(!/£|a month|Eventbrite/.test(await text('/llms.txt')), 'no price in llms.txt');
  assert.ok(!/8:30|10pm/.test(visible(home)));
});

test('the hero answers "describe what you want to build" on the server, with no JavaScript and no AI', async () => {
  assert.equal(matchProject('a booking page for my nail salon').id, 'booking');
  assert.equal(matchProject('sell my cakes online').id, 'shop');
  assert.equal(matchProject('a habit tracker').id, 'tracker');
  assert.equal(matchProject('zzz').id, 'tool');
  const html = await text('/?build=a+booking+page+for+my+nail+salon');
  assert.ok(html.includes('Closest example: <b>a booking page</b>'));
  assert.ok(html.includes('value="a booking page for my nail salon"'));
  assert.ok(html.includes('It ends live, and hosted free.'));
  assert.ok(html.includes('<script src="/wcc-build.js" defer>'));
  assert.ok(!(await text('/')).includes('Closest example'));
});

test('the free product reads "Terms to be confirmed" until the founder fills in its fields', async () => {
  const r = PACK.reward;
  assert.equal(r.hostingFor, ''); assert.equal(r.domainRegistrationIncluded, null); assert.equal(r.terms, '');
  const html = await text('/');
  assert.ok((html.match(/Terms to be confirmed/g) || []).length >= 3);
  assert.ok(html.includes('yourname.ontold.site'));
});

test('certificates come only from the founder list; awards are for projects with prizes to be announced', async () => {
  assert.equal(CERTS.length, 0);
  assert.equal((await get('/certificate/someone')).status, 404);
  const sample = await get('/certificate/sample');
  assert.equal(sample.headers.get('x-robots-tag'), 'noindex');
  const s = await sample.text();
  for (const k of ['SAMPLE', 'Verifiable certificate', 'og:image', 'https://womencancode.com/certificate/sample']) assert.ok(s.includes(k), k);
  const a = await text('/awards');
  assert.equal((a.match(/Prize: To be announced/g) || []).length, PACK.awards.categories.length);
  assert.ok((await text('/winners/wave-1')).includes('To be announced'));
});

test('example builds are real pages with screenshots, labelled as examples', async () => {
  for (const e of EXAMPLES) { assert.ok(exists(`examples/${e.id}.html`), e.id); assert.ok(exists(`examples/shots/${e.id}.png`), e.id); }
  const html = await text('/');
  assert.equal((html.match(/class="wcc-shot-tag">Example/g) || []).length, EXAMPLES.length);
});

test('the instructor shows marked slots for the founder and invents no bio', async () => {
  for (const k of ['name', 'why', 'photo', 'video']) assert.equal(PACK.school.instructor[k], '', `${k} is left for the founder`);
  const html = instructorHtml();
  for (const k of ['name', 'why', 'photo', 'video']) assert.ok(html.includes(`data-fill="${k}"`), k);
});

test('the menu leads with the 10 days, ideas, Wave 1 and go deeper; sitemap lists the new pages', async () => {
  const home = await text('/');
  const nav = home.match(/<nav class="site-nav" aria-label="Main">([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).slice(0, 4), ['/challenge', '/ideas', '/cohorts', '/tracks']);
  const map = await text('/sitemap.xml');
  for (const p of ['/tracks', '/live', '/cohorts', '/challenge', '/awards', '/ideas', '/winners/wave-1']) assert.ok(map.includes(`https://womencancode.com${p}</loc>`), p);
});

test('no invented numbers, testimonials, dates or price anchors, and no dashes, in the copy people read', async () => {
  for (const path of ['/', '/?build=a+shop', '/tracks', '/challenge', '/cohorts', '/live', '/about', '/awards', '/ideas', '/certificate/sample', '/verify/sample', '/certifications']) {
    const words = visible(await text(path));
    assert.ok(!/—|–/.test(words), `${path} has a dash`);
    assert.ok(!/sold out|85%|30% salary|testimonial|regular price/i.test(words), `${path} has a claim`);
    assert.ok(!/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4}/.test(words.replace(/No\. \d+ [A-Z][a-z]+ \d{4}/g, '')), `${path} names a date`);
  }
});

test('every internal link from the front page leads somewhere', async () => {
  const seen = new Map(), queue = ['/', '/tracks', '/challenge', '/cohorts', '/live', '/ideas', '/awards'], broken = [];
  while (queue.length && seen.size < 400) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    const res = await get(path);
    seen.set(path, res.status);
    if (res.status >= 400) { broken.push(`${path} -> ${res.status}`); continue; }
    if (!(res.headers.get('content-type') || '').includes('text/html')) continue;
    for (const m of (await res.text()).matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const raw = m[1].replace(/&amp;/g, '&');
      if (!raw.startsWith('/') || raw.startsWith('//')) continue;
      const u = new URL(raw, 'https://womencancode.com');
      if (u.pathname.startsWith('/admin') || u.pathname.startsWith('/country/') || u.pathname.startsWith('/img/')) continue;
      const next = u.pathname + u.search;
      if (!seen.has(next) && !queue.includes(next)) queue.push(next);
    }
  }
  assert.deepEqual(broken, []);
});

/* WCAG AA: every text colour the skin sets, against the ground it sits on. */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the skin passes WCAG AA contrast for every text pair it sets', () => {
  const css = readFileSync(new URL('../public/skin.css', import.meta.url), 'utf8');
  const v = (name) => css.match(new RegExp(`--${name}:(#[0-9a-f]{6})`))[1];
  const pairs = [['ink', 'bg'], ['ink-2', 'bg'], ['muted', 'bg'], ['accent', 'bg'], ['accent-2', 'bg'], ['muted', 'panel'], ['accent', 'panel'], ['accent-2', 'panel'], ['ink-2', 'panel'],
    ['night-ink', 'night'], ['night-muted', 'night'], ['lime', 'night'], ['lime-ink', 'lime'], ['todo-ink', 'todo-bg'], ['ink', 'lime'], ['muted', 'bg-2']];
  for (const [fg, bg] of pairs) assert.ok(ratio(v(fg), v(bg)) >= 4.5, `${fg} on ${bg}: ${ratio(v(fg), v(bg)).toFixed(2)}`);
  for (const [fg, bg] of [['#ffffff', v('accent')], ['#ffffff', '#3d1aa8'], [v('ink'), '#ecf9cf'], [v('ink-2'), '#ecf9cf'], [v('accent'), '#efeaff'], [v('ink'), '#efeaff'], [v('muted'), '#ffffff'], [v('accent-2'), '#ecf9cf']])
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
});

test('the home page says You CAN Code, with the real community and women who code, credited', async () => {
  const home = await text('/');
  assert.ok(home.includes('<h1>You <em>CAN</em> Code.</h1>'));
  assert.ok(home.indexOf('<h1>') < home.indexOf('id="build"'), 'the describe box comes after the headline');
  for (const s of ['224', '4.6', '25 ratings', '52', 'https://www.meetup.com/womencancode/', '#IamRemarkable', 'coming back with Wave 1', 'No recruiters or sales']) assert.ok(home.includes(s), s);
  const people = PACK.school.coders.people;
  assert.ok(people.length >= 6);
  for (const p of people) {
    assert.match(p.credit.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, p.name);
    assert.match(p.credit.licence, /^(Public domain|CC BY(-SA)? [\d.]+( FR)?)$/, p.name);
    assert.ok(home.includes(`alt="Portrait of ${p.name}"`), p.name);
  }
});
