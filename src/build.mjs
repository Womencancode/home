/* Pack file, no engine change: the Women Can Code home page. "Describe what you want to build" (a GET form answered on the server,
 * then live in the browser by /wcc-build.js with the same table: no AI is called, it is plain keyword matching to example project
 * types), the instructor, the example builds, Wave 1, the honest tools panel, the go deeper shelf, the free end product and the
 * "level up" extras. Data: site.json "school", "reward", "levelUps" and "cohorts". */
import { PACK } from './site.mjs';
import { esc, sectionHead } from './html.mjs';
import { cohortsConfig, longDate } from './cohorts.mjs';
import { challengeConfig, freeLine } from './challenge.mjs';
import { TRACKS, SCHOOL, httpsUrl, instructorHtml } from './tracks.mjs';
import { interestLink, cohortKey, registerInterest } from './interest.mjs';

/* The free product at the end is its own thing people can register interest in. */
export const FREE_PRODUCT_KEY = 'free-product';
registerInterest((pack) => (pack.reward ? [{ id: FREE_PRODUCT_KEY, label: pack.reward.title || 'The free product at the end' }] : []));

const TBA = 'To be announced';
const TBC = 'Terms to be confirmed';

/** Example project types. Each says, for the days it touches, what that day would build for this kind of project. */
export const PROJECTS = [
  { id: 'booking', label: 'a booking page', words: ['book', 'booking', 'appointment', 'salon', 'nail', 'hair', 'barber', 'lesson', 'tutor', 'slot', 'session', 'reserve', 'reservation', 'clinic', 'massage', 'therapy', 'class', 'classes'],
    days: { 1: 'A page with your services, your hours and how to reach you, live.', 3: 'A booking request form that saves every request.', 6: 'Tried by a real customer, and changed from what they said.', 7: 'An email to say a request came in, or a payment link for a deposit.', 8: 'Customer names and numbers kept private and out of your code.', 10: 'Live on your own domain.' } },
  { id: 'shop', label: 'a small shop', words: ['shop', 'sell', 'selling', 'store', 'product', 'products', 'order', 'orders', 'cake', 'cakes', 'bake', 'baking', 'jewellery', 'jewelry', 'craft', 'crafts', 'market', 'candle', 'candles', 'clothes'],
    days: { 1: 'A page that shows what you sell, live.', 3: 'An order form that saves every order.', 6: 'Tried by a real customer, and changed from what they said.', 7: 'A payment link for each product.', 8: 'Order details kept private, and a limit on what anything can charge you.', 10: 'Live on your own domain.' } },
  { id: 'portfolio', label: 'a portfolio', words: ['portfolio', 'cv', 'resume', 'showcase', 'photography', 'photos', 'art', 'artist', 'design', 'designer', 'writer', 'writing', 'illustration', 'work'],
    days: { 1: 'A page with your name, what you do and one piece of work, live.', 2: 'Your own words, colours and layout, changed by hand.', 3: 'A contact form that saves every message.', 9: 'Pictures with alt text, readable on any phone.', 10: 'Live on your own domain, ready to send.' } },
  { id: 'waitlist', label: 'a waitlist', words: ['waitlist', 'waiting', 'launch', 'signup', 'sign', 'newsletter', 'early', 'interest', 'preorder', 'pre-order', 'idea', 'startup', 'app'],
    days: { 1: 'A page that says what is coming, live.', 3: 'A sign-up form that saves every email address.', 7: 'An email to each person who signs up.', 8: 'A clear note on what you keep, and the addresses kept private.', 10: 'Live on your own domain.' } },
  { id: 'tracker', label: 'a tracker', words: ['track', 'tracker', 'tracking', 'habit', 'habits', 'budget', 'expense', 'expenses', 'spending', 'log', 'meal', 'meals', 'workout', 'reading', 'symptom', 'symptoms', 'medication', 'plan', 'planner', 'chores'],
    days: { 1: 'A page for the thing you want to keep track of, live.', 3: 'A form that saves each entry, and a list of what you saved.', 4: 'The bug the AI made in the totals, found and fixed.', 8: 'Your own data kept private.', 9: 'Easy to use on your phone every day.', 10: 'Live on your own domain.' } },
  { id: 'directory', label: 'a community directory', words: ['directory', 'community', 'group', 'members', 'member', 'local', 'volunteer', 'volunteers', 'club', 'network', 'parents', 'church', 'mosque', 'temple', 'charity', 'neighbours', 'list'],
    days: { 1: 'A page that says who the directory is for, live.', 3: 'A form where people add themselves, saved.', 6: 'Built with the group it is for, from what they asked.', 8: 'Nobody listed without saying yes, and an easy way to be removed.', 10: 'Live on your own domain.' } },
];
export const FALLBACK = { id: 'tool', label: 'your own small tool', days: { 1: 'A page that says what your tool is for, live.', 3: 'A form that saves what people put in.', 6: 'Tried by the person it is for.', 8: 'Data, keys and costs kept safe.', 10: 'Live on your own domain.' } };

/** The best example project type for what someone typed: the most keyword hits, first in the list on a tie; FALLBACK for none. */
export function matchProject(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/).filter(Boolean);
  let best = null, hits = 0;
  for (const p of PROJECTS) {
    const n = words.filter((w) => p.words.includes(w) || p.words.some((k) => k.length > 4 && w.startsWith(k))).length;
    if (n > hits) { best = p; hits = n; }
  }
  return best || FALLBACK;
}

const dayTitle = (n, cfg = challengeConfig()) => ((cfg && cfg.days.find((d) => d.n === n)) || {}).title || `Day ${n}`;

/** The free product at the end, as one sentence a visitor can hold us to. */
export const rewardOf = (pack = PACK) => pack.reward || {};

/** The server-rendered answer for what someone typed ('' when nothing was typed). Mirrored by /wcc-build.js. */
export function answerHtml(text) {
  const t = String(text || '').trim().slice(0, 200);
  if (!t) return '';
  const p = matchProject(t);
  const days = Object.entries(p.days).map(([n, what]) => `<li><span class="wcc-dn">Day ${n}</span><b>${esc(dayTitle(Number(n)))}</b><span>${esc(what)}</span></li>`).join('');
  return `<p class="wcc-answer-h">Closest example: <b>${esc(p.label)}</b>. Here is what your 10 days, in two 5-day levels, would build.</p><ol class="wcc-answer-days">${days}</ol><p class="wcc-answer-end"><b>It ends live, and hosted free.</b> Finish Level 2 and your tool is hosted free on Ontold, with your own domain set up for you. <a href="#free-product">${esc(TBC)}</a>.</p>`;
}

/** The table /wcc-build.js uses, so the live answer and the server answer agree. */
const projectsJson = () => JSON.stringify({ projects: PROJECTS, fallback: FALLBACK, titles: Object.fromEntries((challengeConfig() || { days: [] }).days.map((d) => [d.n, d.title])), tbc: TBC }).replace(/</g, '\\u003c');

/** Example builds: real small pages under public/examples, screenshotted. */
export const EXAMPLES = [
  { id: 'day-01-live-page', day: 1, title: 'A first live page', note: 'A one-page site for a small bakery, described to the AI and read line by line.' },
  { id: 'day-03-form-that-saves', day: 3, title: 'A form that saves', note: 'A waitlist form that keeps every sign-up and lists them.' },
  { id: 'day-05-for-someone-else', day: 6, title: 'A tool for someone else', note: 'A rota for a community choir, built from what the choir asked for.' },
  { id: 'day-10-launched', day: 10, title: 'The launched site', note: 'A booking page for a nail salon, on its own domain.' },
];

/** The two levels, each with its seal and its certificate line, for the home Wave panel. */
export function levelsHtml(ch = challengeConfig()) {
  if (!ch || !ch.levels || !ch.levels.length) return '';
  return `<ul class="wcc-wave-levels">${ch.levels.map((l, i) => `<li>${l.seal ? `<img class="ch-level-seal" src="${esc(l.seal)}" alt="" width="56" height="56" loading="lazy" decoding="async">` : ''}<div><p class="wcc-lv-k">Level ${i + 1}, days ${l.days[0]} to ${l.days[l.days.length - 1]}</p><h3><a href="/challenge#${esc(l.id)}">${esc(l.title)}</a></h3>${l.certificate ? `<p class="ch-level-cert"><b>${esc(l.certificate)}</b></p>` : ''}</div></li>`).join('')}</ul>`;
}

/** The two groups of a wave, Night Owls first, each with "Register interest"; with booking on, its Eventbrite link or "Booking opens soon". */
export function groupsHtml(c = cohortsConfig(), raw = (PACK.cohorts || {}).items || []) {
  if (!c) return '';
  const hint = (id) => ((raw.find((r) => r.id === id) || {}).scheduleHint || '');
  return `<ul class="wcc-groups">${c.items.map((g, i) => `<li class="${i === 0 ? 'is-lead' : ''}" id="group-${esc(g.id)}">${i === 0 ? '<span class="wcc-shot-tag">Headline option</span>' : ''}<h3>${esc(g.name)}</h3><p>${esc(g.for)}</p>
    <p class="wcc-g-when"><b>When:</b> ${esc(g.schedule || (hint(g.id) ? hint(g.id).replace(/^./, (m) => m.toUpperCase()) : TBA))}</p><p class="wcc-g-same">${esc(g.about)}</p>
    ${!c.booking ? `<p class="cohort-act">${interestLink(cohortKey(g.id), g.name, { label: c.copy.interest })}</p>` : g.eventbrite ? `<p><a class="button primary" href="${esc(g.eventbrite)}" rel="noopener" target="_blank">Book ${esc(g.name)} on Eventbrite</a></p>` : `<p class="cohort-act is-soon"><span class="cohort-soon">Booking opens soon</span> <a class="cohort-notify" href="${esc(c.notify)}">Tell me when it opens</a></p>`}</li>`).join('')}</ul>`;
}

export function rewardHtml(r = rewardOf(), { id = 'free-product' } = {}) {
  const hosting = r.hostingFor ? esc(r.hostingFor) : TBC;
  const domain = r.domainRegistrationIncluded === true ? 'Included' : r.domainRegistrationIncluded === false ? 'Not included: you buy the domain, we set it up' : TBC;
  return `<section class="section wcc-reward" id="${id}" aria-labelledby="${id}-h"><p class="eyebrow">The free product at the end</p><h2 id="${id}-h">${esc(r.title || 'Finish, and keep what you built, free')}</h2>
  <p class="lead">${esc(r.lead || '')}</p>
  <ul class="wcc-reward-list"><li><b>Your tool hosted free on Ontold</b><span>At a <code>yourname.ontold.site</code> address.</span></li><li><b>Your own domain, set up for you</b><span>Pointed at your tool so it lives at your own address.</span></li><li><b>${esc(r.leaderboardLabel || '')}</b><span>${httpsUrl(r.leaderboardUrl) ? `<a href="${esc(r.leaderboardUrl)}" rel="noopener">The leaderboard</a> ${esc(r.leaderboardText || '')}` : ''}</span></li></ul>
  <dl class="wcc-terms"><div><dt>Who gets it</dt><dd>${esc(r.conditions || TBC)}</dd></div><div><dt>How long free hosting lasts</dt><dd>${hosting}</dd></div><div><dt>Domain registration</dt><dd>${domain}</dd></div><div><dt>Full terms</dt><dd>${r.terms ? esc(r.terms) : TBC}</dd></div></dl>
  <p class="cohort-act">${interestLink(FREE_PRODUCT_KEY, r.title || 'the free product')}</p>
</section>`;
}

/** "Level up" extras: optional GitHub Skills exercises beyond the core days. */
export function levelUpsHtml(list = PACK.levelUps || []) {
  const ok = list.filter((l) => l && httpsUrl(l.url) && l.title);
  if (!ok.length) return '';
  return `<section class="section wcc-levelups"><p class="eyebrow">Level up, optional</p><h2>What Builders Really Use</h2><p class="lead">Extras for when a day goes well. Each is a free GitHub Skills exercise, made and run by GitHub, linked and not copied. They are not part of the core path.</p>
  <ul class="wcc-lu">${ok.map((l) => `<li><span class="wcc-dn">With day ${esc(l.day)}</span><a href="${esc(l.url)}" rel="noopener">${esc(l.title)}</a><small>${esc(l.what || '')} GitHub Skills.</small></li>`).join('')}</ul></section>`;
}

/** The GitHub Skills exercises the days follow, from the challenge itself. */
const skillsCourses = () => (challengeConfig() || { days: [] }).days.filter((d) => /^https:\/\/github\.com\/skills\//.test(d.link)).map((d) => ({ name: d.follows.replace(/^GitHub Skills, /, ''), url: d.link, day: d.n }));

export const BUILD_BLOCKS = {
  'wcc-hero': () => {
    const q = '';
    const h = SCHOOL.hero || {};
    return `<section class="wcc-hero"><div class="wcc-hero-copy"><p class="eyebrow">${esc(h.eyebrow || '')}</p><h1>${h.h1 || ''}</h1><p class="lead">${esc(h.lead || '')}</p>${h.lead2 ? `<p class="wcc-hero-more">${esc(h.lead2)}</p>` : ''}
  <p class="wcc-hero-facts"><span><b>Try it</b> Day 1 now</span><span><b>10 days</b> in two 5-day levels</span><span><b>Live</b> with the founder</span></p></div>
  <form class="wcc-ask" method="get" action="/#build" id="build" role="search" aria-label="Describe what you want to build">
    <label for="wcc-q">Describe what you want to build</label>
    <div class="wcc-ask-row"><input id="wcc-q" name="build" type="text" maxlength="200" autocomplete="off" placeholder="For example: a booking page for my nail salon" value="${esc(q)}"><button class="button primary" type="submit">Show me</button></div>
    <p class="wcc-ask-note">No AI is called here. We match your words to example projects: booking page, shop, portfolio, waitlist, tracker, community directory.</p>
    <div class="wcc-answer" id="wcc-answer" aria-live="polite">${answerHtml(q)}</div>
    <script type="application/json" id="wcc-projects">${projectsJson()}</script>
  </form></section>`;
  },
  'wcc-proof': () => {
    const c = SCHOOL.community;
    if (!c) return '';
    return `<section class="section wcc-proof" id="community" aria-labelledby="proof-h"><div class="wcc-proof-head"><p class="eyebrow">${esc(c.eyebrow)}</p><h2 id="proof-h">${esc(c.h2)}</h2><p class="lead">${esc(c.lead)}</p></div>
  <ul class="wcc-proof-facts">${c.facts.map((f) => `<li><b>${esc(f.n)}</b><span>${esc(f.label)}</span></li>`).join('')}</ul>
  <div class="wcc-proof-body"><div><h3>${esc(c.eventsTitle)}</h3><ul class="wcc-proof-events">${c.events.map((e) => `<li><b>${esc(e.title)}</b><span>${esc(e.when)}</span></li>`).join('')}</ul></div>
  <div><h3>${esc(c.ruleTitle)}</h3><p>${esc(c.rule)}</p><p class="wcc-proof-back"><b>${esc(c.back)}</b></p><p><a class="button ghost" href="${esc(c.url)}" rel="noopener">${esc(c.linkLabel)}</a></p><p class="wcc-proof-src">${esc(c.source)}</p></div></div></section>`;
  },
  'wcc-coders': () => {
    const w = SCHOOL.coders;
    if (!w || !w.people || !w.people.length) return '';
    return `<section class="section wcc-coders" id="${esc(w.id || 'coders')}" aria-label="${esc(w.h2)}">${sectionHead(w.h2, null, w.lead, w.eyebrow)}
  <ul class="wcc-coders-strip">${w.people.map((p) => `<li><figure><img src="${esc(p.photo)}" alt="Portrait of ${esc(p.name)}" width="240" height="300" loading="lazy" decoding="async"><figcaption><b>${esc(p.name)}</b><span>${esc(p.built)} <a href="${esc(p.source)}" rel="noopener">Source</a></span><small>Photo: <a href="${esc(p.credit.url)}" rel="noopener">${esc(p.credit.by)}</a>, ${esc(p.credit.licence)}, via Wikimedia Commons</small></figcaption></figure></li>`).join('')}</ul></section>`;
  },
  'wcc-skills': () => `<section class="section wcc-skillset">${sectionHead('The Skill Is Not Memorising Syntax', null, 'It is these five things, on something you actually need.', 'What you learn')}
  <ol class="wcc-five">${(SCHOOL.skills || []).map((s, i) => `<li><span class="wcc-dn">${i + 1}</span><b>${esc(s.title)}</b><span>${esc(s.text)}</span></li>`).join('')}</ol>
  ${SCHOOL.differs ? `<p class="wcc-differs">${SCHOOL.differs}</p>` : ''}</section>`,
  'wcc-instructor': () => `<section class="section wcc-instructor-band" aria-label="Your instructor">${instructorHtml()}</section>`,
  'wcc-built': () => `<section class="section wcc-built">${sectionHead("What You'll Have Built", { href: '/challenge', label: 'See all 10 days' }, 'These are examples we made to show what a learner builds at each stage. When there is real learner work, it replaces them.', 'Learners\' work, examples')}
  <ul class="wcc-shots">${EXAMPLES.map((e) => `<li><a href="/examples/${e.id}.html"><span class="wcc-shot-tag">Example · Day ${e.day}</span><img src="/examples/shots/${e.id}.png" alt="Screenshot of an example page: ${esc(e.note)}" width="720" height="450" loading="lazy"><b>${esc(e.title)}</b><small>${esc(e.note)}</small></a></li>`).join('')}</ul></section>`,
  'wcc-wave': () => {
    const c = cohortsConfig(), ch = challengeConfig(), w = c && c.items[0];
    const starts = w && w.starts ? longDate(w.starts) : TBA;
    return `<section class="section wcc-wave" id="wave-1" aria-labelledby="wave-h"><div class="wcc-wave-main"><p class="eyebrow">${esc((ch && ch.wave) || 'Wave 1')}</p><h2 id="wave-h">${esc((ch && ch.wave) || 'Wave 1')}</h2>
  <dl class="wcc-wave-facts"><div><dt>Day 1</dt><dd>Try it, open now</dd></div><div><dt>Starts</dt><dd>${esc(starts)}</dd></div><div><dt>Seats</dt><dd>${w && w.seats ? esc(w.seats) : TBA}</dd></div><div><dt>Days 2 to 10</dt><dd>${c && c.booking ? `${esc(c.price)}, live calls with your instructor, paid securely through Eventbrite` : 'Live calls with your instructor, opening with the first wave'}</dd></div></dl>
  ${levelsHtml(ch)}
  <p class="wcc-choose">Choose your group:</p>${groupsHtml(c)}
  <p class="hero-actions"><a class="button primary" href="/challenge#day-1">Start day 1</a> <a class="button ghost" href="/cohorts">Wave 1 details</a></p></div>
  <div class="wcc-wave-gift"><p class="eyebrow">At the end</p><p><b>Your tool hosted free on Ontold, your own domain set up, and a leaderboard listing.</b></p><p><a href="#free-product">${TBC}</a></p></div></section>
${rewardHtml()}`;
  },
  'wcc-tools': () => `<section class="section wcc-tools">${sectionHead('What You Need, Honestly', null, null, 'Tools')}
  <div class="wcc-tools-grid"><div><h3>Free, and needed</h3><ul><li><b>A free GitHub account.</b> GitHub Skills exercises run in your own copy of the repo, with GitHub Actions checking each step.</li><li><b>GitHub Pages</b> for going live. GitHub says: "GitHub Pages is available in public repositories with GitHub Free and GitHub Free for organizations" (<a href="https://docs.github.com/en/pages/quickstart" rel="noopener">Quickstart for GitHub Pages</a>).</li><li><b>A browser.</b> GitHub recommends a public repository for the exercises, since private ones use Actions minutes.</li></ul></div>
  <div><h3>Optional, and paid</h3><ul><li><b>An AI subscription</b> such as Claude, ChatGPT or Cursor, if you want one. Check each provider's own page for its plans.</li><li><b>GitHub Copilot</b> is the AI pair programmer the GitHub Skills Copilot exercises use. Check <a href="https://github.com/features/copilot" rel="noopener">GitHub's Copilot page</a> for what each plan includes.</li><li><b>No API billing needed.</b> You never have to put a card on an API account to do the 10 days.</li></ul></div></div></section>`,
  'wcc-deeper': () => {
    const gh = skillsCourses();
    const others = TRACKS.filter((t) => t.course.provider !== 'GitHub Skills');
    return `<section class="section wcc-deeper">${sectionHead('Go Deeper', { href: '/tracks', label: 'The whole shelf' }, 'Free courses made and run by other people. We link to them, credit them and never copy them, and none of them endorses us.', 'Free courses')}
  <div class="wcc-shelf"><div class="wcc-shelf-first"><h3><a href="https://learn.github.com/skills" rel="noopener">GitHub Skills</a> <small>by GitHub</small></h3><p>Interactive exercises in your own GitHub repo, checked by GitHub Actions. The 10 days follow these:</p>
  <ul>${gh.map((g) => `<li><a href="${esc(g.url)}" rel="noopener">${esc(g.name)}</a> <small>Day ${g.day}</small></li>`).join('')}</ul></div>
  <ul class="wcc-shelf-rest">${others.map((t) => `<li><a href="${esc(t.course.url)}" rel="noopener">${esc(t.course.name)}</a><small>${esc(t.course.provider)} · <a href="/tracks/${esc(t.id)}">our notes</a></small></li>`).join('')}</ul></div></section>`;
  },
  'wcc-cta': () => {
    const ch = challengeConfig();
    return `<section class="cta-band wcc-cta"><h2>Start With One Live Page, Today.</h2><p>${ch ? esc(freeLine(ch)) : ''} You need a free GitHub account and about 30 minutes.</p><p class="hero-actions"><a class="button primary" href="/challenge#day-1">Start day 1</a> <a class="button ghost" href="#build">Describe your idea</a></p></section>`;
  },
};
