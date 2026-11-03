/* Opportunities: open competitions, hackathons, grants, fellowships, calls for entries and jobs, each checked against the organiser's
 * page before it is listed. Matched by country and field, so someone in Lagos sees the remote AI and blockchain prizes they can enter.
 * Data: data/opportunities.json. */
import list from '../data/opportunities.json' with { type: 'json' };

export const OPPORTUNITIES = list;
export const FIELDS = ['ai', 'blockchain', 'business', 'film', 'writing', 'music', 'art', 'design', 'science', 'general'];
/** The kinds of opportunity a submission can be. */
export const TYPES = ['competition', 'hackathon', 'grant', 'accelerator', 'fellowship', 'scholarship', 'job', 'call-for-entries', 'residency', 'cfp'];
export const FIELD_LABEL = { ai: 'AI', blockchain: 'Blockchain', business: 'Business', film: 'Film', writing: 'Writing', music: 'Music', art: 'Art', design: 'Design', science: 'Science', general: 'Anyone', education: 'Education', 'public-life': 'Public life', arts: 'Arts', law: 'Law', engineering: 'Engineering', sport: 'Sport', tech: 'Tech', cyber: 'Cyber security', data: 'Data' };
const day = (d) => d.toISOString().slice(0, 10);

/** Whole days until a deadline, or null for rolling ones. */
export function daysLeft(o, now = new Date()) {
  return o.deadline ? Math.ceil((Date.parse(`${o.deadline}T23:59:59Z`) - now.getTime()) / 86400000) : null;
}

/** A job checked longer ago than this many days stops being listed until someone checks it again (jobs.mjs). */
export const JOB_FRESH_DAYS = 45;
/** A job with a "checked on" day is listed only while that day is recent; anything else is unaffected. */
export function jobFresh(o, now = new Date()) {
  if (!o || o.type !== 'job' || !o.checkedOn) return true;
  const t = Date.parse(`${o.checkedOn}T00:00:00Z`);
  return !Number.isNaN(t) && (now.getTime() - t) / 86400000 <= JOB_FRESH_DAYS;
}

/** What is still open: a future deadline or rolling, soonest deadline first, rolling last. A job not checked lately is left out. */
export function openOpportunities(now = new Date(), items = OPPORTUNITIES) {
  return items.filter((o) => (o.rolling || (o.deadline && o.deadline >= day(now))) && jobFresh(o, now))
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
}

/** Can someone in `country` enter? Worldwide ones ([] countries) are open to all. */
export const openTo = (o, country) => !o.countries || !o.countries.length || !country || o.countries.includes(country);

/** Matches for a person: open, enterable from their country, in their fields (any field when none given), remote first when asked. */
export function match({ country = '', fields = [], remote = false } = {}, now = new Date(), items = OPPORTUNITIES) {
  return openOpportunities(now, items).filter((o) => openTo(o, country) && (!fields.length || o.fields.some((f) => fields.includes(f)) || o.fields.includes('general')) && (!remote || o.remote));
}

/** The fields a story or work points to, so its page can say "enter the next one". */
export function fieldsFor(entry) {
  const t = `${entry.category || ''} ${entry.medium || ''} ${entry.title || ''} ${entry.summary || entry.blurb || ''}`.toLowerCase();
  const out = [];
  if (/\b(ai|artificial intelligence|machine learning)\b/.test(t)) out.push('ai');
  if (/blockchain|crypto|web3/.test(t)) out.push('blockchain');
  if (/film|cinema|movie|documentary/.test(t)) out.push('film');
  if (/book|novel|poet|writ|literature/.test(t)) out.push('writing');
  if (/music|album|song|grammy|mobo/.test(t)) out.push('music');
  if (/\bart\b|artist|gallery|painting/.test(t)) out.push('art');
  if (/business|founder|startup|company/.test(t)) out.push('business');
  return out;
}
