import { T } from '../site.mjs';
import { esc, layout } from '../html.mjs';
import { embeddable } from '../social.mjs';

/** Every entry with an official video, newest first: [{ id, title, kind, href, place, channel, still }]. */
export function videoItems(cat, events = []) {
  const one = (e, kind, href) => { const v = e.video && embeddable(e.video.url); return v && v.network === 'youtube' ? { id: v.id, title: e.title || e.name, kind, href, place: e.countryRecord ? `${e.countryRecord.flag} ${e.city ? `${e.city}, ` : ''}${e.countryRecord.name}` : '', channel: e.video.channel || '', date: e.date || e.start || String(e.year || '') } : null; };
  return [
    ...cat.stories.map((s) => one(s, 'Story', `/story/${s.slug}`)),
    ...events.map((e) => one(e, 'Event', `/event/${e.id}`)),
    ...cat.works.map((w) => one(w, 'Work', `/work/${w.slug}`)),
  ].filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** /watch: official videos one screen at a time. Each shows its still until tapped, so the page loads no player it does not play. */
export function watchPage(items) {
  const body = `
<section class="watch-head"><p class="eyebrow">Watch</p><h1>The moments, <em>in motion</em></h1><p class="muted">Official videos from the artists, festivals and broadcasters behind the stories. Tap to play.</p></section>
<div class="watch-feed">${items.map((v) => `<article class="watch-item">
  <button type="button" class="watch-play" data-yt="${esc(v.id)}" aria-label="Play: ${esc(v.title)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="watch-icon" aria-hidden="true">▶</span></button>
  <div class="watch-meta"><p class="feature-kicker">${esc(v.kind)}${v.place ? ` · ${esc(v.place)}` : ''}</p><h2><a href="${esc(v.href)}">${esc(v.title)}</a></h2><p class="muted small">Video: ${esc(v.channel)}, YouTube</p></div>
</article>`).join('') || '<p class="muted">No videos yet.</p>'}</div>`;
  return layout({ title: 'Watch', description: T('watch.description'), path: '/watch', body, current: '/watch' });
}
