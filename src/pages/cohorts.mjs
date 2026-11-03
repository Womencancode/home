/* /cohorts: the pack's live-call cohorts (src/cohorts.mjs), each with its Join button or, before the owner adds its Eventbrite link,
 * "Booking opens soon" and a link to ask to be told. Plus the optional home block "cohorts". The markup reuses the page shell's own
 * classes (page-head, section, section-head, button) so each site's skin gives the page its own look. */
import { SITE, esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { cohortsConfig, longDate } from '../cohorts.mjs';
import { challengeConfig, freeLine } from '../challenge.mjs';
import { notFoundPage } from './about.mjs';
import { interestLink, cohortKey } from '../interest.mjs';

const facts = (i, c) => `<dl class="cohort-facts">
      <div><dt>${esc(c.starts)}</dt><dd>${i.starts ? esc(longDate(i.starts)) : esc(c.tba)}</dd></div>
      <div><dt>${esc(c.schedule)}</dt><dd>${esc(i.schedule || c.tba)}</dd></div>
      <div><dt>${esc(c.seats)}</dt><dd>${i.seats ? esc(String(i.seats)) : esc(c.tba)}</dd></div>
    </dl>`;

/** The action for one cohort: "Register interest" by default; with booking on, the Eventbrite button, or the honest "not yet". */
export function cohortAction(i, cfg) {
  const c = cfg.copy;
  if (!cfg.booking) return `<p class="cohort-act">${interestLink(cohortKey(i.id), i.name, { label: c.interest })}</p>`;
  if (i.eventbrite) return `<p class="cohort-act"><a class="button primary" href="${esc(i.eventbrite)}" rel="noopener" target="_blank">${esc(c.join)}<span class="visually-hidden">: ${esc(i.name)}</span></a></p>`;
  return `<p class="cohort-act is-soon"><span class="cohort-soon">${esc(c.soon)}</span> <a class="cohort-notify" href="${esc(cfg.notify)}">${esc(c.notify)}<span class="visually-hidden">: ${esc(i.name)}</span></a></p>`;
}

const card = (i, cfg) => `<article class="cohort-card" id="${esc(i.id)}">
    <h3>${esc(i.name)}</h3>
    ${i.for ? `<p class="cohort-for"><b>${esc(cfg.copy.forLabel)}:</b> ${esc(i.for)}</p>` : ''}
    ${i.about ? `<p class="cohort-about">${esc(i.about)}</p>` : ''}
    ${facts(i, cfg.copy)}
    ${cfg.price ? `<p class="cohort-price">${esc(cfg.price)}</p>` : ''}
    ${cohortAction(i, cfg)}
  </article>`;

/** /cohorts. */
export function cohortsPage(cfg = cohortsConfig()) {
  const c = cfg.copy;
  const body = `
<section class="page-head cohorts-head"><p class="eyebrow">${esc(c.eyebrow)}</p><h1>${esc(cfg.title)}</h1>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}
  ${cfg.price ? `<p class="cohort-pricing"><strong class="cohort-amount">${esc(cfg.price)}</strong> <span class="cohort-paid">${esc(c.paid)}</span></p>` : ''}
</section>
<section class="section cohorts-what">${sectionHead(c.whatTitle, null, null)}<p class="cohorts-what-text">${esc(c.what)}</p>${cfg.booking ? '' : `<p class="cohorts-what-text cohorts-interest">${esc(c.interestLead)}</p>`}${challengeConfig() ? `<p class="cohorts-challenge"><a class="more" href="/challenge">${esc(challengeConfig().title)}</a> ${esc(freeLine(challengeConfig()))}</p>` : ''}</section>
<section class="section cohorts-list" aria-label="${esc(cfg.title)}"><div class="cohort-grid">
  ${cfg.items.map((i) => card(i, cfg)).join('\n  ')}
</div>
${cfg.booking ? `<p class="cohorts-small">${esc(c.cancel)}</p>` : ''}</section>`;
  return layout({ title: cfg.title, description: `${cfg.title} on ${SITE.name}.${cfg.price ? ` ${cfg.price}, ${c.paid.charAt(0).toLowerCase()}${c.paid.slice(1)}.` : ''}`, path: '/cohorts', body, current: '/cohorts' });
}

/** The response for /cohorts, or null for any other path; 404 when the pack has no cohorts. */
export function cohortsRoute(path) {
  if (path !== '/cohorts') return null;
  const cfg = cohortsConfig();
  if (!cfg) return htmlResponse(notFoundPage(path), 404);
  return htmlResponse(cohortsPage(cfg));
}

/** The home block "cohorts": the cohorts by name with the price and one link to the page; '' when off. */
export function cohortsBlock(cfg = cohortsConfig()) {
  if (!cfg) return '';
  const c = cfg.copy;
  return `<section class="section cohorts-band">
  ${sectionHead(c.blockTitle, { href: '/cohorts', label: c.blockMore }, c.blockLead || null, c.eyebrow)}
  <ul class="cohort-rows">${cfg.items.map((i) => `<li><a href="/cohorts#${esc(i.id)}"><b>${esc(i.name)}</b>${i.for ? `<span>${esc(i.for)}</span>` : ''}</a></li>`).join('')}</ul>
  ${cfg.price ? `<p class="cohort-pricing"><strong class="cohort-amount">${esc(cfg.price)}</strong> <span class="cohort-paid">${esc(c.paid)}</span></p>` : ''}
</section>`;
}
