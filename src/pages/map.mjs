import { T } from '../site.mjs';
import { esc, layout } from '../html.mjs';
import { countryByCode } from '../countries.mjs';
import { places } from '../places.mjs';
import { counts } from '../content.mjs';
import { dateLabel, countdown } from '../events.mjs';
import { imageFor, sized } from '../media.mjs';
import { eventRow } from './events.mjs';

/* A small rendition for list cards: Commons pictures at 330px through the proxy, a publisher's as it is. */
const thumb = (img) => (img ? { src: sized(img.src, 330), credit: img.credit } : null);

const mapsLinks = (lat, lon, label) => ({ google: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`, label });

/** Everything the street map draws, as JSON: lit countries, a pin per place with its entries, and upcoming events. */
export function mapData(cat, events) {
  const c = counts(cat);
  const pins = places([...cat.stories, ...cat.works, ...cat.talentRows]).filter((p) => p.lat != null).map((p) => {
    const country = countryByCode(p.country);
    const name = p.city ? `${p.city}, ${country.name}` : country.name;
    return { name, country: p.country, flag: country.flag, lat: p.lat, lon: p.lon, count: p.count, href: p.city ? `/country/${country.slug}?city=${encodeURIComponent(p.city)}` : `/country/${country.slug}`,
      img: thumb(p.entries.map(imageFor).find(Boolean)),
      entries: p.entries.slice(0, 8).map((e) => ({ title: e.title || e.creator, kind: e.kind === 'talent' ? 'Talent' : e.summary ? (e.category || 'Story') : (e.medium || 'Work'), year: e.year || null, img: thumb(imageFor(e)), href: e.kind === 'talent' ? `/talent?q=${encodeURIComponent(e.creator)}` : e.summary ? `/story/${e.slug}` : `/work/${e.slug}` })), maps: mapsLinks(p.lat, p.lon, name) };
  });
  const evs = events.map((e) => {
    const at = places([e])[0];
    return at && at.lat != null ? { id: e.id, name: e.name, country: e.country, kind: e.kind, series: e.seriesName || null, img: thumb(imageFor(e)), place: [e.city, e.countryRecord.name].filter(Boolean).join(', '), flag: e.countryRecord.flag, lat: at.lat, lon: at.lon, when: dateLabel(e), countdown: countdown(e), soon: e.status === 'now' || e.daysAway <= 60, now: e.status === 'now', href: `/event/${e.id}`, maps: mapsLinks(at.lat, at.lon, e.name) } : null;
  }).filter(Boolean);
  const countries = Object.fromEntries([...c.entries()].map(([code, v]) => [code, v.stories + v.works]));
  return { countries, pins, events: evs };
}

/** The map explorer: a panel of what is coming up and every place beside a MapLibre map (open source, served from this site, tiles
 * from OpenFreeMap). Choosing a pin or a card opens it in the panel, not a popup; on a phone the panel is a sheet under the map.
 * Without JavaScript the panel still lists the events. */
export function mapPage(params, events = []) {
  const focus = countryByCode(params.get('country'));
  const list = (focus ? events.filter((e) => e.country === focus.code) : events).slice(0, 12);
  const body = `
<section class="explore" data-street-map data-focus="${esc(focus ? focus.code : '')}" data-event="${esc(params.get('event') || '')}">
  <aside class="explore-panel" aria-label="What is on the map">
    <div class="explore-top">
      <p class="eyebrow">The map</p>
      <h1>${focus ? `${esc(focus.name)}, <em>up close</em>` : 'Every place, <em>up close</em>'}</h1>
      <div class="explore-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" data-tab="events">Coming up</button>
        <button type="button" role="tab" aria-selected="false" data-tab="places">Places</button>
      </div>
    </div>
    <div class="explore-body" id="explore-body" aria-live="polite">
      <div class="event-rows">${list.map(eventRow).join('')}</div>
    </div>
  </aside>
  <div class="explore-map" id="street-map" role="region" aria-label="Interactive map"><noscript><p class="notice">The interactive map needs JavaScript. <a href="/countries">Browse every country</a> instead.</p></noscript></div>
</section>
<p class="small muted map-attrib">Map data <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, tiles <a href="https://openfreemap.org" rel="noopener">OpenFreeMap</a>, country shapes Natural Earth, map library MapLibre.</p>
<link rel="stylesheet" href="/vendor/maplibre-gl.css">
<script src="/vendor/maplibre-gl-csp.js" defer></script>
<script src="/vendor/topojson-client.min.js" defer></script>
<script src="/map.js" defer></script>`;
  return layout({ title: focus ? `Map of ${focus.name}` : 'The map', description: T('map.description'), path: '/map', body, current: '/map' });
}
