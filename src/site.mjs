/* The site pack: everything that makes this site this site (name, audience, copy, About and guidelines) lives in site/site.json;
 * the engine reads it here and nowhere else. A missing key throws, so a pack cannot silently fall back to another site's words. */
import pack from '../site/site.json' with { type: 'json' };

export const PACK = pack;

/** A copy string from the pack with {name} placeholders filled from `vars`; raw HTML, so callers escape any visitor input first. */
export function T(key, vars = {}) {
  const s = pack.copy[key];
  if (typeof s !== 'string') throw Error(`site pack ${pack.id} has no copy for "${key}"`);
  return fill(s, vars);
}

/** Fill {name} placeholders; unknown ones are left as written. */
export function fill(s, vars = {}) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
