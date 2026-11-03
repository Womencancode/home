/* /writing and /writing/<slug>: the site's own articles, newest first, each with a picture, its sources and an honest line on
 * how it was written; plus a home block showing the latest few. */
import { esc, layout, sectionHead, htmlResponse, absolute, shareBar } from '../html.mjs';
import { POSTS, postBySlug } from '../posts.mjs';
import { LESSONS, onSite } from '../learn.mjs';
import { draftedNote } from './learn.mjs';
import { notFoundPage } from './about.mjs';
import { byRole, roleTag } from '../roles.mjs';

const when = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const pic = (p) => (p.image && onSite(p.image.src) ? p.image : null);

const card = (p) => `<a class="lesson-card post-card${pic(p) ? ' has-pic' : ''}" href="/writing/${esc(p.slug)}">${pic(p) ? `<img class="lesson-pic" src="${esc(pic(p).src)}" alt="" loading="lazy" width="640" height="360">` : ''}<span class="feature-kicker">${esc(p.tag || 'Writing')} · <time datetime="${esc(p.date)}">${esc(when(p.date))}</time></span><b>${esc(p.title)}</b><small>${esc(p.summary)}</small></a>`;

/** /writing: every post, newest first. */
export function writingPage(posts = POSTS) {
  const body = `
<section class="page-head"><p class="eyebrow">Writing</p><h1>Plain words on <em>what is changing</em></h1><p class="lead">Short articles on AI and the rules around it, each linking to the pages it is drawn from.</p></section>
<section class="section"><div class="lesson-grid">${posts.map(card).join('')}</div></section>`;
  return layout({ title: 'Writing', description: 'Short articles in plain words, each linking to its sources.', path: '/writing', body, current: '/writing' });
}

/** /writing/<slug>: one post with its sections, sources, related lessons and how it was written. */
export function postPage(p, lessons = LESSONS) {
  const sources = (p.sources || []).filter((s) => /^https:\/\//.test(s.url || ''));
  const related = (p.lessons || []).map((id) => lessons.find((l) => l.id === id)).filter(Boolean);
  const body = `
<article class="lesson post">
  <section class="page-head"><p class="eyebrow"><a href="/writing">Writing</a> · ${esc(p.tag || 'Article')} · <time datetime="${esc(p.date)}">${esc(when(p.date))}</time></p><h1>${esc(p.title)}</h1><p class="lead">${esc(p.summary)}</p></section>
  ${pic(p) ? `<figure class="lesson-hero"><img src="${esc(pic(p).src)}" alt="${esc(pic(p).alt || '')}" width="640" height="360"></figure>` : ''}
  <div class="post-body">${p.sections.map((s) => `${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${String(s.text).split(/\n\n+/).map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}</div>
  ${draftedNote(p)}
  ${sources.length ? `<section class="post-sources"><h2>Sources</h2><ul>${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a>${s.by ? `, ${esc(s.by)}` : ''}${s.date ? ` (${esc(s.date)})` : ''}</li>`).join('')}</ul></section>` : ''}
  ${related.length ? `<section class="section">${sectionHead('Learn more', { href: '/learn', label: 'All lessons' }, '', '')}<div class="lesson-grid">${related.map((l) => `<a class="lesson-card" href="/learn/${esc(l.id)}"><span class="feature-kicker">${esc(l.track)} · ${esc(l.minutes)} min</span><b>${esc(l.title)}</b></a>`).join('')}</div></section>` : ''}
  ${shareBar(`/writing/${p.slug}`, p.title)}
  <p><a class="more" href="/writing">All writing</a></p>
</article>`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.summary, datePublished: p.date, url: absolute(`/writing/${p.slug}`), citation: sources.map((s) => s.url) };
  return layout({ title: p.title, description: p.summary, path: `/writing/${p.slug}`, body, current: '/writing', type: 'article', jsonld });
}

/** The response for a /writing path, or null when the path is not one. With no posts every /writing path is a 404. */
export function writingRoute(path, posts = POSTS) {
  if (path !== '/writing' && !path.startsWith('/writing/')) return null;
  if (!posts.length) return htmlResponse(notFoundPage(path), 404);
  if (path === '/writing') return htmlResponse(writingPage(posts));
  const p = postBySlug(path.slice(9), posts);
  return p ? htmlResponse(postPage(p)) : htmlResponse(notFoundPage(path), 404);
}

/** The home block: the latest `n` posts, or with a role its best fits first; '' with none. */
export function writingBlock(n = 3, posts = POSTS, role = null) {
  if (!posts.length) return '';
  return `<section class="section writing-rail">${sectionHead('Latest writing', { href: '/writing', label: 'All writing' }, 'Plain words on what is changing, each linking to its sources.', roleTag(role, posts.slice(0, 40), 'Writing'))}<div class="lesson-grid">${byRole(role, posts).slice(0, n).map(card).join('')}</div></section>`;
}
