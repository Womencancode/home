/* The career side: jobs with pay bands, mentors, community rooms, bounties (listing only) and proof-of-work profiles. A pack switches
 * each one on in site.json under "careers": { "title", "lead", "nav", "jobs": {}, "mentors": {}, "rooms": { "list": [...] },
 * "bounties": {}, "profiles": {} }. A feature whose key is missing has no routes (every one is a 404) and no door: no nav, footer,
 * sitemap, llms.txt, home block or Ask answer. Storage: migrations/0012_careers.sql. */
import { PACK } from './site.mjs';

/** Mentor focus areas, in the order the forms show them. A pack can narrow the list with careers.mentors.focus. */
export const FOCUS = ['fundraising', 'staff-engineering', 'product', 'design', 'finance', 'legal', 'founders', 'career-switch'];
export const FOCUS_LABEL = { fundraising: 'Fundraising', 'staff-engineering': 'Staff+ engineering', product: 'Product', design: 'Design', finance: 'Finance', legal: 'Legal', founders: 'Founders', 'career-switch': 'Career switch' };

const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A room from the pack, or null when it is not well formed: { id, name, focus, blurb, open }. No member counts, by design. */
export function cleanRoom(r) {
  if (!isObj(r) || !/^[a-z0-9-]{2,40}$/.test(r.id || '') || !text(r.name, 80) || !text(r.blurb, 400)) return null;
  return { id: r.id, name: text(r.name, 80), focus: text(r.focus, 80), blurb: text(r.blurb, 400), open: r.open === true };
}

/** The pack's career settings, cleaned, or null when the pack has none. Each feature is an object when on and null when off. */
export function careersConfig(pack = PACK) {
  const c = pack && pack.careers;
  if (!isObj(c)) return null;
  const feature = (k, extra = () => ({})) => (isObj(c[k]) ? { nav: c[k].nav === true, ...extra(c[k]) } : null);
  const rooms = feature('rooms', (r) => ({ list: (Array.isArray(r.list) ? r.list : []).map(cleanRoom).filter(Boolean).filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i) }));
  return {
    title: text(c.title, 40) || 'Careers',
    lead: text(c.lead, 400),
    nav: c.nav === true,
    jobs: feature('jobs'),
    mentors: feature('mentors', (m) => { const f = (Array.isArray(m.focus) ? m.focus : []).filter((x) => FOCUS.includes(x)); return { focus: f.length ? f : FOCUS }; }),
    rooms: rooms && rooms.list.length ? rooms : null,
    bounties: feature('bounties'),
    profiles: feature('profiles'),
  };
}

/** Whether one feature ('jobs', 'mentors', 'rooms', 'bounties' or 'profiles') is on for this pack. */
export const careerOn = (feature, pack = PACK) => { const c = careersConfig(pack); return !!(c && c[feature]); };
/** Whether any career feature is on: /careers, the hub page, exists only then. */
export const careersOn = (pack = PACK) => ['jobs', 'mentors', 'rooms', 'bounties', 'profiles'].some((f) => careerOn(f, pack));

const PAGES = [['jobs', '/jobs', 'Jobs'], ['mentors', '/mentors', 'Mentors'], ['rooms', '/rooms', 'Rooms'], ['bounties', '/bounties', 'Bounties']];

/** The header entries: the hub when careers.nav is set, then any feature whose own "nav" is set. Kept short on purpose. */
export function careersNav(pack = PACK) {
  const c = careersConfig(pack);
  if (!c || !careersOn(pack)) return [];
  return [...(c.nav ? [['/careers', c.title]] : []), ...PAGES.filter(([k]) => c[k] && c[k].nav).map(([, href, label]) => [href, label])];
}

/** Footer links: what to explore and how to take part, only for features that are on. */
export function careersFooter(pack = PACK) {
  const c = careersConfig(pack);
  if (!c || !careersOn(pack)) return { explore: [], takePart: [] };
  return {
    explore: [['/careers', c.title], ...PAGES.filter(([k]) => c[k]).map(([, href, label]) => [href, label])],
    takePart: [...(c.jobs ? [['/jobs/post', 'Post a job']] : []), ...(c.mentors ? [['/mentors/offer', 'Offer to mentor']] : []), ...(c.bounties ? [['/bounties/post', 'Post a bounty']] : []), ...(c.profiles ? [['/talent/add', 'Add your proof of work']] : [])],
  };
}
