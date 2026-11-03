/* "Ask": a question, typed or spoken, answered from the site's own data. The browser engine (search over everything the site has:
 * opportunities, events, stories, news, works, talent, lessons, open doors and speakers) always runs; the Ontold engine adds a written answer when AI_ENGINE is "on" and its URL and token are set, and is
 * switched off by setting AI_ENGINE to anything else. A failure there falls back to the browser answer, never to an error. */
import { fold } from './places.mjs';
import { COUNTRIES } from './countries.mjs';
import { FIELDS } from './opportunities.mjs';
import { TOPICS, TOPIC_LABEL } from './speakers.mjs';
import { directoryConfig } from './partners/festivals.mjs';
import { PACK } from './site.mjs';

const STOP = new Set('the a an of in on for to and or me my find show what whats is are any can i we you there with from about near'.split(' '));
const FIELD_WORDS = { ai: ['ai', 'artificial', 'machine', 'ml'], blockchain: ['blockchain', 'crypto', 'web3', 'ethereum', 'solana'], film: ['film', 'films', 'movie', 'cinema'], writing: ['writing', 'writer', 'book', 'poetry', 'novel'], music: ['music', 'song', 'musician'], art: ['art', 'artist', 'painting'], business: ['business', 'startup', 'founder', 'funding'], design: ['design'], science: ['science', 'research'] };

/** What a question asks for: the country it names, the fields, whether it wants opportunities or events, and its other words. */
export function readQuestion(q) {
  const t = fold(q);
  const country = COUNTRIES.slice().sort((a, b) => b.name.length - a.name.length).find((c) => new RegExp(`\\b${fold(c.name)}\\b`).test(t));
  const words = t.split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  const fields = FIELDS.filter((f) => (FIELD_WORDS[f] || []).some((w) => words.includes(w)));
  const wants = /\b(compet|hackathon|grant|prize|fund|job|fellowship|scholarship|enter|apply|opportunit)/.test(t) ? 'opportunities' : /\b(event|festival|carnival|on this week|whats on|concert)/.test(t) ? 'events' : 'all';
  const speaker = /\b(speakers?|manels?|panel|panels|panellists?|panelists?|keynotes?)\b/.test(t);
  const topic = TOPICS.filter((x) => x.includes('-')).find((x) => t.includes(x.replace('-', ' '))) || TOPICS.find((x) => !x.includes('-') && words.includes(x)) || fields.find((f) => TOPICS.includes(f)) || '';
  /* Film festivals and competitions, for a site with a festival directory: 'festival', 'competition' or 'any' (submit my film). */
  const festival = /\b(festivals?|competitions?|contests?)\b|\bsubmit (my|a|our) (short )?(film|movie|documentary)s?\b/.test(t) ? (/\bfestivals?\b/.test(t) ? 'festival' : /\b(competitions?|contests?)\b/.test(t) ? 'competition' : 'any') : '';
  /* Apps, for a site with an app store: 'publish' (make, check or list one: the checker), or 'find' (the shelves). */
  const appWord = /\b(apps?|pwas?|progressive web apps?|web apps?|install|installable|installing|manifest)\b/.test(t);
  const app = !appWord ? '' : /\b(publish|list|submit|launch|check|test|make|build|ship|sell|pwas?|installable|manifest)\b/.test(t) ? 'publish' : 'find';
  /* The career side, for a site that has it: a mentor, a bounty, a room, or a job question, in that order of precedence. */
  const career = /\bmentor(s|ing|ship)?\b/.test(t) ? 'mentor' : /\bbount(y|ies)\b/.test(t) ? 'bounty' : /\brooms?\b/.test(t) ? 'room' : /\b(jobs?|hiring|vacanc(y|ies)|salary|salaries|pay band|roles?)\b/.test(t) ? 'jobs' : '';
  return { country: country ? country.code : '', fields, wants: speaker ? 'speakers' : wants, words, topic, festival, app, career };
}

const CAREER_LEAD = {
  jobs: { kind: 'jobs', title: 'Jobs that show the pay', href: '/jobs', note: 'Real pay bands, each on the employer\'s own posting, checked by a person' },
  mentor: { kind: 'mentors', title: 'Mentors: request a match', href: '/mentors', note: 'Tell us where you are, where you are going and what is in the way' },
  bounty: { kind: 'bounties', title: 'Bounties: paid briefs from sponsors', href: '/bounties', note: 'Reward, skills and deadline on each; payment is arranged with the sponsor' },
  room: { kind: 'rooms', title: 'Rooms by discipline', href: '/rooms', note: 'Private rooms; ask to join one' },
};
const CAREER_FEATURE = { jobs: 'jobs', mentor: 'mentors', bounty: 'bounties', room: 'rooms' };

/** At most this many results, and no more than PER_KIND of any one kind, so a question gets a spread rather than twelve stories. */
export const ASK_LIMIT = 10;
export const PER_KIND = 4;
/** The best `limit` of an already ranked list, taking no more than `per` of one kind. */
export function spread(ranked, limit = ASK_LIMIT, per = PER_KIND) {
  const seen = {}; const out = [];
  for (const x of ranked) { if ((seen[x.kind] = (seen[x.kind] || 0) + 1) <= per) out.push(x); if (out.length >= limit) break; }
  return out;
}

/** A small lift for something recent: 1 within two weeks, half within two months. Applied only to what already matched. */
export function recency(iso, now = new Date()) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return 0;
  const days = (now - t) / 86400000;
  return days <= 14 ? 1 : days <= 60 ? 0.5 : 0;
}

/** The browser engine: rank everything the site has (opportunities, events, stories, news, works, talent, lessons, open doors and
 * speakers) by the question's words, country and fields. News and stories get a small lift for recency. Top 10, at most 4 of a kind.
 * `talent` is the talent directory (content.mjs talent()), `openDoors` the doors still open, `news` the stored headlines. */
export function searchAnswer(q, { stories = [], events = [], opportunities = [], news = [], works = [], talent = [], lessons = [], openDoors = [], speakers = [], speakersOn = false, festivalsOn = false, appsOn = false, apps = [], careers = null, now = new Date() }) {
  const r = readQuestion(q);
  /* A career question leads with its page when the feature is on, then the matching jobs, bounties, mentors or rooms. */
  const k = careers && careers.on ? careers : null;
  if (k && r.career && k.on[CAREER_FEATURE[r.career]]) {
    const words = (text) => { const t = fold(text); return r.words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };
    const rank = (list) => list.map((x) => ({ x, s: words(x.text) })).sort((a, b) => b.s - a.s).map(({ x }) => x.row);
    const rows = r.career === 'jobs' ? rank((k.jobs || []).map((o) => ({ text: `${o.title} ${o.organiser} ${o.location || ''} ${o.employment} ${o.workplace}`, row: { kind: 'job', title: o.title, href: `/jobs#${o.id}`, note: o.organiser } })))
      : r.career === 'bounty' ? rank((k.bounties || []).map((b) => ({ text: `${b.title} ${b.sponsor} ${b.skills.join(' ')} ${b.summary}`, row: { kind: 'bounty', title: b.title, href: `/bounties/${b.id}`, note: b.sponsor } })))
        : r.career === 'mentor' ? rank((k.mentors || []).map((m) => ({ text: `${m.name} ${m.role} ${m.focus.join(' ')} ${m.about || ''}`, row: { kind: 'mentor', title: m.name, href: `/mentors#${m.id}`, note: m.role } })))
          : (k.rooms || []).map((x) => ({ kind: 'room', title: x.name, href: `/rooms/${x.id}`, note: x.focus || '' }));
    return { understood: r, results: [CAREER_LEAD[r.career], ...rows.slice(0, ASK_LIMIT - 1)] };
  }
  if (r.wants === 'speakers' && speakersOn) {
    const p = new URLSearchParams(); if (r.topic) p.set('topic', r.topic); if (r.country) p.set('country', r.country);
    const href = `/speakers${p.toString() ? `?${p}` : ''}`;
    return { understood: r, results: [{ kind: 'speakers', title: r.topic ? `Speakers on ${TOPIC_LABEL[r.topic]}` : 'Speakers for your panel', href, note: 'Fix the manel: people to invite, with a public source page each' }] };
  }
  const score = (text, country, fields = []) => { const t = fold(text); let s = r.words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); if (r.country && country === r.country) s += 3; if (r.fields.some((f) => fields.includes(f))) s += 3; return s; };
  /* A scheme limited to other countries than the one asked about is pushed down; with no country asked, nothing is. */
  const fits = (countries) => ((!countries || !countries.length || !r.country || countries.includes(r.country)) ? 1 : -5);
  /* Recency only lifts what already matched, so a fresh item that has nothing to do with the question never appears. */
  const lift = (s, iso) => (s > 0 ? s + recency(iso, now) : s);
  const doorHref = (o) => { const c = (o.countries || []).includes(r.country) ? r.country : (o.countries || [])[0]; return `/open-doors${c ? `?country=${c}` : ''}#${o.id}`; };
  const wide = r.wants === 'all' || r.wants === 'speakers';
  /* Schemes: a question about opportunities lists the open ones even when no word matches; any other question needs a real match. */
  const scheme = (text, o) => { const m = score(text, (o.countries || [])[0], o.fields); return m > 0 || r.wants === 'opportunities' ? m + (r.wants === 'opportunities' ? 2 : 0) + fits(o.countries) : 0; };
  const pool = [
    ...(r.wants !== 'events' ? opportunities.map((o) => ({ kind: 'opportunity', title: o.title, href: `/opportunities#${o.id}`, note: o.prize || o.organiser, s: scheme(`${o.title} ${o.organiser} ${o.eligibility}`, o) })) : []),
    ...(r.wants !== 'events' ? openDoors.map((o) => ({ kind: 'door', title: o.title, href: doorHref(o), note: o.organiser, s: scheme(`${o.title} ${o.organiser} ${o.eligibility || ''} ${o.whatToExpect || ''} ${o.lane || ''}`, o) })) : []),
    ...(r.wants !== 'opportunities' ? events.map((e) => ({ kind: 'event', title: e.name, href: `/event/${e.id}`, note: [e.city, e.countryRecord && e.countryRecord.name].filter(Boolean).join(', '), s: score(`${e.name} ${e.blurb} ${e.city || ''}`, e.country) + (r.wants === 'events' ? 2 : 0) })) : []),
    ...(wide ? stories.map((s) => ({ kind: 'story', title: s.title, href: `/story/${s.slug}`, note: s.countryRecord ? s.countryRecord.name : '', s: lift(score(`${s.title} ${s.summary}`, s.country), s.date) })) : []),
    /* A headline links out to the publisher; the site keeps only the headline, an excerpt and the link. */
    ...(wide ? news.filter((n) => /^https?:\/\//.test(n.url || '')).map((n) => ({ kind: 'news', title: n.title, href: n.url, note: n.source || '', s: lift(score(`${n.title} ${n.summary || ''} ${n.source || ''}`, n.country), n.published_at) })) : []),
    ...(wide ? works.map((w) => ({ kind: 'work', title: w.title, href: `/work/${w.slug}`, note: [w.creator, w.medium].filter(Boolean).join(', '), s: score(`${w.title} ${w.creator || ''} ${w.blurb || ''} ${w.medium || ''} ${(w.tags || []).join(' ')} ${w.city || ''}`, w.country) })) : []),
    ...(wide ? talent.map((p) => { const c = (p.countries || []).find((k) => k.code === r.country) || (p.countries || [])[0]; return { kind: 'talent', title: p.name, href: `/talent?q=${encodeURIComponent(p.name)}`, note: [(p.disciplines || []).join(', '), c && c.name].filter(Boolean).join(', '), s: score(`${p.name} ${(p.disciplines || []).join(' ')}`, c && c.code) }; }) : []),
    ...(wide ? lessons.map((l) => ({ kind: 'lesson', title: l.title, href: `/learn/${l.id}`, note: `${l.track} · ${l.minutes} min`, s: score(`${l.title} ${l.summary || ''} ${l.track}`) })) : []),
    ...(wide && appsOn ? apps.filter((a) => a.slug).map((a) => ({ kind: 'app', title: a.name, href: `/apps/${a.slug}`, note: a.maker_name || '', s: score(`${a.name} ${a.short_name || ''} ${a.description || ''} ${a.maker_name || ''} ${a.category || ''} ${(a.categories || []).join(' ')}`) })) : []),
    ...(wide ? speakers.map((p) => ({ kind: 'speaker', title: p.name, href: `/speakers#${p.id}`, note: [p.role, p.org].filter(Boolean).join(', '), s: score(`${p.name} ${p.role || ''} ${p.org || ''} ${(p.topics || []).map((t) => `${t} ${TOPIC_LABEL[t] || ''}`).join(' ')} ${p.about || ''}`, p.country, p.topics) })) : []),
  ];
  const ranked = pool.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map(({ s, ...x }) => x);
  /* A festival or competition question leads with /festivals; the site's own matches follow it. */
  if (festivalsOn && r.festival) {
    const cfg = directoryConfig();
    const p = new URLSearchParams(); if (r.festival !== 'any') p.set('kind', r.festival); if (r.country) p.set('country', r.country);
    const title = r.festival === 'competition' ? 'Film competitions open for entries' : r.festival === 'festival' ? 'Film festivals open for entries' : 'Festivals and competitions to enter your film';
    return { understood: r, results: [{ kind: 'festivals', title, href: `/festivals${p.toString() ? `?${p}` : ''}`, note: cfg ? `From the ${cfg.name} directory` : 'Open for entries' }, ...spread(ranked, ASK_LIMIT - 1)] };
  }
  /* An app question leads with the app store: the checker for making or publishing one, the shelves otherwise. */
  if (appsOn && r.app) {
    const lead = r.app === 'publish' ? { kind: 'apps', title: 'Check your web app, then publish it', href: '/apps/check', note: 'Is it installable? A checklist with fixes, then a step-by-step walkthrough' } : { kind: 'apps', title: 'App store', href: '/apps', note: 'Installable web apps, each installed from its maker\'s own site' };
    return { understood: r, results: [lead, ...spread(ranked, ASK_LIMIT - 1)] };
  }
  return { understood: r, results: spread(ranked) };
}

/** Whether the Ontold engine is switched on for this deployment. */
export const ontoldOn = (env = {}) => String(env.AI_ENGINE || '').toLowerCase() === 'on' && !!env.AI_ENGINE_URL && !!env.AI_ENGINE_TOKEN;

/** The answer: the browser engine's results, plus Ontold's written answer over those results when switched on. */
export async function ask(q, data, env = {}, fetcher = fetch) {
  const base = searchAnswer(q, data);
  if (!ontoldOn(env)) return { ...base, engine: 'browser' };
  try {
    const r = await fetcher(env.AI_ENGINE_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AI_ENGINE_TOKEN}` }, body: JSON.stringify({ app: PACK.id || 'abc', task: 'answer', question: q, context: base.results }), signal: AbortSignal.timeout(15000) });
    const j = r.ok ? await r.json() : null;
    return j && typeof j.answer === 'string' ? { ...base, answer: j.answer.slice(0, 2000), engine: 'ontold' } : { ...base, engine: 'browser' };
  } catch { return { ...base, engine: 'browser' }; }
}
