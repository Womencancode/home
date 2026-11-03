/* The build challenge (site.json "cohorts"."challenge", off by default): a run of short daily builds, each day named by what you end up
 * with. The first "freeDays" days are open to everyone; the rest show their title and outcome and a "Register interest" link each
 * (src/interest.mjs). Only with the pack's "cohorts"."booking": true (off by default) do the rest invite you to the paid live-call cohort
 * with its price and the Eventbrite link; until then "price" and "eventbrite" are kept in config but unused.
 *   "cohorts": { "booking": false, "price", "notify", "challenge": { "title", "lead", "wave", "freeDays": 1, "eventbrite": "", "nav": false, "copy": {},
 *     "faq": [{ "q", "a" }], "days": [{ "n", "title", "build", "minutes", "link", "linkLabel", "about", "follows", "steps": [] }] } }
 * Optional "levels": [{ "id", "title", "lead", "certificate", "seal" }] with a "level" (that id) on each day groups the days into levels that can be taken
 * separately, each with its own Register interest (challenge-<level id>), and optionally a certificate line with a seal image. Without "levels" nothing changes.
 * "freeDays" is one number, 0 up to the number of days; anything else means 1. */
import { PACK } from './site.mjs';
import { eventbriteUrl, priceText, localPath, str } from './cohorts.mjs';

export const DEFAULT_FREE_DAYS = 1;

export const CHALLENGE_COPY = {
  eyebrow: 'The challenge',
  navLabel: 'Challenge',
  free: 'Open now',
  locked: 'Opens with the first wave',
  minutes: 'About {n} minutes',
  youBuild: 'You end up with',
  follows: 'Follows',
  open: 'Open today\'s step',
  continue: 'Continue the challenge',
  continueTitle: 'Continue the challenge',
  continueLead: 'The rest of the days open with the first wave: you build alongside others and bring your questions to the live calls.',
  interest: 'Register interest',
  interestDay: 'Register interest',
  paid: 'Paid securely through Eventbrite',
  soon: 'Booking opens soon',
  notify: 'Tell me when it opens',
  freeLine: 'Day {first} is open to everyone; the rest open with the first wave.',
  freeLineMany: 'Days {first} to {last} are open to everyone; the rest open with the first wave.',
  freeLineNone: 'Every day opens with the first wave.',
  wave: 'Wave',
  when: 'Dates',
  tba: 'To be announced',
  faqTitle: 'Good to know',
  blockTitle: 'The challenge',
  blockLead: '',
  blockMore: 'See every day',
};

/** The words booking mode uses instead, where the paid wording is true. A pack's own "copy" still wins. */
export const BOOKING_COPY = {
  free: 'Free',
  locked: 'In the paid challenge',
  continueLead: 'The rest of the days come with the live-call cohort: you build alongside others and bring your questions to the calls.',
  freeLine: 'Day {first} is free for everyone.',
  freeLineMany: 'Days {first} to {last} are free for everyone.',
  freeLineNone: 'Every day is part of the paid challenge.',
};

const httpsLink = (s) => { try { const u = new URL(str(s)); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };

/** The number of free days: an integer from 0 to the number of days, else the default. */
export function freeDaysOf(v, total) {
  return Number.isInteger(v) && v >= 0 && v <= total ? v : Math.min(DEFAULT_FREE_DAYS, total);
}

/** The pack's challenge, cleaned, or null when off or when no day is well formed. */
export function challengeConfig(pack = PACK) {
  const c = pack && pack.cohorts;
  const ch = c && typeof c === 'object' && c.on !== false ? c.challenge : null;
  if (!ch || typeof ch !== 'object' || ch.on === false || !Array.isArray(ch.days)) return null;
  const seen = new Set();
  const days = ch.days.filter((d) => d && Number.isInteger(d.n) && d.n > 0 && str(d.title) && str(d.build) && !seen.has(d.n) && seen.add(d.n))
    .map((d) => ({ n: d.n, title: str(d.title), build: str(d.build), minutes: Number.isInteger(d.minutes) && d.minutes > 0 ? d.minutes : null,
      level: str(d.level), link: httpsLink(d.link), linkLabel: str(d.linkLabel), about: str(d.about), follows: str(d.follows), steps: Array.isArray(d.steps) ? d.steps.map(str).filter(Boolean) : [] }))
    .sort((a, b) => a.n - b.n);
  if (!days.length) return null;
  const freeDays = freeDaysOf(ch.freeDays, days.length);
  const booking = c.booking === true;
  const copy = { ...CHALLENGE_COPY, ...(booking ? BOOKING_COPY : {}) };
  for (const [k, v] of Object.entries(ch.copy && typeof ch.copy === 'object' ? ch.copy : {})) if (k in CHALLENGE_COPY && typeof v === 'string') copy[k] = v;
  const lseen = new Set();
  const levels = (Array.isArray(ch.levels) ? ch.levels : []).filter((l) => l && /^[a-z0-9-]{1,40}$/.test(l.id || '') && str(l.title) && !lseen.has(l.id) && lseen.add(l.id))
    .map((l) => ({ id: l.id, title: str(l.title), lead: str(l.lead), certificate: str(l.certificate), seal: localPath(l.seal), days: days.filter((d) => d.level === l.id).map((d) => d.n) })).filter((l) => l.days.length);
  return {
    levels,
    title: str(ch.title) || `${days.length}-day challenge`, lead: str(ch.lead), wave: str(ch.wave), freeDays,
    days: days.map((d, i) => ({ ...d, free: i < freeDays })),
    booking, price: booking ? priceText(c.price) : '', eventbrite: booking ? eventbriteUrl(ch.eventbrite) : '', notify: localPath(c.notify) || '/submit', nav: ch.nav === true, copy,
    faq: (Array.isArray(ch.faq) ? ch.faq : []).filter((f) => f && str(f.q) && str(f.a)).map((f) => ({ q: str(f.q), a: str(f.a) })),
  };
}
export const challengeOn = (pack = PACK) => !!challengeConfig(pack);

/** "Day 1 is open to everyone; ..." (or, with booking on, "Day 1 is free for everyone."). */
export function freeLine(cfg) {
  const c = cfg.copy;
  if (!cfg.freeDays) return c.freeLineNone;
  return cfg.freeDays === 1 ? c.freeLine.replace('{first}', String(cfg.days[0].n)) : c.freeLineMany.replace('{first}', String(cfg.days[0].n)).replace('{last}', String(cfg.days[cfg.freeDays - 1].n));
}
