import { T } from '../site.mjs';
import { countryByCode, COUNTRIES } from '../countries.mjs';
import { esc, layout, sectionHead, chip, localSrc } from '../html.mjs';
import { match, daysLeft, FIELDS, FIELD_LABEL, OPPORTUNITIES } from '../opportunities.mjs';
import { payText, PAY_SHOWN } from '../jobs.mjs';

/** The prize line: the prize, or for a job its pay band. */
const prizeOf = (o) => o.prize || (o.pay ? payText(o.pay) : '');

const TYPE_LABEL = { competition: 'Competition', hackathon: 'Hackathon', grant: 'Grant', accelerator: 'Accelerator', fellowship: 'Fellowship', scholarship: 'Scholarship', job: 'Job', 'call-for-entries': 'Call for entries', residency: 'Residency', programme: 'Programme', 'access-scheme': 'Way in', 'summer-school': 'Summer school', internship: 'Internship', appointment: 'Public role', cfp: 'Call for speakers' };
/** Plural labels for the kind chips on /opportunities. */
export const CATEGORY_LABEL = { cfp: 'Calls for speakers and papers' };

/** One opportunity: what, who runs it, the prize, who can enter, how long is left, and the organiser's own page to apply. */
export function opportunityCard(o, now = new Date()) {
  const left = daysLeft(o, now);
  const date = o.deadline ? new Date(`${o.deadline}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  const when = o.rolling && !o.deadline ? 'Rolling' : o.checked === false ? `Listed to close ${date}` : left <= 0 ? 'Closes today' : left === 1 ? '1 day left' : left <= 30 ? `${left} days left` : `Closes ${date}`;
  return `<article class="opp${left != null && left <= 14 ? ' closing' : ''}${o.image ? ' has-pic' : ''}" id="${esc(o.id)}">
  ${oppPicture(o) || '<span class="opp-slot" aria-hidden="true"></span>'}
  <p class="opp-top"><span class="opp-type">${esc(TYPE_LABEL[o.type] || o.type)}</span>${o.remote ? '<span class="opp-remote">Remote</span>' : ''}<span class="opp-when">${esc(when)}</span></p>
  <h3><a href="${esc(o.url)}" rel="noopener nofollow" target="_blank">${esc(o.title)}</a></h3>
  <p class="opp-org">${esc(o.organiser)}</p>
  ${prizeOf(o) ? `<p class="opp-prize">${esc(prizeOf(o))}${!o.prize && o.pay ? ` <span class="pay-badge">${PAY_SHOWN}</span>` : ''}</p>` : '<span class="opp-slot" aria-hidden="true"></span>'}
  <p class="opp-who">${esc(o.eligibility || 'Open worldwide')}</p>
  ${o.whatToExpect ? `<p class="opp-expect"><strong>What to expect:</strong> ${esc(o.whatToExpect)}</p>` : '<span class="opp-slot" aria-hidden="true"></span>'}
  ${o.checked === false ? '<p class="opp-check">Confirm the deadline and terms on the organiser\'s page.</p>' : '<span class="opp-slot" aria-hidden="true"></span>'}
  <p class="opp-fields">${o.fields.map((f) => `<a href="${o.lane ? '/open-doors' : '/opportunities'}?field=${esc(f)}">${esc(FIELD_LABEL[f] || f)}</a>`).join('')}</p>
  <p class="opp-go"><a class="button small primary" href="${esc(o.url)}" rel="noopener nofollow" target="_blank">${o.lane ? 'See how to get in' : 'See how to enter'}</a></p>
</article>`;
}

/** The organiser's own share picture, copied locally and credited to them; nothing when the page has none. */
function oppPicture(o) {
  if (!o.image || !o.image.src) return o.lane ? `<span class="opp-pic opp-pic-blank opp-lane-${esc(o.lane)}" aria-hidden="true"><span>${esc(o.organiser)}</span></span>` : '';
  return `<a class="opp-pic" href="${esc(o.url)}" rel="noopener nofollow" target="_blank" tabindex="-1" aria-hidden="true"><img src="${esc(localSrc(o.image.src))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="opp-credit">${esc(o.image.credit || o.organiser)}</span></a>`;
}

const whenShort = (o, now) => { const left = daysLeft(o, now); return o.rolling && !o.deadline ? 'Rolling' : left == null ? '' : left <= 0 ? 'Closes today' : left === 1 ? '1 day left' : left <= 30 ? `${left} days left` : `Closes ${new Date(`${o.deadline}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`; };

/** A compact row of up to `n` opportunities for the hero: picture, type, title, prize and time left, linking to the organiser. */
export function opportunityStrip(list, { title = 'Opportunities for you', lead = '', n = 3, now = new Date() } = {}) {
  if (!list.length) return '';
  return `<section class="opp-strip" aria-labelledby="opp-strip-h"><p class="opp-strip-head"><span class="eyebrow" id="opp-strip-h">${esc(title)}</span>${lead ? `<span class="opp-strip-lead">${esc(lead)}</span>` : ''}<a class="more" href="/opportunities">All opportunities</a></p>
<div class="opp-strip-row">${list.slice(0, n).map((o) => `<a class="opp-mini${o.image ? '' : ' no-pic'}" href="${esc(o.url)}" rel="noopener nofollow" target="_blank">${o.image && o.image.src ? `<img src="${esc(localSrc(o.image.src))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="opp-mini-type" aria-hidden="true">${esc((TYPE_LABEL[o.type] || o.type).slice(0, 1))}</span>`}<span class="opp-mini-text"><span class="opp-mini-top">${esc(TYPE_LABEL[o.type] || o.type)}${o.remote ? ' · Remote' : ''}<span class="opp-mini-when">${esc(whenShort(o, now))}</span></span><span class="opp-mini-title">${esc(o.title)}</span>${prizeOf(o) ? `<span class="opp-mini-prize">${esc(prizeOf(o))}</span>` : `<span class="opp-mini-org">${esc(o.organiser)}</span>`}</span></a>`).join('')}</div></section>`;
}

/** /opportunities: open calls matched to the visitor's country (from Cloudflare, changeable) and chosen fields. */
export function opportunitiesPage(params, { country = '', now = new Date(), items } = {}) {
  const c = countryByCode(params.get('country')) || countryByCode(country);
  const fields = (params.get('field') || '').split(',').filter((f) => FIELDS.includes(f) || FIELD_LABEL[f]);
  const remote = params.get('remote') === '1';
  const kinds = [...new Set(match({}, now, items).map((o) => o.type))];
  const category = kinds.includes(params.get('category')) ? params.get('category') : '';
  const list = match({ country: c ? c.code : '', fields, remote }, now, items).filter((o) => !category || o.type === category);
  const link = (changes) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); } const s = p.toString(); return `/opportunities${s ? `?${s}` : ''}`; };
  const body = `
<section class="page-head">
  <p class="eyebrow">Opportunities</p>
  <h1>Prizes, funding and jobs <em>you can go for</em></h1>
  <p class="lead">Competitions, hackathons, grants, fellowships and calls for entries that are open now, many of them remote. Looking for a way into the ballet, Oxbridge or Parliament? See <a href="/open-doors">Open doors</a>. Each is checked on the organiser's own page. ${c ? `Showing what people in ${esc(c.name)} can enter.` : ''}</p>
  <form class="opp-filter" method="get" action="/opportunities">
    <label class="visually-hidden" for="o-country">Where you are</label>
    <select id="o-country" name="country"><option value="">Anywhere</option>${COUNTRIES.map((k) => `<option value="${k.code}"${c && c.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
    ${category ? `<input type="hidden" name="category" value="${esc(category)}">` : ''}${fields.length ? `<input type="hidden" name="field" value="${esc(fields.join(','))}">` : ''}
    <label class="check"><input type="checkbox" name="remote" value="1"${remote ? ' checked' : ''}> Remote only</label>
    <button class="button small" type="submit">Show</button>
  </form>
  <p class="chips">${chip('Every field', link({ field: '' }))}${FIELDS.filter((f) => f !== 'general').map((f) => `<a class="chip${fields.includes(f) ? ' active' : ''}" href="${esc(link({ field: f }))}">${esc(FIELD_LABEL[f])}</a>`).join('')}</p>
  ${kinds.includes('cfp') ? `<p class="chips">${chip('Every kind', link({ category: '' }))}<a class="chip${category === 'cfp' ? ' active' : ''}" href="${esc(link({ category: 'cfp' }))}">${esc(CATEGORY_LABEL.cfp)}</a></p>` : ''}
</section>
<section class="section">
  ${list.length ? `<div class="opp-grid">${list.map((o) => opportunityCard(o, now)).join('')}</div>` : `<div class="invite"><p>Nothing open matches that yet. Know an opportunity people should see? <a class="button" href="/submit?kind=story">Tell us</a></p></div>`}
</section>`;
  return layout({ title: 'Opportunities: competitions, grants and jobs', description: T('opportunities.description'), path: '/opportunities', body, current: '/opportunities' });
}

/** A short row of opportunities for the home page or a story: up to `n` cards, with a link to the full list. */
export function opportunityRail(list, { title = 'Opportunities for you', lead = '', href = '/opportunities', n = 3, now = new Date(), eyebrow = '' } = {}) {
  if (!list.length) return '';
  return `<section class="section opp-rail">${sectionHead(title, { href, label: 'All opportunities' }, lead || null, eyebrow)}<div class="opp-grid">${list.slice(0, n).map((o) => opportunityCard(o, now)).join('')}</div></section>`;
}
