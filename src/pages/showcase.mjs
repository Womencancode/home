import { T } from '../site.mjs';
import { COUNTRIES, countryByCode } from '../countries.mjs';
import { imageFor } from '../media.mjs';
import { MEDIA, talent } from '../content.mjs';
import { esc, layout, workCard, chip, invite, absolute, SITE, shareBar, localSrc, sameAs } from '../html.mjs';
import { pager } from './stories.mjs';
import { embeddable, embedHtml, embedScripts, socialRow, socialsOf } from '../social.mjs';
import { picture, credit, personImage } from '../media.mjs';
import { careerOn } from '../careers.mjs';
import { profilesOf } from '../profiles.mjs';
import { verifiedBadge } from './profiles.mjs';

export function showcasePage(cat, params) {
  const country = countryByCode(params.get('country'));
  const medium = MEDIA.includes(params.get('medium')) ? params.get('medium') : '';
  const q = String(params.get('q') || '').trim().toLowerCase();
  let list = cat.works;
  if (country) list = list.filter((w) => w.country === country.code);
  if (medium) list = list.filter((w) => w.medium === medium);
  if (q) list = list.filter((w) => `${w.title} ${w.creator} ${w.blurb} ${(w.tags || []).join(' ')} ${w.countryRecord.name}`.toLowerCase().includes(q));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const per = 24;
  const shown = list.slice((page - 1) * per, page * per);
  const present = MEDIA.filter((m) => cat.works.some((w) => w.medium === m));
  const link = (changes) => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(changes)) { if (v) p.set(k, v); else p.delete(k); } p.delete('page'); const s = p.toString(); return `/showcase${s ? `?${s}` : ''}`; };
  const body = `
<section class="page-head">
  <p class="eyebrow">Creative showcase</p>
  <h1>${country ? `Made in ${esc(country.name)}` : T('showcase.h1')}</h1>
  <p class="lead">Films, series, albums, books, poetry, painting, photography and more. ${cat.works.length} works so far. Add yours, or someone's you love.</p>
  <form class="filter" action="/showcase" method="get" role="search">
    <label class="visually-hidden" for="q">Search works</label><input id="q" name="q" type="search" value="${esc(params.get('q') || '')}" placeholder="Search titles, creators, tags">
    <label class="visually-hidden" for="country">Country</label><select id="country" name="country"><option value="">All countries</option>${COUNTRIES.map((k) => `<option value="${k.code}"${country && country.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
    ${medium ? `<input type="hidden" name="medium" value="${esc(medium)}">` : ''}
    <button class="button" type="submit">Filter</button>
  </form>
  <p class="chips">${chip('All', link({ medium: '' }))}${present.map((m) => `<a class="chip${medium === m ? ' active' : ''}" href="${esc(link({ medium: m }))}">${esc(m)}</a>`).join('')}</p>
</section>
<section class="section">
  ${shown.length ? `<div class="card-grid">${shown.map((w) => workCard(w, w.countryRecord, { img: imageFor(w) })).join('')}</div>` : invite(country, 'work')}
  ${pager(list.length, page, per, params, '/showcase')}
</section>`;
  return layout({ title: country ? `Creative work from ${country.name}` : 'Creative showcase', description: T('showcase.description'), path: '/showcase', body, current: '/showcase' });
}

export function workPage(work, cat) {
  const c = work.countryRecord;
  const more = cat.works.filter((w) => w.country === work.country && w.slug !== work.slug).slice(0, 3);
  const embed = embeddable(work.url) || (work.video ? embeddable(work.video.url) : null);
  const socials = { ...socialsOf(work.creator), ...(work.socials || {}) };
  const body = `
<article class="article">
  <p class="eyebrow"><a href="/showcase">Showcase</a> · <a href="/showcase?medium=${esc(work.medium)}">${esc(work.medium)}</a> · <a href="/country/${esc(c.slug)}${work.city ? `?city=${encodeURIComponent(work.city)}` : ''}"><span aria-hidden="true">${c.flag}</span> ${work.city ? `${esc(work.city)}, ` : ''}${esc(c.name)}</a> · ${esc(work.year)}</p>
  <h1>${esc(work.title)}</h1>
  <p class="byline">by ${esc(work.creator)}</p>
  ${imageFor(work) ? `<figure class="hero-photo">${picture(imageFor(work), { alt: work.creator, widths: [500, 960], sizes: '(max-width: 900px) 100vw, 820px', eager: true })}<figcaption>${credit(imageFor(work))}</figcaption></figure>` : ''}
  ${socialRow(socials, esc)}
  <p class="article-lead">${esc(work.blurb)}</p>
  ${embedHtml(embed, esc)}
  ${work.tags && work.tags.length ? `<p class="chips">${work.tags.map((t) => chip(t, `/showcase?q=${encodeURIComponent(t)}`)).join('')}</p>` : ''}
  ${work.url ? `<p><a class="button primary" href="${esc(work.url)}" rel="noopener nofollow ugc">Watch, listen or read</a></p>` : '<p class="muted small">We link only to pages the creator or rights holder controls. Know the official page? <a href="/submit?kind=correction">Send it</a>.</p>'}
  ${shareBar(`/work/${work.slug}`, `${work.title} by ${work.creator}`)}
  <p class="muted small">${work.community ? `Shared by ${esc(work.submittedBy || 'a reader')} and checked by a moderator.` : 'An editor\'s pick.'} Something to correct? <a href="/submit?kind=correction&country=${esc(c.code)}&title=${encodeURIComponent(`Correction: ${work.title}`)}">Tell us</a>.</p>
</article>
${more.length ? `<section class="section section-alt"><div class="section-head"><h2>More from ${esc(c.name)}</h2><a class="more" href="/country/${esc(c.slug)}">The ${esc(c.name)} page</a></div><div class="card-grid">${more.map((w) => workCard(w, c, { img: imageFor(w) })).join('')}</div></section>` : ''}
${embedScripts([embed])}`;
  return layout({ title: `${work.title} by ${work.creator}`, description: work.blurb.slice(0, 200), path: `/work/${work.slug}`, type: 'article', body, current: '/showcase', image: imageFor(work) ? { src: imageFor(work).src, alt: imageFor(work).alt || work.title } : null, jsonld: { '@context': 'https://schema.org', '@type': 'CreativeWork', name: work.title, creator: { '@type': 'Person', name: work.creator, ...(sameAs(work.creator).length ? { sameAs: sameAs(work.creator) } : {}) }, dateCreated: String(work.year), description: work.blurb, ...(imageFor(work) ? { image: absolute(localSrc(imageFor(work).src)) } : {}), ...(work.url ? { url: work.url } : {}), publisher: { '@type': 'Organization', name: SITE.name, url: absolute('/'), logo: { '@type': 'ImageObject', url: absolute('/icon-512.png') } } } });
}

export function talentPage(cat, params) {
  const country = countryByCode(params.get('country'));
  const q = String(params.get('q') || '').trim().toLowerCase();
  /* With proof-of-work profiles on, each name opens its own page and carries its badge. */
  const profiles = careerOn('profiles') ? profilesOf(cat) : null;
  let people = profiles || talent(cat);
  if (country) people = people.filter((p) => p.countries.some((k) => k.code === country.code));
  if (q) people = people.filter((p) => `${p.name} ${p.disciplines.join(' ')} ${p.countries.map((k) => k.name).join(' ')}`.toLowerCase().includes(q));
  const letters = [...new Set(people.map((p) => p.name[0].toUpperCase()))];
  const body = `
<section class="page-head">
  <p class="eyebrow">Talent directory</p>
  <h1>${country ? T('talent.from', { country: esc(country.name) }) : T('talent.h1')}</h1>
  <p class="lead">Every creator named in the showcase, plus people who asked to be listed. Looking for a collaborator, a speaker or someone to commission? Start here.</p>
  <form class="filter" action="/talent" method="get" role="search">
    <label class="visually-hidden" for="q">Search people</label><input id="q" name="q" type="search" value="${esc(params.get('q') || '')}" placeholder="Search by name or discipline" data-filter="person">
    <label class="visually-hidden" for="country">Country</label><select id="country" name="country"><option value="">All countries</option>${COUNTRIES.map((k) => `<option value="${k.code}"${country && country.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
    <button class="button" type="submit">Find</button>
  </form>
  <nav class="jump" aria-label="Letters">${letters.map((l) => chip(l, `#letter-${l}`)).join('')}</nav>
  <p class="hero-actions">${profiles ? '<a class="button primary" href="/talent/add">Add your proof of work</a> ' : ''}<a class="button" href="/submit?kind=talent">List yourself or nominate someone</a></p>
</section>
<section class="section">
${people.length ? letters.map((l) => `<h2 class="letter" id="letter-${esc(l)}">${esc(l)}</h2><ul class="people">${people.filter((p) => p.name[0].toUpperCase() === l).map((p) => `<li class="person${personImage(p.name) ? ' has-photo' : ''}" data-name="${esc(p.name.toLowerCase())}">${personImage(p.name) ? picture(personImage(p.name), { alt: p.name, widths: [330], sizes: '64px', className: 'avatar' }) : `<span class="avatar none" aria-hidden="true">${esc(p.name.slice(0, 1))}</span>`}<strong>${p.slug ? `<a href="/talent/${esc(p.slug)}">${esc(p.name)}</a>` : esc(p.name)}</strong>${p.slug ? ` ${verifiedBadge(p)}` : ''} <span class="muted">${p.countries.map((k) => `<a href="/country/${esc(k.slug)}"><span aria-hidden="true">${k.flag}</span> ${esc(k.name)}</a>`).join(', ')}</span>${p.disciplines.length ? ` · <span class="muted">${esc(p.disciplines.join(', '))}</span>` : ''}${p.works.length ? `<br><span class="small">${p.works.slice(0, 4).map((w) => `<a href="/work/${esc(w.slug)}">${esc(w.title)}</a>`).join(' · ')}</span>` : ''}${p.url ? `<br><a class="small outlink" href="${esc(p.url)}" rel="noopener nofollow ugc">Their page</a>` : ''}${socialRow(p.socials, esc)}</li>`).join('')}</ul>`).join('') : invite(country, 'talent')}
</section>`;
  return layout({ title: country ? T('talent.from', { country: country.name }) : 'Talent directory', description: T('talent.description'), path: '/talent', body, current: '/talent' });
}
