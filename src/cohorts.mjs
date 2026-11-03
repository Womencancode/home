/* Live-call cohorts (site.json "cohorts", off by default): small groups that meet on live calls. By default each cohort shows a
 * "Register interest" link (src/interest.mjs) and no price. "booking": true is the owner's opt-in switch: only then are the price and the
 * Eventbrite links rendered. Until then "price" and every "eventbrite" field are kept in config but unused. With booking on, an empty or
 * non-Eventbrite link is never rendered as a button: the cohort reads "Booking opens soon" with a link to the pack's own notify path.
 *   "cohorts": { "title", "lead", "booking": false, "price": { "amount": 47, "currency": "GBP", "per": "month" }, "notify": "/waitlist?for=live-calls",
 *                "nav": false, "copy": { ... }, "items": [{ "id", "name", "for", "about", "starts", "schedule", "seats", "eventbrite": "" }] }
 * "starts" is a date (YYYY-MM-DD) or empty; with a date, the cohort also shows on the calendar as a "Live call". */
import { PACK } from './site.mjs';

const ID = /^[a-z0-9-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYMBOL = { GBP: '£', USD: '$', EUR: '€' };
const TBA = 'To be announced';
export const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** The words a page uses unless the pack's "copy" says otherwise. */
export const COHORT_COPY = {
  eyebrow: 'Live calls',
  navLabel: 'Live calls',
  whatTitle: 'What the live calls are',
  what: 'Small groups that meet on live video calls. You join a cohort, come to the calls, ask your questions and work through it with others at the same stage.',
  paid: 'Paid securely through Eventbrite',
  join: 'Join on Eventbrite',
  soon: 'Booking opens soon',
  notify: 'Tell me when it opens',
  starts: 'Starts',
  schedule: 'When',
  seats: 'Seats',
  forLabel: 'For',
  interest: 'Register interest',
  interestLead: 'Register interest in a cohort and we will email you when it opens, and only about that.',
  tba: TBA,
  cancel: 'You book and pay on Eventbrite, and Eventbrite sends your receipt. Questions about a booking go to the organiser through Eventbrite.',
  blockTitle: 'Live calls',
  blockLead: '',
  blockMore: 'See the cohorts',
  event: 'Live call',
};

/** Whether a link may be a Join button: https, on eventbrite.<tld> or www.eventbrite.<tld> (co.uk, com, ca, com.au, ie, ...). */
export function eventbriteUrl(s) {
  let u;
  try { u = new URL(str(s)); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
  return /^(www\.)?eventbrite\.(com|co\.uk|ca|com\.au|co\.nz|ie|de|fr|es|it|nl|be|at|ch|pt|se|dk|fi|no|pl|com\.mx|com\.br|com\.ar|co|cl|com\.pe|sg|hk|in)$/.test(u.hostname) ? u.href : '';
}

/** The price as people read it: "£47 a month". */
export function priceText(p) {
  if (!p || typeof p.amount !== 'number' || !(p.amount >= 0)) return '';
  const cur = str(p.currency).toUpperCase() || 'GBP';
  const n = Number.isInteger(p.amount) ? String(p.amount) : p.amount.toFixed(2);
  const amount = SYMBOL[cur] ? `${SYMBOL[cur]}${n}` : `${n} ${cur}`;
  const per = str(p.per);
  return per ? `${amount} a ${per}` : amount;
}

/** A local path the "Tell me when it opens" link may use: same site, starting with one slash. */
export const localPath = (s) => (/^\/(?!\/)[^\s"'<>]*$/.test(str(s)) ? str(s) : '');

/** The pack's cohorts, cleaned, or null when off or when no cohort is well formed. */
export function cohortsConfig(pack = PACK) {
  const c = pack && pack.cohorts;
  if (!c || typeof c !== 'object' || c.on === false || !Array.isArray(c.items)) return null;
  const booking = c.booking === true;
  const seen = new Set();
  const items = c.items.filter((i) => i && ID.test(i.id || '') && str(i.name) && !seen.has(i.id) && seen.add(i.id)).map((i) => ({
    id: i.id, name: str(i.name), for: str(i.for), about: str(i.about), starts: DATE.test(str(i.starts)) ? str(i.starts) : '',
    schedule: str(i.schedule), seats: Number.isInteger(i.seats) && i.seats > 0 ? i.seats : null, eventbrite: booking ? eventbriteUrl(i.eventbrite) : '', roles: Array.isArray(i.roles) ? i.roles.filter((r) => typeof r === 'string') : [],
  }));
  if (!items.length) return null;
  const copy = { ...COHORT_COPY };
  for (const [k, v] of Object.entries(c.copy && typeof c.copy === 'object' ? c.copy : {})) if (k in COHORT_COPY && typeof v === 'string') copy[k] = v;
  return { title: str(c.title) || 'Live-call cohorts', lead: str(c.lead), booking, price: booking ? priceText(c.price) : '', notify: localPath(c.notify) || '/submit', nav: c.nav === true, copy, items };
}
export const cohortsOn = (pack = PACK) => !!cohortsConfig(pack);

/** A date as "12 January 2027". */
export function longDate(iso) {
  if (!DATE.test(iso || '')) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Cohorts with a start date as calendar feed rows (events.mjs fromFeed): an online "Live call" that links to its cohort. */
export function cohortEventRows(pack = PACK) {
  const cfg = cohortsConfig(pack);
  if (!cfg) return [];
  return cfg.items.filter((i) => i.starts).map((i) => ({ id: `cohort-${i.id}`, source: pack.name, source_home: `https://${pack.domain}/cohorts`, uid: i.id, title: `${cfg.copy.event}: ${i.name}`, start: i.starts, end: i.starts, city: 'Online', country: '', url: `https://${pack.domain}/cohorts#${i.id}`, summary: [i.for, cfg.price].filter(Boolean).join('. '), kind: 'workshop' }));
}
