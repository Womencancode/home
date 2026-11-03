/* Pack file, no engine change: the end of the 10 days. Day 10 as a finale (launch, show and tell, a 2-minute pitch, certificates and
 * awards), verifiable certificates in src/certificates.mjs, awards for projects (never a ranking of people) at /awards, a winners page
 * per wave at /winners/<wave>, starter ideas at /ideas and resource cards by level. */
import { PACK } from './site.mjs';
import { SITE, esc, layout, sectionHead, htmlResponse } from './html.mjs';
import { notFoundPage } from './pages/about.mjs';
import { httpsUrl } from './tracks.mjs';
import { PROJECTS, rewardHtml, levelUpsHtml, groupsHtml } from './build.mjs';

const TBA = 'To be announced';
const waveName = (id) => id.replace(/^wave-(\d+)$/, 'Wave $1');

const awards = () => PACK.awards || { categories: [], winners: {} };

export function awardsPage() {
  const a = awards();
  const waves = Object.keys(a.winners || {});
  const body = `
<section class="page-head"><p class="eyebrow">Demo day</p><h1>Awards for projects</h1><p class="lead">${esc(a.lead || '')}</p></section>
<section class="section"><ul class="wcc-awards">${(a.categories || []).map((k) => `<li id="${esc(k.id)}"><b>${esc(k.name)}</b><span>${esc(k.about || '')}</span><span class="wcc-prize">Prize: ${k.prize ? esc(k.prize) : TBA}</span></li>`).join('')}</ul></section>
<section class="section">${sectionHead('Winners', null, null)}<ul class="wcc-plain">${waves.map((w) => `<li><a href="/winners/${esc(w)}">${esc(waveName(w))} winners</a></li>`).join('')}</ul></section>`;
  return layout({ title: 'Awards', description: `Awards for projects shipped in the ${SITE.name} 10-day build. Prizes to be announced.`, path: '/awards', body });
}

export function winnersPage(wave) {
  const a = awards(), list = (a.winners || {})[wave] || [];
  const byCat = Object.fromEntries((a.categories || []).map((k) => [k.id, k.name]));
  const ok = list.filter((w) => w && byCat[w.category] && w.project && httpsUrl(w.live));
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/awards">Awards</a></p><h1>${esc(waveName(wave))} winners</h1><p class="lead">Projects, not people, chosen at the award ceremony on demo day.</p></section>
<section class="section">${ok.length ? `<ul class="wcc-awards">${ok.map((w) => `<li><b>${esc(byCat[w.category])}</b><a href="${esc(w.live)}" rel="noopener">${esc(w.project)}</a></li>`).join('')}</ul>` : `<p class="wcc-tba"><b>${TBA}.</b> Winners are named after demo day.</p>`}</section>`;
  return layout({ title: `${waveName(wave)} winners`, description: `${waveName(wave)} award winners in the ${SITE.name} 10-day build.`, path: `/winners/${wave}`, body });
}

export function ideasPage() {
  const body = `
<section class="page-head"><p class="eyebrow">Starter ideas</p><h1>Not sure what to build?</h1><p class="lead">${esc(PACK.ideasLead || '')}</p></section>
<section class="section"><ul class="wcc-ideas">${PROJECTS.map((p) => `<li><b>${esc(p.label.replace(/^a /, '').replace(/^./, (m) => m.toUpperCase()))}</b><span>${esc(p.days[1])} ${esc(p.days[3] || '')}</span><a href="/?build=${encodeURIComponent(p.label)}#build">See its 10 days</a></li>`).join('')}</ul></section>
<section class="section"><p>Built one already? <a href="/submit?kind=work">Submit your project</a>, with its live link, its code link and one line about it. Approved projects go in <a href="/showcase">the wave gallery</a>.</p></section>`;
  return layout({ title: 'Starter ideas', description: `Starter ideas for the ${SITE.name} 10-day build: a booking page, a shop, a portfolio, a waitlist, a tracker, a community directory.`, path: '/ideas', body });
}

/** Resource cards by level, each credited and linking out. */
export function resourcesHtml(list = PACK.resources || []) {
  if (!list.length) return '';
  return `<section class="section wcc-levels">${sectionHead('Resources by level', null, 'Free, made by other people, credited and linked. Start where you are.', 'Resources')}
  <ol class="wcc-level-cards">${list.map((l, i) => `<li><span class="wcc-dn">${i + 1}</span><h3>${esc(l.level)}</h3><ul>${(l.items || []).filter((r) => httpsUrl(r.url)).map((r) => `<li><a href="${esc(r.url)}" rel="noopener">${esc(r.name)}</a><small>${esc(r.by)}${r.note ? `. ${esc(r.note)}` : ''}</small></li>`).join('')}</ul></li>`).join('')}</ol></section>`;
}

/** The finale on /challenge: day 10's shape, online, and in person when the founder names a place. */
export function finaleHtml(f = PACK.finale || {}) {
  const album = httpsUrl(f.album) ? `<a href="${esc(f.album)}" rel="noopener">The shared photo album</a>` : TBA;
  return `<section class="section wcc-finale" id="finale">${sectionHead('Day 10: the finale', null, null, 'Demo day')}
  <ol class="wcc-five">${(f.parts || []).map((p, i) => `<li><span class="wcc-dn">${i + 1}</span><b>${esc(p.title)}</b><span>${esc(p.text)}</span></li>`).join('')}</ol>
  <dl class="wcc-terms"><div><dt>Online</dt><dd>Both groups together, on the live call</dd></div><div><dt>In person, optional</dt><dd>${esc(f.meetupCity || '')} meetup: ${f.inPerson ? esc(f.inPerson) : 'venue to be announced'}</dd></div><div><dt>Prizes</dt><dd><a href="/awards">See the awards</a></dd></div><div><dt>Certificates</dt><dd><a href="/certificate/sample">See a sample verifiable certificate</a></dd></div><div><dt>Photo album</dt><dd>${album}</dd></div></dl>
</section>`;
}

/** What /challenge gets after the engine's days: level-up extras, the finale and the free product. */
export const challengeExtras = () => `<section class="section wcc-wave-groups" id="groups">${sectionHead('Wave 1: choose your group', null, 'Both groups follow the same 10 days, with recordings of every live session and the group chat.', 'Two groups')}${groupsHtml()}</section>\n${levelUpsHtml()}\n${finaleHtml()}\n${rewardHtml(undefined, { id: 'free-product' })}\n`;

export const FINALE_PATHS = ['/awards', '/ideas', ...Object.keys((PACK.awards || {}).winners || {}).map((w) => `/winners/${w}`)];

export function finaleRoute(path) {
  if (path === '/awards') return htmlResponse(awardsPage());
  if (path === '/ideas') return htmlResponse(ideasPage());
  const w = path.match(/^\/winners\/([a-z0-9-]{1,40})$/);
  if (w) return (awards().winners || {})[w[1]] ? htmlResponse(winnersPage(w[1])) : htmlResponse(notFoundPage(path), 404);
  return null;
}
