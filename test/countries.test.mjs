import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, REGIONS, slugify, flag, countryBySlug, countryByCode, grouped } from '../src/countries.mjs';

test('every country has a unique code, a unique slug and a region the pages know', () => {
  assert.ok(COUNTRIES.length >= 195, 'at least every UN member and observer');
  assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
  assert.equal(new Set(COUNTRIES.map((c) => c.slug)).size, COUNTRIES.length);
  for (const c of COUNTRIES) assert.ok(REGIONS.includes(c.region), `${c.name} in ${c.region}`);
});

test('slugs drop accents and apostrophes', () => {
  assert.equal(slugify("Côte d'Ivoire"), 'cote-divoire');
  assert.equal(slugify('São Tomé and Príncipe'), 'sao-tome-and-principe');
  assert.equal(slugify('Türkiye'), 'turkiye');
  assert.equal(countryBySlug('cote-divoire').code, 'CI');
});

test('flags are the two regional indicators for the code', () => {
  assert.equal(flag('NG'), '🇳🇬');
  assert.equal(countryByCode('gh').flag, '🇬🇭');
  assert.equal(countryByCode('ZZ'), null);
});

test('grouping covers every country exactly once', () => {
  const seen = grouped().flatMap((g) => g.subregions.flatMap((s) => s.countries.map((c) => c.code)));
  assert.equal(seen.length, COUNTRIES.length);
  assert.equal(new Set(seen).size, COUNTRIES.length);
});
