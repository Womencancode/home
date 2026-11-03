/* /challenge: the pack's build challenge (src/challenge.mjs). Free days are open in full; the rest show their title and what you end up
 * with, and a "Continue the challenge" link to the paid live-call cohort, like episodes that unlock. Plus the optional home block
 * "challenge". Markup reuses the shell's classes so each site's skin gives it its look. */
import { SITE, esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { challengeConfig, freeLine } from '../challenge.mjs';
import { notFoundPage } from './about.mjs';
import { interestLink, challengeKey, dayKey, levelKey } from '../interest.mjs';

const mins = (d, c) => (d.minutes ? `<span class="ch-day-min">${esc(c.minutes.replace('{n}', String(d.minutes)))}</span>` : '');

/** The action for the rest of the days: "Register interest" by default; with booking on, the Eventbrite button, or "Booking opens soon". */
export function continueAction(cfg) {
  const c = cfg.copy;
  if (!cfg.booking) return `<p class="cohort-act">${interestLink(challengeKey(), cfg.title, { label: c.interest })}</p>`;
  if (cfg.eventbrite) return `<p class="cohort-act"><a class="button primary" href="${esc(cfg.eventbrite)}" rel="noopener" target="_blank">${esc(c.continue)}</a></p>`;
  return `<p class="cohort-act is-soon"><span class="cohort-soon">${esc(c.soon)}</span> <a class="cohort-notify" href="${esc(cfg.notify)}">${esc(c.notify)}</a></p>`;
}

const freeDay = (d, c) => `<li class="ch-day is-free" id="day-${d.n}">
    <p class="ch-day-top"><span class="ch-day-n">Day ${d.n}</span><span class="ch-day-tag">${esc(c.free)}</span>${mins(d, c)}</p>
    <h3>${esc(d.title)}</h3>
    <p class="ch-day-build"><b>${esc(c.youBuild)}:</b> ${esc(d.build)}</p>
    ${d.follows ? `<p class="ch-day-follows">${esc(c.follows)}: ${esc(d.follows)}</p>` : ''}
    ${d.about ? `<p class="ch-day-about">${esc(d.about)}</p>` : ''}
    ${d.steps.length ? `<ol class="ch-day-steps">${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${d.link ? `<p class="ch-day-link"><a class="button ghost" href="${esc(d.link)}" rel="noopener">${esc(d.linkLabel || c.open)}</a></p>` : ''}
  </li>`;

const lockedDay = (d, c, cfg) => `<li class="ch-day is-locked" id="day-${d.n}">
    <p class="ch-day-top"><span class="ch-day-n">Day ${d.n}</span><span class="ch-day-tag">${esc(c.locked)}</span>${mins(d, c)}</p>
    <h3>${esc(d.title)}</h3>
    <p class="ch-day-build"><b>${esc(c.youBuild)}:</b> ${esc(d.build)}</p>
    ${d.follows ? `<p class="ch-day-follows">${esc(c.follows)}: ${esc(d.follows)}</p>` : ''}
    <p class="ch-day-link">${cfg.booking ? `<a class="ch-day-continue" href="#continue">${esc(c.continue)}<span class="visually-hidden">: day ${d.n}</span></a>` : interestLink(dayKey(d.n), `day ${d.n}`, { cls: 'ch-day-continue', label: c.interestDay })}</p>
  </li>`;

/** "Finish Level 1, get your Level 1 certificate", when the level has one. */
export const certLine = (l) => (l.certificate ? `<p class="ch-level-cert"><b>${esc(l.certificate)}</b></p>` : '');

const dayHtml = (cfg) => (d) => (d.free ? freeDay(d, cfg.copy) : lockedDay(d, cfg.copy, cfg));

/** The days, in one list, or with "levels" one block per level (its title, lead, days and its own Register interest). */
function daysHtml(cfg) {
  if (!cfg.levels || !cfg.levels.length) return `<section class="section challenge-days" aria-label="${esc(cfg.title)}"><ol class="ch-days">
  ${cfg.days.map(dayHtml(cfg)).join('\n  ')}
</ol></section>`;
  return cfg.levels.map((l, i) => { const ds = cfg.days.filter((d) => l.days.includes(d.n)); return `<section class="section challenge-days ch-level" id="${esc(l.id)}" aria-labelledby="${esc(l.id)}-h">
  <header class="ch-level-head">${l.seal ? `<img class="ch-level-seal" src="${esc(l.seal)}" alt="" width="72" height="72" loading="lazy" decoding="async">` : ''}<div><p class="eyebrow">Level ${i + 1}, days ${ds[0].n} to ${ds[ds.length - 1].n}</p><h2 id="${esc(l.id)}-h">${esc(l.title)}</h2>${l.lead ? `<p class="lead">${esc(l.lead)}</p>` : ''}${certLine(l)}<p class="cohort-act">${interestLink(levelKey(l.id), l.title)}</p></div></header>
  <ol class="ch-days">
  ${ds.map(dayHtml(cfg)).join('\n  ')}
</ol></section>`; }).join('\n');
}

/** /challenge. */
export function challengePage(cfg = challengeConfig()) {
  const c = cfg.copy;
  const paid = cfg.days.length > cfg.freeDays;
  const body = `
<section class="page-head challenge-head"><p class="eyebrow">${esc(c.eyebrow)}</p><h1>${esc(cfg.title)}</h1>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}
  <p class="ch-free-line" data-free-days="${cfg.freeDays}"><strong>${esc(freeLine(cfg))}</strong></p>
  <dl class="cohort-facts ch-facts"><div><dt>${esc(c.wave)}</dt><dd>${esc(cfg.wave || c.tba)}</dd></div><div><dt>${esc(c.when)}</dt><dd>${esc(c.tba)}</dd></div><div><dt>Days</dt><dd>${cfg.days.length}</dd></div></dl>
</section>
${daysHtml(cfg)}
${paid ? `<section class="section ch-continue" id="continue">${sectionHead(c.continueTitle, null, null)}<p class="cohorts-what-text">${esc(c.continueLead)}</p>
  ${cfg.price ? `<p class="cohort-pricing"><strong class="cohort-amount">${esc(cfg.price)}</strong> <span class="cohort-paid">${esc(c.paid)}</span></p>` : ''}
  ${continueAction(cfg)}
</section>` : ''}
${cfg.faq.length ? `<section class="section ch-faq">${sectionHead(c.faqTitle, null, null)}<dl class="ch-faq-list">${cfg.faq.map((f) => `<div><dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd></div>`).join('')}</dl></section>` : ''}`;
  return layout({ title: cfg.title, description: `${cfg.title} on ${SITE.name}. ${freeLine(cfg)}`, path: '/challenge', body, current: '/challenge' });
}

/** The response for /challenge, or null for any other path; 404 when the pack has no challenge. */
export function challengeRoute(path) {
  if (path !== '/challenge') return null;
  const cfg = challengeConfig();
  if (!cfg) return htmlResponse(notFoundPage(path), 404);
  return htmlResponse(challengePage(cfg));
}

const rows = (ds) => `<ol class="ch-rows">${ds.map((d) => `<li class="${d.free ? 'is-free' : 'is-locked'}"><a href="/challenge#day-${d.n}"><span class="ch-day-n">Day ${d.n}</span><b>${esc(d.title)}</b><span>${esc(d.build)}</span></a></li>`).join('')}</ol>`;
const rowsHtml = (cfg) => (!cfg.levels || !cfg.levels.length ? rows(cfg.days)
  : cfg.levels.map((l, i) => `<div class="ch-level-rows"><h3 class="ch-level-title">${l.seal ? `<img class="ch-level-seal" src="${esc(l.seal)}" alt="" width="40" height="40" loading="lazy" decoding="async">` : ''}<a href="/challenge#${esc(l.id)}">Level ${i + 1}: ${esc(l.title)}</a></h3>${certLine(l)}${rows(cfg.days.filter((d) => l.days.includes(d.n)))}</div>`).join(''));

/** The home block "challenge": every day by name, free ones marked, and one link to the page; '' when off. */
export function challengeBlock(cfg = challengeConfig()) {
  if (!cfg) return '';
  const c = cfg.copy;
  return `<section class="section challenge-band">
  ${sectionHead(c.blockTitle, { href: '/challenge', label: c.blockMore }, c.blockLead || null, c.eyebrow)}
  <p class="ch-free-line"><strong>${esc(freeLine(cfg))}</strong></p>
  ${rowsHtml(cfg)}
</section>`;
}
