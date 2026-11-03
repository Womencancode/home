/* /learn and /learn/<id>: bite-size lessons grouped by track, plus a home block showing a few. */
import { esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { LESSONS, tracks, lessonById, onSite } from '../learn.mjs';
import { notFoundPage } from './about.mjs';
import { byRole, roleTag } from '../roles.mjs';

/** A lesson's picture, when it names one on this site: { src, alt }. */
const pic = (l) => (l.image && onSite(l.image.src) ? l.image : null);
/** The line under AI-drafted writing (EU AI Act Article 50(4)): drafted with AI from the linked sources, and whether an editor has reviewed it. */
export const draftedNote = (x) => (x && x.drafted === 'ai' ? `<p class="ai-note">${x.reviewed ? 'Drafted with AI from the linked sources and reviewed by our editor.' : 'Drafted with AI from the linked sources. Check the links for the full detail.'}</p>` : '');

const card = (l) => `<a class="lesson-card${pic(l) ? ' has-pic' : ''}" href="/learn/${esc(l.id)}">${pic(l) ? `<img class="lesson-pic" src="${esc(pic(l).src)}" alt="" loading="lazy" width="640" height="360">` : ''}<span class="feature-kicker">${esc(l.track)} · ${esc(l.minutes)} min</span><b>${esc(l.title)}</b><small>${esc(l.summary)}</small></a>`;

/** /learn: every lesson, grouped by track. */
export function learnPage(lessons = LESSONS) {
  const body = `
<section class="page-head"><p class="eyebrow">Learn</p><h1>Short lessons, <em>then try it</em></h1><p class="lead">A few minutes each, in plain words. Every lesson ends with something to do next, right here.</p></section>
${tracks(lessons).map((t) => `<section class="section">${sectionHead(t.track, null, '')}<div class="lesson-grid">${t.lessons.map(card).join('')}</div></section>`).join('')}`;
  return layout({ title: 'Learn', description: 'Short, practical lessons in plain words, each with a next step to try.', path: '/learn', body, current: '/learn' });
}

/** /learn/<id>: one lesson, its steps, its next step and a small credit for what it was reviewed from. */
export function lessonPage(l) {
  const href = onSite(l.try && l.try.href) ? l.try.href : '/';
  const sources = (l.sources || []).filter((s) => /^https:\/\//.test(s.url || ''));
  const body = `
<article class="lesson">
  <section class="page-head"><p class="eyebrow"><a href="/learn">Learn</a> · ${esc(l.track)} · ${esc(l.minutes)} min</p><h1>${esc(l.title)}</h1><p class="lead">${esc(l.summary)}</p></section>
  ${pic(l) ? `<figure class="lesson-hero"><img src="${esc(pic(l).src)}" alt="${esc(pic(l).alt || '')}" width="640" height="360"></figure>` : ''}
  <ol class="lesson-steps">${l.steps.map((s) => `<li><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></li>`).join('')}</ol>
  <section class="cta-band panel lesson-try"><p class="eyebrow">Try it now</p><p>${esc(l.try.text)}</p><p><a class="button primary" href="${esc(href)}">Try it</a></p></section>
  ${sources.length ? `<p class="ch-credits">Reviewed from: ${sources.map((s) => `<a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a>${s.by ? ` (${esc(s.by)})` : ''}`).join(', ')}. Written in our own words.</p>` : ''}
  ${draftedNote(l)}
  <p><a class="more" href="/learn">All lessons</a></p>
</article>`;
  return layout({ title: l.title, description: l.summary, path: `/learn/${l.id}`, body, current: '/learn' });
}

/** The response for a /learn path, or null when the path is not one. With no lessons every /learn path is a 404. */
export function learnRoute(path, lessons = LESSONS) {
  if (path !== '/learn' && !path.startsWith('/learn/')) return null;
  if (!lessons.length) return htmlResponse(notFoundPage(path), 404);
  if (path === '/learn') return htmlResponse(learnPage(lessons));
  const l = lessonById(path.slice(7), lessons);
  return l ? htmlResponse(lessonPage(l)) : htmlResponse(notFoundPage(path), 404);
}

/** The home block: up to `n` lessons, one per track first, or with a role (src/roles.mjs) its best fits first; '' with none. */
export function learnBlock(n = 4, lessons = LESSONS, role = null) {
  if (!lessons.length) return '';
  const firsts = tracks(lessons).map((t) => t.lessons[0]);
  const pick = (role ? byRole(role, lessons) : [...firsts, ...lessons.filter((l) => !firsts.includes(l))]).slice(0, n);
  return `<section class="section learn-rail">${sectionHead('Learn in minutes', { href: '/learn', label: 'All lessons' }, 'Short lessons in plain words, each with something to try next.', roleTag(role, pick, 'Learn'))}<div class="lesson-grid">${pick.map(card).join('')}</div></section>`;
}
