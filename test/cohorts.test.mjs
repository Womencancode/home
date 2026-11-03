import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/site.mjs';
import { cohortsConfig, eventbriteUrl, priceText, cohortEventRows } from '../src/cohorts.mjs';
import { challengeConfig, freeDaysOf, freeLine, DEFAULT_FREE_DAYS } from '../src/challenge.mjs';
import { cohortsPage, cohortsBlock } from '../src/pages/cohorts.mjs';
import { challengePage, challengeBlock } from '../src/pages/challenge.mjs';
import worker from '../src/worker.mjs';
import { interestFeatures } from '../src/interest.mjs';
import { waitlistRoute, adminWaitlistRoute } from '../src/pages/waitlist.mjs';
import { MemoryStore } from '../src/store.mjs';

const get = (path) => worker.fetch(new Request(`https://example.test${path}`), { ASSETS: { fetch: async () => new Response('', { status: 404 }) } });
const item = (over = {}) => ({ id: 'first', name: 'First cohort', for: 'Beginners.', about: 'We meet on calls.', starts: '', schedule: '', seats: null, eventbrite: '', ...over });
const days = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `Day title ${i + 1}`, build: `Thing ${i + 1}`, minutes: 30, link: 'https://example.org/unit', about: `Secret about ${i + 1}`, steps: [`Secret step ${i + 1}`] }));
const ON = { ...PACK, cohorts: { title: 'Live calls', price: { amount: 47, currency: 'GBP', per: 'month' }, notify: '/waitlist?for=live-calls', items: [item()], challenge: { title: 'Ten days', days: days(10) } } };
const BOOK = { ...PACK, cohorts: { ...ON.cohorts, booking: true } };
const OFF = { ...PACK, cohorts: undefined };

test('cohorts and the challenge are off unless the pack configures them, and stay off when switched off', () => {
  assert.equal(cohortsConfig(OFF), null);
  assert.equal(challengeConfig(OFF), null);
  assert.equal(cohortsConfig({ ...PACK, cohorts: { ...ON.cohorts, on: false } }), null);
  assert.equal(challengeConfig({ ...PACK, cohorts: { ...ON.cohorts, challenge: { ...ON.cohorts.challenge, on: false } } }), null);
  assert.equal(cohortsConfig({ ...PACK, cohorts: { items: [{ id: 'Bad Id', name: 'x' }] } }), null, 'malformed items do not count');
  assert.equal(cohortEventRows(OFF).length, 0);
});

test('a site without cohorts has no /cohorts or /challenge pages, footer links, sitemap or llms.txt entries', async () => {
  if (cohortsConfig() || challengeConfig()) return;
  assert.equal((await get('/cohorts')).status, 404);
  assert.equal((await get('/challenge')).status, 404);
  const home = await (await get('/')).text();
  assert.ok(!home.includes('href="/cohorts"') && !home.includes('href="/challenge"'));
  assert.ok(!(await (await get('/sitemap.xml')).text()).includes('/cohorts'));
  assert.ok(!(await (await get('/llms.txt')).text()).includes('/challenge'));
});

test('a site with cohorts serves /cohorts and lists it in the sitemap and llms.txt', async () => {
  const cfg = cohortsConfig();
  if (!cfg) return;
  const page = await (await get('/cohorts')).text();
  assert.ok(page.includes(cfg.items[0].name));
  if (cfg.booking) assert.ok(page.includes(`${cfg.price}</strong> <span class="cohort-paid">Paid securely through Eventbrite`));
  else {
    assert.ok(!/£|\$\d|€|a month|Eventbrite/.test(page), 'no price and no Eventbrite while booking is off');
    for (const i of cfg.items) assert.ok(page.includes(`href="/waitlist?for=cohort-${i.id}" data-interest="cohort-${i.id}">Register interest`), i.id);
  }
  assert.ok((await (await get('/sitemap.xml')).text()).includes('/cohorts</loc>'));
  assert.ok((await (await get('/llms.txt')).text()).includes('/cohorts'));
  if (challengeConfig()) {
    assert.equal((await get('/challenge')).status, 200);
    assert.ok((await (await get('/sitemap.xml')).text()).includes('/challenge</loc>'));
    assert.ok((await (await get('/llms.txt')).text()).includes('/challenge#day-1'));
  }
});

test('only https eventbrite links are accepted as a booking link', () => {
  for (const ok of ['https://www.eventbrite.co.uk/e/live-calls-tickets-123', 'https://eventbrite.com/e/x-1', 'https://www.eventbrite.ie/e/y']) assert.ok(eventbriteUrl(ok), ok);
  for (const bad of ['', 'http://www.eventbrite.co.uk/e/x', 'https://eventbrite.co.uk.evil.test/e/x', 'https://evil.test/?eventbrite.com', 'https://user:pw@www.eventbrite.com/e/x', 'javascript:alert(1)', 'https://www.eventbrite.com:8443/e/x', 'https://fakeeventbrite.com/e/x'])
    assert.equal(eventbriteUrl(bad), '', bad);
});

test('with booking on, the price is stated plainly: £47 a month, paid securely through Eventbrite', () => {
  assert.equal(priceText({ amount: 47, currency: 'GBP', per: 'month' }), '£47 a month');
  const html = cohortsPage(cohortsConfig(BOOK));
  assert.ok(html.includes('£47 a month</strong> <span class="cohort-paid">Paid securely through Eventbrite</span>'));
});

test('with booking on, a cohort with an empty or rejected link shows "Booking opens soon" with a link to be told, never a Join button', () => {
  for (const eventbrite of ['', 'https://evil.test/e/1']) {
    const html = cohortsPage(cohortsConfig({ ...PACK, cohorts: { ...BOOK.cohorts, items: [item({ eventbrite })] } }));
    assert.ok(html.includes('Booking opens soon'));
    assert.ok(html.includes('href="/waitlist?for=live-calls">Tell me when it opens'));
    assert.ok(!html.includes('Join on Eventbrite') && !html.includes('evil.test'));
  }
  const open = cohortsPage(cohortsConfig({ ...PACK, cohorts: { ...BOOK.cohorts, items: [item({ eventbrite: 'https://www.eventbrite.co.uk/e/first-123' })] } }));
  assert.ok(open.includes('href="https://www.eventbrite.co.uk/e/first-123"') && open.includes('Join on Eventbrite'));
  assert.ok(!open.includes('Booking opens soon'));
});

test('with booking on and without a notify path the "Tell me" link falls back to the submit form, and unknown dates read To be announced', () => {
  const html = cohortsPage(cohortsConfig({ ...PACK, cohorts: { ...BOOK.cohorts, notify: 'https://evil.test' } }));
  assert.ok(html.includes('href="/submit">Tell me when it opens'));
  assert.ok(html.includes('<dd>To be announced</dd>'));
  assert.ok(cohortsBlock(cohortsConfig(ON)).includes('href="/cohorts"'));
  assert.equal(cohortsBlock(null), '');
});

test('freeDays defaults to 1 and is one number from 0 to the number of days', () => {
  assert.equal(DEFAULT_FREE_DAYS, 1);
  assert.equal(challengeConfig(ON).freeDays, 1);
  for (const [v, want] of [[2, 2], [3, 3], [0, 0], [10, 10], [11, 1], [-1, 1], ['2', 1], [1.5, 1], [null, 1]]) assert.equal(freeDaysOf(v, 10), want, String(v));
  const three = challengeConfig({ ...PACK, cohorts: { ...ON.cohorts, challenge: { ...ON.cohorts.challenge, freeDays: 3 } } });
  assert.deepEqual(three.days.map((d) => d.free), [true, true, true, false, false, false, false, false, false, false]);
  assert.equal(freeLine(three), 'Days 1 to 3 are open to everyone; the rest open with the first wave.');
  assert.equal(freeLine(challengeConfig(ON)), 'Day 1 is open to everyone; the rest open with the first wave.');
  assert.equal(freeLine(challengeConfig(BOOK)), 'Day 1 is free for everyone.');
});

test('with booking on, free days are open in full; paid days show only title and outcome with "Continue the challenge"', () => {
  const cfg = challengeConfig({ ...PACK, cohorts: { ...BOOK.cohorts, challenge: { ...ON.cohorts.challenge, freeDays: 2 } } });
  const html = challengePage(cfg);
  for (const n of [1, 2]) assert.ok(html.includes(`Secret about ${n}`) && html.includes(`Secret step ${n}`), `day ${n} open`);
  for (const n of [3, 10]) {
    assert.ok(html.includes(`Day title ${n}`) && html.includes(`Thing ${n}`), `day ${n} names its outcome`);
    assert.ok(!html.includes(`Secret about ${n}<`) && !html.includes(`Secret step ${n}<`), `day ${n} is locked`);
  }
  assert.equal((html.match(/class="ch-day-continue"/g) || []).length, 8);
  assert.ok(html.includes('id="continue"') && html.includes('£47 a month</strong> <span class="cohort-paid">Paid securely through Eventbrite'));
  assert.ok(html.includes('Booking opens soon') && html.includes('href="/waitlist?for=live-calls">Tell me when it opens'), 'no link yet');
  assert.ok(html.includes('<dd>To be announced</dd>'), 'dates are not invented');
});

test('with booking on, the challenge continue button is only an https Eventbrite link', () => {
  const withLink = (eventbrite) => challengePage(challengeConfig({ ...PACK, cohorts: { ...BOOK.cohorts, challenge: { ...ON.cohorts.challenge, eventbrite } } }));
  assert.ok(withLink('https://www.eventbrite.co.uk/e/challenge-1').includes('href="https://www.eventbrite.co.uk/e/challenge-1" rel="noopener" target="_blank">Continue the challenge'));
  assert.ok(!withLink('https://evil.test/e/1').includes('evil.test'));
  const all = challengePage(challengeConfig({ ...PACK, cohorts: { ...ON.cohorts, challenge: { ...ON.cohorts.challenge, freeDays: 10 } } }));
  assert.ok(!all.includes('id="continue"'), 'nothing to continue when every day is free');
  assert.ok(challengeBlock(challengeConfig(ON)).includes('href="/challenge#day-10"'));
  assert.equal(challengeBlock(null), '');
});

test('booking is off by default: no price, no Eventbrite, and every cohort, the challenge and each locked day has Register interest', () => {
  const eb = { ...PACK, cohorts: { ...ON.cohorts, items: [item({ eventbrite: 'https://www.eventbrite.co.uk/e/first-123' })], challenge: { ...ON.cohorts.challenge, eventbrite: 'https://www.eventbrite.co.uk/e/ch-1' } } };
  const cfg = cohortsConfig(eb), ch = challengeConfig(eb);
  assert.equal(cfg.booking, false);
  assert.equal(cfg.price, '');
  assert.equal(cfg.items[0].eventbrite, '', 'the field is kept in config but not used');
  assert.equal(ch.price, '');
  assert.equal(ch.eventbrite, '');
  const pages = [cohortsPage(cfg), cohortsBlock(cfg), challengePage(ch), challengeBlock(ch)].join('\n');
  assert.ok(!/£|\$\d|€|a month|Eventbrite|eventbrite|paid|Paid/.test(pages), 'no money anywhere');
  assert.ok(pages.includes('href="/waitlist?for=cohort-first" data-interest="cohort-first">Register interest'));
  assert.ok(pages.includes('href="/waitlist?for=challenge" data-interest="challenge">Register interest'));
  for (const n of [2, 10]) assert.ok(pages.includes(`href="/waitlist?for=challenge-day-${n}" data-interest="challenge-day-${n}">Register interest`), `day ${n}`);
  assert.ok(!pages.includes('challenge-day-1"'), 'the open day needs no interest');
  assert.ok(!pages.includes('free for everyone'), 'nothing implies the rest is paid');
  assert.deepEqual(interestFeatures(eb).map((f) => f.id), ['cohort-first', 'challenge', ...Array.from({ length: 9 }, (_, i) => `challenge-day-${i + 2}`)]);
  assert.equal(cohortEventRows({ ...eb, cohorts: { ...eb.cohorts, items: [item({ starts: '2027-01-12' })] } })[0].summary, 'Beginners.');
});

test('Register interest stores the item key on the waitlist, and the owner sees counts and a masked list per item', async () => {
  const store = new MemoryStore();
  const post = (body) => new Request('https://example.test/waitlist', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '203.0.113.9' }, body: new URLSearchParams(body) });
  const form = await (await waitlistRoute(new Request('https://example.test/waitlist?for=challenge-day-3'), {}, store, { pack: ON })).text();
  assert.ok(form.includes('Register <em>interest</em>') && form.includes('value="challenge-day-3" selected'));
  assert.ok(!/£|Eventbrite/.test(form));
  const ok = await waitlistRoute(post({ email: 'Ada@Example.org', feature: 'cohort-first', consent: 'yes' }), {}, store, { pack: ON });
  assert.equal(ok.status, 200);
  await waitlistRoute(post({ email: 'grace@example.org', feature: 'challenge-day-3', consent: 'yes' }), {}, store, { pack: ON });
  const bad = await waitlistRoute(post({ email: 'x@example.org', feature: 'cohort-nope', consent: 'yes' }), {}, store, { pack: ON });
  assert.equal(bad.status, 400, 'an unknown key is refused');
  const trap = await waitlistRoute(post({ email: 'bot@example.org', feature: 'challenge', consent: 'yes', website: 'spam' }), {}, store, { pack: ON });
  assert.equal(trap.status, 200, 'the honeypot is thanked');
  assert.deepEqual(await store.waitlistCounts(), { 'cohort-first': 1, 'challenge-day-3': 1 });
  const admin = await (await adminWaitlistRoute('/admin/waitlist', 'owner', store, { pack: ON })).text();
  assert.ok(admin.includes('Registered interest') && admin.includes('<code>cohort-first</code>') && admin.includes('id="interest-challenge-day-3"'));
  assert.ok(admin.includes('a*@e*.org') && !admin.includes('ada@example.org'), 'masked on the page');
  const csv = await (await adminWaitlistRoute('/admin/waitlist.csv', 'owner', store, { pack: ON })).text();
  assert.ok(csv.includes('"ada@example.org","cohort-first"'));
});
