/* Events from public calendars, so the events page fills itself. Each source in data/event-sources.json names a feed: an iCalendar
 * (.ics) file, or an RSS or Atom feed of events. The cron that reads the news also reads the PER_RUN event sources fetched longest ago,
 * keeps what starts between today and HORIZON_DAYS ahead and passes data/event-filter.json, and stores one row per source and event uid
 * (migrations/0010_feed_events.sql). The events page and the home blocks show them beside the seed calendar (events.mjs upcoming),
 * each linking to the event's own page and crediting the calendar it came from. Only the title, dates, place, a short description and
 * the link are kept. */
import { PACK } from './site.mjs';
import sources from '../data/event-sources.json' with { type: 'json' };
import filterData from '../data/event-filter.json' with { type: 'json' };
import { wordPattern, clean, parseFeed } from './news.mjs';
import { KINDS, nthWeekday } from './events.mjs';
import { CITIES, fold } from './places.mjs';

export const EVENT_SOURCES = sources;
export const PER_RUN = 6;
export const STALE_MS = 3 * 60 * 60 * 1000;
export const HORIZON_DAYS = 180;
/* A repeating event shows only its next date, and only when that is within REPEAT_DAYS. */
export const REPEAT_DAYS = 120;
/* A busy calendar keeps its MAX_PER_SOURCE best events: the ones naming the most "positive" words, then the soonest. */
export const MAX_PER_SOURCE = 60;
const TIMEOUT_MS = 5000;
const DAY = 86400000;
const UA = `${PACK.name} events reader (+https://${PACK.domain}/about)`;

/* ---------- The filter ---------- */

/** data/event-filter.json as patterns. An empty list is no test at all (a pattern of no words would match everything). */
export function compileFilter(f = {}) {
  const words = (l) => (Array.isArray(l) ? l.filter((w) => typeof w === 'string' && w.trim()) : []);
  const pat = (l) => (words(l).length ? wordPattern(words(l)) : null);
  return { require: (Array.isArray(f.require) ? f.require : []).map(pat).filter(Boolean), positive: pat(f.positive), negative: pat(f.negative), offTopic: pat(f.offTopic) };
}
export const FILTER = compileFilter(filterData);

/** Whether an event belongs on this site: a word from every "require" list in its title or description, no "negative" word in either,
 * and no "offTopic" word in the title. */
export function wanted(title, summary = '', filter = FILTER) {
  const text = `${title} ${summary}`;
  return filter.require.every((re) => re.test(text)) && !(filter.negative && filter.negative.test(text)) && !(filter.offTopic && filter.offTopic.test(title));
}

/** How many different "positive" words an event names. It ranks a busy feed; it never drops an event. */
export function boost(title, summary = '', filter = FILTER) {
  if (!filter.positive) return 0;
  return new Set((`${title} ${summary}`.match(new RegExp(filter.positive.source, 'gi')) || []).map((w) => w.toLowerCase().replace(/\s+/g, ' '))).size;
}

/* ---------- Dates and time zones ---------- */

const pad = (n, w = 2) => String(n).padStart(w, '0');
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayKey = (now) => dayKey(now.getTime());
/* Calendars written by Outlook name Windows zones; the common ones map to their IANA names. */
const WINDOWS = { 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest', 'E. Europe Standard Time': 'Europe/Bucharest', 'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles', 'South Africa Standard Time': 'Africa/Johannesburg', 'W. Central Africa Standard Time': 'Africa/Lagos', 'E. Africa Standard Time': 'Africa/Nairobi', 'India Standard Time': 'Asia/Kolkata', 'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC' };
const ZONES = new Map();
/** An IANA zone name the runtime knows, from a TZID (Windows names and "/mozilla.org/.../Europe/London" prefixes included), or null. */
export function zone(tzid) {
  if (!tzid) return null;
  const raw = String(tzid).trim();
  const name = WINDOWS[raw] || (/([A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(raw) || [, raw])[1];
  if (!ZONES.has(name)) { let ok = null; try { new Intl.DateTimeFormat('en-US', { timeZone: name }); ok = name; } catch { ok = null; } ZONES.set(name, ok); }
  return ZONES.get(name);
}
const FORMATS = new Map();
/** The wall clock in a zone at an instant: { y, mo, d, h, mi, s }. No zone is UTC. */
function wallAt(ms, tz) {
  if (!tz) { const t = new Date(ms); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() }; }
  let f = FORMATS.get(tz);
  if (!f) FORMATS.set(tz, (f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })));
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}
const wallMs = (w) => Date.UTC(w.y, w.mo - 1, w.d, w.h || 0, w.mi || 0, w.s || 0);
/** The instant a wall-clock time in a zone names, daylight saving included. */
function instantOf(w, tz) {
  const guess = wallMs(w);
  if (!tz) return guess;
  const first = guess - (wallMs(wallAt(guess, tz)) - guess);
  return guess - (wallMs(wallAt(first, tz)) - first);
}
/** An instant as an ISO date-time carrying the zone's own offset ("2026-11-05T18:30:00+00:00"), or Z when there is no zone. */
function stamp(ms, tz) {
  const w = wallAt(ms, tz);
  const base = `${pad(w.y, 4)}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}`;
  if (!tz) return `${base}Z`;
  const off = Math.round((wallMs(w) - ms) / 60000), a = Math.abs(off);
  return `${base}${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/* ---------- iCalendar ---------- */

/** Long lines are folded onto the next line after a space or tab; this joins them back. */
export function unfold(text) { return String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, ''); }

/** One content line as { name, params, value }; a colon inside a quoted parameter is not the separator. */
function contentLine(line) {
  let quoted = false, i = 0;
  for (; i < line.length; i += 1) { if (line[i] === '"') quoted = !quoted; else if (line[i] === ':' && !quoted) break; }
  if (i >= line.length) return null;
  const [name, ...ps] = line.slice(0, i).split(';');
  const params = {};
  for (const p of ps) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); }
  return { name: name.replace(/^.*\./, '').toUpperCase(), params, value: line.slice(i + 1) };
}
const text = (s) => clean(String(s || '').replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c)));

/** A DTSTART or DTEND: { allDay, w (wall clock), tz, ms }. A time in UTC (Z) is shown in the source's zone when it names one;
 * a floating time, or one in a zone the runtime does not know, is read in the source's zone, else as UTC. */
function point(prop, fallbackTz) {
  if (!prop) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(String(prop.value).trim());
  if (!m) return null;
  const w = { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), h: Number(m[4] || 0), mi: Number(m[5] || 0), s: Number(m[6] || 0) };
  if (m[4] === undefined || String(prop.params.VALUE || '').toUpperCase() === 'DATE') return { allDay: true, w: { y: w.y, mo: w.mo, d: w.d, h: 0, mi: 0, s: 0 }, tz: null, ms: wallMs(w) };
  if (m[7]) { const ms = wallMs(w); return { allDay: false, w: wallAt(ms, fallbackTz), tz: fallbackTz, ms }; }
  const tz = zone(prop.params.TZID) || fallbackTz;
  return { allDay: false, w, tz, ms: instantOf(w, tz) };
}

/** An iCalendar DURATION ("PT2H", "P1D", "P1W") in milliseconds, or null. */
function duration(s) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(s || '').trim());
  if (!m || !m.slice(2).some(Boolean)) return null;
  return (m[1] === '-' ? -1 : 1) * ((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * DAY + (Number(m[4] || 0) * 3600 + Number(m[5] || 0) * 60 + Number(m[6] || 0)) * 1000);
}

const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
/** The next date (a UTC midnight, in the event's own wall clock) a weekly or monthly RRULE gives on or after `from` and no later than `to`,
 * or null: other frequencies, a rule that has ended, or no date in the window. COUNT, UNTIL, INTERVAL, BYDAY (with "2TU" and "-1FR"
 * positions), BYSETPOS and BYMONTHDAY are understood; EXDATE dates are skipped. */
export function nextRepeat(start, rule, { from, to, exdates = [] }) {
  const r = Object.fromEntries(String(rule || '').split(';').map((kv) => kv.split('=')).filter(([k, v]) => k && v).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
  if (r.FREQ !== 'WEEKLY' && r.FREQ !== 'MONTHLY') return null;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : null;
  const skip = new Set(exdates);
  const base = Date.UTC(start.y, start.mo - 1, start.d);
  const byday = (r.BYDAY || '').split(',').map((d) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d)).filter(Boolean).map((m) => ({ nth: m[1] ? Number(m[1]) : null, wd: WEEKDAYS[m[2]] }));
  let seen = 0;
  /* Every candidate counts toward COUNT, in order, whether or not it is in the window or excluded, as RFC 5545 says. */
  const consider = (ms) => {
    if (ms < base) return undefined;
    const key = dayKey(ms);
    if (seen >= count || (until && key > until) || key > to) return null;
    seen += 1;
    return key >= from && !skip.has(key) ? ms : undefined;
  };
  if (r.FREQ === 'WEEKLY') {
    const days = (byday.length ? byday.map((b) => b.wd) : [new Date(base).getUTCDay()]).map((wd) => (wd + 6) % 7).sort((a, b) => a - b);
    const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * DAY;
    for (let k = 0; k < 5000; k += 1) {
      for (const off of days) { const got = consider(monday + (k * interval * 7 + off) * DAY); if (got !== undefined) return got; }
    }
    return null;
  }
  const monthDays = (r.BYMONTHDAY || '').split(',').map(Number).filter((n) => n && Math.abs(n) <= 31);
  const setpos = r.BYSETPOS ? Number(r.BYSETPOS) : null;
  for (let k = 0; k < 1200; k += 1) {
    const total = start.mo - 1 + k * interval, y = start.y + Math.floor(total / 12), mo = (total % 12) + 1;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    let dates = [];
    if (byday.length) {
      for (const b of byday) {
        const nth = b.nth ?? setpos;
        if (nth) { const d = nthWeekday(y, mo, b.wd, nth); if (d.getUTCMonth() === mo - 1) dates.push(d.getTime()); }
        else for (let n = 1; n <= 5; n += 1) { const d = nthWeekday(y, mo, b.wd, n); if (d.getUTCMonth() === mo - 1) dates.push(d.getTime()); }
      }
    } else {
      for (const n of monthDays.length ? monthDays : [start.d]) { const d = n > 0 ? n : last + 1 + n; if (d >= 1 && d <= last) dates.push(Date.UTC(y, mo - 1, d)); }
    }
    dates = [...new Set(dates)].sort((a, b) => a - b);
    for (const ms of dates) { const got = consider(ms); if (got !== undefined) return got; }
    if (Date.UTC(y, mo - 1, 1) > Date.parse(`${to}T00:00:00Z`)) return null;
  }
  return null;
}

/** Turn a VEVENT's properties into an event, or null when it is cancelled, undated, or a repeat with no date in the window. */
function resolve(ev, { from, repeatTo, tz }) {
  const p = ev.props;
  if (String((p.STATUS || {}).value || '').toUpperCase() === 'CANCELLED') return null;
  const title = text(p.SUMMARY && p.SUMMARY.value).slice(0, 200);
  let start = point(p.DTSTART, tz);
  if (!title || !start) return null;
  let end = point(p.DTEND, tz);
  const dur = p.DURATION ? duration(p.DURATION.value) : null;
  let length = end ? end.ms - start.ms : dur != null ? dur : start.allDay ? DAY : 0;
  if (length < 0) length = 0;
  if (p.RRULE && !p['RECURRENCE-ID']) {
    const next = nextRepeat(start.w, p.RRULE.value, { from, to: repeatTo, exdates: ev.exdates });
    if (next == null) return null;
    const d = new Date(next);
    const w = { ...start.w, y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() };
    start = { ...start, w, ms: start.allDay ? wallMs(w) : instantOf(w, start.tz) };
  }
  const startIso = start.allDay ? dayKey(start.ms) : stamp(start.ms, start.tz);
  /* An all-day DTEND is the day after the last day. */
  const endIso = start.allDay ? dayKey(Math.max(start.ms, start.ms + length - DAY)) : stamp(start.ms + length, start.tz);
  const description = text(p.DESCRIPTION && p.DESCRIPTION.value);
  const uid = String((p.UID && p.UID.value) || `${title}|${startIso}`).trim();
  return {
    uid: p['RECURRENCE-ID'] ? `${uid}/${String(p['RECURRENCE-ID'].value).trim()}` : uid,
    title,
    start: startIso,
    end: endIso,
    location: text(p.LOCATION && p.LOCATION.value).slice(0, 200),
    url: httpUrl(p.URL && p.URL.value) || httpUrl((/https?:\/\/[^\s<>"')\]]+/.exec(description) || [])[0]),
    summary: description.slice(0, 280),
  };
}

/** The events in an iCalendar file whose (next) date is on or after today: { uid, title, start, end, location, url, summary }.
 * Alarms and other components nested in an event are skipped. `tz` is the zone a source's floating and UTC times are shown in. */
export function parseIcs(ics, { now = new Date(), tz = null } = {}) {
  const from = todayKey(now), repeatTo = dayKey(now.getTime() + REPEAT_DAYS * DAY);
  const out = [];
  let ev = null, depth = 0;
  for (const raw of unfold(ics).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^BEGIN:VEVENT$/i.test(line)) { ev = { props: {}, exdates: [] }; depth = 0; continue; }
    if (!ev) continue;
    if (/^END:VEVENT$/i.test(line)) { const e = resolve(ev, { from, repeatTo, tz: zone(tz) }); if (e && e.start.slice(0, 10) >= from) out.push(e); ev = null; continue; }
    if (/^BEGIN:/i.test(line)) { depth += 1; continue; }
    if (/^END:/i.test(line)) { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const p = contentLine(line);
    if (!p) continue;
    if (p.name === 'EXDATE') ev.exdates.push(...p.value.split(',').map((v) => /^(\d{4})(\d{2})(\d{2})/.exec(v.trim())).filter(Boolean).map((m) => `${m[1]}-${m[2]}-${m[3]}`));
    else if (!(p.name in ev.props)) ev.props[p.name] = p;
  }
  return out;
}

/* ---------- RSS and Atom ---------- */

const httpUrl = (s, base) => { try { const u = new URL(String(s || '').trim(), base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
const tagIn = (block, names) => {
  for (const n of names) { const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(block); if (m && clean(m[1])) return clean(m[1]); }
  return '';
};
const START_TAGS = ['ev:startdate', 'xcal:dtstart', 'event:startdate', 'ev:start', 'startdate', 'dtstart', 'event:start', 'start_date'];
const END_TAGS = ['ev:enddate', 'xcal:dtend', 'event:enddate', 'ev:end', 'enddate', 'dtend', 'event:end', 'end_date'];
/** A date written in an event feed as an ISO date or date-time, an iCalendar value, or an RFC 822 date. */
function feedDate(s, tz) {
  const v = String(s || '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const iso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i.exec(v);
  if (iso) return iso[4].toUpperCase() === 'Z' && tz ? stamp(Date.parse(v), tz) : `${iso[1]}T${iso[2]}${iso[3] || ':00'}${iso[4].toUpperCase() === 'Z' ? 'Z' : iso[4].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`;
  const p = point({ value: v, params: {} }, tz);
  if (p) return p.allDay ? dayKey(p.ms) : stamp(p.ms, p.tz);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : stamp(t, tz);
}

/** Events from an RSS or Atom feed. The start is an event tag (ev:startdate, xCal dtstart and the like) when the feed has one;
 * otherwise the item's date, which event calendars set to the day of the event. Either way only dates on or after today are kept. */
export function parseEventFeed(xml, base, { now = new Date(), tz = null } = {}) {
  const doc = String(xml || '');
  const atom = /<feed[\s>]/i.test(doc) && !/<rss[\s>]/i.test(doc);
  const blocks = doc.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  const from = todayKey(now), z = zone(tz);
  const out = [];
  for (const b of blocks) {
    const [item] = parseFeed(atom ? `<feed>${b}</feed>` : `<rss>${b}</rss>`, base);
    if (!item) continue;
    const start = feedDate(tagIn(b, START_TAGS), z) || (item.published_at ? stamp(Date.parse(item.published_at), z) : null);
    if (!start || start.slice(0, 10) < from) continue;
    const end = feedDate(tagIn(b, END_TAGS), z);
    out.push({ uid: tagIn(b, ['guid', 'id']) || item.url, title: clean(item.title).slice(0, 200), start, end: end && end >= start ? end : start, location: tagIn(b, ['ev:location', 'xcal:location', 'event:location', 'location']).slice(0, 200), url: item.url, summary: clean(item.summary).slice(0, 280) });
  }
  return out;
}

/* ---------- From a source to rows ---------- */

const ONLINE = /\b(online|virtual|zoom|webinar|livestream|live stream|microsoft teams|google meet)\b/i;
/** The kind for an event: the title's own word when it is a hackathon, workshop or meetup, else the source's kind, else community. */
export function kindFor(title, source = {}) {
  if (/\bhack(athon|day|fest)\b/i.test(title)) return 'hackathon';
  if (/\b(workshop|bootcamp|boot camp|masterclass|master class)s?\b/i.test(title)) return 'workshop';
  if (/\b(meetup|meet-up|meet up)s?\b/i.test(title)) return 'meetup';
  return KINDS.includes(source.kind) ? source.kind : 'community';
}
/** Where an event is, as { city, country }: the source's own city, else a known city named in the location (of the source's
 * country, or of any country for a worldwide calendar with no country of its own), else "Online" for an online one. A worldwide
 * calendar's in-person event that names no known city has no place we can vouch for: null, and it is left out. */
function placeFor(e, source) {
  const country = String(source.country || '').toUpperCase();
  if (source.city) return { city: source.city, country };
  const where = ` ${fold(e.location)} `;
  const hit = e.location ? CITIES.filter((c) => (!country || c.country === country) && where.includes(` ${fold(c.name)} `)).sort((a, b) => b.name.length - a.name.length)[0] : null;
  if (hit) return { city: hit.name, country: hit.country };
  if (ONLINE.test(`${e.location} ${e.title}`)) return { city: 'Online', country };
  return country ? { city: null, country } : null;
}

/** The rows one source gives: in the window (today to HORIZON_DAYS ahead), wanted by the filter, the best MAX_PER_SOURCE of them. */
export function rowsFrom(events, source, { now = new Date(), filter = FILTER } = {}) {
  const from = todayKey(now), to = dayKey(now.getTime() + HORIZON_DAYS * DAY);
  const seen = new Set();
  return events
    .filter((e) => e.start.slice(0, 10) >= from && e.start.slice(0, 10) <= to && wanted(e.title, e.summary, filter))
    .filter((e) => !seen.has(e.uid) && seen.add(e.uid))
    .map((e) => ({ e, score: boost(e.title, e.summary, filter) }))
    .sort((a, b) => b.score - a.score || a.e.start.localeCompare(b.e.start))
    .slice(0, MAX_PER_SOURCE)
    .map(({ e }) => ({ e, at: placeFor(e, source) })).filter(({ at }) => at)
    .map(({ e, at }) => ({ source: source.name, uid: String(e.uid).slice(0, 300), title: e.title, start: e.start, end: e.end || e.start, city: at.city, country: at.country, url: httpUrl(e.url), summary: e.summary || (e.location ? `At ${e.location}.` : ''), kind: kindFor(e.title, source) }));
}

/** Read one source's feed (5 s at most): { events, format, error }. webcal: addresses are read over https. */
export async function readEventSource(source, { fetcher = fetch, now = new Date() } = {}) {
  const feed = String(source.feed || '').replace(/^webcal:\/\//i, 'https://');
  try {
    if (!httpUrl(feed)) return { events: [], format: '', error: 'no feed address' };
    const r = await fetcher(feed, { headers: { 'user-agent': UA, accept: 'text/calendar, application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const body = await r.text();
    if (/BEGIN:VCALENDAR/i.test(body.slice(0, 4000))) return { events: parseIcs(body, { now, tz: source.tz }), format: 'ics', error: '' };
    if (/<(rss|feed|rdf:RDF)[\s>]/i.test(body)) return { events: parseEventFeed(body, feed, { now, tz: source.tz }), format: 'rss', error: '' };
    return { events: [], format: '', error: 'not a calendar or a feed' };
  } catch (e) {
    return { events: [], format: '', error: String((e && e.message) || e).slice(0, 120) };
  }
}

/** One refresh: read the PER_RUN sources read longest ago, store what each keeps, forget what a source no longer lists and what is
 * over. Returns { at, sources: [{ name, country, feed, format, read, kept, error }], kept }. A pack with no sources does nothing. */
export async function refreshEvents(store, { fetcher = fetch, now = new Date(), all = false, list = EVENT_SOURCES, filter = FILTER } = {}) {
  const at = now.toISOString();
  const report = { at, sources: [], kept: 0 };
  if (!list.length) return report;
  await store.setNewsMeta('events:last_refresh', at);
  const seen = await store.feedEventSourceTimes();
  const queue = [...list].sort((a, b) => String(seen[a.feed] || '').localeCompare(String(seen[b.feed] || '')));
  const batch = all ? queue : queue.slice(0, PER_RUN);
  const results = await Promise.all(batch.map((s) => readEventSource(s, { fetcher, now }).then((r) => [s, r])));
  for (const [s, r] of results) {
    const rows = r.error ? [] : rowsFrom(r.events, s, { now, filter });
    if (!r.error) {
      if (rows.length) await store.saveFeedEvents(rows.map((x) => ({ ...x, fetched_at: at })));
      /* The feed answered: whatever it no longer lists (cancelled, moved, filtered out) goes. */
      await store.clearFeedEvents(s.name, at);
    }
    await store.setNewsMeta(`evsrc:${s.feed}`, at);
    report.kept += rows.length;
    report.sources.push({ name: s.name, country: s.country || '', feed: s.feed, format: r.format, read: r.events.length, kept: rows.length, error: r.error });
  }
  await store.pruneFeedEvents(todayKey(now));
  await store.setNewsMeta('events:last_report', JSON.stringify(report));
  return report;
}

/** Start a refresh in the background when the last is older than STALE_MS, as news.mjs does. Never blocks or breaks the page. */
export async function refreshEventsIfStale(store, ctx, options = {}) {
  if (!(options.list || EVENT_SOURCES).length || !ctx || typeof ctx.waitUntil !== 'function') return false;
  const now = options.now || new Date();
  let last = null;
  try { last = await store.getNewsMeta('events:last_refresh'); } catch { return false; }
  if (last && now.getTime() - Date.parse(last) < STALE_MS) return false;
  try { await store.setNewsMeta('events:last_refresh', now.toISOString()); } catch { return false; }
  ctx.waitUntil(refreshEvents(store, options).catch((e) => console.error(`${PACK.id} events`, (e && e.stack) || e)));
  return true;
}

/** What the events reader last did: { sources (configured), last_refresh, report }. */
export async function eventsStatus(store) {
  try {
    const raw = await store.getNewsMeta('events:last_report');
    return { sources: EVENT_SOURCES.length, last_refresh: await store.getNewsMeta('events:last_refresh'), report: raw ? JSON.parse(raw) : null };
  } catch { return { sources: EVENT_SOURCES.length, last_refresh: null, report: null }; }
}

/** The stored feed events a page shows: not over, from a source the pack still lists, and wanted by the current filter, so a change to
 * either file shows at once. Each carries its source's home page. A storage failure (or no table yet) shows none. */
export async function feedEventsFor(store, { now = new Date(), list = EVENT_SOURCES, filter = FILTER } = {}) {
  if (!list.length || !store.feedEvents) return [];
  const homes = new Map(list.map((s) => [s.name, httpUrl(s.home)]));
  try {
    return (await store.feedEvents(todayKey(now))).filter((r) => homes.has(r.source) && wanted(r.title, r.summary || '', filter)).map((r) => ({ ...r, source_home: homes.get(r.source) || '' }));
  } catch { return []; }
}
