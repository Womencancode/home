/* Pack file: industry certifications. /certifications lists each one (issuer, exam code, price, official link, what it proves, free
 * prep) and "Your instructor's progress"; /admin/certifications lets a signed-in owner show or hide each item and mark what she has
 * completed, with a date and an optional proof link. Both live in the engine's site_settings (certifications.show and
 * certifications.progress). Hidden items never render; nothing is marked done unless the founder sets it. */
import data from '../data/certifications.json' with { type: 'json' };
import { SITE, esc, layout, sectionHead, htmlResponse } from './html.mjs';
import { notFoundPage } from './pages/about.mjs';
import { storeFor } from './store.mjs';
import { signInConfigured } from './owners.mjs';
import { readBody } from './submissions.mjs';
import { httpsUrl } from './tracks.mjs';
import { longDate } from './cohorts.mjs';
import { certOwner } from './certadmin.mjs';
import { interestLink, registerInterest } from './interest.mjs';

export const ITEMS = (data.items || []).filter((i) => i && /^[a-z0-9-]{2,60}$/.test(i.id || '') && i.name && httpsUrl(i.url));
const SHOW = 'certifications.show', PROGRESS = 'certifications.progress';
/** Each certification's own "Register interest" key. */
export const certKey = (id) => `cert-${id}`;
registerInterest(() => ITEMS.map((i) => ({ id: certKey(i.id), label: `Certification: ${i.name}` })));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

/** The price line: free ones say so; we never show a third-party fee (they change), only "Check the official page". The data's
 * "price" numbers are kept for the record but unused. */
export const priceText = (p) => (p === 0 ? 'Free' : 'Check the official page');

async function settings(env) {
  const s = storeFor(env);
  let show = null, progress = null;
  try { show = await s.getSetting(SHOW); progress = await s.getSetting(PROGRESS); } catch { /* storage down: defaults */ }
  return { show: show && typeof show === 'object' ? show : {}, progress: progress && typeof progress === 'object' ? progress : {} };
}
/** Items with the founder's toggles applied: { ...item, show, done: { date, proof } | null }. */
export async function itemsFor(env, items = ITEMS) {
  const { show, progress } = await settings(env);
  return items.map((i) => {
    const p = progress[i.id];
    const done = p && p.done === true && DATE.test(p.date || '') ? { date: p.date, proof: httpsUrl(p.proof) ? p.proof : '' } : null;
    return { ...i, show: typeof show[i.id] === 'boolean' ? show[i.id] : i.show !== false, done };
  });
}

const card = (i) => `<li class="wcc-ic" id="${esc(i.id)}"><p class="wcc-ic-k">${esc(i.issuer)}${i.code ? ` · <span class="wcc-ic-code">${esc(i.code)}</span>` : ''}</p>
  <h3>${esc(i.name)}</h3><p>${esc(i.proves || '')}</p>${i.note ? `<p class="wcc-ic-note">${esc(i.note)}</p>` : ''}
  <dl><div><dt>Price</dt><dd>${esc(priceText(i.price))}</dd></div>${i.partnersOnly ? '<div><dt>Who can take it</dt><dd>Claude Partner Network organisations only</dd></div>' : ''}</dl>
  <p class="wcc-ic-links"><a href="${esc(i.url)}" rel="noopener">Official page</a>${(i.prep || []).filter((p) => httpsUrl(p.url)).map((p) => ` · <a href="${esc(p.url)}" rel="noopener">${esc(p.name)}</a>`).join('')}</p>
  <p class="wcc-ic-interest">${interestLink(certKey(i.id), i.name, { cls: 'button small ghost' })}</p>
  ${i.done ? `<p class="wcc-ic-done">Your instructor completed this on ${esc(longDate(i.done.date))}${i.done.proof ? `. <a href="${esc(i.done.proof)}" rel="noopener">See the certificate</a>` : ''}</p>` : ''}</li>`;

export function progressHtml(list) {
  const plan = list.filter((i) => i.kind === 'course' || i.kind === 'exam');
  const done = plan.filter((i) => i.done);
  const courses = list.filter((i) => i.kind === 'course'), cDone = courses.filter((i) => i.done).length;
  return `<section class="section wcc-progress" id="progress">${sectionHead("Your instructor's progress", null, 'The founder takes these herself, so you can see it can be done. Only what she has finished is marked.', 'Proof of concept')}
  ${courses.length ? `<p class="wcc-prog-line"><b>${cDone} of ${courses.length}</b> Anthropic Academy courses done</p><div class="wcc-prog-bar" role="img" aria-label="${cDone} of ${courses.length} courses done"><span style="width:${Math.round((100 * cDone) / courses.length)}%"></span></div>` : ''}
  ${done.length ? `<ul class="wcc-prog-list">${done.sort((a, b) => b.done.date.localeCompare(a.done.date)).map((i) => `<li><b>${esc(i.name)}</b> <span>${esc(i.issuer)} · ${esc(longDate(i.done.date))}</span>${i.done.proof ? ` <a href="${esc(i.done.proof)}" rel="noopener">Proof</a>` : ''}</li>`).join('')}</ul>` : '<p class="wcc-tba">Nothing completed yet. Each one appears here with its date when she finishes it.</p>'}</section>`;
}

export async function certificationsPage(env) {
  const list = (await itemsFor(env)).filter((i) => i.show);
  const exams = list.filter((i) => i.kind === 'exam'), academy = list.filter((i) => i.kind === 'academy'), courses = list.filter((i) => i.kind === 'course');
  const body = `<section class="page-head"><p class="eyebrow">Go further</p><h1>Industry certifications</h1><p class="lead">Exams and free courses from the companies that make the tools. They are theirs, not ours: we link to the official pages and the free prep. Each exam's fee is set by its provider, so check the official page.</p></section>
${exams.length ? `<section class="section">${sectionHead('Certification exams', null, null, null)}<ul class="wcc-icards">${exams.map(card).join('')}</ul></section>` : ''}
${academy.length || courses.length ? `<section class="section">${sectionHead('Anthropic Academy', null, 'Free courses, each with a free certificate of completion. This is the founder\'s own plan.', null)}${academy.length ? `<ul class="wcc-icards">${academy.map(card).join('')}</ul>` : ''}${courses.length ? `<ul class="wcc-courses">${courses.map((i) => `<li${i.done ? ' class="is-done"' : ''}><span class="wcc-tick" aria-hidden="true">${i.done ? '✓' : ''}</span><a href="${esc(i.url)}" rel="noopener">${esc(i.name)}</a>${i.note ? ` <small>${esc(i.note)}</small>` : ''}<span class="wcc-c-state">${i.done ? `Done ${esc(longDate(i.done.date))}` : 'Not done yet'}</span></li>`).join('')}</ul>` : ''}</section>` : ''}
${progressHtml(list)}`;
  return layout({ title: 'Industry certifications', description: `Industry certifications for builders, with free prep, and the ${SITE.name} founder's own progress.`, path: '/certifications', body });
}

/** The optional home block "wcc-certifications": the first few shown exams and a link. */
export async function certificationsBlock(env) {
  const list = (await itemsFor(env)).filter((i) => i.show && i.kind === 'exam').slice(0, 3);
  if (!list.length) return '';
  return `<section class="section">${sectionHead('Industry certifications', '/certifications', 'Real exams from the companies that make the tools, with free prep.', 'Go further')}<ul class="wcc-icards">${list.map(card).join('')}</ul></section>`;
}

export async function adminCertificationsPage(env, owner, message = '') {
  const list = await itemsFor(env);
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Admin</a></p><h1>Certifications on the site</h1><p class="lead">Choose what shows on <a href="/certifications">/certifications</a>, and mark what you have completed. Signed in as ${esc(owner)}.</p>${message ? `<p class="wcc-ok-line" role="status">${esc(message)}</p>` : ''}</section>
<section class="section"><ul class="wcc-admin-list">${list.map((i) => `<li><div><b>${esc(i.name)}</b> <span class="wcc-pill${i.show ? '' : ' is-void'}">${i.show ? 'shown' : 'hidden'}</span>${i.done ? ' <span class="wcc-pill">done</span>' : ''}<br><small>${esc(i.issuer)}${i.code ? ` · ${esc(i.code)}` : ''}</small></div>
  <div class="wcc-admin-acts"><form method="post" action="/admin/certifications/show"><input type="hidden" name="id" value="${esc(i.id)}"><input type="hidden" name="show" value="${i.show ? '0' : '1'}"><button class="button small ghost">${i.show ? 'Hide' : 'Show'}</button></form>
  <form method="post" action="/admin/certifications/progress"><input type="hidden" name="id" value="${esc(i.id)}"><input type="date" name="date" value="${esc(i.done ? i.done.date : '')}" aria-label="Date you completed ${esc(i.name)}"><input name="proof" type="url" placeholder="Proof link (Credly, Skilljar)" value="${esc(i.done ? i.done.proof : '')}" aria-label="Proof link for ${esc(i.name)}"><button class="button small primary" name="done" value="1">Mark done</button>${i.done ? '<button class="button small ghost" name="done" value="0">Not done</button>' : ''}</form></div></li>`).join('')}</ul></section>`;
  return layout({ title: 'Certifications', description: 'Show, hide and mark certifications done.', path: '/admin/certifications', body, noindex: true });
}

export async function adminCertificationsRoute(request, env = {}) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, ''), method = request.method.toUpperCase();
  if (!(signInConfigured(env) || env.ADMIN_TOKEN)) return htmlResponse(notFoundPage(path), 404);
  const owner = await certOwner(request, env);
  if (!owner) return method === 'GET' ? new Response(null, { status: 303, headers: { location: '/admin/login' } }) : new Response(JSON.stringify({ error: 'only a signed-in owner can do this' }), { status: 403, headers: { 'content-type': 'application/json', ...NO_STORE } });
  const origin = request.headers.get('origin');
  if (method === 'POST' && origin && origin !== url.origin) return new Response('Cross-site request refused', { status: 403, headers: NO_STORE });
  const back = (m) => new Response(null, { status: 303, headers: { location: `/admin/certifications?m=${encodeURIComponent(m)}`, 'cache-control': 'no-store' } });
  const store = storeFor(env);
  if (method === 'POST') {
    const b = await readBody(request); const item = ITEMS.find((i) => i.id === b.id);
    if (!item) return back('That item was not found.');
    const { show, progress } = await settings(env);
    if (path === '/admin/certifications/show') { show[item.id] = b.show === '1'; await store.setSetting(SHOW, show, owner); return back(`${item.name}: ${show[item.id] ? 'shown' : 'hidden'}.`); }
    if (path === '/admin/certifications/progress') {
      if (b.done === '0') { delete progress[item.id]; await store.setSetting(PROGRESS, progress, owner); return back(`${item.name}: not done.`); }
      const date = String(b.date || '').trim(), proof = String(b.proof || '').trim();
      if (!DATE.test(date)) return back('Add the date you completed it.');
      if (proof && !httpsUrl(proof)) return back('The proof link must be https.');
      progress[item.id] = { done: true, date, ...(proof ? { proof } : {}) };
      await store.setSetting(PROGRESS, progress, owner);
      return back(`${item.name}: done on ${date}.`);
    }
    return new Response('Not found', { status: 404, headers: NO_STORE });
  }
  if (path !== '/admin/certifications') return new Response('Not found', { status: 404, headers: NO_STORE });
  return htmlResponse(await adminCertificationsPage(env, owner, url.searchParams.get('m') || ''), 200, NO_STORE);
}
