/* Every country and territory, with the helpers the pages need. The list itself is data (data/countries.json): names, ISO 3166-1
 * alpha-2 codes and UN regions. Nothing here knows about stories or works; see content.mjs for that. */
import countries from '../data/countries.json' with { type: 'json' };
import { PACK } from './site.mjs';

/** A URL slug for a country name: "Côte d'Ivoire" becomes "cote-divoire", "São Tomé and Príncipe" becomes "sao-tome-and-principe". */
export function slugify(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The flag emoji for an alpha-2 code: two regional indicator symbols. */
export function flag(code) {
  return String(code).toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

/* A national site (womenintech.uk) names its countries in site.json; the rest cover them all. */
const ONLY = Array.isArray(PACK.countries) && PACK.countries.length ? new Set(PACK.countries.map((c) => String(c).toUpperCase())) : null;
export const COUNTRIES = countries.filter((c) => !ONLY || ONLY.has(c.code)).map((c) => ({ ...c, slug: slugify(c.name), flag: flag(c.code) })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));

export const REGIONS = ['Africa', 'Americas', 'Europe', 'Asia', 'Oceania'];

export function countryByCode(code) { return BY_CODE.get(String(code || '').toUpperCase()) || null; }
export function countryBySlug(slug) { return BY_SLUG.get(String(slug || '').toLowerCase()) || null; }
export function countriesInRegion(region) { return COUNTRIES.filter((c) => c.region === region); }

/** Countries grouped by region then subregion, in the order the pages list them. */
export function grouped() {
  return REGIONS.map((region) => {
    const subregions = new Map();
    for (const c of countriesInRegion(region)) {
      if (!subregions.has(c.subregion)) subregions.set(c.subregion, []);
      subregions.get(c.subregion).push(c);
    }
    return { region, subregions: [...subregions.entries()].map(([name, list]) => ({ name, countries: list })) };
  });
}
