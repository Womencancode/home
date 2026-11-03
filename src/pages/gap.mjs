/* The representation gap as a broadsheet data graphic (home block "gap") and the fuller /why page. Bars are CSS widths on a 0 to 100
 * scale capped at the larger figure; each row is also a sentence and a table, so the numbers never live only in a picture. */
import { SITE, esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { gapConfig } from '../gap.mjs';
import { notFoundPage } from './about.mjs';

const pct = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
const cite = (f) => `<a href="${esc(f.url)}" rel="noopener" target="_blank">${esc(f.release)}, ${esc(f.year)}</a>`;

function row(r) {
  const top = Math.max(r.teachers.value, r.pupils.value) || 1;
  const w = (v) => `${Math.max(1.5, (v / top) * 100).toFixed(1)}%`;
  const gap = r.pupils.value - r.teachers.value;
  return `<figure class="gap-row">
  <figcaption class="gap-place">${esc(r.place)}</figcaption>
  <div class="gap-bars" aria-hidden="true">
    <div class="gap-bar is-pupils"><span class="gap-fill" style="width:${w(r.pupils.value)}"></span><span class="gap-n">${pct(r.pupils.value)}</span><span class="gap-k">${esc(r.pupils.label)}</span></div>
    <div class="gap-bar is-teachers"><span class="gap-fill" style="width:${w(r.teachers.value)}"></span><span class="gap-n">${pct(r.teachers.value)}</span><span class="gap-k">${esc(r.teachers.label)}</span></div>
  </div>
  <p class="gap-say">${esc(r.pupils.label)}: <strong>${pct(r.pupils.value)}</strong>. ${esc(r.teachers.label)}: <strong>${pct(r.teachers.value)}</strong>.${gap > 0 ? ` A gap of ${pct(Math.round(gap * 10) / 10)} points.` : ''}</p>
  <p class="gap-src">Sources: pupils, ${cite(r.pupils)}; teachers, ${cite(r.teachers)}.${r.note ? ` ${esc(r.note)}` : ''}</p>
</figure>`;
}

/** The home block; '' when off. */
export function gapBlock() {
  const cfg = gapConfig();
  if (!cfg) return '';
  return `<section class="section gap-band" aria-labelledby="gap-h">
  <div class="section-head"><div><p class="section-n">By the numbers</p><h2 id="gap-h">${esc(cfg.title)}</h2>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}</div><a class="more" href="/why">Why it matters</a></div>
  <div class="gap-graphic">${cfg.rows.map(row).join('')}</div>
</section>`;
}

/** /why, optionally for one country (?country=GB): its rows and its facts, with a switch between the countries that have any. */
export function whyPage(params = new URLSearchParams()) {
  const all = gapConfig();
  const codes = [...new Set([...all.rows.map((r) => r.country), ...all.why.map((p) => p.country || '')].filter(Boolean))];
  const want = codes.includes(String(params.get('country') || '').toUpperCase()) ? String(params.get('country')).toUpperCase() : '';
  const keep = (x) => !want || !x.country || x.country === want;
  const cfg = { ...all, rows: all.rows.filter(keep), why: all.why.filter(keep) };
  const names = { GB: 'United Kingdom', US: 'United States' };
  const switcher = codes.length > 1 ? `<p class="chips"><a class="chip${want ? '' : ' active'}" href="/why">Both</a>${codes.map((c) => `<a class="chip${want === c ? ' active' : ''}" href="/why?country=${c}">${esc(names[c] || c)}</a>`).join('')}</p>` : '';
  const table = `<table class="gap-table"><caption>The figures, with their sources</caption><thead><tr><th scope="col">Where</th><th scope="col">Pupils</th><th scope="col">Teachers</th><th scope="col">Sources</th></tr></thead><tbody>${cfg.rows.map((r) => `<tr><th scope="row">${esc(r.place)}</th><td>${pct(r.pupils.value)} <small>${esc(r.pupils.label)}</small></td><td>${pct(r.teachers.value)} <small>${esc(r.teachers.label)}</small></td><td>${cite(r.pupils)}; ${cite(r.teachers)}</td></tr>`).join('')}</tbody></table>`;
  const body = `
<section class="page-head"><p class="eyebrow">Why this site exists</p><h1>${esc(cfg.title)}</h1>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}${switcher}</section>
${cfg.rows.length ? `<section class="section gap-band"><div class="gap-graphic">${cfg.rows.map(row).join('')}</div></section>` : ''}
${cfg.why.length ? `<section class="section why-copy">${sectionHead('What the figures say', null, null, 'The case')}${cfg.why.map((p) => `<p>${p.label ? `<b class="why-k">${esc(p.label)}.</b> ` : ''}${esc(p.text)} <a class="why-src" href="${esc(p.url)}" rel="noopener" target="_blank">${esc(p.source)}</a></p>`).join('')}</section>` : ''}
${cfg.rows.length ? `<section class="section">${table}</section>` : ''}`;
  return layout({ title: cfg.title, description: `${cfg.lead || cfg.title} Sourced figures on ${SITE.name}.`, path: '/why', body, current: '/why' });
}

export function whyRoute(path, params) {
  if (path !== '/why') return null;
  if (!gapConfig()) return htmlResponse(notFoundPage(path), 404);
  return htmlResponse(whyPage(params));
}
