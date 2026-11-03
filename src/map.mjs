/* The world map: land drawn as a field of dots, each country's dots lit by how much good news it has, and a pin on every city where
 * something happened. Inline SVG, so it works without JavaScript; public/app.js adds the spotlight, the tooltip and a pulse at the
 * city whenever someone there shares something (/api/activity). Geometry: data/world-map.json, made by scripts/world-map.cjs. */
import world from '../data/world-map.json' with { type: 'json' };
import { COUNTRIES, countryByCode } from './countries.mjs';
import { esc } from './html.mjs';
import { locate } from './places.mjs';
import { countdown, dateLabel } from './events.mjs';

export const MAP = world;
const HEAT_DOTS = ['#3a3540', '#6b5532', '#8f6f39', '#b78d45', '#e2b762'];

/** The heat level for a number of entries: 0 none, then 1, 2-3, 4-7, 8 and over. */
export function heat(n) {
  if (!n) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 7) return 3;
  return 4;
}

/** The bounding box of a country's outline in map units, or null. Overseas parts far from the centre are left out. */
export function bounds(code) {
  const d = MAP.shapes[code];
  const [cx, cy] = MAP.centers[code] || [];
  if (!d || cx == null) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
    const x = Number(m[1]), y = Number(m[2]);
    if (Math.abs(x - cx) > 90 || Math.abs(y - cy) > 70) continue;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/** The window onto the map for one country: its outline with room around it, never narrower than 60 units, at the map's aspect. */
export function viewFor(code) {
  const [cx, cy] = MAP.centers[code] || [MAP.width / 2, MAP.height / 2];
  const b = bounds(code) || { x0: cx - 4, y0: cy - 4, x1: cx + 4, y1: cy + 4 };
  const aspect = MAP.width / MAP.height;
  let w = Math.max(60, (b.x1 - b.x0) * 1.9), h = Math.max(w / aspect, (b.y1 - b.y0) * 1.7);
  w = Math.max(w, h * aspect); h = w / aspect;
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  const x = Math.min(Math.max(mx - w / 2, 0), MAP.width - w), y = Math.min(Math.max(my - h / 2, -10), MAP.height - h + 10);
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

const round = (n) => Math.round(n * 100) / 100;

/** The map as an SVG string. `counts` maps a country code to { stories, works }; `pins` comes from places(); `focus` zooms to one
 * country and labels its cities. */
export function worldMap(counts, { pins = [], events = [], highlight = '', focus = '', label = 'A map of the world in dots, each country lit by its good news, with a pin on every city where something happened' } = {}) {
  const view = focus ? viewFor(focus) : { x: 0, y: 0, w: MAP.width, h: MAP.height };
  const k = view.w / MAP.width;
  const pitch = round(Math.max(0.5, 3.4 * k));
  const dot = round(pitch * 0.3);
  const total = (code) => { const c = counts.get(code); return c ? c.stories + c.works : 0; };
  const here = highlight || focus;
  const attrs = (c) => {
    const n = total(c.code);
    const [cx, cy] = MAP.centers[c.code] || [0, 0];
    return `data-code="${c.code}" data-name="${esc(c.name)}" data-slug="${esc(c.slug)}" data-count="${n}" data-cx="${cx}" data-cy="${cy}" class="land h${heat(n)}${c.code === here ? ' here' : ''}"`;
  };
  const shapes = [], dots = [];
  for (const c of COUNTRIES) {
    const n = total(c.code);
    const title = `<title>${esc(c.name)}: ${n ? `${n} ${n === 1 ? 'entry' : 'entries'}` : 'nothing yet, be the first'}</title>`;
    if (MAP.shapes[c.code]) shapes.push(`<a href="/country/${esc(c.slug)}" aria-label="${esc(c.name)}"><path d="${MAP.shapes[c.code]}" ${attrs(c)}>${title}</path></a>`);
    else if (MAP.dots[c.code]) { const [x, y] = MAP.dots[c.code]; dots.push(`<a href="/country/${esc(c.slug)}" aria-label="${esc(c.name)}"><circle cx="${x}" cy="${y}" r="${round((n ? 2.6 : 1.9) * Math.max(k, 0.3))}" ${attrs(c)}>${title}</circle></a>`); }
  }
  const shown = focus ? pins.filter((p) => p.country === focus) : pins;
  const pinMarks = shown.map((p) => {
    const c = countryByCode(p.country);
    if (!c) return '';
    const name = p.city ? `${p.city}, ${c.name}` : c.name;
    const r = round((1.5 + Math.sqrt(p.count) * 1.05) * (focus ? k * 1.7 : 1));
    const href = p.city ? `/country/${c.slug}?city=${encodeURIComponent(p.city)}` : `/country/${c.slug}`;
    const tag = focus && p.city ? `<text x="${round(p.x + r + 1.2 * k * 1.7)}" y="${round(p.y + 1.3 * k * 1.7)}" class="pin-label" font-size="${round(4.6 * k * 1.7)}" stroke-width="${round(0.9 * k * 1.7)}">${esc(p.city)}</text>` : '';
    return `<a href="${esc(href)}" aria-label="${esc(`${name}: ${p.count}`)}"><circle class="pin p${heat(p.count)}" cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" data-code="${c.code}" data-name="${esc(name)}" data-slug="${esc(c.slug)}" data-city="${esc(p.city || '')}" data-count="${p.count}"><title>${esc(name)}: ${p.count} ${p.count === 1 ? 'entry' : 'entries'}</title></circle>${tag}</a>`;
  }).join('');
  /* Events coming up: a diamond at the city, bright when it is on or within two months. */
  const evMarks = (focus ? events.filter((e) => e.country === focus) : events).map((e) => {
    const at = locate(e);
    if (!at) return '';
    const r = round((e.status === 'now' || e.daysAway <= 60 ? 4.4 : 3.2) * (focus ? k * 1.7 : 1));
    const x = round(at.x), y = round(at.y);
    const label = `${e.name}, ${e.city ? `${e.city}, ` : ''}${e.countryRecord.name}`;
    return `<a href="/event/${esc(e.id)}" aria-label="${esc(`${label}: ${dateLabel(e)}`)}"><path class="ev${e.status === 'now' ? ' now' : e.daysAway <= 60 ? ' soon' : ''}" d="M${x} ${round(y - r)}L${round(x + r)} ${y}L${x} ${round(y + r)}L${round(x - r)} ${y}Z" data-code="${e.country}" data-name="${esc(label)}" data-when="${esc(`${countdown(e)} · ${dateLabel(e)}`)}" data-cx="${x}" data-cy="${y}"><title>${esc(`${label}: ${dateLabel(e)}`)}</title></path></a>`;
  }).join('');
  const patterns = HEAT_DOTS.map((fill, i) => `<pattern id="dots-h${i}" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse"><circle cx="${round(pitch / 2)}" cy="${round(pitch / 2)}" r="${dot}" fill="${fill}"/></pattern>`).join('')
    + `<pattern id="dots-other" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse"><circle cx="${round(pitch / 2)}" cy="${round(pitch / 2)}" r="${round(dot * 0.85)}" fill="#2a2630"/></pattern>`
    + `<pattern id="dots-hot" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse"><circle cx="${round(pitch / 2)}" cy="${round(pitch / 2)}" r="${round(dot * 1.2)}" fill="#fff1cc"/></pattern>`;
  return `<svg class="world-map${focus ? ' zoomed' : ''}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" data-k="${round(k)}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">
<defs>${patterns}<radialGradient id="pulse-glow"><stop offset="0" stop-color="#f6d58f" stop-opacity=".9"/><stop offset="1" stop-color="#f6d58f" stop-opacity="0"/></radialGradient></defs>
<path class="other-land" d="${MAP.other}"/>
<g class="countries">${shapes.join('')}</g>
<g class="islands">${dots.join('')}</g>
<g class="pins">${pinMarks}</g>
<g class="events">${evMarks}</g>
<g class="pulses" aria-hidden="true"></g>
</svg>`;
}

/** The map with its legend, live ticker and spotlight caption: the section the home, countries and country pages place. */
export function mapSection(counts, { heading = true, pins = [], events = [], focus = '' } = {}) {
  const lit = [...counts.values()].filter((c) => c.stories + c.works > 0).length;
  const cities = pins.filter((p) => p.city && (!focus || p.country === focus)).length;
  const focusName = focus ? (countryByCode(focus) || {}).name : '';
  return `<section class="map-section" data-live-map>
  ${heading ? `<div class="section-head"><div><h2>Live from <em>everywhere</em></h2><p class="lead">${lit} of ${COUNTRIES.length} countries and ${cities} cities lit so far. A pin glows where someone shares something.</p></div><a class="more" href="/countries">Every country</a></div>` : ''}
  <div class="map-frame">
    ${worldMap(counts, { pins, events, focus })}
    <div class="map-tip" role="status" aria-live="polite" hidden></div>
    <a class="map-open button small" href="/map${focus ? `?country=${esc(focus)}` : ''}">Zoom in on the street map</a>
    <p class="map-caption" aria-live="polite">${focus ? esc(cities ? `${cities} ${cities === 1 ? 'city' : 'cities'} in ${focusName}` : `${focusName}: add the first city`) : ''}</p>
  </div>
  <div class="map-foot">
    <ol class="map-legend" aria-label="How many entries a place has">
      <li><span class="sw h0"></span>None yet</li><li><span class="sw h1"></span>1</li><li><span class="sw h2"></span>2 to 3</li><li><span class="sw h3"></span>4 to 7</li><li><span class="sw h4"></span>8 and over</li><li><span class="sw pin"></span>A city</li><li><span class="sw ev"></span>An event coming up</li><li><span class="sw live"></span>Just now</li>
    </ol>
    <div class="live-feed"><p class="eyebrow">Just now</p><ul class="live-list"><li class="muted">Waiting for the next good thing. <a href="/submit">Share one</a>.</li></ul></div>
  </div>
</section>`;
}
