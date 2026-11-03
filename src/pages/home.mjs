import { T, PACK } from '../site.mjs';
import { COUNTRIES, REGIONS, countriesInRegion, countryByCode } from '../countries.mjs';
import { imageFor } from '../media.mjs';
import { counts } from '../content.mjs';
import { SITE, esc, layout, sectionHead, storyCard, workCard, countryTile, newsList } from '../html.mjs';
import { worldMap } from '../map.mjs';
import { places } from '../places.mjs';
import { eventRow } from './events.mjs';
import { highlights } from '../events.mjs';
import { featuredMoment } from '../moments.mjs';
import { picture } from '../media.mjs';
import { opportunityRail, opportunityStrip } from './opportunities.mjs';
import { openDoorsRail } from './opendoors.mjs';
import { match, OPPORTUNITIES } from '../opportunities.mjs';
import { countryByCode as cc } from '../countries.mjs';
import { homeLayout, renderBlock } from '../layout.mjs';
import { createHero, formatsBand } from './create.mjs';
import { coverHero } from './cover.mjs';
import { spotlightBlock } from './spotlight.mjs';
import { learnBlock } from './learn.mjs';
import { writingBlock } from './writing.mjs';
import { speakersBlock } from './speakers.mjs';
import { SPEAKERS } from '../speakers.mjs';
import { festivalsBlock } from './festivals.mjs';
import { CAREER_BLOCKS } from './careers.mjs';
import { tributesBlock } from './tributes.mjs';
import { trainBlock } from './train.mjs';
import { gapBlock } from './gap.mjs';
import { cohortsBlock } from './cohorts.mjs';
import { challengeBlock } from './challenge.mjs';
import { panelsBlock, askBox, panelImage } from '../panels.mjs';
import { byRole, roleScore, rolesBlock, rolePicker, roleIntro, roleTag } from '../roles.mjs';

/** Everything the home blocks draw on, computed once per request. */
function homeContext(cat, news, events, country, now, role = null) {
  const moment = featuredMoment(now, country);
  const momentEvents = moment && moment.event ? events.filter((x) => x.series === moment.event) : [];
  const c = counts(cat);
  const covered = [...c.keys()].length;
  const featuredStories = cat.stories.slice(0, 6);
  const featuredWorks = byRole(role, pickSpread(cat.works, 8));
  const fitEvents = role ? highlights(events.filter((e) => roleScore(role, e) > 0), { country, n: 5 }) : [];
  const next = [...fitEvents, ...highlights(events, { country, n: 5 }).filter((e) => !fitEvents.includes(e))].slice(0, 5);
  const here = country && cc(country);
  const opps = byRole(role, match({ country }, now, [...OPPORTUNITIES, ...(cat.opportunities || [])]).sort((a, b) => (b.remote - a.remote) || (!!b.image - !!a.image)));
  const nowOn = events.filter((e) => e.status === 'now');
  const lead = featuredStories[0], side = featuredStories.slice(1, 3), rest = role ? byRole(role, cat.stories.slice(3, 40)).slice(0, 3) : featuredStories.slice(3, 6);
  const strip = moment ? `<div class="moment-strip" role="region" aria-label="${esc(moment.name)}"><div class="moment-strip-in">
  <span class="moment-live"><span class="live-dot" aria-hidden="true"></span>${esc(moment.name)} ${esc(moment.start.slice(0, 4))}</span>
  ${moment.theme ? `<span class="moment-theme">${esc(moment.theme.theme)}</span>` : ''}
  <span class="moment-links">${moment.event ? `<a href="/event/${esc(moment.event)}">${momentEvents.length ? `${momentEvents.length} events` : 'What is on'}</a>` : ''}<a href="/submit">Share someone who should be honoured</a><span class="moment-tag" translate="no">${esc(moment.hashtag)}</span></span>
</div></div>` : '';
  const feature = (s, size) => { const img = imageFor(s); return `<a class="feature feature-${size}${img ? '' : ' no-photo'}" href="/story/${esc(s.slug)}">${img ? picture(img, { alt: '', widths: size === 'lead' ? [500, 960] : [330, 500], sizes: size === 'lead' ? '(max-width: 900px) 100vw, 760px' : '(max-width: 900px) 100vw, 380px', eager: size === 'lead' }) : `<span class="cover-flag" aria-hidden="true">${s.countryRecord.flag}</span>`}<span class="feature-text"><span class="feature-kicker">${esc(s.category)} · ${s.countryRecord.flag} ${esc(s.countryRecord.name)}</span><span class="feature-title">${esc(s.title)}</span></span></a>`; };
  return { role, cat, news, events, country, now, moment, momentEvents, c, covered, featuredWorks, next, here, opps, nowOn, lead, side, rest, strip, feature };
}

/* The blocks a home page is built from. Each takes the context and the block's options from the layout and returns HTML ('' to
 * leave itself out). The layout (site pack, or the owner's saved one) orders them; see src/layout.mjs. */
export const HOME_BLOCKS = {
  hero: (x, b = {}) => { if (b.variant === 'create' && PACK.create) return createHero(); const cover = b.variant === 'cover' ? coverHero({ stories: x.cat.stories.slice(0, (PACK.cover || {}).lineRoles ? 30 : 8), moment: x.moment, now: x.now }) : ''; const { cat, events, c, covered, next, here, opps, nowOn, lead, side, feature, now } = x; return `<section class="front"${cover ? ' data-cover' : ''}>
  <div class="front-grid">
    <div class="front-main">${cover ? `<h1 class="visually-hidden">${T('home.h1')}</h1>${cover}` : `<div class="front-intro"><h1>${T('home.h1')}</h1><p>${T('home.intro', { n: COUNTRIES.length, covered })} <a href="/submit">Share something good</a></p></div>
    <div class="front-stories">${lead ? feature(lead, 'lead') : ''}<div class="front-side">${side.map((s) => feature(s, 'side')).join('')}</div></div>`}
    ${b.strip === false ? '' : opportunityStrip(opps, { lead: here ? `Open to people in ${here.name}` : 'Open now, many remote', now })}</div>
    ${b.aside === 'roles' && rolePicker(x.role) ? `<div class="front-aside front-roles">${rolePicker(x.role)}</div>` : `<div class="front-aside">
      <figure class="mini-map" data-live-map>
        ${worldMap(c, { pins: places([...cat.stories, ...cat.works, ...cat.talentRows]), events, focus: COUNTRIES.length === 1 ? COUNTRIES[0].code : '', label: 'Where the good news is: a small map' })}
        <button type="button" class="mini-map-grow" aria-expanded="false" aria-label="Enlarge the map" title="Enlarge the map"><span class="i-grow"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span class="i-shrink"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>
      </figure>
      ${next.length ? `<aside class="hero-side" aria-labelledby="coming-up" data-closable="on-now">
        <button type="button" class="panel-close" aria-label="Close what's on">×</button>
        <p class="eyebrow" id="coming-up">${nowOn.length ? '<span class="live-dot" aria-hidden="true"></span> On now and coming up' : 'Coming up'}</p>
        <div class="event-rows">${next.map((e) => eventRow(e, { count: events.filter((x) => x.series === e.id).length })).join('')}</div>
        <a class="more" href="/events">The full calendar</a>
      </aside>
      <button type="button" class="panel-reopen" data-reopen="on-now" hidden>Show what's on</button>` : ''}
    </div>`}
  </div>
</section>`; },
  /* The classic hero's map and calendar as blocks of their own, so a site with another hero (create) can place them anywhere. */
  'coming-up': ({ cat, events, c, next, nowOn }) => `<section class="section home-pair">
  <div class="front-aside">
    <figure class="mini-map" data-live-map>
      ${worldMap(c, { pins: places([...cat.stories, ...cat.works, ...cat.talentRows]), events, focus: COUNTRIES.length === 1 ? COUNTRIES[0].code : '', label: 'Where the good news is: a small map' })}
      <button type="button" class="mini-map-grow" aria-expanded="false" aria-label="Enlarge the map" title="Enlarge the map"><span class="i-grow"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span class="i-shrink"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>
    </figure>
    ${next.length ? `<aside class="hero-side" aria-labelledby="coming-up-b">
      <p class="eyebrow" id="coming-up-b">${nowOn.length ? '<span class="live-dot" aria-hidden="true"></span> On now and coming up' : 'Coming up'}</p>
      <div class="event-rows">${next.map((e) => eventRow(e, { count: events.filter((x) => x.series === e.id).length })).join('')}</div>
      <a class="more" href="/events">The full calendar</a>
    </aside>` : ''}
  </div>
</section>`,
  roles: ({ role }, b = {}) => (b.picker === false ? (role ? `<section class="section roles-band">${roleIntro(role)}</section>` : '') : rolesBlock(role)),
  formats: () => formatsBand(),
  spotlight: (x, b = {}) => spotlightBlock(b.group),
  learn: ({ role } = {}) => learnBlock(4, undefined, role),
  writing: ({ role } = {}) => writingBlock(3, undefined, role),
  speakers: ({ cat, role }) => speakersBlock(4, [...SPEAKERS, ...((cat && cat.speakers) || [])], role),
  festivals: ({ festivals }) => festivalsBlock(festivals),
  ...CAREER_BLOCKS,
  /* Opt-in features: each renders '' unless its pack setting is on (src/tributes.mjs, src/train.mjs, src/gap.mjs). */
  tributes: ({ cat, role }) => tributesBlock(cat, role),
  train: () => trainBlock(null),
  gap: () => gapBlock(),
  cohorts: () => cohortsBlock(),
  challenge: () => challengeBlock(),
  /* Opt-in: a pack's own panels (site.json "panels", by id) and the visible Ask box ("askBox"); '' when the pack has neither. */
  panels: (x, b = {}) => panelsBlock(b.id),
  'ask-box': () => askBox(),
  'good-news': ({ rest, role }) => `${rest.length ? `<section class="section news-rail">
  ${sectionHead('More good news', { href: '/stories', label: 'All stories' }, null, roleTag(role, rest))}
  <div class="card-grid">${rest.map((s) => storyCard(s, s.countryRecord, { img: imageFor(s) })).join('')}</div>
</section>` : ''}`,
  headlines: ({ news }) => `${news.length ? `<section class="section headlines-rail">
  ${sectionHead('From around the web', null, 'Good-news headlines from the leading news sites of each country, refreshed through the day. Each links to its publisher.', 'In the news')}
  ${newsList(news.map((n) => ({ ...n, countryName: (countryByCode(n.country) || {}).name })))}
</section>` : ''}`,
  'open-doors': ({ country, now, role }) => `${openDoorsRail({ country, now, role })}`,
  'more-opportunities': ({ opps, here, now, role }, b = {}) => `${opportunityRail(opps.slice(b.strip === false ? 0 : 3), { title: role ? 'Opportunities for you' : b.strip === false ? 'Opportunities' : 'More opportunities', lead: here ? `Also open to people in ${here.name}, many of them remote.` : 'Open now, many of them remote.', now, eyebrow: roleTag(role, opps.slice(b.strip === false ? 0 : 3, (b.strip === false ? 0 : 3) + 3)) })}`,
  showcase: ({ featuredWorks }) => `<section class="section-alt section">
  ${sectionHead('From the showcase', { href: '/showcase', label: 'All work' }, T('home.showcase.lead'), 'Made by')}
  <div class="card-grid four">${featuredWorks.map((w) => workCard(w, w.countryRecord, { img: imageFor(w) })).join('')}</div>
</section>`,
  cta: () => `<section class="cta-band panel">
  <p class="eyebrow">Take part</p>
  <h2>Know a story, an artist or a work that belongs here?</h2>
  <p>Anyone can submit. A moderator reads every submission before it is published, and nothing negative goes up. Corrections are welcome too.</p>
  <p><a class="button primary" href="/submit">Submit a story or a work</a></p>
</section>`,
};

/** The front page, block by block in the order the layout gives. `news` is the latest filtered headlines; `events` is upcoming();
 * `festivals` is festivalsFor()'s answer when the layout shows the festivals block; `rooms` the rooms with their open state. */
export function homePage(cat, news = [], events = [], { country = '', now = new Date(), layout: plan = homeLayout(), festivals = null, rooms = null, role = null } = {}) {
  const x = { ...homeContext(cat, news, events, country, now, role), festivals, rooms };
  const { strip } = x;
  const body = '\n' + plan.map((b) => renderBlock(HOME_BLOCKS, b, x)).join('\n');
  return layout({ role, cover: /<header class="mast">/.test(body) || (/class="mag-strapline"/.test(body) && (PACK.cover || {}).strap === 'nav'), ticker: strip, path: '/', description: `${SITE.tagline} A page for every country, ${T('home.description')} Submissions open.`, body, current: '/', jsonld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', '@id': `https://${SITE.domain}/#org`, name: SITE.name, url: `https://${SITE.domain}/`, logo: `https://${SITE.domain}/icon-512.png`, description: T('org.description') }, { '@type': 'WebSite', '@id': `https://${SITE.domain}/#site`, name: SITE.name, url: `https://${SITE.domain}/`, publisher: { '@id': `https://${SITE.domain}/#org` }, inLanguage: 'en', potentialAction: { '@type': 'SearchAction', target: `https://${SITE.domain}/countries?q={q}`, 'query-input': 'required name=q' } }] } });
}

/* Blocks only a pack's own page can use (kept out of the home registry, so the layout editor's list is unchanged): the calendar's next events the calendar's next events of one kind ("kind": "film"), with a link to the rest. */
export const PAGE_BLOCKS = {
  'events-list': ({ events }, b = {}) => {
    const list = events.filter((e) => !b.kind || e.kind === b.kind).slice(0, Number.isInteger(b.max) ? b.max : 6);
    const all = b.kind ? `/events?kind=${encodeURIComponent(b.kind)}` : '/events';
    return `<section class="section events-list"${b.anchor && /^[a-z0-9-]{1,40}$/.test(b.anchor) ? ` id="${b.anchor}"` : ''}>
  ${sectionHead(b.title || 'Coming up', { href: all, label: b.more || 'The full calendar' }, b.lead || null, b.eyebrow || '')}
  ${list.length ? `<div class="event-rows">${list.map((e) => eventRow(e, { count: events.filter((x) => x.series === e.id).length })).join('')}</div>` : `<p>${esc(b.empty || 'Nothing listed yet.')} <a href="${all}">${esc(b.more || 'The full calendar')}</a></p>`}
</section>`;
  }
};

/** A pack's own page (src/panels.mjs packPage): its head, then its blocks, rendered as the home page renders them. */
export function packPageHtml(page, cat, news = [], events = [], { now = new Date(), festivals = null } = {}) {
  const x = { ...homeContext(cat, news, events, '', now, null), festivals, rooms: null };
  const pic = panelImage(page.image, 'page-head-img');
  const body = `
<section class="page-head pack-page-head${pic ? ' has-img' : ''}"><div>${page.eyebrow ? `<p class="eyebrow">${esc(page.eyebrow)}</p>` : ''}<h1>${esc(page.title || '')}</h1>${page.lead ? `<p class="lead">${esc(page.lead)}</p>` : ''}</div>${pic}</section>
${page.blocks.map((b) => renderBlock({ ...HOME_BLOCKS, ...PAGE_BLOCKS }, b, x)).join('\n')}`;
  return layout({ title: page.title || SITE.name, description: page.description || page.lead || '', path: page.path, body, current: page.path });
}

const sum = (c) => (c ? c.stories + c.works : 0);

/** Up to n works, no two from the same country where possible, newest first. */
function pickSpread(list, n) {
  const seen = new Set(); const out = [];
  for (const w of list) { if (seen.has(w.country)) continue; seen.add(w.country); out.push(w); if (out.length === n) return out; }
  for (const w of list) { if (out.includes(w)) continue; out.push(w); if (out.length === n) break; }
  return out;
}
