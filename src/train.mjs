/* "What could you get to train?" (site.json "train", off by default): pick a country, then a subject or route, and see the funding the
 * pack lists for it. Every figure carries its source page; a figure without one is dropped, never shown. The numbers are the pack's
 * data, copied from the published tables, not computed. */
import { PACK } from './site.mjs';

const ID = /^[a-z0-9-]{1,40}$/;
const okSource = (s) => !!s && typeof s.name === 'string' && s.name.length > 1 && /^https:\/\//.test(s.url || '');
const okFigure = (f) => !!f && typeof f.label === 'string' && f.label && typeof f.amount === 'string' && f.amount && okSource(f.source);

/** The pack's calculator, cleaned, or null when off: { title, lead, check, countries: [{ code, label, pick, options: [{ id, label, figures, note }] }] }. */
export function trainConfig(pack = PACK) {
  const c = pack && pack.train;
  if (!c || typeof c !== 'object' || c.on === false || !Array.isArray(c.countries)) return null;
  const countries = c.countries.filter((k) => k && /^[A-Z]{2}$/.test(k.code || '') && typeof k.label === 'string' && Array.isArray(k.options)).map((k) => ({
    code: k.code, label: k.label, pick: typeof k.pick === 'string' ? k.pick : 'Subject', intro: typeof k.intro === 'string' ? k.intro : '',
    options: k.options.filter((o) => o && ID.test(o.id || '') && typeof o.label === 'string').map((o) => ({ id: o.id, label: o.label, note: typeof o.note === 'string' ? o.note : '', figures: (Array.isArray(o.figures) ? o.figures : []).filter(okFigure).map((f) => ({ label: f.label, amount: f.amount, note: typeof f.note === 'string' ? f.note : '', source: { name: f.source.name, url: f.source.url } })) })),
  })).filter((k) => k.options.length);
  if (!countries.length) return null;
  return { title: typeof c.title === 'string' ? c.title : 'What could you get to train?', lead: typeof c.lead === 'string' ? c.lead : '', check: typeof c.check === 'string' ? c.check : 'Check before you apply: amounts and rules change, and the source page is the one that counts.', countries };
}
export const trainOn = (pack = PACK) => !!trainConfig(pack);

/** What a request asks for: ?country=GB&subject=physics. An option id alone finds its country; unknown values are ignored. */
export function trainPick(params, cfg = trainConfig()) {
  if (!cfg) return { country: null, option: null };
  const get = (k) => (params && typeof params.get === 'function' ? String(params.get(k) || '') : '');
  const want = get('subject');
  let country = cfg.countries.find((k) => k.code === get('country').toUpperCase()) || null;
  if (!country && want) country = cfg.countries.find((k) => k.options.some((o) => o.id === want)) || null;
  const option = country ? country.options.find((o) => o.id === want) || null : null;
  return { country, option };
}
