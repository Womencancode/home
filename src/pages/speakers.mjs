/* /speakers: a directory for organisers fixing an all-male panel, filterable by topic and country, plus a home block of a few cards. */
import { T } from '../site.mjs';
import { countryByCode, COUNTRIES } from '../countries.mjs';
import { esc, layout, sectionHead, chip, htmlResponse } from '../html.mjs';
import { SPEAKERS, TOPICS, TOPIC_LABEL, filterSpeakers, speakersEnabled } from '../speakers.mjs';
import { notFoundPage } from './about.mjs';
import { byRole, roleTag } from '../roles.mjs';

const card = (s) => { const c = countryByCode(s.country); return `<article class="lesson-card speaker-card" id="${esc(s.id)}"><span class="feature-kicker">${c ? `${c.flag} ${esc(s.city ? `${s.city}, ${c.name}` : c.name)}` : ''}</span><b>${esc(s.name)}</b><small>${esc([s.role, s.org].filter(Boolean).join(', '))}</small><span class="opp-fields">${s.topics.map((t) => `<a href="/speakers?topic=${esc(t)}">${esc(TOPIC_LABEL[t] || t)}</a>`).join('')}</span><small><a href="${esc(s.url)}" rel="noopener nofollow" target="_blank">Source</a>${s.source ? `: ${esc(s.source)}` : ''}</small></article>`; };

/** /speakers with topic and country filters; `cfp` says whether the site lists any open calls for speakers. */
export function speakersPage(params, all = SPEAKERS, { cfp = false } = {}) {
  const topic = TOPICS.includes(params.get('topic')) ? params.get('topic') : '';
  const c = countryByCode(params.get('country'));
  const list = filterSpeakers(all, { topic, country: c ? c.code : '' });
  const link = (changes) => { const p = new URLSearchParams(); const v = { topic, country: c ? c.code : '', ...changes }; for (const [k, x] of Object.entries(v)) if (x) p.set(k, x); const s = p.toString(); return `/speakers${s ? `?${s}` : ''}`; };
  const present = TOPICS.filter((t) => all.some((s) => s.topics.includes(t)));
  const countries = COUNTRIES.filter((k) => all.some((s) => s.country === k.code));
  const body = `
<section class="page-head"><p class="eyebrow">Speakers</p><h1>Speakers for your <em>next panel</em></h1><p class="lead">${T('speakers.lead')}</p>
  <p class="chips">${chip('Every topic', link({ topic: '' }))}${present.map((t) => `<a class="chip${topic === t ? ' active' : ''}" href="${esc(link({ topic: t }))}">${esc(TOPIC_LABEL[t])}</a>`).join('')}</p>
  ${countries.length > 1 ? `<p class="chips">${chip('Anywhere', link({ country: '' }))}${countries.map((k) => `<a class="chip${c && c.code === k.code ? ' active' : ''}" href="${esc(link({ country: k.code }))}">${k.flag} ${esc(k.name)}</a>`).join('')}</p>` : ''}
</section>
<section class="section panel speakers-organise"><h2>Organising a panel?</h2><p>Find people by topic and country, read the source page, then invite them through their own public channels.</p>
  <form class="opp-filter" method="get" action="/speakers">
    <label class="visually-hidden" for="sp-topic">Topic</label><select id="sp-topic" name="topic"><option value="">Any topic</option>${TOPICS.map((t) => `<option value="${t}"${topic === t ? ' selected' : ''}>${esc(TOPIC_LABEL[t])}</option>`).join('')}</select>
    <label class="visually-hidden" for="sp-country">Country</label><select id="sp-country" name="country"><option value="">Anywhere</option>${COUNTRIES.map((k) => `<option value="${k.code}"${c && c.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
    <button class="button small" type="submit">Find speakers</button>
  </form>
  <p>Know someone who should be on this list, or are you one? <a href="/submit?kind=speaker">Nominate a speaker</a>, yourself or someone who agreed to be listed.</p>
  ${cfp ? '<p>Want to be on stage? <a href="/opportunities?category=cfp">Open calls for speakers</a></p>' : ''}
</section>
<section class="section">${list.length ? `<div class="lesson-grid">${list.map(card).join('')}</div>` : '<div class="invite"><p>No one listed for that yet. <a class="button" href="/submit?kind=speaker">Nominate a speaker</a></p></div>'}</section>`;
  return layout({ title: 'Speakers', description: 'Speakers to invite, by topic and country, each with a public source page.', path: '/speakers', body, current: '/speakers' });
}

/** The response for /speakers, or null for any other path. 404 when the site has no speakers and the page is not switched on. */
export function speakersRoute(path, params, all = SPEAKERS, opts = {}) {
  if (path !== '/speakers') return null;
  if (!all.length && !speakersEnabled([], opts.pack)) return htmlResponse(notFoundPage(path), 404);
  return htmlResponse(speakersPage(params, all, opts));
}

/** The home block: up to `n` speakers, or with a role those whose topics fit it first; '' with none. */
export function speakersBlock(n = 4, all = SPEAKERS, role = null) {
  if (!all.length) return '';
  return `<section class="section speakers-rail">${sectionHead('Speakers for your panel', { href: '/speakers', label: 'All speakers' }, 'People to invite, each with a public source page.', roleTag(role, all, 'Speakers'))}<div class="lesson-grid">${byRole(role, all).slice(0, n).map(card).join('')}</div></section>`;
}
