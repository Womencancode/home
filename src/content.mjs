/* What the site shows: the seed data (data/stories.json, data/works.json) plus the submissions a moderator approved. Everything is read
 * through here so that a page never has to know which of the two a record came from. */
import stories from '../data/stories.json' with { type: 'json' };
import works from '../data/works.json' with { type: 'json' };
import { countryByCode } from './countries.mjs';
import { socialsOf } from './social.mjs';
import { fold } from './places.mjs';
import { bountyFromRow } from './bounties.mjs';
import { tributeFromRow } from './tributes.mjs';

export const CATEGORIES = ['music', 'film', 'literature', 'art', 'fashion', 'sport', 'science', 'community', 'business', 'design', 'games'];
export const MEDIA = ['film', 'series', 'album', 'single', 'book', 'poetry', 'painting', 'photography', 'sculpture', 'fashion', 'design', 'play', 'dance', 'podcast', 'game', 'comic', 'other'];

export const SEED_STORIES = stories.map((s) => ({ ...s, community: false }));
export const SEED_WORKS = works.map((w) => ({ ...w, community: false }));

/** A row's details column (JSON written by a career form), or {} when it has none or it does not parse. */
export function detailsOf(row) {
  if (!row || !row.details) return {};
  if (typeof row.details === 'object') return row.details;
  try { const d = JSON.parse(row.details); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}

/** Turn an approved submission row into the shape the pages render. A 'mentee' row is a private request and becomes nothing. */
export function fromSubmission(row) {
  const d = detailsOf(row);
  if (row.kind === 'mentee') return { kind: 'mentee', private: true };
  if (row.kind === 'mentor') return { id: `c-${row.id}`, kind: 'mentor', community: true, name: row.title, role: row.creator || '', focus: Array.isArray(d.focus) && d.focus.length ? d.focus.map(String) : [row.medium].filter(Boolean), country: row.country, city: row.city || null, url: row.url || '', about: row.summary, optedIn: d.optedIn === true };
  if (row.kind === 'bounty') return bountyFromRow(row, d);
  if (row.kind === 'tribute') return tributeFromRow(row, d);
  const socials = Object.fromEntries([['instagram', row.instagram], ['x', row.x_handle], ['tiktok', row.tiktok], ['youtube', row.youtube]].filter(([, v]) => v));
  /* A community story is dated by when a moderator approved it, so a new one leads the list it joins. */
  const base = { slug: `c-${row.id}`, date: String(row.reviewed_at || row.created_at || '').slice(0, 10) || undefined, country: row.country, city: row.city || null, lat: row.lat ?? null, lon: row.lon ?? null, year: row.year, title: row.title, community: true, submittedBy: row.submitter_name || '', socials };
  if (row.kind === 'story') return { ...base, category: row.category || 'community', summary: row.summary, people: row.creator ? [row.creator] : [], source: row.url || '', url: row.url || '' };
  if (row.kind === 'work') return { ...base, medium: row.medium || 'other', creator: row.creator, blurb: row.summary, tags: [], url: row.url || '' };
  if (row.kind === 'event') return { ...base, kind: 'event' };
  if (row.kind === 'opportunity') {
    /* A job posted through /jobs/post carries its band in details; a moderator approving it is the check, so it is dated then. */
    const job = row.category === 'job' && d.pay ? { pay: d.pay, employment: d.employment, workplace: d.workplace, location: d.location || null, featured: d.featured === true, checkedOn: String(row.reviewed_at || row.created_at || '').slice(0, 10) } : {};
    return { id: `c-${row.id}`, kind: 'opportunity', community: true, title: row.title, organiser: row.creator || '', type: row.category, fields: [row.medium || 'general'], remote: !!row.remote, eligibility: row.only_country ? `Open to people in ${(countryByCode(row.country) || {}).name || row.country}` : 'Open worldwide', countries: row.only_country ? [row.country] : [], prize: row.prize || null, deadline: row.end_date || null, rolling: !row.end_date, url: row.url, checked: true, summary: row.summary, ...job };
  }
  if (row.kind === 'speaker') return { id: `c-${row.id}`, kind: 'speaker', community: true, name: row.title, role: null, org: row.creator || null, topics: [row.medium || 'community'], country: row.country, city: row.city || null, url: row.url || '', source: 'Nominated with consent', about: row.summary };
  return { ...base, id: row.id, kind: 'talent', creator: row.creator || row.title, medium: row.medium || (d.headline ? null : 'other'), blurb: row.summary, url: row.url || '', headline: typeof d.headline === 'string' ? d.headline : '', portfolio: Array.isArray(d.portfolio) ? d.portfolio.filter((x) => x && typeof x === 'object' && /^https:\/\//.test(x.link || '')) : [], verified: !!row.verified_at };
}

/* Kinds that carry a summary but are not stories. */
const OTHER_KINDS = ['opportunity', 'bounty', 'mentor', 'mentee', 'tribute'];

/** All content, seed plus approved community rows, each with its country resolved. Unknown country codes are dropped rather than crash a page. */
export function catalogue(approved = []) {
  const community = approved.map(fromSubmission);
  const now = new Date();
  const resolve = (list) => list.map((x) => ({ ...x, countryRecord: countryByCode(x.country), fresh: isRecent(x, now) })).filter((x) => x.countryRecord);
  const allStories = resolve([...community.filter((x) => 'summary' in x && !OTHER_KINDS.includes(x.kind)), ...SEED_STORIES]).sort((a, b) => storyDate(b).localeCompare(storyDate(a)) || a.title.localeCompare(b.title));
  const allWorks = resolve([...community.filter((x) => 'blurb' in x && !x.kind), ...SEED_WORKS]).sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
  const talentRows = resolve(community.filter((x) => x.kind === 'talent'));
  const opportunities = community.filter((x) => x.kind === 'opportunity');
  const speakers = community.filter((x) => x.kind === 'speaker' && x.url);
  const mentors = community.filter((x) => x.kind === 'mentor' && x.optedIn && x.url);
  const bounties = community.filter((x) => x.kind === 'bounty');
  const tributes = community.filter((x) => x.kind === 'tribute');
  return { stories: allStories, works: allWorks, talentRows, opportunities, speakers, mentors, bounties, tributes, approved };
}

/** The day a story happened, for ordering: its own date, or the middle of its year when only the year is known. */
export function storyDate(s) { return s.date || `${s.year || 1900}-07-01`; }

/** Is a story from the last `days` days? Undated stories never count as new. */
export function isRecent(s, now = new Date(), days = 120) { return !!s.date && (now - new Date(`${s.date}T00:00:00Z`)) / 86400000 <= days; }

/** Per-country counts, for the grids. */
export function counts(cat) {
  const out = new Map();
  const bump = (code, key) => { const c = out.get(code) || { stories: 0, works: 0 }; c[key] += 1; out.set(code, c); };
  for (const s of cat.stories) bump(s.country, 'stories');
  for (const w of cat.works) bump(w.country, 'works');
  for (const t of cat.talentRows) bump(t.country, 'works');
  return out;
}

/** The talent directory: every creator named on a work, plus approved talent submissions, grouped by person. */
export function talent(cat) {
  const people = new Map();
  const add = (name, entry) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    const p = people.get(key) || { name: name.trim(), countries: new Set(), disciplines: new Set(), works: [], url: '', socials: { ...socialsOf(name) } };
    for (const [k, v] of Object.entries(entry.socials || {})) if (!p.socials[k]) p.socials[k] = v;
    p.countries.add(entry.country);
    if (entry.medium) p.disciplines.add(entry.medium);
    if (entry.title) p.works.push(entry);
    if (entry.url && !p.url) p.url = entry.url;
    people.set(key, p);
  };
  /* A work's handles belong to its creator only when it names one person. */
  for (const w of cat.works) { const names = splitCreators(w.creator); for (const name of names) add(name, names.length === 1 ? w : { ...w, socials: {} }); }
  for (const t of cat.talentRows) add(t.creator, { ...t, title: '' });
  return [...people.values()].map((p) => ({ ...p, countries: [...p.countries].map(countryByCode).filter(Boolean), disciplines: [...p.disciplines] })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** "Ali Farka Touré and Toumani Diabaté" names two people; "George Kay, starring Omar Sy" names two; "Buena Vista Social Club" names one. */
export function splitCreators(creator) {
  return String(creator || '').replace(/,?\s+starring\s+/i, ' and ').split(/\s+and\s+|,\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Entries in one city of a country, matched without accents or case. */
export function inCity(list, city) { return list.filter((x) => x.city && fold(x.city) === fold(city)); }

export function storyBySlug(cat, slug) { return cat.stories.find((s) => s.slug === slug) || null; }
export function workBySlug(cat, slug) { return cat.works.find((w) => w.slug === slug) || null; }
export function forCountry(cat, code) {
  return { stories: cat.stories.filter((s) => s.country === code), works: cat.works.filter((w) => w.country === code), talentRows: cat.talentRows.filter((t) => t.country === code) };
}
