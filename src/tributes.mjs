/* "Who taught you?" (site.json "tributes", off by default): readers name the teacher who changed their life, in one line. Each one is
 * a 'tribute' submission (migrations/0013_tributes.sql) through the same lane as every form: honeypot, human check, five an hour per
 * address, pending until a person approves it. No email is asked for; the reader's first name or initials show only if they say so.
 * A pack may also list tributes quoted from published sources ("sourced"), each with the page it is quoted from. */
import { PACK } from './site.mjs';
import { countryByCode } from './countries.mjs';
import { rolesOf } from './roles.mjs';

export const TRIBUTE_LIMITS = { teacher: 120, place: 120, line: 280, by: 40, minLine: 10 };
const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINKISH = /https?:\/\/|www\./i;

/** The pack's tributes settings, or null when the feature is off. `roles` are the role ids a tribute can be filed under. */
export function tributesConfig(pack = PACK) {
  const c = pack && pack.tributes;
  if (!c || typeof c !== 'object' || c.on === false) return null;
  const known = rolesOf(pack).map((r) => r.id);
  const roles = (Array.isArray(c.roles) ? c.roles : []).filter((id) => known.includes(id));
  return {
    title: typeof c.title === 'string' ? c.title : 'Who taught you?',
    lead: typeof c.lead === 'string' ? c.lead : 'Name the teacher who changed your life, in one line.',
    roles,
    sourced: (Array.isArray(c.sourced) ? c.sourced : []).filter(validSourced),
  };
}
export const tributesOn = (pack = PACK) => !!tributesConfig(pack);

/** A quoted tribute is listed only with who said it, which teacher, the words and the page they were published on. */
export function validSourced(t) {
  return !!t && typeof t.teacher === 'string' && t.teacher.length > 1 && typeof t.line === 'string' && t.line.length >= TRIBUTE_LIMITS.minLine && t.line.length <= 400
    && typeof t.by === 'string' && t.by.length > 1 && !!t.source && /^https:\/\//.test(t.source.url || '') && typeof t.source.name === 'string' && t.source.name.length > 1 && !EMAILISH.test(JSON.stringify(t));
}

const read = (input) => (k, max) => String(input[k] ?? '').replace(/\r/g, '').replace(/\s+/g, ' ').trim().slice(0, max + 1);

/** Check the tribute form. Returns { ok, errors, value } where value is the submission row (pending, never public until approved). */
export function validateTribute(input, { pack = PACK, now = new Date() } = {}) {
  const t = read(input), errors = {};
  const cfg = tributesConfig(pack) || { roles: [] };
  const teacher = t('teacher', TRIBUTE_LIMITS.teacher), place = t('place', TRIBUTE_LIMITS.place), line = t('line', TRIBUTE_LIMITS.line), by = t('by', TRIBUTE_LIMITS.by);
  const yearRaw = t('year', 6), roleRaw = t('role', 40);
  const countries = Array.isArray(pack.countries) && pack.countries.length ? pack.countries : null;
  const country = countryByCode(t('country', 2));
  if (teacher.length < 2 || teacher.length > TRIBUTE_LIMITS.teacher) errors.teacher = 'Their name, the way you knew them: Mrs Okafor, Mr Lewis, Dr Patel.';
  if (place.length < 2 || place.length > TRIBUTE_LIMITS.place) errors.place = 'The school, college or town where they taught you.';
  if (line.length < TRIBUTE_LIMITS.minLine) errors.line = 'One line on what they did for you.';
  else if (line.length > TRIBUTE_LIMITS.line) errors.line = `One line: ${TRIBUTE_LIMITS.line} characters at most.`;
  if (!country || (countries && !countries.includes(country.code))) errors.country = 'Choose the country where they taught you.';
  let year = null;
  if (yearRaw) { year = Number(yearRaw); if (!Number.isInteger(year) || year < 1900 || year > now.getUTCFullYear()) errors.year = 'A four-digit year, or leave it blank.'; }
  const role = cfg.roles.includes(roleRaw) ? roleRaw : null;
  if (roleRaw && !role) errors.role = 'Pick one from the list, or leave it blank.';
  const showName = String(input.show_name ?? '') === 'yes';
  if (showName && (by.length < 1 || by.length > TRIBUTE_LIMITS.by)) errors.by = 'Your first name or initials, or untick the box to stay anonymous.';
  if (EMAILISH.test(`${teacher} ${place} ${line} ${by}`)) errors.line = 'No email addresses, please.';
  else if (LINKISH.test(`${teacher} ${place} ${line} ${by}`)) errors.line = 'No links, please: just their name and what they did.';
  if (String(input.consent ?? '') !== 'yes') errors.consent = 'Please confirm this is true and kind, and that we may publish it.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { kind: 'tribute', country: country.code, city: null, lat: null, lon: null, title: teacher, creator: place, medium: null, category: role, year, summary: line, url: null, start_date: null, end_date: null, prize: null, remote: false, only_country: false, instagram: null, x_handle: null, tiktok: null, youtube: null, details: { showName }, submitter_name: showName ? by : null, submitter_email: null } };
}

/** An approved tribute row as the pages show it. The reader's name only when they ticked the box. */
export function tributeFromRow(row, d = {}) {
  return { id: `t-${row.id}`, kind: 'tribute', teacher: row.title, place: row.creator || '', year: row.year || null, line: row.summary, role: row.category || null, country: row.country, by: d.showName && row.submitter_name ? row.submitter_name : '', date: String(row.reviewed_at || row.created_at || '').slice(0, 10) };
}

/** Quoted tributes from the pack, shaped like approved ones and marked as quoted. */
export const sourcedTributes = (pack = PACK) => ((tributesConfig(pack) || {}).sourced || []).map((t, i) => ({ id: `q-${i + 1}`, kind: 'tribute', quoted: true, teacher: t.teacher, place: t.place || '', year: t.year || null, line: t.line, role: t.role || null, country: t.country || '', by: t.by, source: t.source }));

/** Every tribute a page may show: approved ones from the catalogue, newest first, then the quoted ones. Pending ones never reach here. */
export const tributesFrom = (cat, pack = PACK) => [...((cat && cat.tributes) || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), ...sourcedTributes(pack)];
