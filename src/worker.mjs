/* BlackABC: the Worker. Pages are rendered here from data/*.json plus approved submissions in D1; static files come from public/ through
 * the ASSETS binding. One module decides the routes so that the whole surface of the site can be read in one place. */
import { PACK } from './site.mjs';
import { COUNTRIES, countryBySlug, countryByCode } from './countries.mjs';
import { catalogue, storyBySlug, workBySlug, talent } from './content.mjs';
import { storeFor, STATUSES } from './store.mjs';
import { accept, isAdmin, readBody } from './submissions.mjs';
import { htmlResponse, SITE, fromLocal, liveBadge } from './html.mjs';
import { MEDIA, videoThumb } from './media.mjs';
import { SEED_STORIES, SEED_WORKS } from './content.mjs';
import { SEED_EVENTS } from './events.mjs';
import { sitemap, rss, robots, llms } from './feeds.mjs';
import { homePage, packPageHtml } from './pages/home.mjs';
import { roleFrom } from './roles.mjs';
import { countriesPage, countryPage } from './pages/countries.mjs';
import { storiesPage, storyPage } from './pages/stories.mjs';
import { showcasePage, workPage, talentPage } from './pages/showcase.mjs';
import { submitPage } from './pages/submit.mjs';
import { aboutPage, guidelinesPage, notFoundPage, errorPage } from './pages/about.mjs';
import { adminPage, adminLoginPage, adminNewsPage, siteFacts } from './pages/admin.mjs';
import { signInConfigured, beginSignIn, finishSignIn, sessionOwner, signOut } from './owners.mjs';
import { activity } from './activity.mjs';
import { headlines, refresh, refreshIfStale, status as newsStatus } from './news.mjs';
import { citiesOf } from './places.mjs';
import { EMBED_CSP } from './social.mjs';
import { upcoming, ics } from './events.mjs';
import { feedEventsFor, refreshEvents, refreshEventsIfStale, eventsStatus } from './feedevents.mjs';
import { eventsPage, eventPage, liveMoment } from './pages/events.mjs';
import { featuredMoment } from './moments.mjs';
import { opportunitiesPage } from './pages/opportunities.mjs';
import { layoutEditorPage } from './pages/layoutEditor.mjs';
import { homeLayout, valid, cleanLayout } from './layout.mjs';
import { composeTarget } from './pages/create.mjs';
import { openDoorsPage } from './pages/opendoors.mjs';
import { learnRoute } from './pages/learn.mjs';
import { writingRoute } from './pages/writing.mjs';
import { speakersRoute } from './pages/speakers.mjs';
import { festivalsRoute } from './pages/festivals.mjs';
import { festivalsOn, festivalsFor, festivalsInComingUp, festivalEventRows } from './partners/festivals.mjs';
import { ontoldOn, adminOntoldRoute } from './partners/ontold.mjs';
import { SPEAKERS, speakersEnabled } from './speakers.mjs';
import { OPEN_DOORS, doorsFor } from './opendoors.mjs';
import { LESSONS } from './learn.mjs';
import { watchPage, videoItems } from './pages/watch.mjs';
import { OPPORTUNITIES, match, fieldsFor } from './opportunities.mjs';
import { openOpportunities } from './opportunities.mjs';
import { ask } from './ask.mjs';
import { coveragePage } from './pages/coverage.mjs';
import { mapPage, mapData } from './pages/map.mjs';
import { waitlistRoute, adminWaitlistRoute } from './pages/waitlist.mjs';
import { appsRoute, adminAppsRoute } from './pages/apps.mjs';
import { appStoreOn, appFromRow } from './appstore.mjs';
import { careersRoute, adminCareersRoute, roomsNow, mentorsFrom, jobItems } from './pages/careers.mjs';
import { careerOn } from './careers.mjs';
import { boardJobs } from './jobs.mjs';
import { openBounties } from './bounties.mjs';
import { profilesOf } from './profiles.mjs';
import { skinsOf } from './html.mjs';
import { tributesRoute } from './pages/tributes.mjs';
import { trainRoute } from './pages/train.mjs';
import { whyRoute } from './pages/gap.mjs';
import { cohortsRoute } from './pages/cohorts.mjs';
import { challengeRoute } from './pages/challenge.mjs';
import { promptsRoute, packPage } from './panels.mjs';
import { cohortEventRows } from './cohorts.mjs';

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': `default-src 'self'; img-src 'self' data: blob: https:; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com ${EMBED_CSP.script.join(' ')}; frame-src 'self' https://challenges.cloudflare.com ${EMBED_CSP.frame.join(' ')}; style-src 'self' 'unsafe-inline'; connect-src 'self' https://tiles.openfreemap.org https://cloudflareinsights.com; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://ontold.com https://*.ontold.com http://localhost:* http://127.0.0.1:*`,
};

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': status === 200 ? 'public, max-age=300' : 'no-store', ...extra } });
const redirect = (to, status = 303) => new Response(null, { status, headers: { location: to } });

/** The catalogue for this request: seed data plus whatever has been approved, and the events read from the pack's calendar feeds.
 * A storage failure degrades to the seed rather than a 500. */
async function loadCatalogue(store) {
  let cat;
  try { cat = catalogue(await store.approved()); } catch { cat = catalogue([]); }
  /* Live-call cohorts with a start date join the calendar as online events (pack "cohorts"; none when off). */
  return { ...cat, feedEvents: [...await feedEventsFor(store), ...cohortEventRows()] };
}
/** The calendar a page shows: seed and approved events, then feed events that are not already on it. */
const eventsOf = (cat, now = new Date()) => upcoming(cat.approved, now, cat.feedEvents || []);

export async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const store = storeFor(env);

  if (path === '/healthz') return json({ ok: true, countries: COUNTRIES.length });
  /* The create hero's composer: the idea goes to the pack's creation partner (form-action stays 'self'). */
  if (path === '/create' && method === 'GET') { const to = composeTarget(url.searchParams); return to ? new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store' } }) : new Response('Not found', { status: 404 }); }

  /* Commons photos are fetched once with an honest User-Agent and kept in the edge cache, as Wikimedia asks of sites that show its
     files; only upload.wikimedia.org paths are served, and only images. */
  if (path.startsWith('/img/commons/') && (method === 'GET' || method === 'HEAD')) return commonsImage(request, path.slice('/img/commons/'.length), ctx);
  if (path.startsWith('/img/p/') && (method === 'GET' || method === 'HEAD')) return publisherImage(request, path.slice('/img/p/'.length), store, ctx);

  /* The API. Read-only except submissions. */
  if (path === '/api/countries') return json(COUNTRIES.map(({ code, name, slug, region, subregion, flag }) => ({ code, name, slug, region, subregion, flag, url: `/country/${slug}` })));
  if (path === '/api/stories' || path === '/api/works') {
    const cat = await loadCatalogue(store);
    const country = countryByCode(url.searchParams.get('country'));
    const list = (path === '/api/stories' ? cat.stories : cat.works).filter((x) => !country || x.country === country.code).map(({ countryRecord, submittedBy, ...rest }) => ({ ...rest, countryName: countryRecord.name }));
    return json({ count: list.length, items: list.slice(0, 500) });
  }
  if (path === '/api/cities') {
    const country = countryByCode(url.searchParams.get('country'));
    return json({ country: country ? country.code : null, cities: country ? citiesOf(country.code).map((c) => c.name) : [] });
  }
  if (path === '/api/news') {
    await refreshIfStale(store, ctx);
    const country = countryByCode(url.searchParams.get('country'));
    const st = await newsStatus(store);
    const report = st.report ? { at: st.report.at, kept: st.report.kept, sources: st.report.sources.map(({ name, country: c, read, kept, error }) => ({ name, country: c, read, kept, error })) } : null;
    return json({ last_refresh: st.last_refresh, report, items: (await headlines(store, country ? country.code : null, 50)).map(({ hidden, ...n }) => n) }, 200, { 'cache-control': 'public, max-age=120' });
  }
  if (path === '/api/events') {
    const country = countryByCode(url.searchParams.get('country'));
    await refreshEventsIfStale(store, ctx);
    const list = eventsOf(await loadCatalogue(store)).filter((e) => !country || e.country === country.code).map(({ countryRecord, rule, ...e }) => ({ ...e, countryName: countryRecord.name, url: `/event/${e.id}`, ...(e.feed ? { link: e.url } : {}) }));
    return json({ count: list.length, items: list, feed: await eventsStatus(store) });
  }
  if (path === '/api/ask') {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 300);
    if (!q) return json({ error: 'Ask a question with ?q=' }, 400);
    const cat = await loadCatalogue(store);
    const now = new Date();
    const speakersOn = speakersEnabled() || cat.speakers.length > 0;
    /* Everything the site has: the stored headlines (a storage failure gives none), the showcase, the talent directory, Learn, the open doors and the speakers. */
    return json(await ask(q, { stories: cat.stories, events: eventsOf(cat), opportunities: openOpportunities(now, [...OPPORTUNITIES, ...cat.opportunities]), news: await headlines(store, null, 120), works: cat.works, talent: talent(cat), lessons: LESSONS, openDoors: doorsFor({}, now), speakers: speakersOn ? [...SPEAKERS, ...cat.speakers] : [], now, speakersOn, festivalsOn: festivalsOn(), appsOn: appStoreOn(), apps: await approvedApps(store), careers: await careersData(cat, store, now) }, env), 200, { 'cache-control': 'no-store' });
  }
  if (path === '/api/places') { const cat = await loadCatalogue(store); return json(mapData(cat, eventsOf(cat))); }
  if (path === '/api/activity') return json(await activity(store, url.searchParams.get('since')), 200, { 'cache-control': 'no-store' });
  if (path === '/api/submissions') {
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
    if (method !== 'POST') return json({ error: 'POST a submission' }, 405, { allow: 'POST, OPTIONS' });
    const r = await accept(request, env, store);
    const { input, ...rest } = r.body;
    return json(rest, r.status === 201 ? 201 : r.status);
  }

  /* Moderation. Three doors, any one of which opens it: an owner's emailed link (OWNER_EMAILS, the normal one), the ADMIN_TOKEN, or a
     verified Cloudflare Access identity when that is configured. With none configured, /admin does not exist. */
  const adminOpen = !!(env.ADMIN_TOKEN || signInConfigured(env) || (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD));
  if (path.startsWith('/admin') && !adminOpen) return htmlResponse(notFoundPage(path), 404);
  const whoIs = async () => (await sessionOwner(request, env, store)) || ((await isAdmin(request, env)) ? 'token' : null);
  if (path === '/admin/login') {
    const code = url.searchParams.get('code');
    if (method === 'GET' && code) {
      const done = await finishSignIn(env, store, code);
      if (done) return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': done.cookie } });
      return htmlResponse(adminLoginPage({ env, problem: 'That link has expired or was already used. Ask for a new one.' }), 400, { 'cache-control': 'no-store' });
    }
    if (method === 'POST') {
      const body = await readBody(request);
      if (body.token !== undefined && env.ADMIN_TOKEN) {
        if (String(body.token || '') === env.ADMIN_TOKEN) return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': `${PACK.id}_admin=${encodeURIComponent(env.ADMIN_TOKEN)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=43200` } });
        return htmlResponse(adminLoginPage({ env, problem: 'That token did not match.' }), 401, { 'cache-control': 'no-store' });
      }
      if (signInConfigured(env)) {
        const r = await beginSignIn(request, env, store, body.email);
        if (r.reason === 'mail-failed') return htmlResponse(adminLoginPage({ env, problem: 'The sign-in email could not be sent just now. Try again in a minute.' }), 503, { 'cache-control': 'no-store' });
        return htmlResponse(adminLoginPage({ env, sent: String(body.email || '').trim() }), 200, { 'cache-control': 'no-store' });
      }
      return htmlResponse(adminLoginPage({ env, problem: 'Sign-in is not set up for this site yet.' }), 400, { 'cache-control': 'no-store' });
    }
    return htmlResponse(adminLoginPage({ env }), 200, { 'cache-control': 'no-store' });
  }
  if (path === '/admin/logout') {
    const cleared = await signOut(request, env, store);
    const headers = new Headers({ location: '/' });
    headers.append('set-cookie', cleared);
    headers.append('set-cookie', `${PACK.id}_admin=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return new Response(null, { status: 303, headers });
  }
  if (path === '/admin/coverage') {
    if (!(await whoIs())) return redirect('/admin/login');
    const cat = await loadCatalogue(store);
    return htmlResponse(coveragePage(cat, upcoming(cat.approved)), 200, { 'cache-control': 'no-store' });
  }
  if (path === '/admin/news' || path === '/admin/news/hide' || path === '/admin/news/refresh') {
    const who = await whoIs();
    if (!who) return method === 'GET' ? redirect('/admin/login') : json({ error: 'sign in first' }, 401, { 'cache-control': 'no-store' });
    if (path === '/admin/news/refresh' && method === 'POST') {
      const report = await refresh(store);
      if ((request.headers.get('accept') || '').includes('application/json')) return json(report, 200, { 'cache-control': 'no-store' });
      return redirect(`/admin/news?m=${encodeURIComponent(`Read ${report.sources.length} sources and kept ${report.kept} headlines.`)}`);
    }
    if (path === '/admin/news/hide' && method === 'POST') {
      const body = await readBody(request);
      const ok = await store.setNewsHidden(Number(body.id), body.hidden === '1');
      return redirect(`/admin/news?m=${encodeURIComponent(ok ? (body.hidden === '1' ? 'Hidden.' : 'Shown again.') : 'That headline was not found.')}`);
    }
    if (method !== 'GET') return json({ error: 'not allowed' }, 405, { allow: 'GET', 'cache-control': 'no-store' });
    return htmlResponse(adminNewsPage(await store.newsForReview(), url.searchParams.get('m') || '', await newsStatus(store)), 200, { 'cache-control': 'no-store' });
  }
  if (path.startsWith('/admin/layout')) {
    const who = await whoIs();
    if (!who) return method === 'GET' ? redirect('/admin/login') : json({ error: 'sign in' }, 401, { 'cache-control': 'no-store' });
    const saved = await readSetting(store, 'layout.home'), draftSaved = await readSetting(store, 'layout.home.draft');
    if (path === '/admin/layout' && method === 'GET') return htmlResponse(layoutEditorPage({ draft: homeLayout(draftSaved || saved), published: homeLayout(saved), isDraft: !!draftSaved }), 200, { 'cache-control': 'no-store' });
    if (path === '/admin/layout/frame' && method === 'GET') {
      const cat = await loadCatalogue(store);
      const plan = homeLayout(draftSaved || saved);
      const fests = await homeFestivals(plan, env, ctx);
      return htmlResponse(homePage(cat, await headlines(store, null, 8), homeEvents(cat, fests), { country: String((request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '').toUpperCase().slice(0, 2), layout: plan, festivals: fests, rooms: careerOn('rooms') ? await roomsNow(store) : null }), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    }
    if (method !== 'POST') return json({ error: 'not allowed' }, 405, { 'cache-control': 'no-store' });
    const by = typeof who === 'string' ? who : 'owner';
    if (path === '/admin/layout/draft') {
      const body = await request.json().catch(() => null);
      if (!body || !valid(body.layout)) return json({ error: 'a layout is a list of blocks' }, 400, { 'cache-control': 'no-store' });
      await store.setSetting('layout.home.draft', cleanLayout(body.layout), by);
      return json({ ok: true, state: 'draft' }, 200, { 'cache-control': 'no-store' });
    }
    if (path === '/admin/layout/publish') {
      const next = draftSaved || saved;
      if (next) await store.setSetting('layout.home', next, by);
      await store.deleteSetting('layout.home.draft');
      return json({ ok: true, state: 'live' }, 200, { 'cache-control': 'no-store' });
    }
    if (path === '/admin/layout/reset') {
      await store.deleteSetting('layout.home.draft'); await store.deleteSetting('layout.home');
      return json({ ok: true, state: 'default', layout: homeLayout() }, 200, { 'cache-control': 'no-store' });
    }
    return json({ error: 'not found' }, 404, { 'cache-control': 'no-store' });
  }
  /* The waitlist's owner view, emails masked, and its CSV export; 404 when the pack has no waitlist. */
  if (path === '/admin/waitlist' || path === '/admin/waitlist.csv') {
    if (method !== 'GET' && method !== 'HEAD') return json({ error: 'not allowed' }, 405, { allow: 'GET', 'cache-control': 'no-store' });
    return adminWaitlistRoute(path, await whoIs(), store);
  }
  /* The app store's owner view: makers' questions, apps with their checklists, approve, decline, re-check; 404 when the pack has none. */
  if (path === '/admin/apps' || path.startsWith('/admin/apps/')) return adminAppsRoute(request, await whoIs(), store, { env });
  /* Careers: open or close a room, and mark a person verified; 404 when the pack has neither. */
  if ((path === '/admin/ontold' || path.startsWith('/admin/ontold/')) && ontoldOn()) return adminOntoldRoute(request, await whoIs(), env, store);
  if (path === '/admin/rooms' || path === '/admin/verify') return adminCareersRoute(request, await whoIs(), store);
  if (path === '/admin' || path === '/admin/review') {
    const who = await whoIs();
    if (!who) return redirect('/admin/login');
    if (path === '/admin/review' && method === 'POST') {
      const body = await readBody(request);
      const id = Number(body.id);
      const status = STATUSES.includes(body.status) ? body.status : null;
      if (!id || !status) return htmlResponse(adminPage(await store.byStatus('pending'), await store.stats(), 'pending', 'That review did not make sense.', who, siteFacts(env, request.url), await newsStatus(store)), 400, { 'cache-control': 'no-store' });
      const ok = await store.review(id, status, String(body.note || '').slice(0, 300) || null, new Date().toISOString());
      const back = STATUSES.includes(body.back) ? body.back : 'pending';
      return redirect(`/admin?status=${back}&m=${encodeURIComponent(ok ? `#${id} ${status}` : `#${id} not found`)}`);
    }
    const status = STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
    return htmlResponse(adminPage(await store.byStatus(status), await store.stats(), status, url.searchParams.get('m') || '', who, siteFacts(env, request.url), await newsStatus(store)), 200, { 'cache-control': 'no-store' });
  }

  /* Static files first, so a real asset is never shadowed by a page route. */
  if (env.ASSETS && method === 'GET' && /\.[a-z0-9]+$/i.test(path) && !/\.(xml|txt)$/.test(path)) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
  }

  if (path === '/sitemap.xml') { const cat = await loadCatalogue(store); return sitemap(cat, upcoming(cat.approved), await approvedApps(store), await careersData(cat, store)); }
  if (path === '/feed.xml') return rss(await loadCatalogue(store));
  if (path === '/robots.txt') return robots();
  if (path === '/llms.txt') { const cat = await loadCatalogue(store); return llms(cat, openOpportunities(new Date(), [...OPPORTUNITIES, ...cat.opportunities]), await approvedApps(store), await careersData(cat, store)); }

  if (path === '/submit') {
    if (method === 'POST') {
      const r = await accept(request, env, store);
      /* A signed-in owner publishes straight away: their own submission is approved as it is stored, noted as theirs. */
      const owner = r.body.ok && adminOpen ? await whoIs() : null;
      if (owner) await store.review(r.body.id, 'approved', `published by the owner (${owner})`, new Date().toISOString());
      if (r.body.ok) return htmlResponse(submitPage(url.searchParams, { ok: true, id: r.body.id, input: r.body.input, published: !!owner }, env), 200, { 'cache-control': 'no-store' });
      return htmlResponse(submitPage(url.searchParams, { ok: false, errors: r.body.errors, input: r.body.input }, env), r.status, { 'cache-control': 'no-store' });
    }
    return htmlResponse(submitPage(url.searchParams, {}, env), 200, { 'cache-control': 'no-store' });
  }

  /* The career side (pack "careers"): jobs, mentors, rooms, bounties and proof-of-work profiles; each 404s unless its feature is on. */
  { const r = await careersRoute(request, env, store, { catalogue: () => loadCatalogue(store), owner: () => (adminOpen ? whoIs() : null) }); if (r) return r; }

  /* "Who taught you?" (pack "tributes"): the corkboard and its moderated form; 404 when off. */
  { const r = await tributesRoute(request, env, store, { catalogue: () => loadCatalogue(store), owner: () => (adminOpen ? whoIs() : null) }); if (r) return r; }

  /* Intent capture for coming-soon features (pack "waitlist"): the form and its post. Not in the sitemap, never indexed. */
  if (path === '/waitlist' || path === '/waitlist/leave') return waitlistRoute(request, env, store);
  /* The app store (pack "appStore"): the shelves, the checker, listings and the step-by-step publish walkthrough. */
  if (path === '/apps' || path.startsWith('/apps/')) return appsRoute(request, env, store);

  if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });

  { const pg = packPage(path); if (pg) { const cat = await loadCatalogue(store); const fests = await homeFestivals(pg.blocks, env, ctx); return htmlResponse(packPageHtml(pg, cat, [], homeEvents(cat, fests), { festivals: fests })); } }
  if (path === '/about') return htmlResponse(aboutPage(await loadCatalogue(store)));
  if (path === '/guidelines') return htmlResponse(guidelinesPage());
  if (path === '/') {
    await refreshIfStale(store, ctx);
    const cat = await loadCatalogue(store);
    const plan = homeLayout(await readSetting(store, 'layout.home'));
    const fests = await homeFestivals(plan, env, ctx);
    return htmlResponse(homePage(cat, await headlines(store, null, 8), homeEvents(cat, fests), { country: String((request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '').toUpperCase().slice(0, 2), layout: plan, festivals: fests, rooms: careerOn('rooms') ? await roomsNow(store) : null, role: roleFrom(url.searchParams) }), 200, { 'cache-control': 'private, max-age=60', vary: 'CF-IPCountry' });
  }
  if (path === '/countries') {
    const cat = await loadCatalogue(store);
    const out = countriesPage(cat, url.searchParams.get('q'), eventsOf(cat));
    return out.redirect ? redirect(out.redirect, 302) : htmlResponse(out.html);
  }
  if (path === '/map') { const cat = await loadCatalogue(store); return htmlResponse(mapPage(url.searchParams, eventsOf(cat))); }
  if (path === '/watch') { const cat = await loadCatalogue(store); return htmlResponse(watchPage(videoItems(cat, upcoming(cat.approved)))); }
  if (path === '/open-doors') return htmlResponse(openDoorsPage(url.searchParams, { country: String((request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '').toUpperCase().slice(0, 2) }), 200, { 'cache-control': 'private, max-age=60', vary: 'CF-IPCountry' });
  if (path === '/opportunities') return htmlResponse(opportunitiesPage(url.searchParams, { items: [...OPPORTUNITIES, ...(await loadCatalogue(store)).opportunities], country: String((request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '').toUpperCase().slice(0, 2) }), 200, { 'cache-control': 'private, max-age=60', vary: 'CF-IPCountry' });
  if (path === '/events') { await refreshEventsIfStale(store, ctx); const cat = await loadCatalogue(store); return htmlResponse(eventsPage(eventsOf(cat), url.searchParams)); }
  if (path === '/stories') return htmlResponse(storiesPage(await loadCatalogue(store), url.searchParams));
  if (path === '/showcase') return htmlResponse(showcasePage(await loadCatalogue(store), url.searchParams));
  { const r = learnRoute(path); if (r) return r; }
  { const r = trainRoute(path, url.searchParams, method); if (r) return r; }
  { const r = whyRoute(path, url.searchParams); if (r) return r; }
  { const r = cohortsRoute(path); if (r) return r; }
  { const r = challengeRoute(path); if (r) return r; }
  { const r = promptsRoute(path); if (r) return r; }
  { const r = writingRoute(path); if (r) return r; }
  { const r = await festivalsRoute(path, url.searchParams, env, ctx); if (r) return r; }
  if (path === '/speakers') { const cat = await loadCatalogue(store); return speakersRoute(path, url.searchParams, [...SPEAKERS, ...cat.speakers], { cfp: openOpportunities(new Date(), [...OPPORTUNITIES, ...cat.opportunities]).some((o) => o.type === 'cfp') }); }
  if (path === '/talent') return htmlResponse(talentPage(await loadCatalogue(store), url.searchParams));

  let m;
  if ((m = /^\/country\/([a-z0-9-]+)$/.exec(path))) {
    const country = countryBySlug(m[1]) || countryByCode(m[1]);
    if (!country) return htmlResponse(notFoundPage(path), 404);
    if (country.slug !== m[1]) return redirect(`/country/${country.slug}${url.search}`, 301);
    await refreshIfStale(store, ctx);
    const cat = await loadCatalogue(store);
    return htmlResponse(countryPage(cat, country, { city: String(url.searchParams.get('city') || '').slice(0, 80), news: await headlines(store, country.code, 6), events: eventsOf(cat) }));
  }
  if ((m = /^\/event\/([a-z0-9-]+)(\.ics)?$/.exec(path))) {
    const cat = await loadCatalogue(store);
    const events = eventsOf(cat);
    const e = events.find((x) => x.id === m[1]);
    if (!e) return htmlResponse(notFoundPage(path), 404);
    if (m[2]) return new Response(ics(e, url.origin), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="${e.id}.ics"`, 'cache-control': 'public, max-age=3600' } });
    return htmlResponse(eventPage(e, events, cat));
  }
  if ((m = /^\/story\/([a-z0-9-]+)$/.exec(path))) {
    const story = storyBySlug(await loadCatalogue(store), m[1]);
    if (!story) return htmlResponse(notFoundPage(path), 404);
    const fields = fieldsFor(story);
    return htmlResponse(storyPage(story, { opportunities: fields.length ? match({ fields }, new Date(), [...OPPORTUNITIES, ...(await loadCatalogue(store)).opportunities]).filter((o) => o.fields.some((f) => fields.includes(f))) : [] }));
  }
  if ((m = /^\/work\/([a-z0-9-]+)$/.exec(path))) {
    const cat = await loadCatalogue(store);
    const work = workBySlug(cat, m[1]);
    return work ? htmlResponse(workPage(work, cat)) : htmlResponse(notFoundPage(path), 404);
  }
  return htmlResponse(notFoundPage(path), 404);
}

/** A Wikimedia Commons file or thumbnail, served from the edge cache when it can be. */
async function commonsImage(request, rest, ctx) {
  if (!/^wikipedia\/commons\/[\w%().,'~!*+-]+(\/[\w%().,'~!*+-]+)*$/.test(rest)) return new Response('Not found', { status: 404 });
  const cache = globalThis.caches && caches.default;
  const key = new Request(new URL(request.url).origin + '/img/commons/' + rest);
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const upstream = await fetch(`https://upload.wikimedia.org/${rest}`, { headers: { 'user-agent': `${PACK.name}/1.0 (https://${PACK.domain}/about; images credited to their authors)`, accept: 'image/*' }, cf: { cacheTtl: 2592000, cacheEverything: true } }).catch(() => null);
  if (!upstream || !upstream.ok || !/^image\//.test(upstream.headers.get('content-type') || '')) return new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=300' } });
  const res = new Response(upstream.body, { status: 200, headers: { 'content-type': upstream.headers.get('content-type'), 'cache-control': 'public, max-age=2592000, immutable', 'access-control-allow-origin': '*' } });
  if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* Every picture address the site itself shows, so /img/p/ copies what we credit and nothing else. */
let KNOWN = null;
const knownImages = () => KNOWN || (KNOWN = new Set([
  ...[...SEED_STORIES, ...SEED_WORKS, ...SEED_EVENTS].flatMap((e) => [e.image && e.image.src, videoThumb(e) && videoThumb(e).src]),
  ...Object.values(MEDIA.events || {}).map((m) => m.src), ...Object.values(MEDIA.people || {}).map((m) => m.src), ...Object.values(MEDIA.stock || {}).map((m) => m.src), ...OPPORTUNITIES.map((o) => o.image && o.image.src), ...OPEN_DOORS.map((o) => o.image && o.image.src),
].filter(Boolean)));

/** A publisher's picture, copied once and served from the edge with a 30-day lifetime. Only addresses the site shows are fetched:
 * seed data, or a stored headline's picture. The copy keeps the credit the page prints beside it. */
export async function publisherImage(request, code, store, ctx) {
  const src = fromLocal(code);
  const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=300' } });
  if (!/^https?:\/\//.test(src)) return notFound();
  if (!knownImages().has(src) && !(store && store.hasNewsImage && await store.hasNewsImage(src).catch(() => false))) return notFound();
  const cache = globalThis.caches && caches.default;
  const key = new Request(new URL(request.url).origin + '/img/p/' + code);
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const upstream = await fetch(src, { headers: { 'user-agent': `Mozilla/5.0 (compatible; ${PACK.name}/1.0; +https://${PACK.domain}/about) images credited to their publishers`, accept: 'image/avif,image/webp,image/*;q=0.9' }, redirect: 'follow', cf: { cacheTtl: 2592000, cacheEverything: true } }).catch(() => null);
  if (!upstream || !upstream.ok || !/^image\//.test(upstream.headers.get('content-type') || '')) return notFound();
  const res = new Response(upstream.body, { status: 200, headers: { 'content-type': upstream.headers.get('content-type'), 'cache-control': 'public, max-age=2592000, immutable', 'x-image-source': src.slice(0, 300) } });
  if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/** The last headers every response gets: the preview is for the owner to look at, not for search engines to index. */
function finish(headers, env) {
  if (env.DEPLOYMENT_ENVIRONMENT && env.DEPLOYMENT_ENVIRONMENT !== 'production' && env.DEPLOYMENT_ENVIRONMENT !== 'development') headers.set('x-robots-tag', 'noindex, nofollow');
  return headers;
}

export default {
  async fetch(request, env = {}, ctx) {
    /* One address for search engines: in production every other host (<app>.ontold.site, www) redirects permanently to the brand
       domain, same path and query. The preview is never redirected and stays noindex. CANONICAL=off disables it, and so does a pack
       with "canonical": false (a brand domain bought but not yet pointing here: redirecting to it would send visitors elsewhere). */
    const here = new URL(request.url);
    if (env.DEPLOYMENT_ENVIRONMENT === 'production' && env.CANONICAL !== 'off' && PACK.canonical !== false && here.hostname !== SITE.domain && (here.hostname.endsWith('.ontold.site') || here.hostname === `www.${SITE.domain}`) && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(null, { status: 301, headers: { location: `https://${SITE.domain}${here.pathname}${here.search}`, 'cache-control': 'public, max-age=3600' } });
    }
    let response;
    try { response = await handle(request, env, ctx); } catch (e) { console.error(PACK.id, e && e.stack || e); response = htmlResponse(errorPage(), 500); }
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY)) if (!headers.has(k)) headers.set(k, v);
    /* Pages are written with the brand domain; until that domain serves the site, canonical, share and feed links name the address
       that does (PUBLIC_ORIGIN when set, otherwise the one this request came in on), so a link shared from the preview still opens. */
    const publicOrigin = (env.PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/+$/, '');
    const type = headers.get('content-type') || '';
    const isHtml = /text\/html/.test(type);
    if (isHtml || (publicOrigin !== `https://${SITE.domain}` && /xml|text\/plain/.test(type))) {
      let text = (await response.text()).replaceAll(`https://${SITE.domain}`, publicOrigin);
      /* ?skin=<id> previews one of the pack's skins on this page (?skin=default shows it without), without changing the live look. */
      const preview = isHtml ? here.searchParams.get('skin') : null;
      if (preview && (preview === 'default' || skinsOf().includes(preview))) {
        text = text.replace(/\n<link rel="stylesheet" href="\/skins\/[a-z0-9-]+\.css" data-skin="[a-z0-9-]+">/, '');
        if (preview !== 'default') text = text.replace('<link rel="stylesheet" href="/skin.css">', `<link rel="stylesheet" href="/skin.css">\n<link rel="stylesheet" href="/skins/${preview}.css" data-skin="${preview}">`);
      }
      if (isHtml && text.includes('<!--live-moment-->')) {
        const country = String((request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '').toUpperCase().slice(0, 2);
        const fm = featuredMoment(new Date(), country);
        text = text.replace('<!--live-moment-->', liveBadge(fm ? { label: fm.short, href: fm.event ? `/event/${fm.event}` : '/', name: `${fm.name}${fm.theme ? `: ${fm.theme.theme}` : ''}` } : liveMoment(upcoming([]), country)));
      }
      headers.delete('content-length');
      return new Response(text, { status: response.status, statusText: response.statusText, headers: finish(headers, env) });
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: finish(headers, env) });
  },
  /* The cron in wrangler.json: read the next batch of news sources, and the next batch of calendar feeds (data/event-sources.json). */
  async scheduled(event, env = {}, ctx) {
    const store = storeFor(env);
    const news = refresh(store).then((r) => console.log(`${PACK.id} news: ${r.sources.length} sources, ${r.kept} kept`)).catch((e) => console.error(`${PACK.id} news`, e && e.stack || e));
    const events = refreshEvents(store).then((r) => {
      for (const s of r.sources) console.log(`${PACK.id} events: ${s.error ? 'MISS' : 'ok'} ${s.name}${s.country ? ` (${s.country})` : ''}: read ${s.read}, kept ${s.kept}${s.error ? `, ${s.error}` : ''}`);
      console.log(`${PACK.id} events: ${r.sources.length} sources, ${r.kept} kept`);
    }).catch((e) => console.error(`${PACK.id} events`, e && e.stack || e));
    const run = Promise.all([news, events]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(run); else await run;
  },
};

/** The festival directory's rows for the home page, fetched only when the layout shows the block and the pack has a directory. */
async function homeFestivals(plan, env, ctx) {
  return festivalsOn() && (plan.some((b) => b.block === 'festivals') || festivalsInComingUp()) ? festivalsFor(env, {}, { ctx }) : null;
}

/** The home page's events: the calendar, plus upcoming festivals from the directory when the pack asks (festivalDirectory.comingUp). */
const homeEvents = (cat, festivals) => (festivalsInComingUp() && festivals ? upcoming(cat.approved, new Date(), [...(cat.feedEvents || []), ...festivalEventRows(festivals)]) : eventsOf(cat));

/** What Ask, the sitemap and llms.txt know of the career side: which features are on and what each lists. */
async function careersData(cat, store, now = new Date()) {
  const on = { jobs: careerOn('jobs'), mentors: careerOn('mentors'), rooms: careerOn('rooms'), bounties: careerOn('bounties'), profiles: careerOn('profiles') };
  return { on, jobs: on.jobs ? boardJobs(jobItems(cat), {}, now) : [], mentors: on.mentors ? mentorsFrom(cat) : [], rooms: on.rooms ? await roomsNow(store) : [], bounties: on.bounties ? openBounties(cat.bounties || [], now) : [], profiles: on.profiles ? profilesOf(cat).filter((p) => p.portfolio.length) : [] };
}

/** The approved apps, or none when the pack has no app store or the apps table is not there yet (before migration 0011). */
async function approvedApps(store) {
  if (!appStoreOn()) return [];
  try { return (await store.approvedApps()).map(appFromRow); } catch { return []; }
}

/** A stored setting, or null when it is missing or the settings table is not there yet (before migration 0007). */
async function readSetting(store, key) {
  try { return store.getSetting ? await store.getSetting(key) : null; } catch { return null; }
}
