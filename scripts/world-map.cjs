// Generates data/world-map.json: one SVG path per country (Natural Earth 110m via world-atlas), Equal Earth projection, a dot for each
// listed country too small for 110m (centroid from 50m), and a centre per country for the live pulses. The output is committed;
// run it again only to change the map: npm run map.
const fs = require('fs');
const path = require('path');
const { feature } = require('topojson-client');
const { geoEqualEarth, geoPath } = require('d3-geo');
const iso = require('i18n-iso-countries');
const countriesFile = path.join(__dirname, '../data/countries.json');
const outFile = path.join(__dirname, '../data/world-map.json');
const W = 1000, H = 487;
const want = new Map(JSON.parse(fs.readFileSync(countriesFile, 'utf8')).map((c) => [c.code, c.name]));
const load = (f) => feature(JSON.parse(fs.readFileSync(require.resolve(`world-atlas/${f}`), 'utf8')), 'countries');
const c110 = load('countries-110m.json'), c50 = load('countries-50m.json');
const noAntarctica = (fc) => ({ ...fc, features: fc.features.filter((f) => f.id !== '010') });
const projection = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], noAntarctica(c110));
const round = (d) => d.replace(/(\d+\.\d)\d+/g, '$1');
const p = geoPath(projection);
const code = (f) => (f.id ? iso.numericToAlpha2(f.id) : null);
const shapes = {}, other = [], dots = {}, centers = {};
/* The centre of a country's largest piece, so France pulses in Europe and not between Paris and Cayenne. */
const mainCentre = (f) => {
  const g = f.geometry;
  if (g.type !== 'MultiPolygon') return p.centroid(f);
  let best = null, area = -1;
  for (const coords of g.coordinates) { const piece = { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } }; const a = p.area(piece); if (a > area) { area = a; best = piece; } }
  return p.centroid(best);
};
const r1 = (v) => Math.round(v * 10) / 10;
for (const f of noAntarctica(c110).features) {
  const c = code(f);
  const d = round(p(f) || '');
  if (!d) continue;
  if (c && want.has(c)) { shapes[c] = (shapes[c] ? shapes[c] : '') + d; const [x, y] = mainCentre(f); centers[c] = [r1(x), r1(y)]; } else other.push(d);
}
for (const f of c50.features) {
  const c = code(f);
  if (!c || !want.has(c) || shapes[c] || dots[c]) continue;
  const [x, y] = p.centroid(f);
  if (Number.isFinite(x) && Number.isFinite(y)) dots[c] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}
// Territories Natural Earth folds into another country at both scales: placed by hand from their capitals (lon, lat).
const PLACED = { BQ: [-68.26, 12.18], GF: [-53.1, 3.9], GI: [-5.35, 36.14], GP: [-61.55, 16.25], MQ: [-61.02, 14.64], YT: [45.17, -12.83], RE: [55.54, -21.12], TK: [-171.85, -9.2], TV: [179.2, -8.52] };
for (const [c, ll] of Object.entries(PLACED)) if (want.has(c) && !shapes[c] && !dots[c]) { const [x, y] = projection(ll); dots[c] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10]; }
const missing = [...want.keys()].filter((c) => !shapes[c] && !dots[c]);
/* A dot on the antimeridian (Tuvalu) can land just past the edge: keep every dot and centre inside the frame. */
const inside = ([x, y]) => [Math.min(W - 6, Math.max(6, x)), Math.min(H - 6, Math.max(6, y))];
for (const c of Object.keys(dots)) dots[c] = inside(dots[c]);
for (const [c, xy] of Object.entries(dots)) centers[c] = xy;
for (const c of Object.keys(centers)) centers[c] = inside(centers[c]);
const out = { width: W, height: H, projection: { name: 'Equal Earth', scale: projection.scale(), translate: projection.translate() }, source: 'Natural Earth via world-atlas 2 (public domain)', shapes, dots, centers, other: other.join('') };
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`shapes ${Object.keys(shapes).length}, dots ${Object.keys(dots).length}, missing ${missing.length}: ${missing.join(' ')}; ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
