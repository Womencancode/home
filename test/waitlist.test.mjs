import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/site.mjs';
import { MemoryStore, storeFor } from '../src/store.mjs';
import { waitlistOn, waitlistFeatures, validateWaitlist, maskEmail, maskEmailsIn, waitlistCsv } from '../src/waitlist.mjs';
import { waitlistRoute, adminWaitlistRoute, listsOn } from '../src/pages/waitlist.mjs';
import { createHero } from '../src/pages/create.mjs';
import { layout } from '../src/html.mjs';
import worker from '../src/worker.mjs';
import { interestOn } from '../src/interest.mjs';

const FEATURES = [{ id: 'twin', label: 'Digital twin that joins your calls' }, { id: 'work', label: 'AI at work' }, { id: 'code', label: 'Build with AI' }];
const ON = { ...PACK, waitlist: { features: FEATURES } };
/* No waitlist, no Register interest (cohorts) and no career lists (rooms and bounties keep theirs on the same table). */
const OFF = { ...PACK, waitlist: undefined, careers: undefined, cohorts: undefined };
const now = new Date('2026-10-29T12:00:00Z');
const page = (qs = '') => new Request(`https://example.test/waitlist${qs}`);
const post = (fields, ip = '192.0.2.10') => new Request('https://example.test/waitlist', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip }, body: new URLSearchParams(fields).toString() });
const good = { email: 'ada.lovelace@example.test', feature: 'work', use_case: 'Summarising the weekly report for my team.', consent: 'yes' };
const join = (store, fields, ip, pack = ON) => waitlistRoute(post(fields, ip), {}, store, { pack, now });
const get = (path, env = {}, init = {}) => worker.fetch(new Request(`https://example.test${path}`, init), { ASSETS: { fetch: async () => new Response('', { status: 404 }) }, ...env });

test('a pack without a waitlist has no /waitlist, no admin view, no footer link and no hero doors', async () => {
  assert.equal(waitlistOn(OFF), false);
  assert.equal(waitlistOn({ ...PACK, waitlist: { features: [{ id: 'Bad Id', label: 'x' }] } }), false, 'malformed features do not count');
  const store = new MemoryStore();
  assert.equal((await waitlistRoute(page('?for=twin'), {}, store, { pack: OFF })).status, 404);
  assert.equal((await join(store, good, '192.0.2.1', OFF)).status, 404);
  assert.deepEqual(await store.waitlistExport(), [], 'nothing stored when the waitlist is off');
  assert.equal((await adminWaitlistRoute('/admin/waitlist', 'owner', store, { pack: OFF })).status, 404);
  assert.ok(!createHero({ call: { soon: 'Soon', waitlist: 'twin' }, tiles: [{ soon: true, waitlist: 'work', label: 'Work' }] }, OFF).includes('/waitlist'));
  const shell = layout({ title: 't', path: '/', body: '' });
  if (!waitlistOn() && !interestOn()) {
    assert.equal((await get('/waitlist')).status, 404);
    assert.equal((await get('/waitlist', {}, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(good).toString() })).status, 404);
    assert.ok(!shell.includes('href="/waitlist"'));
  } else {
    assert.equal((await get('/waitlist')).status, 200);
    if (waitlistOn()) assert.ok(shell.includes('<li><a href="/waitlist">Waitlist</a></li>'), 'the footer links it when the pack has one');
    else assert.ok(!shell.includes('href="/waitlist"'), 'Register interest alone adds no footer link');
  }
});

test('the form lists the pack\'s features, preselects ?for, and is not indexed', async () => {
  const res = await waitlistRoute(page('?for=work'), {}, new MemoryStore(), { pack: ON });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const html = await res.text();
  for (const f of FEATURES) assert.ok(html.includes(`<option value="${f.id}"`) && html.includes(f.label), f.id);
  assert.ok(html.includes('<option value="work" selected>'));
  assert.equal(html.match(/ selected>/g).length, 1);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /name="email" type="email"/);
  assert.match(html, /name="use_case"[^>]*maxlength="500"/);
  assert.ok(html.includes('Email me when this is ready. I can leave the list at any time at /waitlist/leave.'));
  assert.match(html, /<input type="checkbox" name="consent" value="yes" required>/);
  assert.match(html, /class="trap"[\s\S]*name="website"/, 'the honeypot is there');
  assert.ok(!(await (await waitlistRoute(page('?for=nope'), {}, new MemoryStore(), { pack: ON })).text()).includes(' selected>'), 'an unknown ?for preselects nothing');
  const withKey = await (await waitlistRoute(page(), { TURNSTILE_SITE_KEY: 'site-key' }, new MemoryStore(), { pack: ON })).text();
  assert.ok(withKey.includes('class="cf-turnstile" data-sitekey="site-key"'), 'the same human check as the submit form');
});

test('a post is checked: email, a known feature and consent are required, the use case is capped, the honeypot stores nothing', async () => {
  const store = new MemoryStore();
  for (const [fields, key] of [[{ ...good, email: 'not-an-email' }, 'email'], [{ ...good, email: '' }, 'email'], [{ ...good, feature: 'teleport' }, 'feature'], [{ ...good, consent: '' }, 'consent'], [{ ...good, use_case: 'x'.repeat(501) }, 'use_case']]) {
    assert.ok(validateWaitlist(fields, ON).errors[key], key);
    const res = await join(store, fields);
    assert.equal(res.status, 400, key);
    assert.match(await res.text(), /role="alert"/);
  }
  assert.deepEqual(await store.waitlistExport(), [], 'no row for a rejected post');
  const trap = await join(store, { ...good, website: 'https://spam.example' });
  assert.equal(trap.status, 200);
  assert.match(await trap.text(), /You are on the list/);
  assert.deepEqual(await store.waitlistExport(), [], 'a bot is thanked and forgotten');
  const ok = await join(store, { ...good, email: ' Ada.Lovelace@Example.TEST ' });
  assert.equal(ok.status, 200);
  const thanks = await ok.text();
  assert.match(thanks, /You are on the list/);
  assert.ok(thanks.includes('AI at work'), 'the thank-you names the feature');
  const rows = await store.waitlistExport();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'ada.lovelace@example.test');
  assert.equal(rows[0].feature, 'work');
  assert.equal((await store.waitlistLatest())[0].use_case, good.use_case);
  assert.equal((await waitlistRoute(post({ ...good, email: 'grace@example.test' }), { TURNSTILE_SECRET: 's' }, store, { pack: ON, now })).status, 400, 'with Turnstile on, a post without its token is refused');
  for (let i = 0; i < 5; i += 1) await join(store, { ...good, email: `person${i}@example.test` }, '192.0.2.99');
  const slow = await join(store, { ...good, email: 'one-too-many@example.test' }, '192.0.2.99');
  assert.equal(slow.status, 429, 'the same hourly limit per address as the submit form');
  assert.ok(!(await store.waitlistExport()).some((r) => r.email === 'one-too-many@example.test'));
});

test('joining twice is not an error and stores one row; another feature is another row', async () => {
  const store = new MemoryStore();
  const first = await join(store, good);
  const again = await join(store, { ...good, email: 'ADA.LOVELACE@example.test', use_case: 'Again.' });
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.match(await again.text(), /You are on the list/);
  assert.equal((await store.waitlistExport()).length, 1);
  assert.deepEqual(await store.waitlistCounts(), { work: 1 });
  await join(store, { ...good, feature: 'twin' });
  assert.deepEqual(await store.waitlistCounts(), { work: 1, twin: 1 });
});

test('an email is never shown on a public page, not even back to the person who typed it', async () => {
  const email = 'hidden.person@example.test';
  const shared = storeFor({});
  const thanks = await (await join(shared, { ...good, email })).text();
  const refused = await (await join(shared, { ...good, email, consent: '' }, '192.0.2.11')).text();
  assert.ok((await shared.waitlistExport()).some((r) => r.email === email), 'it was stored');
  const pages = [thanks, refused];
  for (const p of ['/', '/stories', '/about', '/opportunities', '/waitlist', '/waitlist?for=work', '/sitemap.xml', '/llms.txt', '/feed.xml', '/api/activity', '/api/stories']) {
    const res = await get(p);
    pages.push(await res.text());
  }
  for (const html of pages) assert.ok(!html.includes(email) && !html.includes('hidden.person'), 'no page carries the address');
  assert.ok(!(await (await get('/sitemap.xml')).text()).includes('/waitlist'), 'the waitlist is not in the sitemap');
});

test('the owner view needs the owner, masks addresses, counts per feature, and exports CSV to the owner only', async () => {
  assert.equal(maskEmail('rose@example.com'), 'r*@e*.com');
  assert.equal(maskEmail('nonsense'), '*');
  assert.equal(maskEmailsIn('Write to rose@example.com please'), 'Write to r*@e*.com please');
  const store = new MemoryStore();
  await join(store, { ...good, email: 'rose@example.com', use_case: 'My twin could answer bea@example.org on Fridays.' }, '192.0.2.20');
  await join(store, { ...good, email: 'cara@example.test', feature: 'twin', use_case: '' }, '192.0.2.21');
  await join(store, { ...good, email: '=cmd@example.test', feature: 'twin' }, '192.0.2.22');
  for (const path of ['/admin/waitlist', '/admin/waitlist.csv']) {
    const out = await adminWaitlistRoute(path, null, store, { pack: ON });
    assert.equal(out.status, 303, path);
    assert.equal(out.headers.get('location'), '/admin/login');
  }
  const res = await adminWaitlistRoute('/admin/waitlist', 'owner', store, { pack: ON });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('r*@e*.com') && html.includes('b*@e*.org'), 'addresses are masked, in the line and in the use case');
  assert.ok(!html.includes('rose@') && !html.includes('cara@') && !html.includes('bea@'), 'no address is whole');
  assert.match(html, /<td>AI at work<\/td><td>1<\/td>/);
  assert.match(html, /<td>Digital twin that joins your calls<\/td><td>2<\/td>/);
  assert.match(html, /<td>Build with AI<\/td><td>0<\/td>/);
  assert.ok(html.includes('href="/admin/waitlist.csv"'));
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  const csv = await adminWaitlistRoute('/admin/waitlist.csv', 'owner', store, { pack: ON });
  assert.match(csv.headers.get('content-type'), /^text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /^attachment; filename=".+-waitlist\.csv"$/);
  assert.equal(csv.headers.get('cache-control'), 'no-store');
  const text = await csv.text();
  assert.equal(text.split('\r\n')[0], 'email,feature,date');
  assert.ok(text.includes('"rose@example.com","work","'));
  assert.ok(text.includes('"\'=cmd@example.test"'), 'a cell a spreadsheet would run as a formula is defused');
  assert.ok(!text.includes('Fridays'), 'the export is email, feature and date only');
  assert.equal(waitlistCsv([]), 'email,feature,date\r\n');
  /* Through the Worker: closed without an owner door, 404 when the pack has no waitlist, the sign-in redirect otherwise. */
  assert.equal((await get('/admin/waitlist')).status, 404);
  const env = { ADMIN_TOKEN: 'letmein' };
  const anon = await get('/admin/waitlist', env);
  const owner = await get('/admin/waitlist.csv', env, { headers: { authorization: 'Bearer letmein' } });
  if (listsOn()) {
    assert.equal(anon.status, 303);
    assert.equal(anon.headers.get('location'), '/admin/login');
    assert.equal((await get('/admin/waitlist.csv', env, { headers: { authorization: 'Bearer wrong' } })).status, 303);
    assert.equal(owner.status, 200);
    assert.match(owner.headers.get('content-type'), /^text\/csv/);
    assert.ok((await (await get('/admin', env, { headers: { authorization: 'Bearer letmein' } })).text()).includes('href="/admin/waitlist"'), 'the admin links it');
  } else {
    assert.equal(anon.status, 404);
    assert.equal(owner.status, 404);
  }
});

test('the hero\'s coming-soon call card and soon tiles link to the waitlist when the pack has one', async () => {
  const cfg = { h1: 'Hi', call: { name: 'Twin', soon: 'Twins that join your calls' }, tiles: [{ label: 'Work', soon: true, waitlist: 'work' }, { label: 'Plain', soon: true }, { label: 'Live', href: '/stories', waitlist: 'code' }] };
  const html = createHero(cfg, ON);
  assert.ok(html.includes('href="/waitlist?for=twin"'), 'the call card defaults to twin');
  assert.ok(createHero({ ...cfg, call: { ...cfg.call, waitlist: 'code' } }, ON).includes('href="/waitlist?for=code">Join the waitlist</a></span>'));
  assert.ok(html.includes('href="/waitlist?for=work"'), 'a soon tile with a waitlist id links to it');
  assert.equal(html.match(/Join the waitlist/g).length, 2, 'not the soon tile without an id, not a live tile');
  assert.ok(!createHero({ ...cfg, call: { name: 'Live call' } }, ON).includes('for=twin'), 'a live call card has no waitlist link');
  if (waitlistOn() && PACK.create) {
    const home = await (await get('/')).text();
    if (PACK.create.call && PACK.create.call.soon) assert.ok(home.includes(`href="/waitlist?for=${PACK.create.call.waitlist || 'twin'}"`), 'the call card');
    for (const t of PACK.create.tiles || []) if (t.soon && t.waitlist) assert.ok(home.includes(`href="/waitlist?for=${t.waitlist}"`), t.label);
    for (const t of PACK.create.tiles || []) if (t.waitlist) assert.ok(waitlistFeatures().some((f) => f.id === t.waitlist), `tile ${t.label} names a feature the pack has`);
  }
});

test('leaving takes an address off every waitlist, and the page is the same whether or not it was on one', async () => {
  const { MemoryStore } = await import('../src/store.mjs');
  const { waitlistRoute } = await import('../src/pages/waitlist.mjs');
  const { PACK } = await import('../src/site.mjs');
  const pack = { ...PACK, waitlist: { features: [{ id: 'twin', label: 'Twin' }] } };
  const store = new MemoryStore();
  await store.joinWaitlist({ feature: 'twin', email: 'leaver@example.test', use_case: null, created_at: '2026-10-01T00:00:00Z', ip_hash: 'h' });
  const post = (email) => waitlistRoute(new Request('https://site.test/waitlist/leave', { method: 'POST', body: new URLSearchParams({ email }) }), {}, store, { pack });
  const a = await (await post('Leaver@example.test')).text();
  const b = await (await post('nobody@example.test')).text();
  assert.equal((await store.waitlistExport()).length, 0);
  assert.equal(a.replace(/<[^>]+>/g, ''), b.replace(/<[^>]+>/g, ''));
  assert.ok(!a.includes('leaver@example.test'));
});
