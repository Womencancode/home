import { T } from '../site.mjs';
import { COUNTRIES, grouped } from '../countries.mjs';
import { imageFor } from '../media.mjs';
import { counts, forCountry, inCity, talent } from '../content.mjs';
import { SITE, esc, layout, sectionHead, storyCard, workCard, countryTile, invite, chip, newsList } from '../html.mjs';
import { mapSection } from '../map.mjs';
import { places, fold } from '../places.mjs';
import { socialRow } from '../social.mjs';
import { eventRow } from './events.mjs';
import { opportunityRail } from './opportunities.mjs';
import { match, OPPORTUNITIES } from '../opportunities.mjs';

export function countriesPage(cat, query = '', events = []) {
  const c = counts(cat);
  const q = String(query || '').trim();
  const needle = q.toLowerCase();
  const matches = needle ? COUNTRIES.filter((k) => k.name.toLowerCase().includes(needle) || k.code.toLowerCase() === needle) : [];
  if (matches.length === 1) return { redirect: `/country/${matches[0].slug}` };
  const groups = grouped().map((g) => `<section class="region" id="${esc(g.region.toLowerCase())}"><h2>${esc(g.region)}</h2>${g.subregions.map((s) => `<h3>${esc(s.name)}</h3><div class="tile-grid">${s.countries.map((k) => countryTile(k, c.get(k.code))).join('')}</div>`).join('')}</section>`).join('');
  const body = `
<section class="page-head">
  <p class="eyebrow">Every country and territory</p>
  <h1>A page for every country</h1>
  <p class="lead">${COUNTRIES.length} pages, one for each country and territory, ${T('countries.lead')} Type to filter.</p>
  <form class="filter" action="/countries" method="get" role="search"><label class="visually-hidden" for="q">Filter countries</label><input id="q" name="q" type="search" value="${esc(q)}" placeholder="Filter by name" data-filter="tile" autocomplete="off"><button class="button" type="submit">Find</button></form>
  ${needle && !matches.length ? `<p class="notice">No country matches "${esc(q)}". Browse the full list below.</p>` : ''}
  ${matches.length > 1 ? `<div class="tile-grid">${matches.map((k) => countryTile(k, c.get(k.code))).join('')}</div>` : ''}
  <nav class="jump" aria-label="Regions">${grouped().map((g) => chip(g.region, `#${g.region.toLowerCase()}`)).join('')}</nav>
</section>
${mapSection(c, { heading: false, pins: places([...cat.stories, ...cat.works, ...cat.talentRows]), events })}
${groups}`;
  return { html: layout({ title: 'Every country', description: T('countries.description', { n: COUNTRIES.length }), path: '/countries', body, current: '/countries' }) };
}

/** One country's page. `city` narrows it to one place; `news` is that country's headlines from around the web. */
export function countryPage(cat, country, { city = '', news = [], events = [], now = new Date() } = {}) {
  const all = forCountry(cat, country.code);
  const pins = places([...all.stories, ...all.works, ...all.talentRows]);
  const place = city ? pins.find((p) => p.city && fold(p.city) === fold(city)) : null;
  const mine = place ? { stories: inCity(all.stories, place.city), works: inCity(all.works, place.city), talentRows: inCity(all.talentRows, place.city) } : all;
  const byMedium = new Map();
  for (const w of mine.works) { if (!byMedium.has(w.medium)) byMedium.set(w.medium, []); byMedium.get(w.medium).push(w); }
  const people = [...new Set([...mine.stories.flatMap((s) => s.people || []), ...mine.works.map((w) => w.creator), ...mine.talentRows.map((t) => t.creator)])].filter(Boolean);
  const total = mine.stories.length + mine.works.length + mine.talentRows.length;
  const names = new Set(people.map((p) => p.toLowerCase()));
  const social = talent(cat).filter((p) => names.has(p.name.toLowerCase()) && Object.keys(p.socials || {}).length);
  const cityChips = pins.filter((p) => p.city).map((p) => `<a class="chip${place && place.city === p.city ? ' active' : ''}" href="/country/${esc(country.slug)}?city=${encodeURIComponent(p.city)}">${esc(p.city)} <span class="n">${p.count}</span></a>`).join('');
  const where = place ? `${place.city}, ${country.name}` : country.name;
  const mineEvents = events.filter((e) => e.country === country.code);
  const body = `
<section class="page-head country-head">
  <p class="eyebrow"><a href="/countries">Countries</a> · <a href="/countries#${esc(country.region.toLowerCase())}">${esc(country.region)}</a> · ${esc(country.subregion)}</p>
  <h1><span class="big-flag" aria-hidden="true">${country.flag}</span> ${place ? `${esc(place.city)}<span class="h1-sub">, ${esc(country.name)}</span>` : esc(country.name)}</h1>
  <p class="lead">${total ? `${mine.stories.length} ${mine.stories.length === 1 ? 'story' : 'stories'}, ${mine.works.length} ${mine.works.length === 1 ? 'work' : 'works'}${mine.talentRows.length ? ` and ${mine.talentRows.length} ${mine.talentRows.length === 1 ? 'profile' : 'profiles'}` : ''} ${T('country.from', { where: esc(where) })}${place ? '' : T('country.diaspora')}.` : T('country.empty', { country: esc(country.name) })}</p>
  ${cityChips ? `<nav class="chips city-chips" aria-label="Cities in ${esc(country.name)}">${place ? `<a class="chip" href="/country/${esc(country.slug)}">All of ${esc(country.name)}</a>` : ''}${cityChips}</nav>` : ''}
  <p class="hero-actions"><a class="button primary" href="/submit?country=${esc(country.code)}${place ? `&city=${encodeURIComponent(place.city)}` : ''}">Add something from ${esc(where)}</a></p>
</section>
${mapSection(counts(cat), { heading: false, pins, events, focus: country.code })}
${mineEvents.length ? `<section class="section">${sectionHead(`Coming up in ${country.name}`, { href: `/events?country=${country.code}`, label: 'All events' })}<div class="event-rows wide">${mineEvents.slice(0, 6).map(eventRow).join('')}</div></section>` : ''}
${opportunityRail(match({ country: country.code }, now, [...OPPORTUNITIES, ...(cat.opportunities || [])]).sort((a, b) => (a.countries && a.countries.includes(country.code) ? -1 : 0) - (b.countries && b.countries.includes(country.code) ? -1 : 0) || (b.remote - a.remote)), { title: `Opportunities for ${country.name}`, lead: `Competitions, grants and jobs people in ${country.name} can enter now.`, href: `/opportunities?country=${country.code}`, now })}
<section class="section">
  ${sectionHead('Good news', mine.stories.length > 6 ? { href: `/stories?country=${country.code}`, label: `All ${mine.stories.length}` } : null)}
  ${mine.stories.length ? `<div class="card-grid">${mine.stories.slice(0, 12).map((s) => storyCard(s, country, { img: imageFor(s) })).join('')}</div>` : invite(country, 'story')}
</section>
<section class="section section-alt">
  ${sectionHead('Creative work', mine.works.length > 8 ? { href: `/showcase?country=${country.code}`, label: `All ${mine.works.length}` } : null, 'Films, music, books, art and more made by people from here.')}
  ${mine.works.length ? [...byMedium.entries()].map(([medium, list]) => `<h3 class="medium-head">${esc(medium)}</h3><div class="card-grid">${list.map((w) => workCard(w, country, { img: imageFor(w) })).join('')}</div>`).join('') : invite(country, 'work')}
</section>
${news.length ? `<section class="section">${sectionHead(`In the news in ${country.name}`, null, `Good-news headlines from ${country.name}'s leading news sites. Each links to its publisher.`)}${newsList(news, { country })}</section>` : ''}
${social.length ? `<section class="section">${sectionHead('Follow them', null, `Where the people on this page post their work.`)}<ul class="follow-list">${social.map((p) => `<li><strong>${esc(p.name)}</strong>${socialRow(p.socials, esc)}</li>`).join('')}</ul></section>` : ''}
${mine.talentRows.length ? `<section class="section">${sectionHead('Profiles', null, 'People who asked to be listed.')}<div class="card-grid">${mine.talentRows.map((t) => `<article class="card"><p class="card-kicker">${esc(t.medium)}</p><h3>${esc(t.creator)}</h3><p>${esc(t.blurb)}</p>${socialRow(t.socials, esc)}${t.url ? `<p><a class="outlink" href="${esc(t.url)}" rel="noopener nofollow ugc">See their work</a></p>` : ''}</article>`).join('')}</div></section>` : ''}
<section class="section">
  ${sectionHead('People on this page', people.length ? { href: `/talent?country=${country.code}`, label: 'Talent directory' } : null)}
  ${people.length ? `<p class="chips">${people.map((p) => chip(p, `/talent?q=${encodeURIComponent(p)}`)).join('')}</p>` : `<p class="muted">No names yet. <a href="/submit?country=${esc(country.code)}&kind=talent">Nominate someone</a>.</p>`}
</section>`;
  return layout({ title: place ? `${place.city}, ${country.name}: ${T('country.title.tail')}` : `${country.name}: ${T('country.title.tail')}`, description: `${T('country.description', { where })}: ${mine.stories.length} stories and ${mine.works.length} works, with open submissions.`, path: `/country/${country.slug}`, noindex: !!city && !place, body, current: '/countries', jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${country.name} on ${SITE.name}`, about: { '@type': 'Country', name: country.name } } });
}
