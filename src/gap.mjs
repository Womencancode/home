/* The representation gap (site.json "gap", off by default): one sourced comparison per country, a share of teachers against a share of
 * pupils, drawn as a data graphic with its text equivalent. A row is shown only when both of its figures name a release, a year and a
 * source page; anything else is dropped rather than guessed. */
import { PACK } from './site.mjs';

const okFig = (f) => !!f && typeof f.value === 'number' && f.value >= 0 && f.value <= 100 && typeof f.label === 'string' && typeof f.release === 'string' && f.release && typeof f.year === 'string' && f.year && /^https:\/\//.test(f.url || '');

/** The pack's gap graphic, cleaned, or null when off or when no row has two sourced figures. */
export function gapConfig(pack = PACK) {
  const c = pack && pack.gap;
  if (!c || typeof c !== 'object' || c.on === false || !Array.isArray(c.rows)) return null;
  const rows = c.rows.filter((r) => r && typeof r.place === 'string' && okFig(r.teachers) && okFig(r.pupils)).map((r) => ({ country: /^[A-Z]{2}$/.test(r.country || '') ? r.country : '', place: r.place, note: typeof r.note === 'string' ? r.note : '', teachers: { ...r.teachers }, pupils: { ...r.pupils } }));
  if (!rows.length) return null;
  return { title: typeof c.title === 'string' ? c.title : 'The representation gap', lead: typeof c.lead === 'string' ? c.lead : '', why: Array.isArray(c.why) ? c.why.filter((p) => p && typeof p.text === 'string' && typeof p.source === 'string' && /^https:\/\//.test(p.url || '')) : [], rows };
}
export const gapOn = (pack = PACK) => !!gapConfig(pack);
