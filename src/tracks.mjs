/* Pack file, no engine change: tracks. Each track is one free course someone else made and runs, with its units as the
 * provider names them, a suggested weekly pace, what you build, and the instructor walk-throughs we add on top. We link out to the
 * course and never rehost it. Data: data/tracks.json; the instructor and the live sessions: site.json "school". */
import list from '../data/tracks.json' with { type: 'json' };
import { PACK } from './site.mjs';
import { esc, layout, sectionHead, htmlResponse } from './html.mjs';
import { notFoundPage } from './pages/about.mjs';
import { cohortsConfig } from './cohorts.mjs';
import { challengeConfig, freeLine } from './challenge.mjs';
import { interestLink } from './interest.mjs';

/** The paid part, from the engine's cohorts: price, and where to book or hear when booking opens. */
const paidOf = () => { const c = cohortsConfig(); return c ? { booking: c.booking, price: c.price, paid: c.copy.paid, notify: c.notify } : { booking: false, price: '', paid: '', notify: '/submit' }; };

export const TRACKS = list;
export const SCHOOL = PACK.school || {};

/** A course link we can send people to: https only. */
export const httpsUrl = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u);

/** Is a track well formed: an id, a free course with a link and a source for both, its units, a pace, what you build and its sessions? */
export function validTrack(t) {
  const c = t && t.course;
  return !!t && /^[a-z0-9-]{2,40}$/.test(t.id || '') && typeof t.title === 'string' && !!c && httpsUrl(c.url) && typeof c.name === 'string' && typeof c.provider === 'string'
    && c.free === true && !!c.freeEvidence && typeof c.freeEvidence.quote === 'string' && Array.isArray(t.sources) && t.sources.length > 0
    && Array.isArray(t.units) && t.units.length > 0 && t.units.every((u) => typeof u === 'string' && u.length > 0)
    && !!t.pace && Number.isInteger(t.pace.weeks) && t.pace.weeks > 0 && typeof t.pace.hours === 'string' && Array.isArray(t.pace.plan) && t.pace.plan.length > 0
    && Array.isArray(t.build) && t.build.length > 0 && Array.isArray(t.walkthroughs) && t.walkthroughs.length > 0;
}

export const trackById = (id, tracks = TRACKS) => tracks.find((t) => t.id === id) || null;

/** A code-editor style chip: the file name a track would open with. */
const tab = (t) => `<span class="wcc-tab" aria-hidden="true"><i></i><i></i><i></i><code>${esc(t.file || `${t.id}.txt`)}</code></span>`;

/** The plain-words line every track carries: their course, free; the walk-through is ours. */
export function creditLine(t) {
  return `<p class="wcc-credit"><b>${esc(t.course.name)}</b> is made and run by <a href="${esc(t.course.url)}" rel="noopener">${esc(t.course.provider)}</a>, and it is free. We do not host or copy it: you learn on their site. The live walk-through, where your instructor works through it alongside you, is ours.</p>`;
}

const card = (t) => `<a class="wcc-track" href="/tracks/${esc(t.id)}">${tab(t)}<span class="wcc-track-body"><span class="wcc-kicker">${esc(t.level)} · ${esc(t.course.provider)}</span><b>${esc(t.title)}</b><small>${esc(t.summary)}</small><span class="wcc-meta"><span>${esc(t.pace.weeks)} weeks</span><span>${esc(t.pace.hours)} a week</span><span>${esc(t.language)}</span></span></span></a>`;

/** /tracks: every track. */
export function tracksPage(tracks = TRACKS) {
  const body = `
<section class="page-head wcc-head"><p class="eyebrow">Go deeper</p><h1>The free course shelf</h1><p class="lead">When you want to go further than the 10 days: free courses made and run by other people, starting with GitHub Skills. You learn on their site; we credit them, link to them and never copy them.</p></section>
<section class="section"><div class="wcc-track-grid">${tracks.map(card).join('')}</div></section>
<section class="section wcc-note"><p>Every course here was checked on its provider's own page. If a course changes or stops being free, tell us through <a href="/submit?kind=correction">a correction</a> and we will take it down.</p></section>`;
  return layout({ title: 'Go deeper', description: 'GitHub Skills first, then free courses from freeCodeCamp, The Odin Project, Harvard CS50, MDN and more, with a weekly pace and live walk-throughs.', path: '/tracks', body, current: '/tracks' });
}

/** /tracks/<id>: one track. */
export function trackPage(t) {
  const sessions = SCHOOL.sessions || {};
  const body = `
<article class="wcc-trackpage">
  <section class="page-head wcc-head"><p class="eyebrow"><a href="/tracks">Tracks</a> · ${esc(t.level)}</p>${tab(t)}<h1>${esc(t.title)}</h1><p class="lead">${esc(t.summary)}</p>
    <p class="hero-actions"><a class="button primary" href="${esc(t.course.url)}" rel="noopener">Open the course on ${esc(t.course.provider)}</a> <a class="button ghost" href="#walkthroughs">See the walk-throughs</a></p></section>
  <section class="wcc-provider panel" aria-labelledby="provider-h"><h2 id="provider-h" class="wcc-h">The course</h2>
    <dl class="wcc-facts"><div><dt>Course</dt><dd><a href="${esc(t.course.url)}" rel="noopener">${esc(t.course.name)}</a></dd></div><div><dt>Made by</dt><dd>${esc(t.course.provider)}</dd></div><div><dt>Cost</dt><dd>Free</dd></div><div><dt>Language</dt><dd>${esc(t.language)}</dd></div></dl>
    <blockquote class="wcc-quote"><p>${esc(t.course.freeEvidence.quote)}</p><footer>${esc(t.course.provider)}, <a href="${esc(t.course.freeEvidence.url)}" rel="noopener">${esc(t.course.freeEvidence.where)}</a></footer></blockquote>
    ${t.course.note ? `<p class="muted">${esc(t.course.note)}</p>` : ''}
    ${creditLine(t)}
  </section>
  <section class="section"><h2 class="wcc-h">${esc(t.unitsLabel || 'Units')}, as ${esc(t.course.provider)} names them</h2>
    <ol class="wcc-units">${t.units.map((u) => `<li><code>${esc(u)}</code></li>`).join('')}</ol></section>
  <section class="section"><h2 class="wcc-h">A suggested pace</h2><p class="lead">${esc(t.pace.weeks)} weeks at ${esc(t.pace.hours)} a week. This is our suggestion, not the provider's; go slower whenever you need to.</p>
    <ol class="wcc-plan">${t.pace.plan.map((p) => `<li><span class="wcc-week">${esc(p.weeks)}</span><span>${esc(p.units)}</span></li>`).join('')}</ol></section>
  <section class="section"><h2 class="wcc-h">What you will build</h2><ul class="wcc-build">${t.build.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>
  <section class="section wcc-walk" id="walkthroughs"><h2 class="wcc-h">Instructor walk-throughs</h2>
    <p class="lead">${esc(sessions.lead || 'Your instructor works through these units alongside you, live, at the same pace.')}</p>
    <ol class="wcc-sessions">${t.walkthroughs.map((w, i) => `<li><span class="wcc-n">${String(i + 1).padStart(2, '0')}</span><b>${esc(w.title)}</b><small>${esc(w.covers)}</small></li>`).join('')}</ol>
    <p class="wcc-when"><b>Dates and times:</b> ${esc(sessions.when || 'To be announced.')} <a href="/live">How the live sessions work</a></p></section>
  <p class="ch-credits">Checked on: ${t.sources.map((s) => `<a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a>`).join(', ')} (${esc(t.checked)}). Units listed in the provider's own words; the summary, pace and walk-throughs are ours.</p>
  <p><a class="more" href="/tracks">All tracks</a></p>
</article>`;
  return layout({ title: t.title, description: `${t.summary} Free on ${t.course.provider}, with live walk-throughs.`, path: `/tracks/${t.id}`, body, current: '/tracks' });
}

/** Your instructor: only what the founder has filled in (name, photo, a 20-second video, why); an empty field shows as a marked slot
 * for her to fill. Nothing is invented: there is no default bio. */
export function instructorHtml(i = SCHOOL.instructor || {}) {
  const todo = (k, label) => `<span class="wcc-todo" data-fill="${esc(k)}">[ ${esc(label)}: for the founder to fill in ]</span>`;
  const photo = i.photo && /^\/[a-z0-9/_.-]+\.(png|jpe?g|webp)$/i.test(i.photo) ? `<img src="${esc(i.photo)}" alt="${esc(i.name || 'Your instructor')}" width="320" height="320">` : todo('photo', 'Photo');
  const video = httpsUrl(i.video) ? `<a class="button ghost" href="${esc(i.video)}" rel="noopener">Watch a 20-second hello</a>` : todo('video', 'Link to a 20-second video');
  return `<div class="wcc-instructor"><div class="wcc-photo">${photo}</div><div>
  <p class="wcc-kicker">Your instructor, live on every call</p><h3>${i.name ? esc(i.name) : todo('name', 'Name')}</h3>
  <p class="wcc-why">${i.why ? esc(i.why) : todo('why', 'Why you are teaching this, in your own words')}</p>
  ${i.bio ? `<p class="muted">${esc(i.bio)}</p>` : ''}
  <p>${video}</p>
  ${i.links && i.links.length ? `<p>${i.links.filter((l) => httpsUrl(l.url)).map((l) => `<a class="outlink" href="${esc(l.url)}" rel="noopener me">${esc(l.label)}</a>`).join(' ')}</p>` : ''}
</div></div>`;
}

/** /live: how the free classes and the paid live calls work. */
export function livePage(school = SCHOOL) {
  const s = school.sessions || {}, paid = school.paid || {}, p = paidOf(), ch = challengeConfig();
  const body = `
<section class="page-head wcc-head"><p class="eyebrow">Live calls</p><h1>Build it <em>alongside</em> someone</h1><p class="lead">${esc(s.lead || '')}</p></section>
<section class="section wcc-two">
  <div class="panel wcc-plan-card"><p class="wcc-kicker">Free</p><h2 class="wcc-h">The free classes</h2><p>${esc(s.free || '')}</p><p><a class="button primary" href="/tracks">Choose a track</a>${ch ? ` <a class="button ghost" href="/challenge">${esc(ch.title)}</a>` : ''}</p></div>
  <div class="panel wcc-plan-card wcc-paid"><p class="wcc-kicker">${p.booking ? esc(p.price) : 'Live calls'}</p><h2 class="wcc-h">Live-call cohorts</h2><p>${esc(paid.about || '')}</p>${p.booking ? `<p class="wcc-soon">${esc(p.price)}, ${esc(p.paid.charAt(0).toLowerCase() + p.paid.slice(1))}.</p>` : ''}<p>${p.booking ? '' : `${interestLink('live-calls', 'live-call cohorts')} `}<a class="button ${p.booking ? 'primary' : 'ghost'}" href="/cohorts">See the cohorts</a></p></div>
</section>
<section class="section"><h2 class="wcc-h">Dates, times and seats</h2><p>${esc(s.when || 'To be announced.')}</p></section>
<section class="section">${instructorHtml(school.instructor)}</section>`;
  return layout({ title: 'Live alongside', description: 'Free classes and live-call cohorts, where your instructor works through free courses alongside you.', path: '/live', body, current: '/live' });
}

/** The routes this file serves, or null. */
export function tracksRoute(path, tracks = TRACKS) {
  if (path === '/live') return htmlResponse(livePage());
  if (path !== '/tracks' && !path.startsWith('/tracks/')) return null;
  if (path === '/tracks' || path === '/tracks/') return htmlResponse(tracksPage(tracks));
  const t = trackById(path.slice(8), tracks);
  return t ? htmlResponse(trackPage(t)) : htmlResponse(notFoundPage(path), 404);
}

/** Home blocks this pack adds to the engine's registry (see src/wcc.mjs). */
export const WCC_BLOCKS = {
  tracks: () => `<section class="section">${sectionHead('Tracks', { href: '/tracks', label: 'All tracks' }, 'One free course per track, at a steady weekly pace, with live walk-throughs on top.', 'Free courses')}<div class="wcc-track-grid">${TRACKS.slice(0, 6).map(card).join('')}</div></section>`,
  alongside: () => {
    const s = SCHOOL.sessions || {};
    return `<section class="section wcc-steps">${sectionHead('How it works', { href: '/live', label: 'Live alongside' }, null, 'Alongside')}
<ol class="wcc-how">${(s.steps || []).map((x, i) => `<li><span class="wcc-n">${String(i + 1).padStart(2, '0')}</span><b>${esc(x.title)}</b><small>${esc(x.text)}</small></li>`).join('')}</ol>
<p class="wcc-strip"><span><b>Free</b> courses on every track</span>${challengeConfig() ? `<span><b>${esc(freeLine(challengeConfig()))}</b> <a href="/challenge">${esc(challengeConfig().title)}</a></span>` : ''}${paidOf().booking ? `<span><b>${esc(paidOf().price)}</b> live-call cohorts, ${esc(paidOf().paid.charAt(0).toLowerCase() + paidOf().paid.slice(1))}</span>` : '<span><b>Live-call cohorts</b> <a href="/cohorts">register interest</a></span>'}</p></section>`;
  },
  instructor: () => `<section class="section">${instructorHtml()}</section>`,
};
