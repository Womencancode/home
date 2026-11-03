/* Moments: the months and days people mark (Black History Month, IWD, Juneteenth...), each with the year's official theme where one is
 * published and how BlackABC marks it. A running moment gets the home banner and the live badge. Data: data/moments.json. */
import moments from '../data/moments.json' with { type: 'json' };
import { nextOccurrence } from './events.mjs';

export const MOMENTS = moments;
const day = (d) => d.toISOString().slice(0, 10);

/** Moments on today, the visitor's own country first, then worldwide ones, then the rest: [{ ...moment, start, end, theme }]. */
export function liveMoments(now = new Date(), country = '') {
  const t = day(now);
  return MOMENTS.map((m) => { const o = nextOccurrence(m.rule, now); return o && day(o.start) <= t && day(o.end) >= t ? { ...m, start: day(o.start), end: day(o.end), theme: (m.themes || {})[day(o.start).slice(0, 4)] || null } : null; })
    .filter(Boolean)
    .sort((a, b) => rank(a, country) - rank(b, country));
}
const rank = (m, c) => (m.countries.includes(c) ? 0 : !m.countries.length ? 1 : 2);

/** The one moment to feature for this visitor, or null: one in their country or worldwide, never another country's. */
export function featuredMoment(now = new Date(), country = '') {
  const m = liveMoments(now, country)[0];
  return m && (m.countries.includes(country) || !m.countries.length || !country) ? m : null;
}
