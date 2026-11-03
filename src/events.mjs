/* Upcoming events: carnivals, festivals and heritage days, from data/events.json plus approved event submissions. Each seed event
 * carries a rule rather than a date, so the calendar works out next year's Rio Carnival or Notting Hill Carnival on its own:
 *   fixed   { month, day, days } or { month, day: 1, wholeMonth: true }
 *   easter  { offset, days }                 days from Easter Sunday, so carnival follows the church calendar
 *   weekday { month, weekday, nth, offset, days }   nth 1 = first, -1 = last; weekday 0 = Sunday
 *   dates   { start, end }                   one announced edition, for events whose dates are set each year by organisers
 * "series" names the parent event a side event belongs to (Detty December's concerts carry "series": "detty-december").
 * "years": "odd" or "even" marks a festival held every other year. "approx" marks dates that move: the page shows `when` instead. */
import { PACK } from './site.mjs';
import seed from '../data/events.json' with { type: 'json' };
import { countryByCode } from './countries.mjs';

/** Where an online event with no country of its own is: no country page, no map pin, shown as Online. */
export const ONLINE_PLACE = { code: '', name: 'Online', flag: '🌐', region: '', slug: '' };
export const KINDS = ['carnival', 'music', 'film', 'fashion', 'art', 'culture', 'heritage', 'sport', 'conference', 'community', 'workshop', 'meetup', 'hackathon'];
/** How each kind reads on a chip or a card. */
export const KIND_LABELS = { carnival: 'Carnival', music: 'Music', film: 'Film', fashion: 'Fashion', art: 'Art', culture: 'Culture', heritage: 'Heritage', sport: 'Sport', conference: 'Conference', community: 'Community', workshop: 'Workshop', meetup: 'Meetup', hackathon: 'Hackathon' };
export const kindLabel = (k) => KIND_LABELS[k] || String(k || '');
export const SEED_EVENTS = seed;
const DAY = 86400000;

/** Easter Sunday for a year, Gregorian (the anonymous algorithm), as a UTC date. */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The nth weekday of a month (nth -1 is the last), as a UTC date. */
export function nthWeekday(year, month, weekday, nth) {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    return new Date(Date.UTC(year, month - 1, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (nth - 1) * 7));
  }
  const last = new Date(Date.UTC(year, month, 0));
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7)));
}

/** One year's dates for a rule: { start, end } as UTC dates (end inclusive), or null when the rule skips that year. */
export function occurrence(rule, year) {
  if (rule.years === 'odd' && year % 2 === 0) return null;
  if (rule.years === 'even' && year % 2 === 1) return null;
  let start, days = rule.days || 1;
  if (rule.type === 'fixed') {
    start = new Date(Date.UTC(year, rule.month - 1, rule.day));
    if (rule.wholeMonth) days = new Date(Date.UTC(year, rule.month, 0)).getUTCDate();
  } else if (rule.type === 'easter') start = new Date(easter(year).getTime() + rule.offset * DAY);
  else if (rule.type === 'dates') { if (Number(rule.start.slice(0, 4)) !== year) return null; start = new Date(`${rule.start}T00:00:00Z`); days = Math.round((new Date(`${rule.end || rule.start}T00:00:00Z`) - start) / DAY) + 1; }
  else if (rule.type === 'weekday') start = new Date(nthWeekday(year, rule.month, rule.weekday, rule.nth).getTime() + (rule.offset || 0) * DAY);
  else return null;
  return { start, end: new Date(start.getTime() + (days - 1) * DAY) };
}

const iso = (d) => d.toISOString().slice(0, 10);
const today = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** The next time an event happens that has not finished by `now`: this year's if it is on or ahead, else the next one. */
export function nextOccurrence(rule, now = new Date()) {
  const t = today(now);
  for (let y = t.getUTCFullYear() - 1; y <= t.getUTCFullYear() + 2; y += 1) {
    const o = occurrence(rule, y);
    if (o && o.end >= t) return o;
  }
  return null;
}

/** An approved event submission as an event record. Its dates are its own, once. */
export function fromSubmission(row) {
  return { id: `c-${row.id}`, name: row.title, country: row.country, city: row.city || null, lat: row.lat ?? null, lon: row.lon ?? null, kind: KINDS.includes(row.category) ? row.category : 'community', blurb: row.summary, url: row.url || '', start: row.start_date, end: row.end_date || row.start_date, community: true };
}

const httpOnly = (s) => { try { const u = new URL(String(s || '')); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
/** A stored feed event (feedevents.mjs) as an event record. It links to its own page (http or https only) and names its calendar. */
export function fromFeed(row) {
  const time = /T(\d{2}:\d{2})/.exec(row.start || '');
  const online = row.city === 'Online';
  return { id: `f-${row.id}`, name: row.title, country: row.country, city: online ? null : row.city || null, online, lat: null, lon: null, kind: KINDS.includes(row.kind) ? row.kind : 'community', blurb: row.summary || '', url: httpOnly(row.url), start: String(row.start).slice(0, 10), end: String(row.end || row.start).slice(0, 10), time: time ? `${time[1]}${/Z$/.test(row.start) ? ' UTC' : ''}` : null, feed: true, source: row.source, sourceHome: httpOnly(row.source_home) };
}
/** A name as it is compared for duplicates: no case, accents, punctuation or year. */
const sameName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(19|20)\d{2}\b/g, ' ').replace(/[^a-z0-9]+/g, '');

/** Every event with its next dates resolved, soonest first: { ...event, start, end, status, daysAway, countryRecord }.
 * status is "now" while it runs, otherwise "soon". Events that are over and do not recur are left out. Feed events (feedRows, from
 * feedevents.mjs) join last: one the calendar already has under the same name on that date is left out, as is a second copy. */
export function upcoming(approvedRows = [], now = new Date(), feedRows = []) {
  const t = today(now);
  const out = [];
  for (const e of SEED_EVENTS) {
    const o = nextOccurrence(e.rule, now);
    if (o) out.push({ ...e, start: iso(o.start), end: iso(o.end) });
  }
  for (const row of approvedRows) {
    if (row.kind !== 'event' || !row.start_date) continue;
    const e = fromSubmission(row);
    if (new Date(`${e.end}T00:00:00Z`) >= t) out.push(e);
  }
  const dated = new Map();
  for (const e of out) { const k = sameName(e.name); if (!dated.has(k)) dated.set(k, []); dated.get(k).push(e); }
  for (const row of feedRows) {
    if (!row || !row.title || !row.start) continue;
    const e = fromFeed(row);
    if (new Date(`${e.end}T00:00:00Z`) < t) continue;
    const k = sameName(e.name);
    if ((dated.get(k) || []).some((x) => x.start <= e.start && e.start <= x.end)) continue;
    if (!dated.has(k)) dated.set(k, []);
    dated.get(k).push(e);
    out.push(e);
  }
  const names = new Map(SEED_EVENTS.map((e) => [e.id, e.name]));
  return out.map((e) => {
    const s = new Date(`${e.start}T00:00:00Z`), en = new Date(`${e.end}T00:00:00Z`);
    if (e.series) e = { ...e, seriesName: names.get(e.series) || e.series };
    return { ...e, countryRecord: countryByCode(e.country) || (e.online && !e.country ? ONLINE_PLACE : null), status: s <= t && en >= t ? 'now' : 'soon', daysAway: Math.max(0, Math.round((s - t) / DAY)) };
  }).filter((e) => e.countryRecord).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "29 to 30 Aug 2027", "26 Dec 2026 to 1 Jan 2027", "6 Mar 2027". Approximate events read `when` instead. */
export function dateLabel(e) {
  if (e.approx && e.when) return `${e.when} (${e.start.slice(0, 4)})`;
  const s = new Date(`${e.start}T00:00:00Z`), en = new Date(`${e.end}T00:00:00Z`);
  const d = (x, withMonth = true, withYear = true) => `${x.getUTCDate()}${withMonth ? ` ${MONTHS[x.getUTCMonth()]}` : ''}${withYear ? ` ${x.getUTCFullYear()}` : ''}`;
  if (e.start === e.end) return d(s);
  if (s.getUTCFullYear() !== en.getUTCFullYear()) return `${d(s)} to ${d(en)}`;
  if (s.getUTCMonth() !== en.getUTCMonth()) return `${d(s, true, false)} to ${d(en)}`;
  return `${d(s, false, false)} to ${d(en)}`;
}

/** "Happening now", "Tomorrow", "In 12 days", "In 5 weeks", "In 4 months". Events whose dates move only ever say "This month",
 * "Next month" or "In about 4 months", never a number of days we cannot vouch for. */
export function countdown(e, now = new Date()) {
  if (e.status === 'now') return 'Happening now';
  const n = e.daysAway;
  if (e.approx) {
    const months = (Number(e.start.slice(0, 4)) - now.getUTCFullYear()) * 12 + Number(e.start.slice(5, 7)) - 1 - now.getUTCMonth();
    return months <= 0 ? 'This month' : months === 1 ? 'Next month' : `In about ${months} months`;
  }
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 21) return `In ${n} days`;
  if (n < 70) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30.4)} months`;
}

/** The month heading an event sits under on /events: "December 2026". */
export function monthOf(e) { return `${LONG[Number(e.start.slice(5, 7)) - 1]} ${e.start.slice(0, 4)}`; }

/** The pieces of a date tile: { day, month } for the start, "now" when it is running. */
export function tile(e) { const s = new Date(`${e.start}T00:00:00Z`); return { day: String(s.getUTCDate()), month: MONTHS[s.getUTCMonth()] }; }

const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** An iCalendar file for one event: an all-day entry from its start to the day after its end. */
export function ics(e, origin = `https://${PACK.domain}`) {
  const dt = (s) => s.replace(/-/g, '');
  const after = new Date(new Date(`${e.end}T00:00:00Z`).getTime() + DAY).toISOString().slice(0, 10);
  const where = [e.city, e.countryRecord ? e.countryRecord.name : e.country].filter(Boolean).join(', ');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PACK.name}//Events//EN`, 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.id}-${e.start}@${PACK.id}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${dt(e.start)}`, `DTEND;VALUE=DATE:${dt(after)}`, `SUMMARY:${icsEscape(e.name)}`, `LOCATION:${icsEscape(where)}`,
    `DESCRIPTION:${icsEscape(`${e.blurb}${e.approx ? ' Dates are approximate; check the organisers before you travel.' : ''}`)}`, `URL:${origin}/event/${e.id}`,
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

/** The handful of events a front page shows, all on now or within `horizon` days: the visitor's own country first (at most two), then one per country in date order,
 * a series once rather than each of its parts, and month-long exhibitions only after dated events. */
export function highlights(events, { country = '', n = 5, horizon = 60 } = {}) {
  const long = (e) => (Date.parse(e.end) - Date.parse(e.start)) / 86400000 > 45;
  const shown = new Set(events.map((e) => e.id));
  /* Only what is on or close: a carnival ten months out is not 'coming up'. Further dates fill in only if nothing nearer exists. */
  const near = events.filter((e) => e.status === 'now' || (e.daysAway != null && e.daysAway <= horizon));
  const pool = (near.length >= n ? near : events).filter((e) => !(e.series && shown.has(e.series)) || e.series === 'nigeria-season');
  const ranked = [...pool.filter((e) => !long(e)), ...pool.filter(long)];
  const out = [], perCountry = new Map();
  const take = (e, cap) => { if (out.length >= n || out.includes(e) || (perCountry.get(e.country) || 0) >= cap) return; out.push(e); perCountry.set(e.country, (perCountry.get(e.country) || 0) + 1); };
  if (country) ranked.filter((e) => e.country === country).forEach((e) => take(e, 2));
  ranked.forEach((e) => take(e, 1));
  ranked.forEach((e) => take(e, 2));
  const order = (a, b) => (a.status === 'now' ? 0 : 1) - (b.status === 'now' ? 0 : 1) || a.start.localeCompare(b.start);
  return [...out.filter((e) => e.country === country).sort(order), ...out.filter((e) => e.country !== country).sort(order)];
}
