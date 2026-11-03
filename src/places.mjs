/* Where on the map a thing happened: a city when we know it, the capital when we do not, the country's centre as the last resort.
 * Cities are data/cities.json ([country, name, lat, lon, capital]); the projection matches the one scripts/world-map.cjs drew with. */
import { PACK } from './site.mjs';
import cities from '../data/cities.json' with { type: 'json' };
import world from '../data/world-map.json' with { type: 'json' };

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
const RAD = Math.PI / 180;

/** Equal Earth, as d3-geo computes it, then the map's own scale and translate. Returns [x, y] in map units. */
export function project(lon, lat, projection = world.projection) {
  const l = Math.asin(M * Math.sin(lat * RAD));
  const l2 = l * l, l6 = l2 * l2 * l2;
  const x = (lon * RAD * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
  const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  return [projection.scale * x + projection.translate[0], projection.translate[1] - projection.scale * y];
}

/** Lower case, no accents, single spaces: "São Paulo" and "sao  paulo" are the same place. */
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* A national site keeps only its own countries' cities. */
const ONLY = Array.isArray(PACK.countries) && PACK.countries.length ? new Set(PACK.countries.map((c) => String(c).toUpperCase())) : null;
export const CITIES = cities.filter(([country]) => !ONLY || ONLY.has(country)).map(([country, name, lat, lon, capital]) => ({ country, name, lat, lon, capital: !!capital }));
const byKey = new Map(CITIES.map((c) => [`${c.country}:${fold(c.name)}`, c]));
const capitals = new Map(CITIES.filter((c) => c.capital).map((c) => [c.country, c]));

/** The known city in a country by name, or null. */
export function cityIn(country, name) { return byKey.get(`${country}:${fold(name)}`) || null; }
/** The capital of a country, when we have it. */
export function capitalOf(country) { return capitals.get(country) || null; }
/** The cities we know in a country, for the submission form's suggestions. */
export function citiesOf(country) { return CITIES.filter((c) => c.country === country); }

/** Turn what a person typed into a place: a known city gets its coordinates; an unknown one keeps its name and gets none. */
export function geocode(country, typed) {
  const name = String(typed || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) return { city: null, lat: null, lon: null };
  const hit = cityIn(country, name);
  return hit ? { city: hit.name, lat: hit.lat, lon: hit.lon } : { city: name, lat: null, lon: null };
}

/** The point to draw for an entry: { x, y, city, precision } where precision is city, capital or country. */
export function locate(entry) {
  const known = entry.city ? cityIn(entry.country, entry.city) : null;
  if (known) return { x: project(known.lon, known.lat)[0], y: project(known.lon, known.lat)[1], lat: known.lat, lon: known.lon, city: known.name, precision: 'city' };
  if (Number.isFinite(entry.lat) && Number.isFinite(entry.lon)) { const [x, y] = project(entry.lon, entry.lat); return { x, y, lat: entry.lat, lon: entry.lon, city: entry.city || null, precision: 'city' }; }
  const cap = capitalOf(entry.country);
  if (cap) { const [x, y] = project(cap.lon, cap.lat); return { x, y, lat: cap.lat, lon: cap.lon, city: cap.name, precision: 'capital' }; }
  const centre = world.centers[entry.country];
  return centre ? { x: centre[0], y: centre[1], lat: null, lon: null, city: null, precision: 'country' } : null;
}

/** Group entries by the place they happened: one pin per city (or country) with how many entries it holds. */
export function places(entries) {
  const out = new Map();
  for (const e of entries) {
    const at = locate(e);
    if (!at) continue;
    const key = `${e.country}:${at.precision === 'country' ? '' : fold(at.city)}`;
    const p = out.get(key) || { country: e.country, city: at.precision === 'city' ? at.city : null, x: at.x, y: at.y, lat: at.lat, lon: at.lon, precision: at.precision, count: 0, entries: [] };
    p.count += 1;
    p.entries.push(e);
    out.set(key, p);
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}
