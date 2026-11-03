import { T } from '../site.mjs';
import { REGIONS, countryByCode } from '../countries.mjs';
import { imageFor } from '../media.mjs';
import { KINDS, kindLabel, countdown, dateLabel, monthOf, tile } from '../events.mjs';
import { esc, layout, sectionHead, storyCard, chip, cardMedia, shareBar, absolute, localSrc } from '../html.mjs';
import { picture, credit } from '../media.mjs';
import { embeddable, embedHtml, embedScripts } from '../social.mjs';

/** A date tile: the start day and month, or a pulsing "Now" while the event runs. */
export function dateTile(e) {
  if (e.status === 'now') return `<span class="date-tile now" aria-hidden="true"><b>Now</b><i>on</i></span>`;
  const t = tile(e);
  return `<span class="date-tile${e.approx ? ' approx' : ''}" aria-hidden="true"><b>${e.approx ? '~' : ''}${esc(t.day)}</b><i>${esc(t.month)}</i></span>`;
}

const ROUTE_ORDER = ['tickets', 'register', 'enter', 'perform', 'join', 'vend', 'volunteer'];
const ROUTE_NOUN = { tickets: 'Tickets', register: 'Register', enter: 'Enter your work', perform: 'Perform', join: 'Join in', vend: 'Trade', volunteer: 'Volunteer' };
/** The ways into an event, verified against the organiser's page: tickets first, then entries, performing, trading, volunteering. */
export function routes(e) {
  return (e.takePart || []).filter((r) => r && r.url && ROUTE_NOUN[r.type]).sort((a, b) => ROUTE_ORDER.indexOf(a.type) - ROUTE_ORDER.indexOf(b.type));
}
const closes = (deadline, now = new Date()) => {
  if (!deadline) return '';
  const days = Math.ceil((Date.parse(`${deadline}T23:59:59Z`) - now.getTime()) / 86400000);
  if (days < 0) return 'Closed';
  const d = new Date(`${deadline}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return days <= 14 ? `Closes ${d}, in ${days} ${days === 1 ? 'day' : 'days'}` : `Closes ${d}`;
};

/* A feed event's own page, opened in a new tab: an http(s) address only (events.mjs fromFeed keeps nothing else). */
const outward = (e) => (e.feed && e.url ? ` href="${esc(e.url)}" rel="noopener nofollow" target="_blank"` : ` href="/event/${esc(e.id)}"`);
/** "Listed by <calendar>": the credit every event read from a calendar feed carries, linked to the calendar's home when it has one. */
export function feedCredit(e) {
  if (!e.feed) return '';
  return `<span class="card-note">Listed by ${e.sourceHome ? `<a href="${esc(e.sourceHome)}" rel="noopener nofollow" target="_blank">${esc(e.source)}</a>` : esc(e.source)}</span>`;
}

/** "How to take part": each verified route as an action card, or an honest note and a way to tell us when none is known. */
export function takePartSection(e, now = new Date()) {
  if (e.feed) {
    return `<section class="section take-part" id="take-part">${sectionHead('How to take part', null, `From the ${e.source} calendar. Booking and details are on the organisers' own page.`)}
  ${e.url ? `<p><a class="button small primary" href="${esc(e.url)}" rel="noopener nofollow" target="_blank">The event's own page</a></p>` : `<p class="route-empty">The calendar gave no link for this event.${e.sourceHome ? ` <a class="button small ghost" href="${esc(e.sourceHome)}" rel="noopener nofollow" target="_blank">See ${esc(e.source)}</a>` : ''}</p>`}
  <p class="muted small">${feedCredit(e)}</p>
</section>`;
  }
  const list = routes(e);
  const cards = list.map((r) => {
    const shut = closes(r.deadline, now) === 'Closed';
    return `<li class="route r-${esc(r.type)}${shut ? ' is-closed' : ''}">
    <p class="route-type">${esc(ROUTE_NOUN[r.type])}</p>
    <p class="route-label">${esc(r.label)}</p>
    <p class="route-facts">${[r.price ? esc(r.price) : '', r.deadline ? esc(closes(r.deadline, now)) : '', r.note ? esc(r.note) : ''].filter(Boolean).join(' · ')}</p>
    ${shut ? '<span class="button small ghost" aria-disabled="true">Closed for this edition</span>' : `<a class="button small primary" href="${esc(r.url)}" rel="noopener nofollow" target="_blank">${esc(r.label)}</a>`}
  </li>`;
  }).join('');
  const tell = `<a href="/submit?kind=correction&country=${esc(e.country)}&title=${encodeURIComponent(`How to take part: ${e.name}`)}">Tell us</a>`;
  const empty = e.url
    ? `<p class="route-empty">We have not confirmed the organisers' ticket or entry page for the next edition yet. <a class="button small ghost" href="${esc(e.url)}" rel="noopener nofollow" target="_blank">Read what we found</a></p><p class="muted small">Found the ticket or entry page? ${tell} and we will add it here.</p>`
    : `<p class="route-empty">We have not confirmed an official way in for the next edition yet. Know the ticket, entry or volunteer page? ${tell} and we will check it and add it.</p>`;
  return `<section class="section take-part" id="take-part">${sectionHead('How to take part', null, list.length ? 'Every link goes to the organiser or the ticketing and entry partner they name.' : null)}
  ${list.length ? `<ul class="routes">${cards}</ul><p class="muted small">Something wrong or missing? ${tell}.</p>` : empty}
</section>`;
}

const place = (e) => (e.countryRecord.code ? `<span aria-hidden="true">${e.countryRecord.flag}</span> ${e.online ? 'Online, ' : e.city ? `${esc(e.city)}, ` : ''}${esc(e.countryRecord.name)}` : `<span aria-hidden="true">${e.countryRecord.flag}</span> Online`);

/** A compact event: tile, name, place, countdown. For the hero, the home rail and country pages. */
export function eventRow(e, { count = 0 } = {}) {
  return `<a class="event-row${e.status === 'now' ? ' is-now' : ''}"${outward(e)}>${dateTile(e)}<span class="event-text"><span class="event-name">${esc(e.name)}</span><span class="event-place">${place(e)}${count ? ` · <b class="series-count">${count} events</b>` : ''}</span></span><span class="event-when">${esc(countdown(e))}</span></a>`;
}

/** The big moment on right now, for the badge beside the logo: a running series with at least five events, the visitor's own country
 * first, as { label, href, name }, or null. */
export function liveMoment(events, country = '') {
  const size = (e) => events.filter((x) => x.series === e.id).length;
  const live = events.filter((e) => e.status === 'now' && size(e) >= 5).sort((a, b) => (b.country === country) - (a.country === country) || size(b) - size(a));
  if (!live.length) return null;
  const e = live[0];
  const label = e.short || e.name.replace(/\s*\(.*\)$/, '').split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('');
  return { label, href: `/event/${e.id}`, name: `${e.name}: ${size(e)} events` };
}

/** A full event card for /events: the row plus kind, dates, blurb and an add-to-calendar link. */
export function eventCard(e) {
  const img = imageFor(e);
  return `<article class="event-card k-${esc(e.kind)}${e.status === 'now' ? ' is-now' : ''}${img ? ' has-photo' : ''}" id="${esc(e.id)}">
  <a class="event-cover"${outward(e)} tabindex="-1" aria-hidden="true">${cardMedia(img, e.name, e.countryRecord.flag)}${dateTile(e)}</a>
  <div class="event-body">
    ${e.series && e.seriesName ? `<a class="series-badge" href="/event/${esc(e.series)}">Part of ${esc(e.seriesName)}</a>` : ''}
    <p class="event-meta"><span class="kind-chip">${esc(kindLabel(e.kind))}</span> <span>${esc(countdown(e))}</span></p>
    <h3><a${outward(e)}>${esc(e.name)}</a></h3>
    <p class="event-place">${place(e)} · <span class="event-dates">${esc(dateLabel(e))}${e.time ? `, ${esc(e.time)}` : ''}</span></p>
    ${e.blurb ? `<p class="event-blurb">${esc(e.blurb)}</p>` : ''}
    <p class="event-links">${routes(e)[0] ? `<a class="button small primary" href="/event/${esc(e.id)}#take-part">${esc(routes(e)[0].label)}</a> ` : ''}${e.feed && e.url ? `<a class="button small primary" href="${esc(e.url)}" rel="noopener nofollow" target="_blank">Details and booking</a> ` : ''}<a class="button small ghost" href="/event/${esc(e.id)}.ics" download>Add to calendar</a>${e.community ? ' <span class="card-note">Shared by the community</span>' : ''}${e.feed ? ` ${feedCredit(e)}` : ''}</p>
  </div>
</article>`;
}

/** /events: what is on now, then everything coming up by month, filterable by kind and region. */
export function eventsPage(events, params) {
  const kind = KINDS.includes(params.get('kind')) ? params.get('kind') : '';
  const region = REGIONS.includes(params.get('region')) ? params.get('region') : '';
  const country = countryByCode(params.get('country'));
  let list = events;
  if (kind) list = list.filter((e) => e.kind === kind);
  if (region) list = list.filter((e) => e.countryRecord.region === region);
  if (country) list = list.filter((e) => e.country === country.code);
  const now = list.filter((e) => e.status === 'now');
  const soon = list.filter((e) => e.status !== 'now');
  const months = [];
  for (const e of soon) { const m = monthOf(e); if (!months.length || months[months.length - 1][0] !== m) months.push([m, []]); months[months.length - 1][1].push(e); }
  const link = (changes) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); } const s = p.toString(); return `/events${s ? `?${s}` : ''}`; };
  const present = KINDS.filter((k) => events.some((e) => e.kind === k));
  const body = `
<section class="page-head events-head">
  <p class="eyebrow">Events</p>
  <h1>${country ? `What's on in <em>${esc(country.name)}</em>` : `What's <em>on</em>`}</h1>
  <p class="lead">${T('events.lead')}</p>
  <p class="chips">${chip('All kinds', link({ kind: '' }))}${present.map((k) => `<a class="chip${kind === k ? ' active' : ''}" href="${esc(link({ kind: k }))}">${esc(kindLabel(k))}</a>`).join('')}</p>
  <p class="chips">${chip('Everywhere', link({ region: '', country: '' }))}${REGIONS.filter((r) => events.some((e) => e.countryRecord.region === r)).map((r) => `<a class="chip${region === r ? ' active' : ''}" href="${esc(link({ region: r, country: '' }))}">${esc(r)}</a>`).join('')}</p>
  <p class="hero-actions"><a class="button" href="/submit?kind=event">Add an event</a></p>
</section>
${now.length ? `<section class="section">${sectionHead('Happening now')}<div class="event-list">${now.map(eventCard).join('')}</div></section>` : ''}
${months.map(([m, items]) => `<section class="section month"><h2 class="month-head">${esc(m)}</h2><div class="event-list">${items.map(eventCard).join('')}</div></section>`).join('')}
${list.length ? '' : `<div class="invite"><p>Nothing listed${country ? ` for ${esc(country.name)}` : ''} yet. <a class="button" href="/submit?kind=event${country ? `&country=${esc(country.code)}` : ''}">Add the first event</a></p></div>`}`;
  return layout({ title: country ? `Events in ${country.name}` : 'Events', description: T('events.description'), path: '/events', body, current: '/events' });
}

/** One event: when, where, what it is, what else is on there, and a calendar file. */
export function eventPage(e, events, cat) {
  const c = e.countryRecord;
  const children = events.filter((x) => x.series === e.id);
  const parent = e.series ? events.find((x) => x.id === e.series) : null;
  const nearby = events.filter((x) => x.id !== e.id && x.country === e.country && x.series !== e.id && !(parent && x.id === parent.id)).slice(0, 3);
  const stories = cat.stories.filter((s) => s.country === e.country).slice(0, 3);
  const body = `
<article class="article event-article">
  <p class="eyebrow"><a href="/events">Events</a> · <a href="/events?kind=${esc(e.kind)}">${esc(kindLabel(e.kind))}</a> · ${c.slug ? `<a href="/country/${esc(c.slug)}">${c.flag} ${esc(c.name)}</a>` : `${c.flag} ${esc(c.name)}`}</p>
  ${imageFor(e) ? `<figure class="hero-photo">${picture(imageFor(e), { alt: e.name, widths: [500, 960], sizes: '(max-width: 900px) 100vw, 900px', eager: true })}<figcaption>${credit(imageFor(e))}</figcaption></figure>` : ''}
  <div class="event-hero">${dateTile(e)}<div><h1>${esc(e.name)}</h1><p class="event-place big">${place(e)}</p></div></div>
  ${parent ? `<p><a class="series-badge" href="/event/${esc(parent.id)}">Part of ${esc(parent.name)}</a></p>` : ''}
  <p class="event-facts"><span><b>When</b> ${esc(dateLabel(e))}${e.time ? `, ${esc(e.time)}` : ''}</span><span><b>Countdown</b> ${esc(countdown(e))}</span></p>
  ${e.feed ? `<p class="muted small">${feedCredit(e)}</p>` : ''}
  <p class="article-lead">${esc(e.blurb)}</p>
  ${e.video ? `${embedHtml(embeddable(e.video.url), esc)}<p class="muted small">From ${esc(e.video.channel || 'the organisers')}${e.video.edition ? `, ${esc(e.video.edition)}` : ''}.</p>` : ''}
  ${shareBar(`/event/${e.id}`, `${e.name}, ${dateLabel(e)}`, { label: 'Tell your people' })}
  ${e.approx ? '<p class="notice">The dates move from year to year. Check with the organisers before you book travel.</p>' : ''}
  <p class="hero-actions"><a class="button primary" href="#take-part">${esc(routes(e)[0] ? routes(e)[0].label : 'How to take part')}</a> <a class="button ghost" href="/event/${esc(e.id)}.ics" download>Add to calendar</a>${e.url ? ` <a class="button ghost" href="${esc(e.url)}" rel="noopener nofollow ugc"${e.feed ? ' target="_blank"' : ''}>More details</a>` : ''}${c.slug ? ` <a class="button ghost" href="/country/${esc(c.slug)}">More from ${esc(c.name)}</a>` : ''}</p>
  <p class="muted small">Know the organisers' site, or a date has changed? <a href="/submit?kind=correction&country=${esc(c.code)}&title=${encodeURIComponent(`Event: ${e.name}`)}">Tell us</a>.</p>
</article>
${takePartSection(e)}
${e.video ? embedScripts([embeddable(e.video.url)]) : ''}
${children.length ? `<section class="section">${sectionHead(`The ${e.name} line-up`, null, `${children.length} main and side events so far. Know one we are missing? Add it with the form and choose ${e.name}.`)}<div class="event-list series-list">${children.map(eventCard).join('')}</div></section>` : ''}
${nearby.length ? `<section class="section">${sectionHead(`Also in ${c.name}`)}<div class="event-rows">${nearby.map(eventRow).join('')}</div></section>` : ''}
${stories.length ? `<section class="section">${sectionHead(`Good news from ${c.name}`, { href: `/country/${c.slug}`, label: 'The country page' })}<div class="card-grid">${stories.map((s) => storyCard(s, c, { img: imageFor(s) })).join('')}</div></section>` : ''}`;
  return layout({ title: `${e.name}, ${dateLabel(e)}`, description: `${e.name} in ${e.city ? `${e.city}, ` : ''}${c.name}: ${dateLabel(e)}. ${e.blurb}`.slice(0, 300), path: `/event/${e.id}`, type: 'article', body, current: '/events', image: imageFor(e) ? { src: imageFor(e).src, alt: imageFor(e).alt || e.name } : null, jsonld: { '@context': 'https://schema.org', '@type': 'Event', name: e.name, url: absolute(`/event/${e.id}`), ...(imageFor(e) ? { image: [absolute(localSrc(imageFor(e).src))] } : {}), startDate: e.start, endDate: e.end, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled', location: { '@type': 'Place', name: e.city || c.name, address: { '@type': 'PostalAddress', addressLocality: e.city || '', addressCountry: c.code } }, description: e.blurb, ...(routes(e).find((r) => r.type === 'tickets') ? { offers: { '@type': 'Offer', url: routes(e).find((r) => r.type === 'tickets').url, availability: 'https://schema.org/InStock' } } : {}) } });
}

/** The ticker band: events now and next, then the latest headlines, as one line that scrolls. */
export function ticker(events, news = []) {
  const items = [
    ...events.filter((e) => e.status === 'now' || e.daysAway <= 60).slice(0, 6).map((e) => `<a href="/event/${esc(e.id)}"><b>${e.status === 'now' ? 'On now' : esc(countdown(e))}</b> ${esc(e.name)} <span>${e.countryRecord.flag}</span></a>`),
    ...news.slice(0, 6).map((n) => { const c = countryByCode(n.country); return `<a href="${esc(n.url)}" rel="noopener nofollow" target="_blank"><b>${c ? c.flag : ''}</b> ${esc(n.title)}</a>`; }),
  ];
  if (!items.length) return '';
  const run = items.join('<i aria-hidden="true">✦</i>');
  return `<div class="ticker" role="region" aria-label="Coming up and in the news"><div class="ticker-track"><div class="ticker-run">${run}<i aria-hidden="true">✦</i></div><div class="ticker-run" aria-hidden="true" inert>${run}<i aria-hidden="true">✦</i></div></div></div>`;
}

