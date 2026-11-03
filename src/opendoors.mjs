/* Open doors: recurring ways into rooms where Black people are under-represented (the ballet and the opera house, Oxford and
 * Cambridge, Parliament and public boards), each checked on its official page. Data: data/open-doors.json. */
import list from '../data/open-doors.json' with { type: 'json' };
import { PACK } from './site.mjs';
import { openTo } from './opportunities.mjs';

export const OPEN_DOORS = list;
/** Every lane the engine knows, in the order the page shows them; a pack may replace them in site.json ("lanes"). */
const ALL_LANES = [
  { id: 'culture', name: 'Culture', lead: 'Ballet, opera, classical music, theatre and galleries: cheap and free tickets, first-timer nights and the programmes that train the next generation on stage.' },
  { id: 'education', name: 'Education', lead: 'Oxford, Cambridge and the most selective universities: free summer schools, scholarships and the support that makes an application land.' },
  { id: 'careers', name: 'Careers', lead: 'Law, the City and the big firms: paid internships, mentoring and the programmes that get a first foot in the door.' },
  { id: 'public-life', name: 'Public life', lead: 'Parliament, councils, the courts, school and NHS boards and the civil service. We list the way in, never a party or a position.' },
];
/** The lanes this site shows: only those with at least one door. */
export const LANES = (Array.isArray(PACK.lanes) && PACK.lanes.length ? PACK.lanes : ALL_LANES).filter((l) => list.some((o) => o.lane === l.id));

/** Open doors someone in `country` can use, optionally in one lane; schemes with a deadline first, soonest first. */
export function doorsFor({ country = '', lane = '', field = '' } = {}, now = new Date(), items = OPEN_DOORS) {
  const today = now.toISOString().slice(0, 10);
  return items.filter((o) => (o.rolling || (o.deadline && o.deadline >= today)) && openTo(o, country) && (!lane || o.lane === lane) && (!field || o.fields.includes(field)))
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
}
