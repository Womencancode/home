/* /festivals: open film festivals and competitions from the partner festival directory, plus a home block of a few. Each row links to
 * the festival's page in the directory, with the festival's own entry link beside it. A paid placement always shows its label. */
import { PACK } from '../site.mjs';
import { COUNTRIES, countryByCode } from '../countries.mjs';
import { esc, layout, sectionHead, chip, htmlResponse } from '../html.mjs';
import { notFoundPage } from './about.mjs';
import { directoryConfig, festivalsFor, KINDS } from '../partners/festivals.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KIND_LABEL = { festival: 'Festivals', competition: 'Competitions' };
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));
const countryOf = (name) => BY_NAME.get(String(name || '').toLowerCase()) || (/^[A-Z]{2}$/.test(name || '') ? countryByCode(name) : null);

const whenOf = (r) => (r.startDate ? `Starts ${new Date(`${r.startDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : r.month ? `Usually in ${MONTHS[r.month - 1]}` : '');

/** One festival: where and when, the paid-placement label when there is one, its directory page and its own entry link. */
export function festivalCard(r) {
  const c = countryOf(r.country);
  const place = [r.city, c ? c.name : r.country].filter(Boolean).join(', ');
  const when = whenOf(r);
  const rel = r.promotedLabel ? 'noopener sponsored' : 'noopener';
  return `<article class="lesson-card fest-card${r.promotedLabel ? ' promoted' : ''}" id="fest-${esc(r.slug)}">
  ${place || when ? `<span class="feature-kicker">${c ? `${c.flag} ` : ''}${esc(place)}${place && when ? ' · ' : ''}${esc(when)}</span>` : ''}
  ${r.promotedLabel ? `<span class="fest-promoted">${esc(r.promotedLabel)}</span>` : ''}
  <b><a href="${esc(r.page)}" rel="${rel}">${esc(r.name)}</a></b>
  ${r.submissionUrl ? '<small class="fest-open">Open for entries</small>' : ''}
  <span class="fest-links"><a class="button small primary" href="${esc(r.page)}" rel="${rel}">See details</a>${r.submissionUrl ? `<a class="button small ghost" href="${esc(r.submissionUrl)}" rel="${rel} nofollow">Enter your film</a>` : ''}</span>
</article>`;
}

/** The credit under a list: the directory's name and how many it lists, plus the way to the rest when this site sees only a window. */
function credit(cfg, result) {
  const more = !result.keyed && result.matched > result.rows.length ? ` <a href="${esc(cfg.site)}/">See all ${result.matched} on ${esc(cfg.name)}</a>` : '';
  return `<p class="fest-credit">From the <a href="${esc(cfg.site)}/">${esc(cfg.name)}</a> directory: ${result.matched} listed.${more}</p>`;
}

/** /festivals with kind chips and a country filter passed through to the directory. `result` is festivalsFor()'s answer. */
export function festivalsPage(params, result, cfg) {
  const kind = KINDS.includes(params.get('kind')) ? params.get('kind') : '';
  const c = countryByCode(params.get('country'));
  const link = (changes) => { const p = new URLSearchParams(); const v = { kind, country: c ? c.code : '', ...changes }; for (const [k, x] of Object.entries(v)) if (x) p.set(k, x); const s = p.toString(); return `/festivals${s ? `?${s}` : ''}`; };
  const list = result.error
    ? `<div class="invite"><p>The festival list could not be loaded just now. Try again in a few minutes, or <a href="${esc(cfg.site)}/">browse ${esc(cfg.name)}</a>.</p></div>`
    : result.rows.length
      ? `<div class="lesson-grid">${result.rows.map(festivalCard).join('')}</div>${credit(cfg, result)}`
      : `<div class="invite"><p>Nothing open matches that yet. <a class="button" href="${esc(link({ kind: '', country: '' }))}">See everything</a></p></div>${credit(cfg, result)}`;
  const body = `
<section class="page-head"><p class="eyebrow">Festivals</p><h1>${esc(cfg.title)}</h1>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}
  <p class="chips">${chip('Everything', link({ kind: '' }))}${KINDS.map((k) => `<a class="chip${kind === k ? ' active' : ''}" href="${esc(link({ kind: k }))}">${esc(KIND_LABEL[k])}</a>`).join('')}</p>
  ${c ? `<p class="chips">${chip('Anywhere', link({ country: '' }))}<a class="chip active" href="${esc(link({}))}">${c.flag} ${esc(c.name)}</a></p>` : ''}
  <form class="opp-filter" method="get" action="/festivals">
    ${kind ? `<input type="hidden" name="kind" value="${esc(kind)}">` : ''}
    <label class="visually-hidden" for="f-country">Country</label><select id="f-country" name="country"><option value="">Anywhere</option>${COUNTRIES.map((k) => `<option value="${k.code}"${c && c.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
    <button class="button small" type="submit">Show</button>
  </form>
</section>
<section class="section fest-list">${list}</section>`;
  return layout({ title: cfg.title, description: cfg.lead || cfg.title, path: '/festivals', body, current: '/festivals' });
}

/** The response for /festivals, or null for any other path: 404 when the pack has no directory, a short-cached empty state when the
 * directory could not be read. `opts.pack` overrides the site pack (tests). */
export async function festivalsRoute(path, params, env = {}, ctx = null, opts = {}) {
  if (path !== '/festivals') return null;
  const pack = opts.pack || PACK;
  const cfg = directoryConfig(pack);
  if (!cfg) return htmlResponse(notFoundPage(path), 404);
  const kind = KINDS.includes(params.get('kind')) ? params.get('kind') : '';
  const c = countryByCode(params.get('country'));
  const result = await festivalsFor(env, { kind, country: c ? c.name : '' }, { pack, ctx });
  return htmlResponse(festivalsPage(params, result, cfg), 200, { 'cache-control': result.error ? 'public, max-age=30' : 'public, max-age=600, stale-while-revalidate=3600' });
}

/** The home block: up to `n` open festivals with the directory credit; '' when off, failed or empty. */
export function festivalsBlock(result, { n = 4, pack = PACK } = {}) {
  const cfg = directoryConfig(pack);
  if (!cfg || !result || result.error || !result.rows.length) return '';
  return `<section class="section fest-rail">${sectionHead(cfg.title, { href: '/festivals', label: 'All festivals' }, cfg.lead || null, 'Festivals')}<div class="lesson-grid">${result.rows.slice(0, n).map(festivalCard).join('')}</div>${credit(cfg, result)}</section>`;
}
