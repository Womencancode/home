import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PACK } from '../src/site.mjs';
import { COUNTRIES } from '../src/countries.mjs';
import { MemoryStore, D1Store, KINDS } from '../src/store.mjs';
import { careersConfig, careerOn, careersOn, careersNav, careersFooter, FOCUS } from '../src/careers.mjs';
import { validPay, payText, yearlyTop, boardJobs, jobFilters, jobProblems, validateJob, FRESH_DAYS } from '../src/jobs.mjs';
import { validateMentorOffer, validateMatchRequest, validMentor } from '../src/mentors.mjs';
import { roomsWithState, roomFeature } from '../src/rooms.mjs';
import { validateBounty, PAYMENT_NOTE, paymentFor, openBounties, rewardText } from '../src/bounties.mjs';
import { validateProfile, profilesOf, personSlug } from '../src/profiles.mjs';
import { careersRoute, adminCareersRoute, CAREER_BLOCKS } from '../src/pages/careers.mjs';
import { adminPage } from '../src/pages/admin.mjs';
import { catalogue } from '../src/content.mjs';
import { validate } from '../src/submissions.mjs';
import { searchAnswer } from '../src/ask.mjs';
import { sitemap, llms } from '../src/feeds.mjs';
import { layout, skinLink, skinsOf } from '../src/html.mjs';
import { waitlistRoute } from '../src/pages/waitlist.mjs';
import worker from '../src/worker.mjs';

const ROOMS = [{ id: 'engineering', name: 'Engineering', focus: 'Software', blurb: 'Engineers trading notes and referrals.' }, { id: 'design', name: 'Design', blurb: 'Designers swapping critique.', open: true }];
const ON = { ...PACK, careers: { title: 'Careers', nav: true, jobs: {}, mentors: {}, rooms: { list: ROOMS }, bounties: {}, profiles: {} } };
const OFF = { ...PACK, careers: undefined };
const now = new Date('2026-10-31T12:00:00Z');
/* A country every pack has: a single-country pack (womenintech) knows only its own. */
const HERE = (COUNTRIES.find((c) => c.code === 'GB') || COUNTRIES[0]).code;
const usd = (min, max, period = 'year') => ({ min, max, currency: 'USD', period });
const JOB = { id: 'job-example', title: 'Staff Engineer', organiser: 'Example Co', type: 'job', fields: ['engineering'], remote: true, eligibility: 'US based', countries: ['US'], prize: null, deadline: null, rolling: true, url: 'https://jobs.example.com/staff', checked: true, checkedOn: '2026-10-31', pay: usd(180000, 220000), employment: 'full-time', workplace: 'remote', location: 'Remote, US', featured: false };
const form = (path, fields, ip = '192.0.2.40') => new Request(`https://example.test${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip }, body: new URLSearchParams(fields).toString() });
const route = (req, store, opts = {}) => careersRoute(req, {}, store, { pack: ON, now, catalogue: async () => catalogue(opts.approved ? opts.approved() : []), ...opts });
const page = (path) => new Request(`https://example.test${path}`);
const approve = async (store, id) => { await store.review(id, 'approved', null, now.toISOString()); return store.approved(); };

test('careers are off unless the pack turns them on: every route is a 404, and there is no door anywhere', async () => {
  assert.equal(careersConfig(OFF), null);
  assert.equal(careersOn(OFF), false);
  assert.deepEqual(careersNav(OFF), []);
  assert.deepEqual(careersFooter(OFF), { explore: [], takePart: [] });
  const store = new MemoryStore();
  for (const p of ['/careers', '/jobs', '/jobs/post', '/mentors', '/mentors/request', '/mentors/offer', '/rooms', '/rooms/engineering', '/bounties', '/bounties/post', '/bounties/c-1', '/talent/add', '/talent/someone']) {
    assert.equal((await careersRoute(page(p), {}, store, { pack: OFF, now })).status, 404, p);
  }
  assert.equal((await careersRoute(form('/jobs/post', { title: 'x' }), {}, store, { pack: OFF, now })).status, 404);
  assert.equal(await careersRoute(page('/talent'), {}, store, { pack: OFF }), null, 'the talent directory is not a career route');
  assert.equal(await careersRoute(page('/stories'), {}, store, { pack: OFF }), null);
  assert.equal((await store.stats()).pending, undefined, 'nothing stored');
  for (const p of ['/admin/rooms', '/admin/verify']) assert.equal((await adminCareersRoute(page(p), 'owner', store, { pack: OFF })).status, 404, p);
  for (const b of Object.values(CAREER_BLOCKS)) assert.equal(b({ cat: catalogue([]), now, pack: OFF }), '', 'no home block');
  const k = { on: { jobs: false, mentors: false, rooms: false, bounties: false, profiles: false }, jobs: [JOB], mentors: [], rooms: [], bounties: [], profiles: [] };
  assert.equal(searchAnswer('any jobs for designers', { careers: k }).results.some((r) => r.href === '/jobs'), false, 'Ask does not lead to an off page');
  if (!careersOn()) {
    const shell = layout({ title: 't', path: '/', body: '' });
    for (const href of ['/careers', '/jobs', '/mentors', '/rooms', '/bounties', '/talent/add']) assert.ok(!shell.includes(`href="${href}"`), href);
    for (const p of ['/jobs', '/mentors', '/rooms', '/bounties', '/careers']) assert.equal((await worker.fetch(page(p), {})).status, 404, p);
    const map = await (await worker.fetch(page('/sitemap.xml'), {})).text();
    assert.ok(!/\/(jobs|mentors|rooms|bounties|careers)</.test(map));
    assert.ok(!/\/jobs\)|\/mentors\)|\/bounties\)/.test(await (await worker.fetch(page('/llms.txt'), {})).text()));
  }
});

test('with careers on, the nav stays short: one hub entry unless a feature asks for its own', () => {
  assert.deepEqual(careersNav(ON), [['/careers', 'Careers']]);
  assert.deepEqual(careersNav({ ...ON, careers: { ...ON.careers, nav: false, jobs: { nav: true } } }), [['/jobs', 'Jobs']]);
  const f = careersFooter(ON);
  assert.deepEqual(f.explore.map(([h]) => h), ['/careers', '/jobs', '/mentors', '/rooms', '/bounties']);
  assert.deepEqual(f.takePart.map(([h]) => h), ['/jobs/post', '/mentors/offer', '/bounties/post', '/talent/add']);
  assert.equal(careersConfig({ ...ON, careers: { rooms: { list: [{ id: 'Bad Id', name: 'x', blurb: 'y' }] } } }).rooms, null, 'malformed rooms do not switch rooms on');
  assert.deepEqual(careersConfig({ ...ON, careers: { mentors: { focus: ['legal', 'nope'] } } }).mentors.focus, ['legal']);
});

test('a pay band reads plainly, compares per year, and is required for a job to be listed', () => {
  assert.equal(payText(usd(150000, 190000)), '$150,000 to $190,000 a year');
  assert.equal(payText({ min: 45.5, max: 60, currency: 'GBP', period: 'hour' }), '£45.50 to £60.00 an hour');
  assert.equal(payText(usd(900, 900, 'day')), '$900 a day');
  for (const bad of [null, {}, usd(0, 10), usd(20, 10), { ...usd(1, 2), currency: 'usd' }, { ...usd(1, 2), period: 'week' }, usd(1.234, 2)]) assert.equal(validPay(bad), false, JSON.stringify(bad));
  assert.equal(yearlyTop(usd(800, 1000, 'day')), 260000);
  assert.equal(yearlyTop(usd(50, 80, 'hour')), 166400);
  assert.deepEqual(jobProblems(JOB), []);
  assert.ok(jobProblems({ ...JOB, pay: null }).some((p) => p.startsWith('pay')));
  assert.ok(jobProblems({ ...JOB, url: 'http://jobs.example.com/x' }).some((p) => p.startsWith('url')));
  assert.ok(jobProblems({ ...JOB, checkedOn: undefined }).some((p) => p.startsWith('checkedOn')));
  assert.ok(jobProblems({ ...JOB, title: 'Staff \u2014 Engineer' }).includes('em dash'));
});

test('the board filters by pay at least, type and workplace; featured first; stale, closed and unpaid jobs are left out', () => {
  const items = [
    JOB,
    { ...JOB, id: 'job-day', title: 'Fractional CFO', pay: usd(900, 1200, 'day'), employment: 'fractional', workplace: 'hybrid' },
    { ...JOB, id: 'job-gbp', title: 'Designer', pay: { min: 50000, max: 65000, currency: 'GBP', period: 'year' }, workplace: 'onsite' },
    { ...JOB, id: 'job-featured', title: 'Product Lead', pay: usd(120000, 150000), featured: true },
    { ...JOB, id: 'job-no-pay', pay: undefined },
    { ...JOB, id: 'job-stale', checkedOn: '2026-08-01' },
    { ...JOB, id: 'job-closed', deadline: '2026-10-01' },
    { id: 'a-grant', type: 'grant', title: 'A grant', rolling: true },
  ];
  assert.deepEqual(boardJobs(items, {}, now).map((o) => o.id), ['job-featured', 'job-gbp', 'job-day', 'job-example'], 'featured first, then by title for the same checked day');
  assert.deepEqual(boardJobs(items, { pay: 200000, currency: 'USD' }, now).map((o) => o.id), ['job-day', 'job-example'], 'a day rate is compared over a year');
  assert.deepEqual(boardJobs(items, { pay: 60000, currency: 'GBP' }, now).map((o) => o.id), ['job-gbp']);
  assert.deepEqual(boardJobs(items, { type: 'fractional' }, now).map((o) => o.id), ['job-day']);
  assert.deepEqual(boardJobs(items, { where: 'onsite' }, now).map((o) => o.id), ['job-gbp']);
  assert.deepEqual(jobFilters(new URLSearchParams('pay=150,000&currency=gbp&type=contract&where=moon')), { pay: 150000, currency: 'GBP', type: 'contract', where: '' });
  assert.ok(FRESH_DAYS >= 30);
});

test('/jobs shows the pay, the badge, the employer link and the checked date; the filter narrows it', async () => {
  const items = [JOB, { ...JOB, id: 'job-hybrid', title: 'Data Lead', workplace: 'hybrid', pay: usd(100000, 120000) }];
  const { jobsPage } = await import('../src/pages/jobs.mjs');
  const html = jobsPage(new URLSearchParams(), items, now);
  assert.ok(html.includes('$180,000 to $220,000 a year') && html.includes('Pay shown'));
  assert.ok(html.includes('href="https://jobs.example.com/staff"'));
  assert.ok(html.includes('Checked 31 Oct 2026 on the employer\'s own posting.'));
  assert.ok(html.includes('does not mean the employer has endorsed'));
  const narrowed = jobsPage(new URLSearchParams('where=hybrid'), items, now);
  assert.ok(narrowed.includes('Data Lead') && !narrowed.includes('Staff Engineer</a>'));
  assert.ok(jobsPage(new URLSearchParams(), [], now).includes('No jobs are listed right now.'), 'an honest empty state');
  assert.ok(!/\u2014/.test(html));
});

test('a posted job needs a real band and the employer\'s https posting; approved, it joins the board dated by the moderator', async () => {
  const good = { title: 'Senior Product Designer', employer: 'Example Studio', country: HERE, pay_min: '6,000,000', pay_max: '9000000', currency: 'ngn', period: 'year', employment: 'full-time', workplace: 'hybrid', field: 'design', url: 'https://example.com/careers/designer', summary: 'Lead design on a payments app used across West Africa, with a small kind team.', pay_consent: 'yes' };
  assert.equal(validateJob(good, now).ok, true, JSON.stringify(validateJob(good, now).errors));
  for (const [change, key] of [[{ pay_min: '' }, 'pay'], [{ pay_min: '10', pay_max: '5' }, 'pay'], [{ currency: 'naira' }, 'currency'], [{ url: 'http://example.com/x' }, 'url'], [{ employment: 'gig' }, 'employment'], [{ pay_consent: '' }, 'pay_consent'], [{ deadline: '2026-01-01' }, 'deadline']]) assert.ok(validateJob({ ...good, ...change }, now).errors[key], key);
  const store = new MemoryStore();
  const res = await route(form('/jobs/post', good), store);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /in the queue/);
  const [row] = await store.byStatus('pending');
  assert.deepEqual([row.kind, row.category, JSON.parse(row.details).pay], ['opportunity', 'job', { min: 6000000, max: 9000000, currency: 'NGN', period: 'year' }]);
  assert.ok(!(await (await route(page('/jobs'), store, { approved: () => [] })).text()).includes('Senior Product Designer'), 'pending is not public');
  const approved = await approve(store, row.id);
  const board = await (await route(page('/jobs'), store, { approved: () => approved })).text();
  assert.ok(board.includes('Senior Product Designer') && board.includes('to NGN') && board.includes('Checked 31 Oct 2026 on the posting, by a moderator.'));
  const bad = await route(form('/jobs/post', { ...good, pay_min: '' }), store);
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /role="alert"/);
});

test('mentors: an offer needs consent, a focus and a public page, and never shows the email; seed mentors must have opted in', async () => {
  const offer = { name: 'Ada Example', role: 'Staff engineer at a bank', country: HERE, focus_product: 'yes', 'focus_staff-engineering': 'yes', about: 'I help engineers get from senior to staff without losing themselves.', url: 'https://example.com/ada', submitter_email: 'ada@example.test', mentor_consent: 'yes' };
  const v = validateMentorOffer(offer);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.deepEqual(v.value.details.focus, ['staff-engineering', 'product']);
  for (const [change, key] of [[{ mentor_consent: '' }, 'mentor_consent'], [{ focus_product: '', 'focus_staff-engineering': '' }, 'focus'], [{ url: '' }, 'url'], [{ submitter_email: '' }, 'submitter_email'], [{ about: 'Write to me at ada@example.test for help with staff promotions.' }, 'about']]) assert.ok(validateMentorOffer({ ...offer, ...change }).errors[key], key);
  assert.equal(validMentor({ id: 'ada', name: 'Ada', focus: ['product'], country: HERE, url: 'https://example.com', optedIn: false }), false, 'no opt-in, no listing');
  const store = new MemoryStore();
  assert.equal((await route(form('/mentors/offer', offer), store)).status, 200);
  const [row] = await store.byStatus('pending');
  const approved = await approve(store, row.id);
  const html = await (await route(page('/mentors'), store, { approved: () => approved })).text();
  assert.ok(html.includes('Ada Example') && html.includes('Staff+ engineering') && html.includes('Request a match'));
  assert.ok(!html.includes('ada@example.test'), 'the email is never shown');
  const empty = await (await route(page('/mentors'), new MemoryStore())).text();
  assert.ok(empty.includes('No mentors are listed yet') && empty.includes('href="/mentors/offer"') && empty.includes('six sessions over six months'));
});

test('a request for a match is private: stored for the owner, shown in admin, never on a public page even once approved', async () => {
  const ask = { name: 'Kofi Example', submitter_email: 'kofi.private@example.test', country: HERE, focus: 'career-switch', now: 'Teacher of ten years, good at explaining hard things.', next: 'A first job in product management within a year.', blocker: 'No one in my network works in tech, and I do not know where to start.', match_consent: 'yes' };
  assert.equal(validateMatchRequest(ask).ok, true, JSON.stringify(validateMatchRequest(ask).errors));
  for (const k of ['now', 'next', 'blocker', 'match_consent', 'submitter_email']) assert.ok(validateMatchRequest({ ...ask, [k]: '' }).errors[k], k);
  const store = new MemoryStore();
  const res = await route(form('/mentors/request', ask), store);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /A person reads every one/);
  const [row] = await store.byStatus('pending');
  assert.equal(row.kind, 'mentee');
  const admin = adminPage(await store.byStatus('pending'), await store.stats(), 'pending');
  assert.ok(admin.includes('mentorship request (private)') && admin.includes('No one in my network works in tech'));
  const approved = await approve(store, row.id);
  const cat = catalogue(approved);
  assert.ok(![...cat.stories, ...cat.works, ...cat.talentRows, ...cat.mentors, ...cat.opportunities].some((x) => JSON.stringify(x).includes('Kofi')), 'not in any public list');
  for (const p of ['/mentors', '/careers', '/talent/kofi-example']) assert.ok(!(await (await route(page(p), store, { approved: () => approved })).text()).includes('Kofi'), p);
  assert.ok(!validate({ kind: 'mentee', country: HERE, title: 'Sneaky', summary: 'x'.repeat(50), consent: 'yes' }, now).ok, 'the general form cannot send a career kind');
});

test('rooms show "Opening soon" until opened; request access goes on the room\'s own list; the owner opens a room', async () => {
  assert.deepEqual(roomsWithState(null, ON).map((r) => r.open), [false, true]);
  assert.deepEqual(roomsWithState({ engineering: true, design: false }, ON).map((r) => r.open), [true, false]);
  const store = new MemoryStore();
  const list = await (await route(page('/rooms'), store)).text();
  assert.ok(list.includes('Opening soon') && list.includes('Engineering') && list.includes('href="/rooms/engineering"'));
  assert.ok(!/\d+\s*(members|people)/i.test(list), 'no member counts');
  assert.equal((await route(page('/rooms/nope'), store)).status, 404);
  const req = await route(form('/rooms/engineering', { feature: roomFeature('engineering'), email: 'zara@example.test', use_case: 'Backend engineer, happy to share interview notes.', consent: 'yes' }), store);
  assert.equal(req.status, 200);
  assert.match(await req.text(), /We will email you when it opens/);
  assert.deepEqual(await store.waitlistCounts(), { 'room-engineering': 1 });
  const wrongRoom = await route(form('/rooms/engineering', { feature: roomFeature('design'), email: 'x@example.test', consent: 'yes' }), store, {});
  assert.equal(wrongRoom.status, 400, 'a room only takes its own list');
  assert.equal((await adminCareersRoute(page('/admin/rooms'), null, store, { pack: ON })).status, 303, 'sign in first');
  const panel = await (await adminCareersRoute(page('/admin/rooms'), 'owner', store, { pack: ON })).text();
  assert.ok(panel.includes('1 asked to join') && panel.includes('Open this room'));
  const open = await adminCareersRoute(new Request('https://example.test/admin/rooms', { method: 'POST', body: new URLSearchParams({ id: 'engineering', open: '1' }) }), 'owner', store, { pack: ON });
  assert.equal(open.status, 303);
  assert.ok((await (await route(page('/rooms/engineering'), store)).text()).includes('<span class="room-state is-open">Open</span>'));
  const left = await waitlistRoute(new Request('https://example.test/waitlist/leave', { method: 'POST', body: new URLSearchParams({ email: 'zara@example.test' }) }), {}, store, { pack: { ...ON, waitlist: undefined } });
  assert.equal(left.status, 200, 'people can leave a room list even when the pack has no waitlist');
  assert.deepEqual(await store.waitlistCounts(), {});
});

test('bounties: a sponsor brief with reward, skills and deadline; payment is null and the page says it is arranged with the sponsor', async () => {
  const brief = { title: 'Map of Black-owned bookshops in London', sponsor: 'Example Books', url: 'https://books.example.com', country: HERE, reward: '1,500', currency: 'gbp', skills: 'Research, Mapping, Writing', deadline: '2026-12-15', summary: 'Find and verify every Black-owned bookshop in London, with address, hours and a short note on each.', submitter_email: 'sponsor@example.test', sponsor_consent: 'yes' };
  const v = validateBounty(brief, now);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.deepEqual(v.value.details, { reward: { amount: 1500, currency: 'GBP' }, skills: ['Research', 'Mapping', 'Writing'], payment: null });
  for (const [change, key] of [[{ reward: 'lots' }, 'reward'], [{ skills: '' }, 'skills'], [{ deadline: '2026-10-01' }, 'deadline'], [{ url: 'http://books.example.com' }, 'url'], [{ sponsor_consent: '' }, 'sponsor_consent']]) assert.ok(validateBounty({ ...brief, ...change }, now).errors[key], key);
  assert.equal(paymentFor({}), null);
  assert.equal(rewardText({ amount: 1500, currency: 'GBP' }), '£1,500');
  const store = new MemoryStore();
  assert.equal((await route(form('/bounties/post', brief), store)).status, 200);
  const [row] = await store.byStatus('pending');
  const approved = await approve(store, row.id);
  const cat = () => approved;
  const list = await (await route(page('/bounties'), store, { approved: cat })).text();
  assert.ok(list.includes('£1,500') && list.includes('Mapping') && list.includes(PAYMENT_NOTE));
  const id = `c-${row.id}`;
  const one = await route(page(`/bounties/${id}`), store, { approved: cat });
  assert.equal(one.status, 200);
  assert.ok((await one.text()).includes('does not hold or send the reward'));
  const interest = await route(form(`/bounties/${id}`, { feature: `bounty-${id}`, email: 'maker@example.test', use_case: 'I mapped bookshops in Leeds last year.', consent: 'yes' }), store, { approved: cat });
  assert.equal(interest.status, 200);
  assert.deepEqual(await store.waitlistCounts(), { [`bounty-${id}`]: 1 });
  assert.equal(openBounties(catalogue(approved).bounties, new Date('2027-01-01T00:00:00Z')).length, 0, 'past its deadline it is gone');
  assert.ok(!(await (await route(page(`/bounties/${id}`), store, { approved: cat })).text()).includes('maker@example.test'));
});

test('proof-of-work profiles: a portfolio, a shareable page, and Verified only after an owner marks every entry', async () => {
  const profile = { name: 'Amaka Example', headline: 'Brand designer for food companies', country: HERE, about: 'I design packaging and identities for small food brands across West Africa.', p1_title: 'Packaging for a pepper sauce', p1_what: 'Identity, labels and the launch poster.', p1_link: 'https://example.com/pepper', p1_ref: 'c-7', profile_consent: 'yes' };
  const v = validateProfile(profile);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(validateProfile({ ...profile, p1_link: 'http://example.com' }).errors.p1 !== undefined, true, 'items link over https');
  assert.ok(validateProfile({ ...profile, p1_title: '', p1_what: '', p1_link: '' }).errors.p1, 'at least one piece of work');
  assert.equal(personSlug('Amaka Ẹ́xample'), 'amaka-example');
  const store = new MemoryStore();
  assert.equal((await route(form('/talent/add', profile), store)).status, 200);
  const [row] = await store.byStatus('pending');
  let approved = await approve(store, row.id);
  const at = async () => (await route(page('/talent/amaka-example'), store, { approved: () => approved })).text();
  let html = await at();
  assert.ok(html.includes('Packaging for a pepper sauce') && html.includes('href="/bounties/c-7"') && html.includes('Not verified yet'));
  assert.ok(!html.includes('verified-badge'), 'no badge until an owner checks');
  assert.equal((await adminCareersRoute(new Request('https://example.test/admin/verify', { method: 'POST', body: new URLSearchParams({ id: String(row.id), verified: '1' }) }), null, store, { pack: ON })).status, 401);
  assert.equal((await adminCareersRoute(new Request('https://example.test/admin/verify', { method: 'POST', body: new URLSearchParams({ id: String(row.id), verified: '1' }) }), 'owner@example.test', store, { pack: ON, now })).status, 303);
  approved = await store.approved();
  html = await at();
  assert.ok(html.includes('verified-badge') && html.includes('✓</span> Verified'));
  await store.insert({ ...validateProfile({ ...profile, p1_title: 'A second piece', p1_link: 'https://example.com/two' }).value, ip_hash: 'x', created_at: now.toISOString() });
  await store.review(2, 'approved', null, now.toISOString());
  approved = await store.approved();
  assert.ok(!(await at()).includes('verified-badge'), 'a new unverified entry under the same name takes the badge away until checked');
  assert.equal(profilesOf(catalogue(approved)).find((p) => p.slug === 'amaka-example').portfolio.length, 2);
  assert.equal((await route(page('/talent/nobody'), store, { approved: () => approved })).status, 404);
  const admin = adminPage(await store.byStatus('approved'), await store.stats(), 'approved');
  if (careerOn('profiles')) assert.ok(admin.includes('action="/admin/verify"'));
});

test('Ask routes jobs, mentor, bounty and room questions to their pages when they are on', () => {
  const k = { on: { jobs: true, mentors: true, rooms: true, bounties: true, profiles: true }, jobs: [JOB, { ...JOB, id: 'job-design', title: 'Product Designer', organiser: 'Studio' }], mentors: [], rooms: roomsWithState(null, ON), bounties: [{ id: 'c-3', title: 'Bookshop map', sponsor: 'Example Books', skills: ['Research'], summary: 'Map them.' }], profiles: [] };
  const lead = (q) => searchAnswer(q, { careers: k, now }).results;
  assert.equal(lead('any design jobs?')[0].href, '/jobs');
  assert.equal(lead('any design jobs?')[1].title, 'Product Designer', 'the matching job comes next');
  assert.equal(lead('can I get a mentor for fundraising')[0].href, '/mentors');
  assert.equal(lead('open bounties for researchers')[0].href, '/bounties');
  assert.equal(lead('open bounties for researchers')[1].href, '/bounties/c-3');
  assert.equal(lead('is there a room for designers')[0].href, '/rooms');
  assert.ok(!lead('what is on in London this week').some((r) => r.href === '/jobs'), 'other questions are left alone');
});

test('the sitemap and llms.txt carry the career pages only when they are on', () => {
  const k = { on: { jobs: true, mentors: true, rooms: true, bounties: true, profiles: true }, jobs: [JOB], mentors: [], rooms: roomsWithState(null, ON), bounties: [{ id: 'c-3', title: 'Bookshop map', sponsor: 'Example Books', reward: { amount: 100, currency: 'USD' }, skills: [], deadline: '2026-12-01', postedOn: '2026-10-31' }], profiles: [{ slug: 'amaka-example', portfolio: [{}] }] };
  const cat = catalogue([]);
  return (async () => {
    const map = await sitemap(cat, [], [], k).text();
    for (const p of ['/careers', '/jobs', '/mentors', '/rooms', '/rooms/engineering', '/bounties', '/bounties/c-3', '/talent/amaka-example']) assert.ok(map.includes(`${p}</loc>`), p);
    const off = await sitemap(cat, [], [], { ...k, on: { jobs: false, mentors: false, rooms: false, bounties: false, profiles: false } }).text();
    assert.ok(!off.includes('/careers</loc>'));
    const txt = await llms(cat, [], [], k).text();
    assert.ok(txt.includes('/jobs)') && txt.includes('## Jobs that show the pay') && txt.includes('$180,000 to $220,000 a year, checked 2026-10-31') && txt.includes('## Open bounties'));
  })();
});

test('the D1 store runs every migration, keeps career details and the verified mark, and takes the new kinds', { skip: !(await import('node:sqlite').catch(() => null)) && 'node:sqlite is not available' }, async () => {
  const sqlite = await import('node:sqlite');
  const db = new sqlite.DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const m of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(m, dir), 'utf8'));
  const wrap = (sql, args = []) => ({ bind: (...a) => wrap(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } });
  const store = new D1Store({ prepare: (sql) => wrap(sql), batch: async (s) => Promise.all(s.map((x) => x.run())) });
  for (const kind of ['mentor', 'mentee', 'bounty']) assert.ok(KINDS.includes(kind));
  const v = validateBounty({ title: 'Bookshop map', sponsor: 'Example Books', url: 'https://books.example.com', country: HERE, reward: '100', currency: 'USD', skills: 'Research', deadline: '2026-12-01', summary: 'Find and verify every Black-owned bookshop in London, with a note on each.', submitter_email: 's@example.test', sponsor_consent: 'yes' }, now).value;
  const id = await store.insert({ ...v, ip_hash: 'h', created_at: now.toISOString() });
  const p = validateProfile({ name: 'Amaka Example', headline: 'Designer', country: HERE, about: 'I design packaging and identities for small food brands.', p1_title: 'Pepper sauce', p1_what: 'Identity and labels.', p1_link: 'https://example.com/p', profile_consent: 'yes' }).value;
  const pid = await store.insert({ ...p, ip_hash: 'h', created_at: now.toISOString() });
  const plain = await store.insert({ ...validate({ kind: 'story', country: HERE, title: 'A good thing', summary: 'A library opened in Kumasi with books in Twi and English for every age.', consent: 'yes' }, now).value, created_at: now.toISOString(), ip_hash: 'h' });
  for (const x of [id, pid, plain]) await store.review(x, 'approved', null, now.toISOString());
  assert.equal(await store.setVerified(pid, true, 'owner@example.test', now.toISOString()), true);
  const cat = catalogue(await store.approved());
  assert.deepEqual(cat.bounties[0].reward, { amount: 100, currency: 'USD' });
  assert.equal(cat.bounties[0].payment, null);
  assert.equal(cat.talentRows[0].verified, true);
  assert.equal(cat.talentRows[0].portfolio[0].title, 'Pepper sauce');
  assert.ok(cat.stories.some((x) => x.title === 'A good thing'), 'an older kind still stores without details');
  assert.throws(() => db.exec("INSERT INTO submissions (kind, country, title, summary, created_at) VALUES ('nonsense', 'GB', 't', 's', 'now')"), 'the kind check still holds');
});

test('a skin variant is opt-in: listed in "skins", switched on only by "skin", previewed with ?skin=', async () => {
  assert.equal(skinLink({ ...PACK, skins: ['emerald'], skin: undefined }), '');
  assert.equal(skinLink({ ...PACK, skins: ['emerald'], skin: 'ruby' }), '', 'only a listed skin');
  assert.match(skinLink({ ...PACK, skins: ['emerald'], skin: 'emerald' }), /href="\/skins\/emerald\.css"/);
  const skins = skinsOf();
  const home = await (await worker.fetch(page(`/about?skin=${skins[0] || 'none'}`), {})).text();
  if (skins.length) assert.ok(home.includes(`href="/skins/${skins[0]}.css"`), 'the preview adds the variant');
  else assert.ok(!home.includes('/skins/'), 'a pack with no skins never links one');
  const plain = await (await worker.fetch(page('/about'), {})).text();
  assert.equal(plain.includes('/skins/'), skinsOf().includes(PACK.skin), 'the live look changes only when the pack says so');
});

test('the focus areas are the ones the founder named', () => {
  assert.deepEqual(FOCUS, ['fundraising', 'staff-engineering', 'product', 'design', 'finance', 'legal', 'founders', 'career-switch']);
});
