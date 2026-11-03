import { T } from '../site.mjs';
import { countryByCode } from '../countries.mjs';
import { esc, layout, sectionHead, chip } from '../html.mjs';
import { LANES, doorsFor, OPEN_DOORS } from '../opendoors.mjs';
import { FIELD_LABEL } from '../opportunities.mjs';
import { opportunityCard } from './opportunities.mjs';
import { byRole, roleScore, roleTag } from '../roles.mjs';

/** /open-doors: the ways in, lane by lane, for the visitor's country (from Cloudflare, changeable with ?country=). */
export function openDoorsPage(params, { country = '', now = new Date(), items } = {}) {
  const c = countryByCode(params.get('country')) || countryByCode(country);
  const lane = LANES.find((l) => l.id === params.get('lane'));
  const field = FIELD_LABEL[params.get('field')] ? params.get('field') : '';
  const shown = (lane ? [lane] : LANES).filter((l) => !field || doorsFor({ lane: l.id, field }, now, items).length);
  const tags = [...new Set((items || OPEN_DOORS).flatMap((o) => o.fields))];
  const link = (changes) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); } const s = p.toString(); return `/open-doors${s ? `?${s}` : ''}`; };
  const blocks = shown.map((l) => {
    const mine = doorsFor({ country: c ? c.code : '', lane: l.id, field }, now, items);
    const list = mine.length ? mine : doorsFor({ lane: l.id, field }, now, items);
    const elsewhere = !mine.length && list.length && c ? `<p class="muted small">Nothing listed for ${esc(c.name)} in this lane yet, so these are the ones listed so far, in ${esc([...new Set(list.flatMap((o) => o.countries || []))].map((k) => (countryByCode(k) || {}).name).filter(Boolean).join(', ') || 'other countries')}. <a href="/submit?kind=opportunity">Know one near you? Tell us.</a></p>` : '';
    return `<section class="section" id="${l.id}">${sectionHead(l.name, null, l.lead)}${elsewhere}${list.length ? `<div class="opp-grid">${list.map((o) => opportunityCard(o, now)).join('')}</div>` : `<div class="invite"><p>Nothing listed for ${c ? esc(c.name) : 'here'} yet. Know a way in? <a class="button" href="/submit?kind=opportunity">Tell us</a></p></div>`}</section>`; }).join('');
  const body = `
<section class="page-head">
  <p class="eyebrow">Open doors</p>
  <h1>Every room. <em>Including that one.</em></h1>
  <p class="lead">${T('doors.lead')} Here are the ways in, with who can apply and what to expect, each checked on its official page.${c ? ` Showing what people in ${esc(c.name)} can use.` : ''}</p>
  <p class="chips">${chip('All lanes', link({ lane: '' }))}${LANES.map((l) => `<a class="chip${lane && lane.id === l.id ? ' active' : ''}" href="${esc(link({ lane: l.id }))}">${esc(l.name)}</a>`).join('')}</p>
  <p class="chips"><span class="muted">Tags:</span> ${chip('Any', link({ field: '' }))}${tags.map((t) => `<a class="chip${field === t ? ' active' : ''}" href="${esc(link({ field: t }))}">${esc(FIELD_LABEL[t] || t)}</a>`).join('')}</p>
</section>
${blocks}`;
  return layout({ title: 'Open doors: ways into ballet, Oxbridge, Parliament and more', description: T('doors.description'), path: '/open-doors', body, current: '/open-doors' });
}

/** A short Open doors row for the home page: one door per lane where possible, or with a role the doors that fit it first. */
export function openDoorsRail({ country = '', now = new Date(), items, role = null } = {}) {
  const lanes = LANES.map((l) => doorsFor({ country, lane: l.id }, now, items)[0] || doorsFor({ lane: l.id }, now, items)[0]).filter(Boolean);
  const fit = role ? byRole(role, doorsFor({}, now, items)).filter((o) => roleScore(role, o) > 0) : [];
  const picks = [...fit, ...lanes.filter((o) => !fit.includes(o))].slice(0, 3);
  if (!picks.length) return '';
  return `<section class="section opp-rail">${sectionHead('Open doors', { href: '/open-doors', label: 'Every way in' }, T('doors.rail'), roleTag(role, fit, 'Every room'))}<div class="opp-grid">${picks.map((o) => opportunityCard(o, now)).join('')}</div></section>`;
}
