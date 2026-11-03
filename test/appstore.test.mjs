import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/site.mjs';
import { MemoryStore } from '../src/store.mjs';
import { checkApp, privateHost, publicHttps, deriveListing, appStoreOn, appStoreConfig, termsConfig, mustEscalate, cofounderAgent, validateStep, AI_LABEL, AI_NOTE, FOUNDER_WILL_REPLY, PAGE_CAP } from '../src/appstore.mjs';
import { appsRoute, adminAppsRoute } from '../src/pages/apps.mjs';
import { searchAnswer } from '../src/ask.mjs';
import { layout } from '../src/html.mjs';
import worker from '../src/worker.mjs';

const CATS = [{ id: 'productivity', label: 'Productivity' }, { id: 'money', label: 'Money' }, { id: 'other', label: 'Other' }];
const ON = { ...PACK, appStore: { title: 'App store', lead: 'Apps made here.', categories: CATS, nav: true, terms: { cofounder: { offered: true, equity: null, vesting: null }, revenueShare: { offered: true, basis: null, split: null } } } };
const OFF = { ...PACK, appStore: undefined };
const now = new Date('2026-10-30T12:00:00Z');
const ORIGIN = 'https://ledger.example.com';

const MANIFEST = { id: '/', name: 'Ledger Lite', short_name: 'Ledger', description: 'Invoices and receipts for freelancers, in one tidy place.', start_url: '/app/', scope: '/', display: 'standalone', theme_color: '#123456', background_color: '#ffffff', categories: ['finance', 'productivity'],
  icons: [{ src: 'icons/192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/512.png', sizes: '512x512', type: 'image/png' }, { src: '/icons/mask.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: 'data:image/png;base64,AAAA', sizes: '64x64' }, { src: 'javascript:alert(1)', sizes: '32x32' }],
  screenshots: [{ src: '/shots/phone.png', sizes: '1080x1920', form_factor: 'narrow', label: 'The home screen' }] };
const PAGE = '<!doctype html><html><head><title>Ledger Lite</title><meta name="theme-color" content="#123456"><link rel="manifest" href="/manifest.webmanifest"></head><body><script src="/main.js" defer></script></body></html>';

/** A stubbed web: `site` maps a full URL to a body string, a { status, headers, body } or a function. Every call is recorded. */
function web(site) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push(url);
    if (init.redirect !== 'manual' && !String(url).includes('/ai')) throw Error('checkApp must follow redirects by hand');
    const hit = typeof site === 'function' ? site(url, init) : site[url];
    if (hit === undefined) return new Response('not found', { status: 404 });
    const r = typeof hit === 'function' ? hit(init) : hit;
    if (r instanceof Response) return r;
    return typeof r === 'string' ? new Response(r, { status: 200 }) : new Response(r.body ?? '', { status: r.status || 200, headers: r.headers || {} });
  };
  return { fetcher, calls };
}
const goodSite = (manifest = MANIFEST, page = PAGE) => ({ [`${ORIGIN}/`]: page, [`${ORIGIN}/manifest.webmanifest`]: () => JSON.stringify(typeof manifest === 'function' ? manifest() : manifest), [`${ORIGIN}/main.js`]: "addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));" });
const item = (r, id) => r.items.find((i) => i.id === id);

test('only public https addresses are checked; nothing is fetched for http, private or local hosts', async () => {
  for (const bad of ['http://ledger.example.com/', 'ftp://ledger.example.com/', 'https://localhost/', 'https://app.localhost/', 'https://127.0.0.1/', 'https://10.1.2.3/', 'https://172.20.0.1/', 'https://192.168.1.10/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://[fd00::1]/', 'https://[::ffff:127.0.0.1]/', 'https://intranet/', 'https://printer.local/', 'https://ledger.example.com:8443/', 'https://user:pw@ledger.example.com/', 'not a url', '']) {
    const { fetcher, calls } = web({});
    const r = await checkApp(bad, fetcher, { now });
    assert.equal(r.ok, false, bad);
    assert.equal(item(r, 'https').ok, false, bad);
    assert.ok(r.error, `${bad} says why`);
    assert.equal(calls.length, 0, `${bad} was not fetched`);
  }
  assert.equal(privateHost('ledger.example.com'), false);
  assert.equal(privateHost('8.8.8.8'), false);
  assert.equal(publicHttps('https://ledger.example.com/x#y').url.href, 'https://ledger.example.com/x');
  const { fetcher, calls } = web({ [`${ORIGIN}/`]: { status: 302, headers: { location: 'http://127.0.0.1/admin' } } });
  const r = await checkApp(`${ORIGIN}/`, fetcher, { now });
  assert.equal(r.ok, false, 'a redirect to a private address is refused');
  assert.equal(calls.length, 1, 'the private hop is never fetched');
});

test('a complete app passes every check, with the service worker found in its own script, read as text', async () => {
  const { fetcher, calls } = web(goodSite());
  const r = await checkApp(`${ORIGIN}/`, fetcher, { now });
  assert.equal(r.ok, true, JSON.stringify(r.items.filter((i) => !i.ok)));
  assert.equal(r.error, '');
  for (const i of r.items) { assert.deepEqual(Object.keys(i).sort(), ['detail', 'fix', 'id', 'label', 'ok', 'required', 'snippet']); assert.ok(i.label && i.fix, i.id); }
  assert.ok(r.items.every((i) => i.ok), 'even the recommendations pass');
  assert.deepEqual(r.items.filter((i) => !i.required).map((i) => i.id).sort(), ['id', 'maskable', 'screenshots', 'service_worker']);
  assert.ok(calls.includes(`${ORIGIN}/main.js`), 'the linked script was read');
  assert.equal(r.manifestUrl, `${ORIGIN}/manifest.webmanifest`);
});

test('the checklist fails what is missing, with a plain fix and a snippet, and recommendations never block', async () => {
  const noLink = await checkApp(`${ORIGIN}/`, web({ [`${ORIGIN}/`]: '<html><head><title>Plain</title></head></html>' }).fetcher, { now });
  assert.equal(noLink.ok, false);
  assert.equal(item(noLink, 'manifest').ok, false);
  assert.match(item(noLink, 'manifest').snippet, /<link rel="manifest" href="\/manifest.webmanifest">/);
  assert.match(item(noLink, 'manifest').snippet, /"name": "Plain"/, 'the starter manifest uses the page title');
  const broken = (patch) => checkApp(`${ORIGIN}/`, web(goodSite({ ...MANIFEST, ...patch })).fetcher, { now });
  assert.equal(item(await broken({ display: 'browser' }), 'display').ok, false);
  assert.equal(item(await broken({ display: 'browser', display_override: ['standalone'] }), 'display').ok, true);
  const oneIcon = await broken({ icons: [MANIFEST.icons[0]] });
  assert.equal(item(oneIcon, 'icons').ok, false); assert.match(item(oneIcon, 'icons').detail, /512x512/); assert.equal(oneIcon.ok, false);
  assert.equal(item(await broken({ start_url: 'https://elsewhere.example.org/' }), 'start_url').ok, false);
  assert.equal(item(await broken({ start_url: '/app/', scope: '/admin/' }), 'start_url').ok, false);
  assert.equal(item(await broken({ short_name: '' }), 'names').ok, false);
  assert.equal(item(await broken({ background_color: undefined }), 'colors').ok, false);
  assert.equal(item(await broken({ description: '' }), 'description').ok, false);
  const plain = await broken({ screenshots: [], id: undefined, icons: MANIFEST.icons.slice(0, 2) });
  assert.equal(plain.ok, true, 'screenshots, id and a maskable icon are recommendations');
  assert.deepEqual(plain.items.filter((i) => !i.ok).map((i) => i.id).sort(), ['id', 'maskable', 'screenshots']);
  const noSw = await checkApp(`${ORIGIN}/`, web({ ...goodSite(), [`${ORIGIN}/main.js`]: 'console.log(1)' }).fetcher, { now });
  assert.equal(item(noSw, 'service_worker').ok, false); assert.equal(noSw.ok, true, 'offline is recommended, not required');
  assert.match(item(noSw, 'service_worker').snippet, /navigator\.serviceWorker\.register/);
  const bad = await checkApp(`${ORIGIN}/`, web({ ...goodSite(), [`${ORIGIN}/manifest.webmanifest`]: '{ not json' }).fetcher, { now });
  assert.equal(item(bad, 'manifest').ok, false); assert.match(item(bad, 'manifest').detail, /not valid JSON/);
  const huge = await checkApp(`${ORIGIN}/`, web({ [`${ORIGIN}/`]: 'x'.repeat(PAGE_CAP + 10) }).fetcher, { now });
  assert.equal(huge.ok, false); assert.match(huge.error, /larger than 1024 KB/);
  const down = await checkApp(`${ORIGIN}/`, web({ [`${ORIGIN}/`]: { status: 500 } }).fetcher, { now });
  assert.match(down.error, /status 500/);
});

test('the listing has absolute http(s) icon and screenshot addresses only, an absolute start address and a safe colour', async () => {
  const r = await checkApp(`${ORIGIN}/`, web(goodSite({ ...MANIFEST, theme_color: 'red;background:url(x)' })).fetcher, { now });
  const l = r.listing;
  assert.equal(l.name, 'Ledger Lite');
  assert.deepEqual(l.icons.map((i) => i.src), [`${ORIGIN}/icons/192.png`, `${ORIGIN}/icons/512.png`, `${ORIGIN}/icons/mask.png`], 'relative icons resolved against the manifest; data: and javascript: dropped');
  assert.ok([...l.icons, ...l.screenshots].every((i) => /^https?:\/\//.test(i.src)));
  assert.equal(l.screenshots[0].src, `${ORIGIN}/shots/phone.png`);
  assert.equal(l.start_url, `${ORIGIN}/app/`);
  assert.equal(l.theme_color, '', 'a colour that is not a colour is dropped');
  assert.equal(deriveListing({ start_url: 'javascript:alert(1)' }, `${ORIGIN}/m.json`, `${ORIGIN}/`).start_url, `${ORIGIN}/`);
});

/* The walkthrough, driven like a browser: a cookie carries the private link from step to step. */
function driver(pack = ON, site = goodSite(), env = {}) {
  const store = new MemoryStore();
  const w = web(site);
  let cookie = '';
  const call = async (path, fields, opts = {}) => {
    const headers = { 'cf-connecting-ip': opts.ip || '192.0.2.50' };
    if (cookie) headers.cookie = cookie;
    const init = fields ? { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() } : { headers };
    const res = await appsRoute(new Request(`https://site.example.test${path}`, init), opts.env || env, store, { pack, fetcher: w.fetcher, now });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const admin = (path, fields, who = 'owner@example.test') => adminAppsRoute(new Request(`https://site.example.test${path}`, fields ? { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() } : {}), who, store, { pack, fetcher: w.fetcher, now, env });
  return { store, call, admin, w, cookie: () => cookie };
}
const idea = { idea: 'Tracks invoices and receipts so freelancers stop losing money.', audience: 'Freelancers in the UK' };
async function walkTo(d, last) {
  const order = [['idea', idea], ['name', { name: 'Typed Name', short_name: 'Typed' }], ['build', { url: `${ORIGIN}/` }], ['check', {}], ['listing', { category: 'money', maker_name: 'A Maker', maker_url: 'https://maker.example.com/' }], ['terms', { support: 'help@ledger.example.com', consent: 'yes', cofounder_interest: 'yes' }]];
  for (const [step, fields] of order) { const r = await d.call(`/apps/publish/${step}`, fields); assert.equal(r.status, 303, `${step}: ${r.status} ${r.status !== 303 ? await r.text() : ''}`); if (step === last) return; }
}

test('every step is its own page with progress, plain help and Ask your cofounder; progress is saved to a private link', async () => {
  const d = driver();
  const first = await d.call('/apps/publish/idea');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-robots-tag'), 'noindex');
  const html = await first.text();
  assert.match(html, /aria-current="step"/); assert.match(html, /Step 1 of 8/);
  for (const label of ['Idea', 'Name and icon', 'Build', 'Check', 'Listing', 'Terms', 'Submit', 'Live']) assert.ok(html.includes(label), label);
  assert.match(html, /Ask your cofounder/); assert.match(html, /class="trap"/);
  assert.ok(!/\u2014/.test(html), 'no em dashes');
  assert.equal((await d.call('/apps/publish/terms')).headers.get('location'), '/apps/publish/idea', 'no skipping ahead without a draft');
  const bad = await d.call('/apps/publish/idea', { idea: 'short', audience: '' });
  assert.equal(bad.status, 400); assert.equal(d.cookie(), '', 'nothing saved for a bad step');
  const ok = await d.call('/apps/publish/idea', idea);
  assert.equal(ok.headers.get('location'), '/apps/publish/name');
  assert.match(d.cookie(), /^[a-z0-9]+_app=[a-f0-9]{48}$/);
  const [row] = await d.store.appsByStatus('draft');
  assert.equal(row.idea, idea.idea); assert.equal(row.step, 'name'); assert.ok(!('draft_token_hash' in row), 'the token hash never leaves the store');
  const name = await (await d.call('/apps/publish/name')).text();
  assert.match(name, /Step 2 of 8/); assert.match(name, /href="\/apps\/publish\/idea"/, 'a done step links back');
  assert.match(name, /\/apps\/publish\/resume\?t=[a-f0-9]{48}/, 'the private link to come back');
  assert.equal((await d.call('/apps/publish/submit')).status, 303, 'a step not reached yet sends you to where you are');
});

test('submit needs passing checks and re-checks the real manifest on the server; the listing is the manifest, not what was typed', async () => {
  let manifest = { ...MANIFEST };
  const d = driver(ON, goodSite(() => manifest));
  await walkTo(d, 'build');
  const check = await d.call('/apps/publish/check');
  assert.equal(check.status, 200);
  assert.match(await check.text(), /It passes/);
  await walkTo(d, 'terms');
  const [draft] = await d.store.appsByStatus('draft');
  assert.equal(draft.cofounder_interest, 1, 'interest is recorded');
  assert.equal(draft.status, 'draft', 'and nothing is accepted');
  manifest = { ...MANIFEST, icons: [] };
  const refused = await d.call('/apps/publish/submit', {});
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /no longer passes the required checks/);
  assert.equal((await d.store.appsByStatus('pending')).length, 0, 'a failing app is not sent');
  manifest = { ...MANIFEST, name: 'Ledger Lite Two' };
  const sent = await d.call('/apps/publish/submit', {});
  assert.equal(sent.headers.get('location'), '/apps/publish/live');
  const [pending] = await d.store.appsByStatus('pending');
  assert.equal(pending.name, 'Ledger Lite Two', 'the listing is what the manifest says at submit time');
  assert.equal(pending.slug, 'ledger-lite-two');
  assert.equal(pending.start_url, `${ORIGIN}/app/`);
  assert.match(await (await d.call('/apps/publish/live')).text(), /with us/);
  assert.equal((await d.call('/apps/publish/name', { name: 'Changed' })).headers.get('location'), '/apps/publish/live', 'answers are locked during review');
  /* A failing app cannot get past the Check step either. */
  const f = driver(ON, goodSite({ ...MANIFEST, display: 'browser' }));
  await walkTo(f, 'build');
  const stuck = await f.call('/apps/publish/check', {});
  assert.equal(stuck.status, 400);
  assert.equal((await f.call('/apps/publish/listing', { category: 'money', maker_name: 'A Maker' })).status, 303);
  assert.equal((await f.call('/apps/publish/listing')).headers.get('location'), '/apps/publish/check', 'listing is not reached while the check fails');
});

test('a pending app is not public; approving it puts it on the shelves, in search, the sitemap door and its own page', async () => {
  const d = driver();
  await walkTo(d, 'terms');
  await d.call('/apps/publish/submit', {});
  const [app] = await d.store.appsByStatus('pending');
  const page = (p) => appsRoute(new Request(`https://site.example.test${p}`), {}, d.store, { pack: ON, fetcher: d.w.fetcher, now });
  assert.equal((await page(`/apps/${app.slug}`)).status, 404);
  assert.ok(!(await (await page('/apps')).text()).includes(app.name));
  assert.equal((await d.admin('/admin/apps', null, null)).status, 303, 'the owner view needs the owner');
  assert.equal((await d.admin('/admin/apps/review', { id: app.id, status: 'approved' }, null)).status, 401);
  const queue = await (await d.admin('/admin/apps')).text();
  assert.ok(queue.includes(app.name) && queue.includes('Re-check now') && queue.includes('expression of interest only'));
  assert.equal((await d.admin('/admin/apps/recheck', { id: app.id })).status, 303);
  await d.admin('/admin/apps/review', { id: app.id, status: 'approved' });
  const live = await page(`/apps/${app.slug}`);
  assert.equal(live.status, 200);
  const html = await live.text();
  assert.ok(html.includes('Ledger Lite') && html.includes('A Maker'));
  assert.ok(html.includes(`href="${ORIGIN}/app/"`) && html.includes('Open / Install'));
  assert.match(html, /installs from the maker's own site/);
  assert.ok(html.includes(`src="${ORIGIN}/icons/192.png"`) && html.includes(`${ORIGIN}/shots/phone.png`));
  assert.match(html, /"@type":"WebApplication"/);
  assert.ok((await (await page('/apps')).text()).includes('Ledger Lite'));
  assert.ok((await (await page('/apps?category=money')).text()).includes('Ledger Lite'));
  assert.ok(!(await (await page('/apps?category=productivity')).text()).includes('href="/apps/ledger-lite"'));
  assert.ok((await (await page('/apps?q=freelancers')).text()).includes('href="/apps/ledger-lite"'));
  assert.ok(!(await (await page('/apps?q=zebra')).text()).includes('href="/apps/ledger-lite"'));
  const kit = await (await d.call('/apps/publish/live')).text();
  assert.match(kit, /Share kit/); assert.ok(kit.includes('/apps/ledger-lite'));
});

test('the owner cannot approve an app that fails its checks', async () => {
  let manifest = { ...MANIFEST };
  const d = driver(ON, goodSite(() => manifest));
  await walkTo(d, 'terms');
  await d.call('/apps/publish/submit', {});
  const [app] = await d.store.appsByStatus('pending');
  manifest = { ...MANIFEST, display: 'browser' };
  await d.admin('/admin/apps/recheck', { id: app.id });
  const r = await d.admin('/admin/apps/review', { id: app.id, status: 'approved' });
  assert.match(decodeURIComponent(r.headers.get('location')), /does not pass the required checks/);
  assert.equal((await d.store.appById(app.id)).status, 'pending');
});

test('terms: the Cofounder track and revenue share come from pack config, with no numbers until set, and interest is not acceptance', async () => {
  const d = driver();
  await walkTo(d, 'listing');
  const html = await (await d.call('/apps/publish/terms')).text();
  assert.match(html, /Cofounder track/); assert.match(html, /Revenue share/);
  assert.match(html, /<dt>Equity share<\/dt><dd>to be set<\/dd>/); assert.match(html, /<dt>Vesting<\/dt><dd>to be set<\/dd>/);
  assert.match(html, /<dt>Split<\/dt><dd>to be set<\/dd>/);
  assert.ok(!/\d+\s?%/.test(html), 'no percentage shown before the founder sets one');
  assert.match(html, /signed separately/); assert.match(html, /legal advice/); assert.match(html, /expression of interest, not an agreement/);
  const set = driver({ ...ON, appStore: { ...ON.appStore, terms: { cofounder: { offered: true, equity: '7%', vesting: 'four years' } } } });
  await walkTo(set, 'listing');
  const setHtml = await (await set.call('/apps/publish/terms')).text();
  assert.match(setHtml, /<dd>7%<\/dd>/); assert.ok(!setHtml.includes('<h2>Revenue share</h2>'), 'a pack can offer only one');
  assert.deepEqual(termsConfig({ cofounder: { offered: true, equity: 12 } }).cofounder, { equity: null, vesting: null }, 'a number that is not set as text is not shown');
  assert.equal(termsConfig({}).cofounder, null);
  assert.equal(validateStep('terms', { support: 'help@x.example', consent: 'yes', revenue_interest: 'yes' }, { ...ON, appStore: { ...ON.appStore, terms: { cofounder: { offered: true } } } }).value.revenue_interest, 0, 'interest in an offer the pack does not make is not recorded');
});

test('Ask your cofounder: with no AI engine the question goes straight to the founder, and the reply shows on the step', async () => {
  const d = driver();
  await walkTo(d, 'idea');
  const r = await d.call('/apps/publish/name', null);
  assert.ok((await r.text()).includes('The founder reads every question'));
  assert.equal((await d.call('/apps/publish/help', { step: 'name', question: 'Is a short name of 14 characters too long?' })).headers.get('location'), '/apps/publish/name#ask');
  const [q] = await d.store.appHelpQueue();
  assert.equal(q.step, 'name'); assert.equal(q.escalated, 1); assert.equal(q.escalation_reason, 'no-ai'); assert.equal(q.ai_answer, null);
  assert.ok((await (await d.call('/apps/publish/name')).text()).includes(FOUNDER_WILL_REPLY));
  const admin = await (await d.admin('/admin/apps')).text();
  assert.ok(admin.includes('Is a short name of 14 characters too long?') && admin.includes('1 waiting for you'));
  await d.admin('/admin/apps/reply', { id: q.id, reply: 'Keep it to 12 so it fits under the icon.' });
  const after = await (await d.call('/apps/publish/name')).text();
  assert.ok(after.includes('Keep it to 12 so it fits under the icon.') && after.includes('The founder'));
  assert.ok(!after.includes('owner@example.test'), 'the owner\'s address is never shown to the maker');
  assert.equal((await d.call('/apps/publish/help', { step: 'name', question: 'x', website: '' })).status, 400, 'a question needs words');
  /* Asking first starts a draft. */
  const fresh = driver();
  assert.equal((await fresh.call('/apps/publish/help', { step: 'idea', question: 'Can I list an app that is still in beta?' })).status, 303);
  assert.match(fresh.cookie(), /_app=/);
  assert.equal((await fresh.store.appsByStatus('draft')).length, 1);
});

test('Ask your cofounder: the AI agent answers first, labelled, and equity, money, legal and approval questions always go to the founder', async () => {
  assert.equal(mustEscalate('How much equity would you take?'), 'equity');
  assert.equal(mustEscalate('What is the vesting schedule?'), 'equity');
  assert.equal(mustEscalate('Will I get paid for downloads?'), 'money');
  assert.equal(mustEscalate('Do I need a contract?'), 'legal');
  assert.equal(mustEscalate('When will my app be approved?'), 'publish-approval');
  assert.equal(mustEscalate('How do I make a maskable icon?'), '');
  const env = { AI_ENGINE: 'on', AI_ENGINE_URL: 'https://ai.example.test/ai', AI_ENGINE_TOKEN: 't' };
  const sent = [];
  const site = (url, init) => (String(url).endsWith('/ai') ? (() => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ answer: 'Use a plain background that fills the whole square.' }), { headers: { 'content-type': 'application/json' } }); }) : goodSite()[url]);
  const d = driver(ON, site, env);
  await walkTo(d, 'idea');
  await d.call('/apps/publish/help', { step: 'name', question: 'How do I make a maskable icon?' });
  await d.call('/apps/publish/help', { step: 'terms', question: 'How much equity would the founder take?' });
  const [equity, icon] = await d.store.appHelpQueue();
  assert.equal(equity.escalated, 1); assert.equal(equity.escalation_reason, 'equity'); assert.ok(equity.ai_answer, 'the agent still answers first');
  assert.equal(icon.escalated, 0); assert.equal(icon.ai_answer, 'Use a plain background that fills the whole square.');
  assert.equal(sent[0].task, 'cofounder'); assert.equal(sent[1].context.escalate, true);
  const html = await (await d.call('/apps/publish/name')).text();
  assert.equal(html.split(`<p class="help-who">${AI_LABEL}</p>`).length - 1, 2, 'every AI reply is labelled');
  assert.equal(html.split(AI_NOTE).length - 1, 2, 'with the one-line note each time');
  assert.ok(html.includes(FOUNDER_WILL_REPLY));
  const off = await cofounderAgent('How do I make a maskable icon?', { env: {}, fetcher: () => { throw Error('must not call'); } });
  assert.deepEqual(off, { answer: '', escalated: true, reason: 'no-ai' });
  const failing = await cofounderAgent('How do I make a maskable icon?', { env, fetcher: async () => new Response('down', { status: 503 }) });
  assert.equal(failing.escalated, true);
});

test('Ask routes app questions to the store when it is on', () => {
  const apps = [{ slug: 'ledger-lite', name: 'Ledger Lite', description: 'Invoices for freelancers', maker_name: 'A Maker', category: 'money', categories: [] }];
  assert.equal(searchAnswer('how do I publish my app', { appsOn: true, apps }).results[0].href, '/apps/check');
  assert.equal(searchAnswer('is my PWA installable', { appsOn: true }).results[0].href, '/apps/check');
  assert.equal(searchAnswer('an app for invoices', { appsOn: true, apps }).results[0].href, '/apps');
  assert.ok(searchAnswer('how do I install an app', { appsOn: true }).results[0].href === '/apps');
  assert.ok(searchAnswer('ledger lite invoices', { appsOn: true, apps }).results.some((x) => x.href === '/apps/ledger-lite'));
  assert.ok(!searchAnswer('how do I publish my app', { appsOn: false, apps }).results.some((x) => /^\/apps/.test(x.href)));
});

test('a pack without an app store has no /apps, no checker, no walkthrough, no admin view and no doors', async () => {
  assert.equal(appStoreOn(OFF), false);
  assert.equal(appStoreConfig({ ...PACK, appStore: { categories: [{ id: 'Bad Id', label: 'x' }] } }).categories[0].id, 'other');
  const store = new MemoryStore();
  const { fetcher, calls } = web(goodSite());
  for (const p of ['/apps', '/apps/check?url=https%3A%2F%2Fledger.example.com%2F', '/apps/publish', '/apps/publish/idea', '/apps/ledger-lite', '/apps/submit']) assert.equal((await appsRoute(new Request(`https://site.example.test${p}`), {}, store, { pack: OFF, fetcher, now })).status, 404, p);
  assert.equal((await appsRoute(new Request('https://site.example.test/apps/publish/idea', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(idea).toString() }), {}, store, { pack: OFF, fetcher, now })).status, 404);
  assert.equal(calls.length, 0, 'nothing is fetched when the store is off');
  assert.equal((await adminAppsRoute(new Request('https://site.example.test/admin/apps'), 'owner', store, { pack: OFF })).status, 404);
  assert.equal(await appsRoute(new Request('https://site.example.test/stories'), {}, store, { pack: ON }), null);
  const get = (path) => worker.fetch(new Request(`https://example.test${path}`), { ASSETS: { fetch: async () => new Response('', { status: 404 }) } });
  const shell = layout({ title: 't', path: '/', body: '' });
  const map = await (await get('/sitemap.xml')).text();
  const llms = await (await get('/llms.txt')).text();
  if (!appStoreOn()) {
    assert.equal((await get('/apps')).status, 404);
    assert.equal((await get('/apps/check')).status, 404);
    assert.ok(!shell.includes('href="/apps"'), 'no nav or footer door');
    assert.ok(!map.includes('/apps') && !llms.includes('/apps'));
  } else {
    assert.equal((await get('/apps')).status, 200);
    assert.equal((await get('/apps/check')).status, 200);
    assert.ok(shell.includes('<li><a href="/apps">'), 'the footer links it');
    if (appStoreConfig().nav) assert.match(shell, /class="site-nav"[^]*href="\/apps"/);
    assert.ok(map.includes('/apps</loc>') && llms.includes('/apps/check'));
  }
});
