import { esc, layout } from '../html.mjs';
import { imageFor, MEDIA } from '../media.mjs';
import { talent } from '../content.mjs';
import queue from '../../data/review-queue.json' with { type: 'json' };

/** The owner's view of what has a real picture and what does not, so the gaps are a list rather than a guess. */
export function coveragePage(cat, events) {
  const rows = [
    ...events.map((e) => ({ kind: 'event', name: e.name, where: e.countryRecord.name, href: `/event/${e.id}`, img: imageFor(e) })),
    ...cat.stories.map((s) => ({ kind: 'story', name: s.title, where: s.countryRecord.name, href: `/story/${s.slug}`, img: imageFor(s), who: (s.people || []).join(', ') })),
    ...cat.works.map((w) => ({ kind: 'work', name: w.title, where: w.countryRecord.name, href: `/work/${w.slug}`, img: imageFor(w), who: w.creator })),
  ];
  const people = talent(cat);
  const missingPeople = people.filter((p) => !(MEDIA.people || {})[p.name]);
  const sum = (k) => { const all = rows.filter((r) => r.kind === k); return `${all.filter((r) => r.img).length} of ${all.length}`; };
  const table = (list) => `<table class="coverage"><thead><tr><th>Kind</th><th>Entry</th><th>Country</th><th>Who</th><th>Picture</th></tr></thead><tbody>${list.map((r) => `<tr class="${r.img ? 'has' : 'gap'}"><td>${esc(r.kind)}</td><td><a href="${esc(r.href)}">${esc(r.name)}</a></td><td>${esc(r.where)}</td><td>${esc(r.who || '')}</td><td>${r.img ? `<a href="${esc(r.img.page)}" rel="noopener nofollow">${esc(r.img.licence)}, ${esc(r.img.credit)}</a>` : '<b>missing</b>'}</td></tr>`).join('')}</tbody></table>`;
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Moderation</a></p><h1>Pictures</h1>
<p class="lead">Pictures are freely licensed photos from Wikimedia Commons, or the share image of the article a story links to, each credited where it appears. Events: ${sum('event')}. Stories: ${sum('story')}. Works: ${sum('work')}. People in the talent directory: ${people.length - missingPeople.length} of ${people.length}.</p>
<p class="small muted">A story or work takes the photo of the first person it names; an event takes a photo of the event itself. Missing ones show the country's colours until a photo is found or made.</p></section>
<section class="section"><h2>Researched, waiting for a person</h2><p class="small muted">Found by research but not published: the cited page could not be read or did not say what the story claims. Open the link, and if it holds up, submit it through the form.</p><table class="coverage"><thead><tr><th>Kind</th><th>Entry</th><th>Why it is held</th></tr></thead><tbody>${queue.map((q) => `<tr><td>${esc(q.kind)}</td><td><a href="${esc(q.url)}" rel="noopener nofollow">${esc(q.title)}</a></td><td>${esc(q.why)}</td></tr>`).join('')}</tbody></table></section>
<section class="section"><h2>Missing</h2>${table(rows.filter((r) => !r.img))}</section>
<section class="section"><h2>People without a photo</h2><p>${missingPeople.map((p) => esc(p.name)).join(', ') || 'None.'}</p></section>
<section class="section"><h2>Everything</h2>${table(rows)}</section>`;
  return layout({ title: 'Pictures', path: '/admin/coverage', body, noindex: true });
}
