import { PACK, T } from '../site.mjs';
import { COUNTRIES, countryByCode } from '../countries.mjs';
import { imageFor } from '../media.mjs';
import { CATEGORIES } from '../content.mjs';
import { esc, layout, storyCard, chip, invite, absolute, SITE, shareBar, localSrc, sameAs } from '../html.mjs';
import { opportunityRail } from './opportunities.mjs';
import { embeddable, embedHtml, embedScripts, socialRow, socialsOf } from '../social.mjs';
import { picture, credit } from '../media.mjs';

export function storiesPage(cat, params) {
  const country = countryByCode(params.get('country'));
  const category = CATEGORIES.includes(params.get('category')) ? params.get('category') : '';
  const q = String(params.get('q') || '').trim().toLowerCase();
  let list = cat.stories;
  if (country) list = list.filter((s) => s.country === country.code);
  if (category) list = list.filter((s) => s.category === category);
  if (q) list = list.filter((s) => `${s.title} ${s.summary} ${(s.people || []).join(' ')} ${s.countryRecord.name}`.toLowerCase().includes(q));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const per = 24;
  const shown = list.slice((page - 1) * per, page * per);
  const link = (changes) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); } p.delete('page'); const s = p.toString(); return `/stories${s ? `?${s}` : ''}`; };
  const body = `
<section class="page-head">
  <p class="eyebrow">Good news</p>
  <h1>${country ? `Good news from ${esc(country.name)}` : 'Things that went right'}</h1>
  <p class="lead">Awards won, records broken, firsts achieved, communities lifted. ${cat.stories.length} stories and counting, every one about something good.</p>
  <form class="filter" action="/stories" method="get" role="search">
    <label class="visually-hidden" for="q">Search stories</label><input id="q" name="q" type="search" value="${esc(params.get('q') || '')}" placeholder="Search by name, place or achievement">
    <label class="visually-hidden" for="country">Country</label><select id="country" name="country"><option value="">All countries</option>${COUNTRIES.map((k) => `<option value="${k.code}"${country && country.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
    ${category ? `<input type="hidden" name="category" value="${esc(category)}">` : ''}
    <button class="button" type="submit">Filter</button>
  </form>
  <p class="chips">${chip('All', link({ category: '' }))}${CATEGORIES.map((c) => `<a class="chip${category === c ? ' active' : ''}" href="${esc(link({ category: c }))}">${esc(c)}</a>`).join('')}</p>
</section>
<section class="section">
  ${shown.length ? `<div class="card-grid">${shown.map((s) => storyCard(s, s.countryRecord, { img: imageFor(s) })).join('')}</div>` : invite(country, 'story')}
  ${pager(list.length, page, per, params, '/stories')}
</section>`;
  return layout({ title: country ? `Good news from ${country.name}` : 'Good news', description: T('stories.description'), path: '/stories', body, current: '/stories' });
}

export function storyPage(story, { opportunities = [] } = {}) {
  const c = story.countryRecord;
  const embed = embeddable(story.url) || (story.video ? embeddable(story.video.url) : null);
  const follow = [...(story.people || []).map((p) => [p, { ...socialsOf(p), ...((story.people || []).length === 1 ? story.socials || {} : {}) }]), ...(story.orgs || []).map((o) => [o, socialsOf(o)])].filter(([, s]) => Object.keys(s).length);
  const body = `
<article class="article">
  <p class="eyebrow"><a href="/stories">Good news</a> · <a href="/country/${esc(c.slug)}${story.city ? `?city=${encodeURIComponent(story.city)}` : ''}"><span aria-hidden="true">${c.flag}</span> ${story.city ? `${esc(story.city)}, ` : ''}${esc(c.name)}</a> · ${esc(story.year)} · <a href="/stories?category=${esc(story.category)}">${esc(story.category)}</a></p>
  <h1>${esc(story.title)}</h1>
  ${imageFor(story) ? `<figure class="hero-photo">${picture(imageFor(story), { alt: story.title, widths: [500, 960], sizes: '(max-width: 900px) 100vw, 820px', eager: true })}<figcaption>${credit(imageFor(story))}</figcaption></figure>` : ''}
  <p class="listen-row"><button type="button" class="listen" data-listen=".article" hidden>▶ Listen</button></p>
  <p class="article-lead">${esc(story.summary)}</p>
  ${embedHtml(embed, esc)}
  ${follow.length ? `<div class="follow">${follow.map(([p, s]) => `<p class="small"><strong>${esc(p)}</strong></p>${socialRow(s, esc)}`).join('')}</div>` : ''}
  ${story.people && story.people.length ? `<p class="chips"><span class="muted">People:</span> ${story.people.map((p) => chip(p, `/talent?q=${encodeURIComponent(p)}`)).join('')}</p>` : ''}
  ${story.url ? `<p><a class="outlink" href="${esc(story.url)}" rel="noopener nofollow ugc">Read more at the source</a></p>` : ''}
  <p class="muted small">${story.community ? `Shared by ${esc(story.submittedBy || 'a reader')} and checked by a moderator.` : `Source: ${esc(story.source || 'public record')}.`} Something to correct? <a href="/submit?kind=correction&country=${esc(c.code)}&title=${encodeURIComponent(`Correction: ${story.title}`)}">Tell us</a>.</p>
  ${shareBar(`/story/${story.slug}`, story.title)}
  <p class="hero-actions"><a class="button" href="/country/${esc(c.slug)}">More from ${esc(c.name)}</a> <a class="button ghost" href="/submit?country=${esc(c.code)}&kind=story">Add a story</a></p>
</article>
${opportunityRail(opportunities, { title: 'Go for the next one', lead: 'Open calls in the same field that you could enter.', n: 3 })}
${embedScripts([embed])}`;
  return layout({ title: story.title, description: story.summary.slice(0, 200), path: `/story/${story.slug}`, type: 'article', body, current: '/stories', image: imageFor(story) ? { src: imageFor(story).src, alt: imageFor(story).alt || story.title } : null, jsonld: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: story.title, description: story.summary, datePublished: story.date || `${story.year}-01-01`, mainEntityOfPage: absolute(`/story/${story.slug}`), ...(imageFor(story) ? { image: [absolute(localSrc(imageFor(story).src))] } : {}), author: { '@type': 'Organization', name: SITE.name, url: absolute('/') }, publisher: { '@type': 'Organization', name: SITE.name, url: absolute('/'), logo: { '@type': 'ImageObject', url: absolute('/icon-512.png') } }, ...(story.url ? { isBasedOn: story.url } : {}), contentLocation: { '@type': 'Place', name: story.city ? `${story.city}, ${c.name}` : c.name }, about: [...(story.people || []).map((p) => ({ '@type': 'Person', name: p, ...(sameAs(p).length ? { sameAs: sameAs(p) } : {}) })), ...(story.orgs || []).map((o) => ({ '@type': 'Organization', name: o, ...(sameAs(o).length ? { sameAs: sameAs(o) } : {}) }))], keywords: [story.category, c.name, ...PACK.keywords].join(', ') } });
}

export function pager(total, page, per, params, base) {
  const pages = Math.ceil(total / per);
  if (pages <= 1) return '';
  const to = (n) => { const p = new URLSearchParams(params); p.set('page', String(n)); return `${base}?${p}`; };
  return `<nav class="pager" aria-label="Pages">${page > 1 ? `<a href="${esc(to(page - 1))}">Previous</a>` : '<span></span>'}<span>Page ${page} of ${pages}</span>${page < pages ? `<a href="${esc(to(page + 1))}">Next</a>` : '<span></span>'}</nav>`;
}
