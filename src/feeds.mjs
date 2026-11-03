/* The machine-readable surfaces: sitemap, RSS and robots. */
import { tributesOn } from './tributes.mjs';
import { trainOn } from './train.mjs';
import { gapOn } from './gap.mjs';
import { cohortsConfig } from './cohorts.mjs';
import { challengeConfig, freeLine } from './challenge.mjs';
import { T } from './site.mjs';
import { COUNTRIES } from './countries.mjs';
import { SITE, absolute, esc } from './html.mjs';
import { LESSONS } from './learn.mjs';
import { POSTS } from './posts.mjs';
import { speakersEnabled } from './speakers.mjs';
import { directoryConfig } from './partners/festivals.mjs';
import { appStoreConfig } from './appstore.mjs';
import { payText } from './jobs.mjs';
import { rewardText } from './bounties.mjs';

const STATIC = ['/', '/opportunities', '/open-doors', '/watch', '/countries', '/events', '/map', '/stories', '/showcase', '/talent', '/submit', '/about', '/guidelines'];

/** The career pages that are on, for the sitemap: the hub, each feature's page, open bounties and profiles with proof of work. */
function careerUrls(k) {
  if (!k || !k.on || !Object.values(k.on).some(Boolean)) return [];
  return [{ loc: absolute('/careers'), priority: '0.8' }, ...[['jobs', '/jobs'], ['mentors', '/mentors'], ['rooms', '/rooms'], ['bounties', '/bounties']].filter(([f]) => k.on[f]).map(([, p]) => ({ loc: absolute(p), priority: '0.8' })),
    ...(k.on.rooms ? k.rooms.map((r) => ({ loc: absolute(`/rooms/${r.id}`), priority: '0.5' })) : []), ...(k.on.bounties ? k.bounties.map((b) => ({ loc: absolute(`/bounties/${b.id}`), priority: '0.6', lastmod: b.postedOn })) : []),
    ...(k.on.profiles ? k.profiles.map((p) => ({ loc: absolute(`/talent/${p.slug}`), priority: '0.5' })) : [])];
}

/** The sitemap: every static page, country, story, work and upcoming event, the app store with its approved listings, and the career
 * pages when the pack has them (`careers` is the worker's careersData()). */
export function sitemap(cat, events = [], apps = [], careers = null) {
  const urls = [
    ...STATIC.map((p) => ({ loc: absolute(p), priority: p === '/' ? '1.0' : '0.8' })),
    ...COUNTRIES.map((c) => ({ loc: absolute(`/country/${c.slug}`), priority: '0.7' })),
    ...cat.stories.map((s) => ({ loc: absolute(`/story/${s.slug}`), priority: '0.6', lastmod: s.date })),
    ...cat.works.map((w) => ({ loc: absolute(`/work/${w.slug}`), priority: '0.6' })),
    ...events.map((e) => ({ loc: absolute(`/event/${e.id}`), priority: '0.6' })),
    ...(speakersEnabled() ? [{ loc: absolute('/speakers'), priority: '0.8' }] : []),
    ...(directoryConfig() ? [{ loc: absolute('/festivals'), priority: '0.8' }] : []),
    ...(LESSONS.length ? [{ loc: absolute('/learn'), priority: '0.8' }, ...LESSONS.map((l) => ({ loc: absolute(`/learn/${l.id}`), priority: '0.6' }))] : []),
    ...(POSTS.length ? [{ loc: absolute('/writing'), priority: '0.8' }, ...POSTS.map((p) => ({ loc: absolute(`/writing/${p.slug}`), lastmod: p.date, priority: '0.6' }))] : []),
    ...careerUrls(careers),
    ...(tributesOn() ? [{ loc: absolute('/tributes'), priority: '0.7' }] : []),
    ...(trainOn() ? [{ loc: absolute('/train'), priority: '0.8' }] : []),
    ...(gapOn() ? [{ loc: absolute('/why'), priority: '0.7' }] : []),
    ...(cohortsConfig() ? [{ loc: absolute('/cohorts'), priority: '0.8' }] : []),
    ...(challengeConfig() ? [{ loc: absolute('/challenge'), priority: '0.8' }] : []),
    ...(appStoreConfig() ? [{ loc: absolute('/apps'), priority: '0.8' }, { loc: absolute('/apps/check'), priority: '0.6' }, ...apps.filter((a) => a.slug).map((a) => ({ loc: absolute(`/apps/${a.slug}`), priority: '0.6', lastmod: a.reviewed_at ? String(a.reviewed_at).slice(0, 10) : '' }))] : []),
  ];
  const body = urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export function rss(cat, now = new Date()) {
  const items = cat.stories.slice(0, 50).map((s) => `<item><title>${esc(s.title)}</title><link>${esc(absolute(`/story/${s.slug}`))}</link><guid isPermaLink="true">${esc(absolute(`/story/${s.slug}`))}</guid><description>${esc(s.summary)}</description><category>${esc(s.countryRecord.name)}</category><category>${esc(s.category)}</category></item>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(SITE.name)}: good news</title><link>${esc(absolute('/'))}</link><description>${esc(SITE.tagline)}</description><language>en</language><lastBuildDate>${now.toUTCString()}</lastBuildDate>\n${items}\n</channel></rss>\n`, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=900' } });
}

export function robots() {
  const answerEngines = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot'];
  const open = answerEngines.map((a) => `User-agent: ${a}\nAllow: /\nDisallow: /admin\n`).join('\n');
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\n${open}\nSitemap: ${absolute('/sitemap.xml')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}

/** /llms.txt: a plain map of the site for answer engines, with the newest stories, open opportunities and, when on, the career side. */
export function llms(cat, opportunities = [], apps = [], careers = null) {
  const k = careers && careers.on ? careers : { on: {}, jobs: [], bounties: [] };
  const store = appStoreConfig();
  const line = (title, path, note) => `- [${title}](${absolute(path)})${note ? `: ${note}` : ''}`;
  const text = [`# ${SITE.name}`, '', `> ${SITE.tagline} ${T('llms.summary', { n: COUNTRIES.length })}`, '',
    '## Sections', line('Opportunities', '/opportunities', 'open competitions, hackathons, grants, fellowships and jobs, many remote, filterable by country'), line('Open doors', '/open-doors', T('llms.doors')), line('Events', '/events', 'carnivals, festivals, heritage months and awards'), ...(directoryConfig() ? [line('Film festivals and competitions', '/festivals', `open for entries, from the ${directoryConfig().name} directory`)] : []), line('Stories', '/stories', 'good news, newest first'), line('Showcase', '/showcase', 'films, music, books and art'), line('Talent', '/talent', 'directory of people'), line('Countries', '/countries', 'a page per country'), ...(LESSONS.length ? [line('Learn', '/learn', 'short lessons in plain words, each with a next step on this site')] : []), ...(POSTS.length ? [line('Writing', '/writing', 'short articles in plain words, each linking to its sources')] : []), ...(speakersEnabled() ? [line('Speakers', '/speakers', 'speakers to invite for panels and events, by topic and country, each with a public source page; filter with ?topic= and ?country=')] : []), ...(store ? [line(store.title, '/apps', 'installable web apps (PWAs) made by the community; each installs from its maker\'s own site'), line('App checker', '/apps/check', 'is a web app installable? ?url= gives a checklist with fixes'), line('Publish an app', '/apps/publish', 'a step-by-step walkthrough to list a web app')] : []), ...(k.on.jobs ? [line('Jobs', '/jobs', 'jobs that show their pay band, each linking to the employer\'s own posting with the day it was checked; filter with ?pay=, ?currency=, ?type= and ?where=')] : []), ...(k.on.mentors ? [line('Mentors', '/mentors', 'mentors who agreed to be listed, by focus area, and a private form to request a match')] : []), ...(k.on.rooms ? [line('Rooms', '/rooms', 'private community rooms by discipline; request access')] : []), ...(k.on.bounties ? [line('Bounties', '/bounties', 'paid briefs from sponsors with reward, skills and deadline; payment is arranged with the sponsor')] : []), ...(k.on.profiles ? [line('Proof of work', '/talent/add', 'add a profile with portfolio items; approved profiles live at /talent/<name>')] : []), ...(cohortsConfig() ? [line(cohortsConfig().title, '/cohorts', cohortsConfig().booking ? `live-call cohorts${cohortsConfig().price ? `, ${cohortsConfig().price}` : ''}, booked and paid through Eventbrite` : 'live-call cohorts, register interest in each')] : []), ...(challengeConfig() ? [line(challengeConfig().title, '/challenge', `${challengeConfig().days.length} daily builds. ${freeLine(challengeConfig())}`)] : []), line('About', '/about', T('llms.about')), '',
    '## Data', line('Stories as JSON', '/api/stories'), line('Works as JSON', '/api/works'), line('Countries as JSON', '/api/countries'), line('RSS feed', '/feed.xml'), line('Sitemap', '/sitemap.xml'), '',
    '## Latest stories', ...cat.stories.slice(0, 30).map((s) => line(s.title, `/story/${s.slug}`, `${s.countryRecord.name}, ${s.date || s.year}`)), '',
    ...(LESSONS.length ? ['## Lessons', ...LESSONS.map((l) => line(l.title, `/learn/${l.id}`, `${l.track}, ${l.minutes} min`)), ''] : []),
    ...(POSTS.length ? ['## Writing', ...POSTS.map((p) => line(p.title, `/writing/${p.slug}`, p.date)), ''] : []),
    ...(store && apps.length ? ['## Apps', ...apps.filter((a) => a.slug).slice(0, 30).map((a) => line(a.name, `/apps/${a.slug}`, [a.maker_name, a.description].filter(Boolean).join(': ').slice(0, 200))), ''] : []),
    ...(k.jobs.length ? ['## Jobs that show the pay', ...k.jobs.slice(0, 20).map((o) => `- [${o.title}](${o.url}): ${o.organiser}, ${payText(o.pay)}, checked ${o.checkedOn}`), ''] : []),
    ...(k.bounties.length ? ['## Open bounties', ...k.bounties.slice(0, 20).map((b) => line(b.title, `/bounties/${b.id}`, `${b.sponsor}, ${rewardText(b.reward)}${b.deadline ? `, due ${b.deadline}` : ''}`)), ''] : []),
    ...(cohortsConfig() ? [`## ${cohortsConfig().title}`, ...cohortsConfig().items.map((i) => line(i.name, `/cohorts#${i.id}`, [i.for.replace(/\.$/, ''), i.starts ? `starts ${i.starts}` : 'start date to be announced', !cohortsConfig().booking ? 'register interest' : i.eventbrite ? 'booking open' : 'booking opens soon'].filter(Boolean).join(', '))), ''] : []),
    ...(challengeConfig() ? [`## ${challengeConfig().title}`, ...challengeConfig().days.map((d) => line(`Day ${d.n}: ${d.title}`, `/challenge#day-${d.n}`, `${d.build.replace(/\.$/, '')}${d.free ? ', open to everyone' : challengeConfig().booking ? ', in the paid challenge' : ', opens with the first wave, register interest'}`)), ''] : []),
    ...(opportunities.length ? ['## Open opportunities', ...opportunities.slice(0, 20).map((o) => `- [${o.title}](${o.url}): ${o.organiser}${o.deadline ? `, closes ${o.deadline}` : ''}${o.remote ? ', remote' : ''}`), ''] : []),
  ].join('\n');
  return new Response(`${text}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
