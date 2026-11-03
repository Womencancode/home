/* The app store's pages: /apps (approved apps, with a category filter and search), /apps/<slug> (one listing), /apps/check (the
 * installability checker, no account needed), and /apps/publish/<step>, the walkthrough a maker goes through with the site as her
 * cofounder: idea, name and icon, build, check, listing, terms, submit, live. Each step saves progress to a draft tied to a private
 * link, and each has "Ask your cofounder". The owner's side is /admin/apps. With no "appStore" in the pack every one of them is a 404. */
import { PACK } from '../site.mjs';
import { esc, layout, htmlResponse, shareBar, absolute, SITE } from '../html.mjs';
import { notFoundPage } from './about.mjs';
import { humanCheck, ipHash, readBody } from '../submissions.mjs';
import { LESSONS } from '../learn.mjs';
import { ontoldOn } from '../ask.mjs';
import { appStoreConfig, checkApp, appFromRow, listingColumns, slugify, validateStep, missingSteps, cofounderAgent, bestIcon, safeColor, categoryLabel, STEPS, stepIndex, CHECKS, APP_LIMITS, APP_STATUSES, AI_LABEL, AI_NOTE, FOUNDER_WILL_REPLY, ESCALATION_LABEL } from '../appstore.mjs';

const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
const redirect = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', ...extra } });
const http = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

/* The private link: a random token in a cookie (Path=/apps) and in the resume address; only its SHA-256 hash is stored. */
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function tokenHash(token) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`app:${token}`)))); }
function newToken() { const b = new Uint8Array(24); crypto.getRandomValues(b); return hex(b); }
const cookieName = (pack) => `${pack.id}_app`;
function cookieToken(request, pack) { const m = new RegExp(`(?:^|;\\s*)${cookieName(pack)}=([a-f0-9]{48})(?:;|$)`).exec(request.headers.get('cookie') || ''); return m ? m[1] : ''; }
const setCookie = (pack, token) => `${cookieName(pack)}=${token}; Path=/apps; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`;

async function loadDraft(request, store, pack) {
  const token = cookieToken(request, pack);
  if (!token) return null;
  const app = appFromRow(await store.appByToken(await tokenHash(token)));
  return app ? { token, app } : null;
}

/** The furthest step this app may open: the saved step while it is a draft, every step once it has been sent. */
const reached = (app) => (!app ? 0 : app.status === 'draft' ? Math.max(0, Math.min(stepIndex(app.step), stepIndex('submit'))) : STEPS.length - 1);
const locked = (app) => !!app && (app.status === 'pending' || app.status === 'approved');
const turnstileWidget = (env) => (env.TURNSTILE_SITE_KEY ? `<div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITE_KEY)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : '');
const trap = '<div class="trap" aria-hidden="true"><label for="a-website">Website</label><input id="a-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>';
const field = (errors, name, label, control, hint) => `<div class="field${errors[name] ? ' has-error' : ''}"><label for="a-${name}">${label}</label>${hint ? `<p class="hint">${hint}</p>` : ''}${control}${errors[name] ? `<p class="error" role="alert">${esc(errors[name])}</p>` : ''}</div>`;
const iconImg = (app, size = 64) => { const src = http(bestIcon(app.icons || [])); return src ? `<img class="app-icon" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="app-icon app-icon-blank" aria-hidden="true" style="width:${size}px;height:${size}px">${esc((app.name || '?').slice(0, 1).toUpperCase())}</span>`; };
const short = (s, n) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };

/* ---------- The checklist, shared by the checker, the Check step and the admin view ---------- */

/** The checklist with a fix and a snippet for each item that is not there yet. */
export function checklist(result) {
  const row = (i) => {
    const state = i.ok ? 'ok' : i.required ? 'bad' : 'rec';
    const mark = i.ok ? '<span class="check-mark" aria-label="Passed">✓</span>' : i.required ? '<span class="check-mark" aria-label="Needs fixing">✗</span>' : '<span class="check-mark" aria-label="Recommended">○</span>';
    const how = i.ok ? '' : `<details class="check-fix"${i.required ? ' open' : ''}><summary>${i.required ? 'How to fix it' : 'How to add it'}</summary><p>${esc(i.fix)}</p>${i.snippet ? `<pre class="snippet"><code>${esc(i.snippet)}</code></pre>` : ''}</details>`;
    return `<li class="check-item is-${state}">${mark}<div><p class="check-label">${esc(i.label)}${i.required ? '' : ' <span class="muted small">optional</span>'}</p>${i.detail ? `<p class="small muted">${esc(i.detail)}</p>` : ''}${how}</div></li>`;
  };
  return `<ol class="checklist">${result.items.map(row).join('')}</ol>`;
}

/** The short form of a stored checklist, for the admin view. */
const checkSummary = (checks = []) => (checks.length ? `<ul class="check-summary">${checks.map((c) => `<li class="is-${c.ok ? 'ok' : c.required ? 'bad' : 'rec'}">${c.ok ? '✓' : c.required ? '✗' : '○'} ${esc(c.label)}${c.detail ? ` <span class="muted">(${esc(c.detail)})</span>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">Not checked yet.</p>');

/* ---------- Public pages ---------- */

const card = (a, pack) => `<a class="lesson-card app-card" href="/apps/${esc(a.slug)}"${safeColor(a.theme_color) ? ` style="--app-theme:${esc(safeColor(a.theme_color))}"` : ''}>${iconImg(a)}<span class="feature-kicker">${esc(categoryLabel(a.category, pack))}</span><b>${esc(a.name)}</b><small>${esc(a.maker_name ? `by ${a.maker_name}` : '')}</small><small>${esc(short(a.description, 150))}</small></a>`;

/** /apps: the grid, with ?category= and ?q=. */
export function storePage(apps, params, pack = PACK) {
  const cfg = appStoreConfig(pack);
  const cat = cfg.categories.some((c) => c.id === params.get('category')) ? params.get('category') : '';
  const q = String(params.get('q') || '').trim().slice(0, 80);
  const qq = q.toLowerCase();
  const list = apps.filter((a) => (!cat || a.category === cat) && (!qq || [a.name, a.short_name, a.description, a.maker_name, ...(a.categories || [])].join(' ').toLowerCase().includes(qq)));
  const link = (c) => { const p = new URLSearchParams(); if (c) p.set('category', c); if (q) p.set('q', q); const s = p.toString(); return `/apps${s ? `?${s}` : ''}`; };
  const count = (id) => apps.filter((a) => a.category === id).length;
  const body = `
<section class="page-head"><p class="eyebrow">${esc(cfg.title)}</p><h1>${esc(cfg.title)}</h1>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}
  <form class="opp-filter app-search" method="get" action="/apps" role="search">
    <label class="visually-hidden" for="apps-q">Search apps</label><input id="apps-q" name="q" type="search" value="${esc(q)}" placeholder="Search apps" maxlength="80">
    <label class="visually-hidden" for="apps-cat">Category</label><select id="apps-cat" name="category"><option value="">Every category</option>${cfg.categories.map((c) => `<option value="${esc(c.id)}"${cat === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
    <button class="button small" type="submit">Search</button>
  </form>
  <p class="chips"><a class="chip${cat ? '' : ' active'}" href="${esc(link(''))}">All</a>${cfg.categories.map((c) => `<a class="chip${cat === c.id ? ' active' : ''}" href="${esc(link(c.id))}">${esc(c.label)}${count(c.id) ? ` <span class="n">${count(c.id)}</span>` : ''}</a>`).join('')}</p>
</section>
<section class="section">${list.length ? `<div class="lesson-grid app-grid">${list.map((a) => card(a, pack)).join('')}</div>` : `<div class="invite"><p>${apps.length ? 'Nothing matches that yet.' : 'The shelves are waiting for the first app.'} <a class="button" href="/apps/publish">Publish yours</a></p></div>`}</section>
<section class="cta-band panel"><p class="eyebrow">Made a web app?</p><h2>Check it, then publish it with your cofounder</h2><p>Paste your address and see what it needs to be installable. Then I walk you through the listing, step by step.</p><p><a class="button primary" href="/apps/check">Check my app</a> <a class="button ghost" href="/apps/publish">Publish my app</a></p></section>`;
  return layout({ title: cfg.title, description: cfg.lead || 'Installable web apps, each installed from its maker\'s own site.', path: '/apps', body, current: '/apps', noindex: !!(q || cat) });
}

/** /apps/<slug>: one approved app. */
export function listingPage(a, pack = PACK) {
  const cfg = appStoreConfig(pack);
  const open = http(a.start_url) || http(a.url);
  const maker = a.maker_name ? (http(a.maker_url) ? `<a href="${esc(a.maker_url)}" rel="noopener nofollow">${esc(a.maker_name)}</a>` : esc(a.maker_name)) : '';
  const support = /^[^\s@]+@[^\s@]+$/.test(a.support || '') ? `<a href="mailto:${esc(a.support)}">${esc(a.support)}</a>` : http(a.support) ? `<a href="${esc(a.support)}" rel="noopener nofollow">Help page</a>` : '';
  const shots = (a.screenshots || []).filter((s) => http(s.src));
  const icon = http(bestIcon(a.icons || [], 512));
  const theme = safeColor(a.theme_color);
  const body = `
<article class="app-listing"${theme ? ` style="--app-theme:${esc(theme)}"` : ''}>
<section class="page-head app-head">${iconImg(a, 112)}<div><p class="eyebrow"><a href="/apps">${esc(cfg.title)}</a> · <a href="/apps?category=${esc(a.category)}">${esc(categoryLabel(a.category, pack))}</a></p><h1>${esc(a.name)}</h1>${maker ? `<p class="byline">by ${maker}</p>` : ''}</div></section>
<section class="section">
  <p class="lead">${esc(a.description || '')}</p>
  <p><a class="button primary" href="${esc(open)}" rel="noopener">Open / Install</a></p>
  <p class="small muted app-note">It installs from the maker's own site, not from us. Open it, then choose Install in your browser (on a phone, Add to Home Screen). We list it; the maker runs it.</p>
  ${(a.categories || []).length ? `<p class="opp-fields">${a.categories.map((c) => `<span>${esc(c)}</span>`).join('')}</p>` : ''}
</section>
${shots.length ? `<section class="section"><h2>Screenshots</h2><div class="app-shots">${shots.map((s) => `<figure><img src="${esc(s.src)}" alt="${esc(s.label || `${a.name} screenshot`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${s.label ? `<figcaption class="small muted">${esc(s.label)}</figcaption>` : ''}</figure>`).join('')}</div></section>` : ''}
<section class="section">${support ? `<p class="small">Questions about the app? ${support}</p>` : ''}${shareBar(`/apps/${a.slug}`, `${a.name} on ${SITE.name}`)}</section>
<p><a class="more" href="/apps">All apps</a></p>
</article>`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'WebApplication', name: a.name, url: open, description: a.description || undefined, applicationCategory: categoryLabel(a.category, pack), operatingSystem: 'Any (installs from a web browser)', ...(icon ? { image: icon } : {}), ...(a.maker_name ? { author: { '@type': 'Person', name: a.maker_name, ...(http(a.maker_url) ? { url: a.maker_url } : {}) } } : {}) };
  return layout({ title: a.name, description: short(a.description || `${a.name} on ${cfg.title}`, 160), path: `/apps/${a.slug}`, body, current: '/apps', type: 'website', jsonld, ...(icon ? { image: { src: icon, alt: `${a.name} icon` } } : {}) });
}

/** /apps/check: the checker. With ?url= it reads that app and shows the checklist. */
export function checkPage(url, result) {
  const intro = `<section class="section"><h2>What we check</h2><ul class="check-summary">${CHECKS.map((c) => `<li>${esc(c.label)}${c.required ? '' : ' <span class="muted small">optional</span>'}</li>`).join('')}</ul><p class="small muted">We read your page and its manifest as text, from our server. Nothing from your site is run, and nothing is saved unless you go on to publish.</p></section>`;
  const verdict = !result ? '' : result.ok
    ? `<div class="notice success" role="status"><h2>Yes, it's installable.</h2><p>Every required check passes. ${result.items.some((i) => !i.ok) ? 'There are a couple of nice-to-haves below too.' : 'Even the nice-to-haves.'}</p><p><a class="button primary" href="/apps/publish/idea?url=${encodeURIComponent(result.url)}">Publish it with me</a></p></div>`
    : `<div class="notice" role="alert"><h2>Not yet. Here's what to fix.</h2>${result.error ? `<p>${esc(result.error)}</p>` : ''}<p>Each item says what to change and gives you something to copy. Fix it on your site, then check again.</p></div>`;
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/apps">Apps</a> · Checker</p><h1>Is your web app <em>installable?</em></h1><p class="lead">Paste the address of your web app. I'll read its page and manifest and tell you, item by item, what's ready and what to fix. No account needed.</p>
<form class="opp-filter app-check-form" method="get" action="/apps/check"><label class="visually-hidden" for="c-url">Your app's address</label><input id="c-url" name="url" type="url" inputmode="url" placeholder="https://" value="${esc(url || '')}" maxlength="${APP_LIMITS.url}" required><button class="button primary small" type="submit">Check it</button></form></section>
${result ? `<section class="section">${verdict}${checklist(result)}</section>` : intro}
<section class="section"><p>Want to learn how it fits together? ${LESSONS.some((l) => l.try && /^\/apps/.test(l.try.href)) ? LESSONS.filter((l) => l.try && /^\/apps/.test(l.try.href)).map((l) => `<a href="/learn/${esc(l.id)}">${esc(l.title)}</a>`).join(' · ') : '<a href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps" rel="noopener">MDN: Progressive web apps</a>'}</p></section>`;
  return layout({ title: 'Check your web app', description: 'Is your web app installable? Paste its address and get a checklist with fixes you can copy.', path: '/apps/check', body, current: '/apps', noindex: !!url });
}

/* ---------- The walkthrough ---------- */

function stepper(current, app) {
  const far = reached(app);
  return `<nav class="app-steps-nav" aria-label="Your progress"><ol class="app-steps">${STEPS.map((s, i) => {
    const state = s.id === current ? 'current' : i < far || (app && app.status !== 'draft') ? 'done' : 'todo';
    const inner = `<span class="app-step-n" aria-hidden="true">${state === 'done' ? '✓' : i + 1}</span><span>${esc(s.label)}</span>${state === 'done' ? '<span class="visually-hidden"> (done)</span>' : ''}`;
    return `<li class="app-step is-${state}"${s.id === current ? ' aria-current="step"' : ''}>${i <= far && s.id !== current ? `<a href="/apps/publish/${s.id}">${inner}</a>` : inner}</li>`;
  }).join('')}</ol><p class="small muted">Step ${stepIndex(current) + 1} of ${STEPS.length}: ${esc(STEPS[stepIndex(current)].label)}</p></nav>`;
}

/** "Ask your cofounder": the form and this maker's questions with their answers. */
function askBox(step, draft, env, notice = '') {
  const help = (draft && draft.help) || [];
  const aiOn = ontoldOn(env);
  const label = (id) => (STEPS.find((s) => s.id === id) || { label: id }).label;
  const thread = help.map((h) => `<li class="help-item"><p class="small muted">${esc(label(h.step))} · ${esc(String(h.created_at).slice(0, 10))}</p><p class="help-q">${esc(h.question)}</p>
  ${h.ai_answer ? `<div class="help-ai"><p class="help-who">${esc(AI_LABEL)}</p><p>${esc(h.ai_answer)}</p><p class="small muted">${esc(AI_NOTE)}</p></div>` : ''}
  ${h.reply ? `<div class="help-founder"><p class="help-who">The founder</p><p>${esc(h.reply)}</p></div>` : h.escalated ? `<p class="small help-wait">${esc(FOUNDER_WILL_REPLY)}${h.ai_answer ? ': this one needs her decision.' : '.'}</p>` : ''}</li>`).join('');
  return `<section class="panel app-help" id="ask" aria-labelledby="ask-h"><h2 id="ask-h">Ask your cofounder</h2>
<p>Stuck, unsure, or want a second opinion on this step? Ask me anything. ${aiOn ? `My ${esc(AI_LABEL)} answers first, and anything about equity, money, legal matters or approval goes to the founder herself.` : 'The founder reads every question and replies right here.'}</p>
${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
<form class="submit-form" method="post" action="/apps/publish/help"><input type="hidden" name="step" value="${esc(step)}"><div class="field"><label for="a-question">Your question</label><textarea id="a-question" name="question" rows="3" maxlength="${APP_LIMITS.question}" required></textarea></div>${trap}${draft ? '' : turnstileWidget(env)}<p><button class="button small" type="submit">Ask</button></p></form>
${thread ? `<ul class="help-thread">${thread}</ul>` : ''}</section>`;
}

/** The page around a step: progress, the step itself, Ask your cofounder, and the private link to come back. */
function frame(step, draft, inner, { env = {}, origin = '', notice = '' } = {}) {
  const resume = draft ? `<p class="small muted app-resume">Your progress is saved. To pick up on another device, keep this private link: <code>${esc(`${origin}/apps/publish/resume?t=${draft.token}`)}</code></p>` : '';
  const lock = draft && locked(draft.app) && step !== 'live' ? `<div class="notice" role="status"><p>${draft.app.status === 'approved' ? 'Your app is live, so these answers are locked.' : 'This is with us for review, so your answers are locked while we look.'} If something needs changing, ask me below. <a href="/apps/publish/live">See where it is</a></p></div>` : '';
  const body = `<div class="app-publish">${stepper(step, draft && draft.app)}${lock}${inner}${askBox(step, draft, env, notice)}${resume}</div>`;
  return htmlResponse(layout({ title: `Publish your app: ${STEPS[stepIndex(step)].label}`, description: 'Publish your web app, step by step, with your cofounder.', path: `/apps/publish/${step}`, body, current: '/apps', noindex: true }), 200, PRIVATE);
}

const head = (eyebrow, h1, lead) => `<section class="page-head"><p class="eyebrow">${esc(eyebrow)}</p><h1>${h1}</h1><p class="lead">${lead}</p></section>`;
const saveBtn = (label = 'Save and continue', dis = false) => `<p><button class="button primary" type="submit"${dis ? ' disabled' : ''}>${esc(label)}</button></p>`;

function relatedLessons() {
  const rel = LESSONS.filter((l) => (l.try && /^\/apps/.test(l.try.href)) || /\b(app|apps|install|manifest|pwa|store)\b/i.test(`${l.title} ${l.summary || ''}`));
  return rel.length ? rel : LESSONS.slice(0, 3);
}

/** The inner HTML of each step. `s` carries { app, input, errors, env, cfg, result, pack, prefillUrl }. */
const STEP_VIEW = {
  idea: ({ app, input, errors, env, prefillUrl }) => `${head('Step 1 · Idea', 'What are we <em>building?</em>', 'Hi, I\'m your cofounder for this. Let\'s start where every good app starts: the problem. Tell me what your app does and who it\'s for. A sentence or two each is plenty, and you can change it later.')}
<section class="section"><ul class="app-tips"><li>Say what it does, not how it's built: "keeps track of my clients' invoices" beats "a React dashboard".</li><li>Picture one real person using it: "freelance designers who hate admin" is clearer than "everyone".</li></ul>
<form class="submit-form" method="post" action="/apps/publish/idea" novalidate>
${field(errors, 'idea', 'What does your app do?', `<textarea id="a-idea" name="idea" rows="4" maxlength="${APP_LIMITS.idea}" required>${esc(input.idea ?? app?.idea ?? '')}</textarea>`)}
${field(errors, 'audience', 'Who is it for?', `<input id="a-audience" name="audience" type="text" maxlength="${APP_LIMITS.audience}" value="${esc(input.audience ?? app?.audience ?? '')}" required>`)}
${app ? '' : `<input type="hidden" name="url" value="${esc(prefillUrl || '')}">${trap}${turnstileWidget(env)}${errors.turnstile ? `<p class="error" role="alert">${esc(errors.turnstile)}</p>` : ''}`}
${saveBtn('Save and continue', locked(app))}</form></section>`,

  name: ({ app, input, errors }) => `${head('Step 2 · Name and icon', 'Name it, and <em>give it a face</em>', 'A good name is short and easy to say out loud. Your short name is what shows under the icon on a phone, so keep it to about 12 characters.')}
<section class="section"><form class="submit-form" method="post" action="/apps/publish/name" novalidate>
${field(errors, 'name', 'Name', `<input id="a-name" name="name" type="text" maxlength="${APP_LIMITS.name}" value="${esc(input.name ?? app?.name ?? '')}" required>`, 'The full name people see when they install it.')}
${field(errors, 'short_name', 'Short name', `<input id="a-short_name" name="short_name" type="text" maxlength="${APP_LIMITS.short_name}" value="${esc(input.short_name ?? app?.short_name ?? '')}">`, 'What fits under the icon. Leave it blank and I\'ll use the first 12 characters of the name.')}
${saveBtn('Save and continue', locked(app))}</form></section>
<section class="section"><h2>Your icon</h2><p>You need a square icon at 192 and 512 pixels, plus a maskable one: the same picture with extra background around it, so phones that crop icons into circles don't cut anything off. Start from one simple shape on a solid colour. It has to read at the size of a fingertip.</p>
<p>These go in your manifest. At the Check step I read the name and icons straight from it, so your listing always matches what people install.</p>
<pre class="snippet"><code>${esc(CHECKS.find((c) => c.id === 'manifest').snippet({ title: input.name ?? app?.name ?? '' }).split('\n\n')[1] || '')}</code></pre></section>`,

  build: ({ app, input, errors }) => {
    const lessons = relatedLessons();
    return `${head('Step 3 · Build', 'Where does it <em>live?</em>', 'Paste the address people open to use your app. It has to start with https://. Not online yet? That\'s fine. Your progress is saved: build it, put it online, and come back here with the link.')}
<section class="section"><form class="submit-form" method="post" action="/apps/publish/build" novalidate>
${field(errors, 'url', 'Your app\'s address', `<input id="a-url" name="url" type="url" inputmode="url" placeholder="https://" maxlength="${APP_LIMITS.url}" value="${esc(input.url ?? app?.url ?? '')}" required>`, 'The page with your &lt;link rel="manifest"&gt; on it, usually your home page.')}
${saveBtn('Save and check it', locked(app))}</form></section>
<section class="section"><h2>Guides for the build</h2><ul class="app-tips">${lessons.map((l) => `<li><a href="/learn/${esc(l.id)}">${esc(l.title)}</a>: ${esc(l.summary || '')}</li>`).join('')}<li><a href="/apps/check">The checker</a>: try any address and see what it needs, before you save it here.</li><li><a href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps" rel="noopener">MDN: Progressive web apps</a>, a thorough reference when you want the detail.</li></ul></section>`;
  },

  check: ({ app, result }) => `${head('Step 4 · Check', 'Let\'s check it <em>together</em>', `I've just read <a href="${esc(http(app.url))}" rel="noopener nofollow">${esc(app.url || '')}</a> and its manifest. Here's what's ready and what isn't. HTTPS, the manifest, the icons and offline use are the big ones.`)}
<section class="section">${!result ? '<div class="notice" role="alert"><p>Give me your app\'s address first. <a href="/apps/publish/build">Add it at the Build step</a></p></div>' : `${result.ok ? '<div class="notice success" role="status"><h2>It passes.</h2><p>People can install it. Have a look at the optional items, then let\'s write your listing.</p></div>' : `<div class="notice" role="alert"><h2>A few things to fix first.</h2>${result.error ? `<p>${esc(result.error)}</p>` : ''}<p>Each one says what to change and gives you something to copy. Fix them on your site, then check again. Offline is optional, but people notice when an app opens on a train with no signal.</p></div>`}
${checklist(result)}
<form method="post" action="/apps/publish/check" class="app-check-next"><a class="button ghost" href="/apps/publish/check">Check again</a> <a class="button ghost" href="/apps/publish/build">Change the address</a> ${result.ok ? '<button class="button primary" type="submit">On to the listing</button>' : ''}</form>`}</section>`,

  listing: ({ app, input, errors, cfg }) => {
    const shots = (app.screenshots || []).filter((s) => http(s.src));
    return `${head('Step 5 · Listing', 'Your <em>listing</em>', 'This is how people will meet your app. The name, icon, description and screenshots come straight from your manifest, so what they see here is what they install. To change them, change your manifest and check again.')}
<section class="section"><div class="app-preview">${iconImg(app, 72)}<div><b>${esc(app.name || 'Your app')}</b><p>${esc(app.description || 'No description yet: add one to your manifest.')}</p></div></div>
${shots.length ? `<div class="app-shots">${shots.slice(0, 4).map((s) => `<figure><img src="${esc(s.src)}" alt="${esc(s.label || 'Screenshot')}" loading="lazy" referrerpolicy="no-referrer"></figure>`).join('')}</div>` : '<p class="small muted">No screenshots yet. They\'re optional, but a listing with pictures gets opened far more. Add them to your manifest under "screenshots", then <a href="/apps/publish/check">check again</a>.</p>'}
<p><a class="button ghost small" href="/apps/publish/check">I changed my manifest: read it again</a></p></section>
<section class="section"><form class="submit-form" method="post" action="/apps/publish/listing" novalidate>
${field(errors, 'category', 'Category', `<select id="a-category" name="category" required><option value="">Choose one</option>${cfg.categories.map((c) => `<option value="${esc(c.id)}"${(input.category ?? app.category) === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`, 'The shelf people will find it on.')}
${field(errors, 'maker_name', 'Maker', `<input id="a-maker_name" name="maker_name" type="text" maxlength="${APP_LIMITS.maker_name}" value="${esc(input.maker_name ?? app.maker_name ?? '')}" required>`, 'Your name, or your studio\'s, as you want it on the listing.')}
${field(errors, 'maker_url', 'Your profile or site (optional)', `<input id="a-maker_url" name="maker_url" type="url" maxlength="${APP_LIMITS.url}" placeholder="https://" value="${esc(input.maker_url ?? app.maker_url ?? '')}">`, 'Where people can find more of your work. Your name links to it.')}
${saveBtn('Save and continue', locked(app))}</form></section>`;
  },

  terms: ({ app, input, errors, cfg, pack }) => {
    const t = cfg.terms;
    const val = (v) => (v ? esc(v) : 'to be set');
    const checked = (k) => ((input[k] ?? (app[k] ? 'yes' : '')) === 'yes' ? ' checked' : '');
    const cofounder = t.cofounder ? `<section class="panel app-offer"><p class="eyebrow">Option</p><h2>Cofounder track</h2>
<p>On the Cofounder track, the founder of ${esc(pack.name)} joins your app as a real cofounder, on paper, with an equity share in it. That means she owns part of the app alongside you and is in it for the long run with you, not just for the listing. Her AI cofounder agent does much of the day-to-day work with you, like reviews, checklists and answers at any hour, and she makes the big decisions herself.</p>
<dl class="app-terms"><dt>Equity share</dt><dd>${val(t.cofounder.equity)}</dd><dt>Vesting</dt><dd>${val(t.cofounder.vesting)}</dd></dl>
${t.cofounder.equity && t.cofounder.vesting ? '' : '<p class="small muted">The founder hasn\'t set these yet, so there are no numbers here. You\'ll see them before anything is agreed.</p>'}
<p class="small">Vesting means a share is earned over time rather than all at once, so a cofounder who leaves early keeps only part of it.</p>
<p><strong>Nothing here is an agreement.</strong> If you both want to go ahead, the cofounder agreement is written and signed separately, and you should each take proper legal advice before signing. Nothing is binding until then.</p>
<label class="check"><input type="checkbox" name="cofounder_interest" value="yes"${checked('cofounder_interest')}><span>I'm interested in the Cofounder track. I understand this is an expression of interest, not an agreement.</span></label></section>` : '';
    const revenue = t.revenueShare ? `<section class="panel app-offer"><p class="eyebrow">Option</p><h2>Revenue share</h2>
<p>A share of what your app earns through ${esc(pack.name)} goes to the store, and the rest to you.</p>
<dl class="app-terms"><dt>Basis</dt><dd>${val(t.revenueShare.basis)}</dd><dt>Split</dt><dd>${val(t.revenueShare.split)}</dd></dl>
${t.revenueShare.basis && t.revenueShare.split ? '' : '<p class="small muted">The basis and the split haven\'t been set yet, so there are no numbers here. Nothing is charged and nothing is taken today.</p>'}
<p class="small">Nothing here is an agreement either: any terms are set out and agreed separately before they apply to your app.</p>
<label class="check"><input type="checkbox" name="revenue_interest" value="yes"${checked('revenue_interest')}><span>I'm interested in a revenue share. I understand this is an expression of interest, not an agreement.</span></label></section>` : '';
    return `${head('Step 6 · Terms', 'The terms, <em>in plain words</em>', 'Listing your app here is free, and it stays yours. Here is what we offer, and what we need from you.')}
<section class="section"><form class="submit-form" method="post" action="/apps/publish/terms" novalidate>
${cofounder}${revenue}${!cofounder && !revenue ? '<p>There are no money or equity terms for this store right now.</p>' : '<p class="small muted">Both options are optional. You can list your app without either.</p>'}
${field(errors, 'support', 'Support contact', `<input id="a-support" name="support" type="text" maxlength="${APP_LIMITS.support}" placeholder="help@yourapp.example or https://" value="${esc(input.support ?? app.support ?? '')}" required>`, 'An email address or an https:// help page. It\'s shown on your listing so people can reach you about the app.')}
<div class="field${errors.consent ? ' has-error' : ''}"><label class="check"><input type="checkbox" name="consent" value="yes"${(input.consent ?? (Number(app.consent) ? 'yes' : '')) === 'yes' ? ' checked' : ''}><span>This app is mine, or I'm authorised to list it. If I want it taken down, I can ask here at any time.</span></label>${errors.consent ? `<p class="error" role="alert">${esc(errors.consent)}</p>` : ''}</div>
${saveBtn('Save and continue', locked(app))}</form></section>`;
  },

  submit: ({ app, errors, result, pack }) => {
    const miss = missingSteps(app).filter((id) => id !== 'check' || !app.checked_at);
    const row = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;
    const interest = [app.cofounder_interest ? 'Cofounder track' : '', app.revenue_interest ? 'Revenue share' : ''].filter(Boolean);
    return `${head('Step 7 · Submit', 'Ready <em>when you are</em>', 'Here\'s everything in one place. When you press send, I read your page and manifest one more time, so your listing matches exactly what people will install. Then a person on our side reviews it.')}
<section class="section">${errors.submit ? `<div class="notice" role="alert"><p>${esc(errors.submit)}</p></div>` : ''}${result && !result.ok ? checklist(result) : ''}
<dl class="app-terms">${row('What it does', esc(app.idea || ''))}${row('Who it\'s for', esc(app.audience || ''))}${row('Name', esc(app.name || ''))}${row('Address', esc(app.url || ''))}${row('Category', esc(categoryLabel(app.category, pack)))}${row('Maker', esc(app.maker_name || ''))}${row('Support', esc(app.support || ''))}${interest.length ? row('Interested in', `${esc(interest.join(' and '))} <span class="muted small">(an expression of interest, not an agreement)</span>`) : ''}</dl>
${miss.length ? `<div class="notice" role="alert"><p>A few steps still need you: ${miss.map((id) => `<a href="/apps/publish/${id}">${esc(STEPS[stepIndex(id)].label)}</a>`).join(', ')}.</p></div>` : `<form method="post" action="/apps/publish/submit">${saveBtn('Send it for review', locked(app))}</form>`}</section>`;
  },

  live: ({ app, pack, origin }) => {
    const cfg = appStoreConfig(pack);
    const listing = `${origin || `https://${SITE.domain}`}/apps/${app.slug}`;
    if (app.status === 'approved') {
      const post = `${app.name} is live on ${pack.name}! ${short(app.description || '', 140)} Install it here: ${listing}`;
      const badge = `<a href="${listing}">Find ${app.name} on the ${pack.name} ${cfg.title.toLowerCase()}</a>`;
      return `${head('Step 8 · Live', 'You\'re <em>live!</em>', `Your app is on the shelf at <a href="/apps/${esc(app.slug)}">${esc(listing)}</a>. Here's your share kit.`)}
<section class="section"><h2>Share kit</h2><div class="field"><label for="k-link">Your listing</label><input id="k-link" type="text" readonly value="${esc(listing)}"></div>
<div class="field"><label for="k-post">A post to start from</label><textarea id="k-post" rows="3" readonly>${esc(post)}</textarea></div>
<div class="field"><label for="k-badge">A link for your own site</label><textarea id="k-badge" rows="2" readonly>${esc(badge)}</textarea></div>
${shareBar(`/apps/${app.slug}`, `${app.name} on ${pack.name}`)}</section>
<section class="section"><h2>What happens next</h2><ol class="app-tips"><li>Changed your manifest, like a new icon or description? Ask me below and I'll have your listing read again.</li><li>Thinking bigger? <a href="/learn">Learn</a> has a lesson on taking a web app to the big stores.</li><li>Tell me what you're building next. I'm here for that too.</li></ol></section>`;
    }
    if (app.status === 'declined') return `${head('Step 8 · Live', 'Not this time, <em>yet</em>', 'We looked at your app and it isn\'t ready for the store. That\'s fixable.')}<section class="section">${app.review_note ? `<p class="notice">${esc(app.review_note)}</p>` : ''}<p>Make the changes, then go back through <a href="/apps/publish/check">Check</a> and send it again. Ask me below if you're not sure what to change.</p></section>`;
    return `${head('Step 8 · Live', 'It\'s <em>with us</em> now', 'You did it. Your app is in the review queue.')}
<section class="section"><h2>What happens next</h2><ol class="app-tips"><li>A person on our side opens your app and reads your listing.</li><li>If it's ready, it goes live at <code>${esc(listing)}</code>. If something needs changing, you'll hear it here, on this page.</li><li>Once it's live, this page turns into your share kit: your link, a post to start from and a link for your own site.</li></ol></section>`;
  },
};

async function render(step, draft, { env, store, input = {}, errors = {}, result = null, status = 200, pack, origin, prefillUrl = '', notice = '' }) {
  if (draft) draft.help = await store.appHelpFor(draft.app.id);
  const res = frame(step, draft, STEP_VIEW[step]({ app: draft ? draft.app : null, input, errors, env, result, cfg: appStoreConfig(pack), pack, origin, prefillUrl }), { env, origin, notice });
  return status === 200 ? res : new Response(res.body, { status, headers: res.headers });
}

/** Save a check: the listing and checklist as the manifest says now. */
async function runCheck(store, app, fetcher, now) {
  const result = await checkApp(app.url, fetcher, { now });
  await store.updateApp(app.id, { ...listingColumns(result), updated_at: now.toISOString() });
  return result;
}

const nextStep = (app, step) => { const next = STEPS[stepIndex(step) + 1].id; return stepIndex(app.step) > stepIndex(next) ? app.step : next; };

/** GET and POST under /apps; null for any other path. `pack`, `fetcher` and `now` are for tests. */
export async function appsRoute(request, env, store, { pack = PACK, fetcher = fetch, now = new Date() } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/apps' && !path.startsWith('/apps/')) return null;
  const cfg = appStoreConfig(pack);
  if (!cfg) return htmlResponse(notFoundPage(path), 404);
  const method = request.method.toUpperCase();
  const origin = url.origin;
  const read = method === 'GET' || method === 'HEAD';

  if (path === '/apps') {
    if (!read) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    let apps = [];
    try { apps = (await store.approvedApps()).map(appFromRow); } catch { apps = []; }
    return htmlResponse(storePage(apps, url.searchParams, pack));
  }
  if (path === '/apps/check') {
    if (!read) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    const target = String(url.searchParams.get('url') || '').trim().slice(0, APP_LIMITS.url);
    if (!target) return htmlResponse(checkPage('', null));
    return htmlResponse(checkPage(target, await checkApp(target, fetcher, { now })), 200, PRIVATE);
  }
  if (path === '/apps/submit') return redirect(`/apps/publish${url.searchParams.get('url') ? `/idea?url=${encodeURIComponent(url.searchParams.get('url'))}` : ''}`);
  if (path === '/apps/publish/resume') {
    const t = String(url.searchParams.get('t') || '');
    const app = /^[a-f0-9]{48}$/.test(t) ? appFromRow(await store.appByToken(await tokenHash(t))) : null;
    if (!app) return htmlResponse(layout({ title: 'That link has expired', path: '/apps/publish/resume', noindex: true, body: '<section class="page-head"><p class="eyebrow">Publish</p><h1>I can\'t find that one.</h1><p class="lead">That link doesn\'t match an app in progress. Check you copied all of it, or <a href="/apps/publish">start a new one</a>.</p></section>' }), 404, PRIVATE);
    return redirect(`/apps/publish/${STEPS[reached(app)].id}`, { 'set-cookie': setCookie(pack, t) });
  }

  const draft = path.startsWith('/apps/publish') ? await loadDraft(request, store, pack) : null;
  if (path === '/apps/publish') return redirect(`/apps/publish/${draft ? STEPS[reached(draft.app)].id : 'idea'}${!draft && url.searchParams.get('url') ? `?url=${encodeURIComponent(url.searchParams.get('url'))}` : ''}`);

  /* Ask your cofounder: on any step, with or without a draft (asking first starts one). */
  if (path === '/apps/publish/help') {
    if (method !== 'POST') return redirect('/apps/publish');
    const input = await readBody(request);
    const step = STEPS.some((s) => s.id === input.step) ? input.step : 'idea';
    const at = draft ? step : 'idea';
    const question = String(input.question ?? '').replace(/\r/g, '').trim().slice(0, APP_LIMITS.question + 1);
    if (String(input.website ?? '').trim()) return redirect(`/apps/publish/${step}#ask`);
    if (question.length < 5 || question.length > APP_LIMITS.question) return render(at, draft, { env, store, pack, origin, notice: `Ask me in a few words, up to ${APP_LIMITS.question} characters.`, status: 400 });
    const hash = await ipHash(request, env);
    const since = new Date(now.getTime() - 3600000).toISOString();
    if ((await store.appHelpRecentCount(hash, since)) >= APP_LIMITS.helpPerHour) return render(at, draft, { env, store, pack, origin, notice: 'That\'s a lot of questions for one hour. Give me a moment to catch up, then ask again.', status: 429 });
    let d = draft, cookie = null;
    if (!d) {
      if (!(await humanCheck(input, env, request))) return render(at, null, { env, store, pack, origin, notice: 'Please complete the human check, then ask again.', status: 400 });
      if ((await store.appsRecentCount(hash, since)) >= APP_LIMITS.draftsPerHour) return render(at, null, { env, store, pack, origin, notice: 'That\'s plenty of new apps for one hour. Please come back later.', status: 429 });
      const token = newToken();
      const id = await store.createApp({ step: 'idea', draft_token_hash: await tokenHash(token), ip_hash: hash, created_at: now.toISOString() });
      d = { token, app: appFromRow(await store.appById(id)) };
      cookie = setCookie(pack, token);
    }
    const agent = await cofounderAgent(question, { step, app: d.app, env, fetcher, pack });
    await store.addAppHelp({ app_id: d.app.id, step, question, ai_answer: agent.answer, escalated: agent.escalated, escalation_reason: agent.reason, created_at: now.toISOString(), ip_hash: hash });
    return redirect(`/apps/publish/${step}#ask`, cookie ? { 'set-cookie': cookie } : {});
  }

  let m;
  if ((m = /^\/apps\/publish\/([a-z]+)$/.exec(path))) {
    const step = m[1];
    if (stepIndex(step) < 0) return htmlResponse(notFoundPage(path), 404);
    if (!draft && step !== 'idea') return redirect('/apps/publish/idea');
    if (draft && step === 'live' && draft.app.status === 'draft') return redirect(`/apps/publish/${STEPS[reached(draft.app)].id}`);
    if (draft && stepIndex(step) > reached(draft.app)) return redirect(`/apps/publish/${STEPS[reached(draft.app)].id}`);
    const ctx = { env, store, pack, origin };
    if (read) {
      if (step === 'check' && draft.app.url && !locked(draft.app)) { const result = await runCheck(store, draft.app, fetcher, now); draft.app = appFromRow(await store.appById(draft.app.id)); return render(step, draft, { ...ctx, result }); }
      if (step === 'check' && draft.app.url) return render(step, draft, { ...ctx, result: { ok: !(draft.app.checks || []).some((c) => c.required && !c.ok), error: '', items: (draft.app.checks || []).map((c) => ({ ...c, ...(CHECKS.find((k) => k.id === c.id) ? { fix: CHECKS.find((k) => k.id === c.id).fix, snippet: '' } : {}) })) } });
      return render(step, draft, { ...ctx, prefillUrl: String(url.searchParams.get('url') || '').slice(0, APP_LIMITS.url) });
    }
    if (method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, POST' } });
    if (draft && locked(draft.app)) return redirect('/apps/publish/live');
    const input = await readBody(request);
    const stamp = now.toISOString();

    if (step === 'idea' && !draft) {
      if (String(input.website ?? '').trim()) return redirect('/apps/publish/idea');
      const v = validateStep('idea', input, pack);
      if (!v.ok) return render('idea', null, { ...ctx, input, errors: v.errors, status: 400, prefillUrl: input.url });
      if (!(await humanCheck(input, env, request))) return render('idea', null, { ...ctx, input, errors: { turnstile: 'Please complete the human check.' }, status: 400, prefillUrl: input.url });
      const hash = await ipHash(request, env);
      if ((await store.appsRecentCount(hash, new Date(now.getTime() - 3600000).toISOString())) >= APP_LIMITS.draftsPerHour) return render('idea', null, { ...ctx, input, errors: { idea: 'That\'s plenty of new apps for one hour. Please come back later.' }, status: 429 });
      const token = newToken();
      const id = await store.createApp({ ...v.value, step: 'name', draft_token_hash: await tokenHash(token), ip_hash: hash, created_at: stamp });
      const pre = validateStep('build', { url: input.url }, pack);
      if (input.url && pre.ok) await store.updateApp(id, { url: pre.value.url });
      return redirect('/apps/publish/name', { 'set-cookie': setCookie(pack, token) });
    }
    const app = draft.app;
    if (['idea', 'name', 'build', 'listing', 'terms'].includes(step)) {
      if (step === 'listing' && !app.checked_at) return redirect('/apps/publish/check');
      const v = validateStep(step, input, pack);
      if (!v.ok) return render(step, draft, { ...ctx, input, errors: v.errors, status: 400 });
      await store.updateApp(app.id, { ...v.value, step: nextStep(app, step), updated_at: stamp, ...(step === 'build' && v.value.url !== app.url ? { checked_at: null, checks_json: null } : {}) });
      return redirect(`/apps/publish/${STEPS[stepIndex(step) + 1].id}`);
    }
    if (step === 'check') {
      if (!app.url) return redirect('/apps/publish/build');
      const result = await runCheck(store, app, fetcher, now);
      if (!result.ok) { draft.app = appFromRow(await store.appById(app.id)); return render('check', draft, { ...ctx, result, status: 400 }); }
      await store.updateApp(app.id, { step: nextStep(app, 'check'), updated_at: stamp });
      return redirect('/apps/publish/listing');
    }
    if (step === 'submit') {
      /* A stored failing check does not block: the check below is the one that counts. */
      if (missingSteps(app).filter((id) => id !== 'check' || !app.checked_at).length) return render('submit', draft, { ...ctx, errors: { submit: 'A few steps still need you before this can go in.' }, status: 400 });
      /* The server reads the app again: what is stored is what the real manifest says now, and a failing app is not sent. */
      const result = await runCheck(store, app, fetcher, now);
      draft.app = appFromRow(await store.appById(app.id));
      if (!result.ok) return render('submit', draft, { ...ctx, result, errors: { submit: 'I read your app again just now and it no longer passes the required checks. Fix the items below, then send it again.' }, status: 400 });
      const dupe = await store.appByUrl(result.listing.start_url, app.id) || await store.appByUrl(result.url, app.id);
      if (dupe) return render('submit', draft, { ...ctx, errors: { submit: 'An app at that address is already listed or waiting for review. If it\'s yours and something is wrong, ask me below.' }, status: 409 });
      let slug = draft.app.slug;
      if (!slug) { const base = slugify(draft.app.name); slug = base; for (let n = 2; await store.appBySlug(slug); n += 1) slug = `${base.slice(0, 56)}-${n}`; }
      await store.updateApp(app.id, { slug, status: 'pending', step: 'live', submitted_at: stamp, updated_at: stamp, reviewed_at: null, review_note: null });
      return redirect('/apps/publish/live');
    }
    return redirect(`/apps/publish/${STEPS[reached(app)].id}`);
  }

  if ((m = /^\/apps\/([a-z0-9-]{1,64})$/.exec(path))) {
    if (!read) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    const app = appFromRow(await store.appBySlug(m[1]).catch(() => null));
    if (!app || app.status !== 'approved') return htmlResponse(notFoundPage(path), 404);
    return htmlResponse(listingPage(app, pack));
  }
  return htmlResponse(notFoundPage(path), 404);
}

/* ---------- The owner's side ---------- */

/** /admin/apps: the questions makers asked (escalated ones first) and the apps by status, each with its checklist. */
export function adminAppsPage({ apps = [], stats = {}, status = 'pending', help = [], message = '', aiOn = false }, pack = PACK) {
  const label = (id) => (STEPS.find((s) => s.id === id) || { label: id }).label;
  const tabs = APP_STATUSES.map((s) => `<a class="chip${status === s ? ' active' : ''}" href="/admin/apps?status=${s}">${s} (${stats[s] || 0})</a>`).join('');
  const open = help.filter((h) => h.escalated && !h.reply).length;
  const helpRows = help.map((h) => `<li class="card admin-card help-item${h.escalated && !h.reply ? ' is-open' : ''}"><p class="card-kicker">#${h.id} · ${esc(h.app_name || `app #${h.app_id}`)} (${esc(h.app_status || '')}) · ${esc(label(h.step))} · ${esc(String(h.created_at).slice(0, 16).replace('T', ' '))}${h.escalated ? ` · escalated: ${esc(ESCALATION_LABEL[h.escalation_reason] || h.escalation_reason || 'yes')}` : ''}</p>
<p class="help-q">${esc(h.question)}</p>
${h.ai_answer ? `<div class="help-ai"><p class="help-who">${esc(AI_LABEL)}</p><p>${esc(h.ai_answer)}</p></div>` : ''}
${h.reply ? `<div class="help-founder"><p class="help-who">Your reply${h.replied_at ? ` · ${esc(String(h.replied_at).slice(0, 10))}` : ''}</p><p>${esc(h.reply)}</p></div>` : ''}
<form method="post" action="/admin/apps/reply" class="review"><input type="hidden" name="id" value="${h.id}"><label class="visually-hidden" for="r-${h.id}">Reply</label><textarea id="r-${h.id}" name="reply" rows="2" maxlength="${APP_LIMITS.reply}" placeholder="${h.reply ? 'Replace your reply' : 'Reply as the founder'}" required></textarea><button class="button small primary" type="submit">${h.reply ? 'Update reply' : 'Reply'}</button></form></li>`).join('');
  const appRows = apps.map((a) => {
    const failing = (a.checks || []).some((c) => c.required && !c.ok) || !(a.checks || []).length;
    const interest = [a.cofounder_interest ? 'Cofounder track' : '', a.revenue_interest ? 'Revenue share' : ''].filter(Boolean);
    return `<article class="card admin-card app-admin">
<p class="card-kicker">#${a.id} · ${esc(a.status)} · ${esc(categoryLabel(a.category, pack) || 'no category')} · ${esc(String(a.submitted_at || a.updated_at || a.created_at).slice(0, 10))}${a.checked_at ? ` · checked ${esc(String(a.checked_at).slice(0, 16).replace('T', ' '))}` : ''}</p>
<div class="app-preview">${iconImg(a, 56)}<div><h3>${esc(a.name || '(no name yet)')}</h3>${a.maker_name ? `<p class="byline">${esc(a.maker_name)}${http(a.maker_url) ? ` · <a href="${esc(a.maker_url)}" rel="noopener noreferrer nofollow">profile</a>` : ''}</p>` : ''}</div></div>
${a.url ? `<p><a class="outlink" href="${esc(http(a.url))}" rel="noopener noreferrer nofollow">${esc(a.url)}</a>${a.slug && a.status === 'approved' ? ` · <a href="/apps/${esc(a.slug)}">listing</a>` : ''}</p>` : ''}
${a.description ? `<p>${esc(a.description)}</p>` : ''}
<p class="small"><strong>Idea:</strong> ${esc(a.idea || '')} <strong>For:</strong> ${esc(a.audience || '')}</p>
<p class="small muted">Support: ${esc(a.support || 'none yet')}${interest.length ? ` · Interested in: ${esc(interest.join(' and '))} (expression of interest only, nothing agreed)` : ''}${a.review_note ? ` · note: ${esc(a.review_note)}` : ''}</p>
${checkSummary(a.checks)}
<form class="review" method="post" action="/admin/apps/review"><input type="hidden" name="id" value="${a.id}"><input type="hidden" name="back" value="${esc(status)}"><input name="note" type="text" placeholder="Note to the maker (optional)" maxlength="300">${a.status !== 'approved' && a.status !== 'draft' ? `<button class="button small primary" name="status" value="approved"${failing ? ' disabled title="Re-check first: it does not pass the required checks"' : ''}>Approve</button>` : ''}${a.status !== 'declined' && a.status !== 'draft' ? '<button class="button small" name="status" value="declined">Decline</button>' : ''}${a.status === 'approved' || a.status === 'declined' ? '<button class="button small ghost" name="status" value="pending">Back to pending</button>' : ''}</form>
${a.url ? `<form method="post" action="/admin/apps/recheck"><input type="hidden" name="id" value="${a.id}"><input type="hidden" name="back" value="${esc(status)}"><button class="button small ghost" type="submit">Re-check now</button></form>` : ''}
</article>`;
  }).join('');
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Moderation</a></p><h1>${esc(appStoreConfig(pack).title)}</h1><p class="lead">Questions from makers, then their apps. ${aiOn ? `The ${esc(AI_LABEL)} answers first; equity, money, legal and approval questions always come to you.` : 'No AI agent is configured, so every question comes straight to you.'}</p>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}</section>
<section class="section"><h2>Ask your cofounder: ${open} waiting for you</h2>${helpRows ? `<ul class="admin-help">${helpRows}</ul>` : '<p class="muted">No questions yet.</p>'}</section>
<section class="section"><h2>Apps</h2><p class="chips">${tabs}</p>${appRows || '<p class="muted">Nothing here.</p>'}</section>`;
  return layout({ title: 'App store', path: '/admin/apps', body, noindex: true });
}

/** GET /admin/apps and its three posts (review, recheck, reply). `who` is the signed-in owner or 'token', null when nobody is. */
export async function adminAppsRoute(request, who, store, { pack = PACK, fetcher = fetch, now = new Date(), env = {} } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!appStoreConfig(pack)) return htmlResponse(notFoundPage(path), 404);
  const method = request.method.toUpperCase();
  if (!who) return method === 'GET' || method === 'HEAD' ? redirect('/admin/login') : new Response('Sign in first', { status: 401, headers: PRIVATE });
  const back = (status, msg) => redirect(`/admin/apps?status=${APP_STATUSES.includes(status) ? status : 'pending'}&m=${encodeURIComponent(msg)}`);
  if (path === '/admin/apps' && (method === 'GET' || method === 'HEAD')) {
    const status = APP_STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
    return htmlResponse(adminAppsPage({ apps: (await store.appsByStatus(status)).map(appFromRow), stats: await store.appStats(), status, help: await store.appHelpQueue(), message: url.searchParams.get('m') || '', aiOn: ontoldOn(env) }, pack), 200, PRIVATE);
  }
  if (method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST', ...PRIVATE } });
  const body = await readBody(request);
  const stamp = now.toISOString();
  if (path === '/admin/apps/reply') {
    const reply = String(body.reply || '').replace(/\r/g, '').trim().slice(0, APP_LIMITS.reply);
    if (!reply) return back('pending', 'A reply needs some words.');
    const ok = await store.replyAppHelp(Number(body.id), reply, typeof who === 'string' ? who : 'owner', stamp);
    return back(body.back, ok ? `Replied to question #${Number(body.id)}.` : 'That question was not found.');
  }
  const app = appFromRow(await store.appById(Number(body.id)));
  if (!app) return back(body.back, `#${Number(body.id)} not found`);
  if (path === '/admin/apps/recheck') {
    if (!app.url) return back(body.back, `#${app.id} has no address to check yet.`);
    const result = await runCheck(store, app, fetcher, now);
    const failing = result.items.filter((i) => i.required && !i.ok).length;
    return back(body.back, `#${app.id} re-checked: ${failing ? `${failing} required ${failing === 1 ? 'check fails' : 'checks fail'}` : 'every required check passes'}.`);
  }
  if (path === '/admin/apps/review') {
    const status = ['approved', 'declined', 'pending'].includes(body.status) ? body.status : null;
    if (!status || app.status === 'draft') return back(body.back, 'That review did not make sense.');
    if (status === 'approved' && ((app.checks || []).some((c) => c.required && !c.ok) || !(app.checks || []).length)) return back(body.back, `#${app.id} does not pass the required checks. Re-check it first.`);
    await store.updateApp(app.id, { status, reviewed_at: stamp, review_note: String(body.note || '').trim().slice(0, 300) || null, ...(status === 'approved' && !app.slug ? { slug: slugify(app.name) } : {}) });
    return back(body.back, `#${app.id} ${status}`);
  }
  return htmlResponse(notFoundPage(path), 404);
}
