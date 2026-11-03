/* /tributes: "Who taught you?" Approved tributes pinned as clippings on a corkboard, filterable by role, and the form to add one.
 * Off unless the pack sets "tributes" (src/tributes.mjs). */
import { COUNTRIES, countryByCode } from '../countries.mjs';
import { SITE, esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { rolesOf } from '../roles.mjs';
import { tributesConfig, tributesFrom, validateTribute, TRIBUTE_LIMITS } from '../tributes.mjs';
import { acceptWith } from '../submissions.mjs';
import { field, tick, guards, valOf, sentNote } from './forms.mjs';
import { notFoundPage } from './about.mjs';

const roleLabel = (id) => (rolesOf().find((r) => r.id === id) || {}).label || '';

/** One clipping: the teacher's name as a headline, where and when, the line in quotes, and who sent it (or "A reader"). */
export function clipping(t) {
  const c = countryByCode(t.country);
  const where = [t.place, c && c.name].filter(Boolean).join(', ');
  return `<article class="clipping${t.quoted ? ' is-quoted' : ''}" id="${esc(t.id)}">
  <p class="clip-kicker">${t.role ? esc(roleLabel(t.role)) : 'Taught by'}${t.year ? ` · ${esc(String(t.year))}` : ''}</p>
  <h3 class="clip-teacher">${esc(t.teacher)}</h3>
  ${where ? `<p class="clip-place">${esc(where)}</p>` : ''}
  <blockquote class="clip-line"><p>${esc(t.line)}</p></blockquote>
  <p class="clip-by">${t.quoted ? `${esc(t.by)}, quoted from <a href="${esc(t.source.url)}" rel="noopener nofollow" target="_blank">${esc(t.source.name)}</a>` : `From ${t.by ? esc(t.by) : 'a reader'}`}</p>
</article>`;
}

const emptyBoard = (cfg) => `<div class="cork-empty"><p class="clip-kicker">The board is waiting</p><p class="cork-empty-h">The first clipping could be yours.</p><p>No tributes are up yet. Name the teacher who changed things for you, in one line, and a person reads it before it is pinned here.</p><p><a class="button primary" href="/tributes#add">Name your teacher</a></p></div>`;

/** The corkboard: clippings, or the first-entry invitation. */
export const corkboard = (list, cfg) => `<div class="corkboard">${list.length ? `<div class="clippings">${list.map(clipping).join('')}</div>` : emptyBoard(cfg)}</div>`;

/** The home block: up to six clippings, a chosen role's first, with the link to all and to add one; '' when off. */
export function tributesBlock(cat, role = null) {
  const cfg = tributesConfig();
  if (!cfg) return '';
  const all = tributesFrom(cat);
  const fit = role && cfg.roles.includes(role.id) ? all.filter((t) => t.role === role.id) : [];
  const list = [...fit, ...all.filter((t) => !fit.includes(t))].slice(0, 6);
  return `<section class="section tributes-band">${sectionHead(cfg.title, { href: role && cfg.roles.includes(role.id) ? `/tributes?role=${role.id}` : '/tributes', label: list.length ? 'The whole board' : 'Add yours' }, cfg.lead, 'Tributes')}
  ${corkboard(list, cfg)}${list.length ? '<p class="cork-add"><a class="button primary" href="/tributes#add">Name your teacher</a></p>' : ''}
</section>`;
}

function form(state, env, cfg) {
  const input = state.input || {}, errors = state.errors || {}, val = valOf(input);
  const roleOpts = cfg.roles.map((id) => `<option value="${esc(id)}"${input.role === id ? ' selected' : ''}>${esc(roleLabel(id))}</option>`).join('');
  return `<form class="submit-form tribute-form" method="post" action="/tributes" novalidate>
  <div class="field-row">
    ${field(errors, 'teacher', 'Your teacher\'s name', `<input id="f-teacher" name="teacher" type="text" maxlength="${TRIBUTE_LIMITS.teacher}" value="${val('teacher')}" required placeholder="Mrs Okafor">`)}
    ${field(errors, 'place', 'School, college or place', `<input id="f-place" name="place" type="text" maxlength="${TRIBUTE_LIMITS.place}" value="${val('place')}" required placeholder="Brixton, south London">`)}
  </div>
  <div class="field-row">
    ${field(errors, 'country', 'Country', `<select id="f-country" name="country" required><option value="">Choose</option>${COUNTRIES.map((k) => `<option value="${k.code}"${input.country === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>`)}
    ${field(errors, 'year', 'Year', `<input id="f-year" name="year" type="text" inputmode="numeric" maxlength="4" value="${val('year')}" placeholder="1998">`, 'Optional.')}
    ${roleOpts ? field(errors, 'role', 'Where they taught', `<select id="f-role" name="role"><option value="">Choose (optional)</option>${roleOpts}</select>`) : ''}
  </div>
  ${field(errors, 'line', 'What they did, in one line', `<textarea id="f-line" name="line" rows="3" maxlength="${TRIBUTE_LIMITS.line}" required data-count>${val('line')}</textarea>`, `Up to ${TRIBUTE_LIMITS.line} characters. Kind and true: this is about something that went right.`)}
  ${tick(errors, 'show_name', 'Show my first name or initials with it.', input.show_name === 'yes')}
  ${field(errors, 'by', 'Your first name or initials', `<input id="f-by" name="by" type="text" maxlength="${TRIBUTE_LIMITS.by}" value="${val('by')}" autocomplete="given-name" placeholder="Ade, or A.O.">`, 'Only shown if you tick the box above. We never ask for your email.')}
  ${tick(errors, 'consent', 'This is true and kind, and you may publish it after a person has read it.', input.consent === 'yes')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Pin my tribute</button></p>
</form>`;
}


/** /tributes with ?role= filtering. */
export function tributesPage(params, all, state = {}, env = {}) {
  const cfg = tributesConfig();
  const role = cfg.roles.includes(params.get('role')) ? params.get('role') : '';
  const list = role ? all.filter((t) => t.role === role) : all;
  const chips = cfg.roles.length && all.length ? `<p class="chips tribute-roles"><a class="chip${role ? '' : ' active'}" href="/tributes">Everyone</a>${cfg.roles.map((id) => `<a class="chip${role === id ? ' active' : ''}" href="/tributes?role=${esc(id)}">${esc(roleLabel(id))}</a>`).join('')}</p>` : '';
  const body = `
<section class="page-head"><p class="eyebrow">Tributes</p><h1>${esc(cfg.title)}</h1><p class="lead">${esc(cfg.lead)}</p>${chips}</section>
<section class="section">${role && !list.length && all.length ? `<p class="muted">Nothing pinned under ${esc(roleLabel(role))} yet. <a href="/tributes">See the whole board</a>.</p>` : ''}${list.length || !all.length ? corkboard(list, cfg) : ''}</section>
<section class="section" id="add">${sectionHead('Name your teacher', null, 'One line, their name and where. A person reads every tribute before it is pinned, and your email is never asked for.', 'Add yours')}
${sentNote(state, 'tribute')}${form(state, env, cfg)}</section>`;
  return layout({ title: cfg.title, description: `${cfg.lead} On ${SITE.name}.`, path: '/tributes', body, current: '/tributes', noindex: !!state.input });
}

/** The route: GET shows the board, POST takes a tribute through the moderated lane. null for other paths; 404 when off. */
export async function tributesRoute(request, env, store, { catalogue, owner } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/tributes') return null;
  if (!tributesConfig()) return htmlResponse(notFoundPage(path), 404);
  const method = request.method.toUpperCase();
  const all = async () => tributesFrom(await catalogue());
  if (method === 'GET' || method === 'HEAD') return htmlResponse(tributesPage(url.searchParams, await all(), {}, env));
  if (method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, POST' } });
  const now = new Date();
  const r = await acceptWith(request, env, store, (input) => validateTribute(input, { now }), now);
  const who = r.body.ok && r.body.id ? await owner() : null;
  if (who) await store.review(r.body.id, 'approved', `published by the owner (${who})`, now.toISOString());
  const state = r.body.ok ? { ok: true, id: r.body.id, published: !!who } : { ok: false, errors: r.body.errors, input: r.body.input };
  return htmlResponse(tributesPage(url.searchParams, await all(), state, env), r.body.ok ? 200 : r.status, { 'cache-control': 'no-store' });
}
