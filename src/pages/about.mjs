import { COUNTRIES } from '../countries.mjs';
import { SITE, esc, layout } from '../html.mjs';
import { PACK, fill } from '../site.mjs';

/** Sections from the pack as HTML: each a heading and one paragraph. */
const prose = (sections, vars) => sections.map((x) => `<h2>${x.h}</h2>\n<p>${fill(x.html, vars)}</p>`).join('\n');

/** The About page from the site pack, with its sections also published as FAQPage data (each asked the way people ask it). */
export function aboutPage(cat) {
  const A = PACK.about, vars = { name: esc(SITE.name), countries: COUNTRIES.length, stories: cat.stories.length, works: cat.works.length };
  const body = `
<section class="page-head"><p class="eyebrow">About</p><h1>What ${esc(SITE.name)} is for</h1>
<p class="lead">${fill(A.lead, vars)}</p></section>
<section class="section prose">
${prose(A.sections, vars)}
</section>`;
  const faq = A.sections.map((x) => ({ '@type': 'Question', name: fill(x.q, { name: SITE.name }), acceptedAnswer: { '@type': 'Answer', text: fill(x.html, vars).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() } }));
  return layout({ jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }, title: 'About', description: fill(A.description, { name: SITE.name }), path: '/about', body, current: '/about' });
}

/** The content guidelines from the site pack. */
export function guidelinesPage() {
  const G = PACK.guidelines;
  const body = `
<section class="page-head"><p class="eyebrow">Content guidelines</p><h1>What we publish, and how we decide</h1>
<p class="lead">These are the rules moderators apply to every submission. They are short on purpose.</p></section>
<section class="section prose">
${prose(G.sections, {})}
</section>`;
  return layout({ title: 'Content guidelines', description: G.description, path: '/guidelines', body });
}

export function notFoundPage(path) {
  const body = `<section class="page-head"><p class="eyebrow">404</p><h1>That page is not here</h1><p class="lead">Nothing lives at <code>${esc(path)}</code>. Try <a href="/countries">the country list</a>, <a href="/stories">good news</a> or <a href="/showcase">the showcase</a>.</p></section>`;
  return layout({ title: 'Not found', path, body, noindex: true });
}

export function errorPage() {
  const body = `<section class="page-head"><p class="eyebrow">500</p><h1>Something went wrong on our side</h1><p class="lead">Please try again in a moment. If it keeps happening, <a href="/submit?kind=correction">tell us</a>.</p></section>`;
  return layout({ title: 'Error', path: '/', body, noindex: true });
}
