/* The career side's routes, hub, home blocks and owner views. Every route answers 404 unless the pack switches its feature on
 * (careers.mjs). Forms go through the moderated submission lane (acceptWith); room and bounty interest go on the waitlist. */
import { PACK } from '../site.mjs';
import { SITE, esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { notFoundPage } from './about.mjs';
import { acceptWith } from '../submissions.mjs';
import { joinWaitlist } from '../waitlist.mjs';
import { careersConfig, careerOn, careersOn } from '../careers.mjs';
import { OPPORTUNITIES } from '../opportunities.mjs';
import { validateJob } from '../jobs.mjs';
import { MENTORS, validMentor, validateMentorOffer, validateMatchRequest } from '../mentors.mjs';
import { roomsWithState, roomFeature, OPEN_SETTING } from '../rooms.mjs';
import { openBounties, bountyFeature, validateBounty } from '../bounties.mjs';
import { profilesOf, validateProfile } from '../profiles.mjs';
import { jobsPage, postJobPage, jobsRail } from './jobs.mjs';
import { mentorsPage, mentorCard, requestMatchPage, offerMentorPage } from './mentors.mjs';
import { roomsPage, roomPage, roomCard } from './rooms.mjs';
import { bountiesPage, bountyPage, postBountyPage, bountyCard } from './bounties.mjs';
import { profilePage, addProfilePage } from './profiles.mjs';

const PRIVATE = { 'cache-control': 'no-store' };
const redirect = (to) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store' } });

/** Seed mentors that pass every check (opted in, a public page, no email) plus approved offers. */
export const mentorsFrom = (cat) => [...MENTORS.filter(validMentor), ...((cat && cat.mentors) || [])];
/** Every opportunity the job board reads: the pack's and the approved ones. */
export const jobItems = (cat) => [...OPPORTUNITIES, ...((cat && cat.opportunities) || [])];
/** Rooms with the owner's saved open or closed choice applied; a storage failure means the pack's own setting. */
export async function roomsNow(store, pack = PACK) {
  let saved = null;
  try { saved = store.getSetting ? await store.getSetting(OPEN_SETTING) : null; } catch { saved = null; }
  return roomsWithState(saved, pack);
}

/** /careers: one door to every career feature the pack has on. */
export function careersHub(pack = PACK) {
  const c = careersConfig(pack);
  const card = (href, title, text) => `<a class="lesson-card" href="${href}"><b>${esc(title)}</b><small>${esc(text)}</small><span class="more">Go</span></a>`;
  const cards = [
    c.jobs && card('/jobs', 'Jobs that show the pay', 'Real pay bands, the employer\'s own posting, checked by a person.'),
    c.mentors && card('/mentors', 'Mentors', 'Ask for a match with someone who has done it, or offer to mentor.'),
    c.rooms && card('/rooms', 'Rooms', 'Private rooms by discipline. Ask to join one.'),
    c.bounties && card('/bounties', 'Bounties', 'Paid briefs from sponsors, with the reward and skills on each.'),
    c.profiles && card('/talent/add', 'Proof of work', 'A page for what you have made, with links people can check.'),
  ].filter(Boolean).join('');
  const body = `<section class="page-head"><p class="eyebrow">${esc(c.title)}</p><h1>Your next move, <em>in good company</em></h1><p class="lead">${esc(c.lead || `Jobs, mentors and paid work, shared by ${SITE.name}. Everything here is real and checked by a person.`)}</p></section><section class="section"><div class="lesson-grid">${cards}</div></section>`;
  return layout({ title: c.title, description: `Jobs that show the pay, mentors, rooms and paid briefs on ${SITE.name}.`, path: '/careers', body, current: '/careers' });
}

/** The two career home blocks: jobs with bounties, and mentors with rooms. Each is '' when its features are off. */
export const CAREER_BLOCKS = {
  'jobs-bounties': ({ cat, now, pack = PACK }) => {
    const jobs = careerOn('jobs', pack), bounties = careerOn('bounties', pack);
    if (!jobs && !bounties) return '';
    const b = bounties ? openBounties((cat && cat.bounties) || [], now).slice(0, 2) : [];
    const j = jobs ? jobsRail(jobItems(cat), 3, now) : '';
    return `<section class="section careers-band">${sectionHead('Work that pays', { href: jobs ? '/jobs' : '/bounties', label: jobs ? 'All jobs' : 'All bounties' }, `${jobs ? 'Jobs that show the pay, each checked on the employer\'s own posting.' : ''}${jobs && bounties ? ' ' : ''}${bounties ? 'Paid briefs from sponsors.' : ''}`, 'Careers')}
  ${jobs ? (j || '<p class="muted">No jobs are listed right now. <a href="/jobs/post">Post one with its pay</a>.</p>') : ''}
  ${bounties ? `<h3 class="careers-sub">Bounties</h3>${b.length ? `<div class="job-grid">${b.map(bountyCard).join('')}</div>` : '<p class="muted">No bounties are open right now. <a href="/bounties/post">Post a brief</a>.</p>'}` : ''}
</section>`;
  },
  'mentors-rooms': ({ cat, rooms = null, pack = PACK }) => {
    const mentorsOn = careerOn('mentors', pack), roomsOn = careerOn('rooms', pack);
    if (!mentorsOn && !roomsOn) return '';
    const m = mentorsOn ? mentorsFrom(cat).slice(0, 3) : [];
    const r = roomsOn ? (rooms || roomsWithState(null, pack)) : [];
    return `<section class="section careers-band">${sectionHead('People in your corner', { href: mentorsOn ? '/mentors' : '/rooms', label: mentorsOn ? 'Mentors' : 'All rooms' }, 'Someone who has done it, and a room of people doing it now.', 'Community')}
  ${mentorsOn ? (m.length ? `<div class="lesson-grid">${m.map(mentorCard).join('')}</div>` : '<p class="muted">We list a mentor only once they have said yes. Ask for a match and a person reads it.</p><p class="hero-actions"><a class="button primary" href="/mentors/request">Request a match</a> <a class="button ghost" href="/mentors/offer">Offer to mentor</a></p>') : ''}
  ${roomsOn ? `<h3 class="careers-sub">Rooms</h3><div class="lesson-grid">${r.map(roomCard).join('')}</div>` : ''}
</section>`;
  },
};

/** Every career route, or null for a path that is not one. `catalogue()` loads seed plus approved content; `owner()` names the
 * signed-in owner, whose own posts are published at once. `pack` and `now` are for tests. */
export async function careersRoute(request, env, store, { pack = PACK, now = new Date(), catalogue = async () => ({}), owner = async () => null } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  const nf = () => htmlResponse(notFoundPage(path), 404);
  const c = careersConfig(pack);
  const area = path === '/careers' ? 'hub' : /^\/jobs(\/|$)/.test(path) ? 'jobs' : /^\/mentors(\/|$)/.test(path) ? 'mentors' : /^\/rooms(\/|$)/.test(path) ? 'rooms' : /^\/bounties(\/|$)/.test(path) ? 'bounties' : /^\/talent\/[^/]+$/.test(path) ? 'profiles' : '';
  if (!area) return null;
  if (area === 'hub' ? !careersOn(pack) : !careerOn(area, pack)) return nf();
  if (!read && method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, POST' } });

  /* A moderated form: on success the page thanks them (or, for an owner, publishes it), otherwise it comes back with the errors. */
  const moderated = async (check, render, { publish = true } = {}) => {
    const r = await acceptWith(request, env, store, check, now);
    const who = publish && r.body.ok && r.body.id ? await owner() : null;
    if (who) await store.review(r.body.id, 'approved', `published by the owner (${who})`, now.toISOString());
    const state = r.body.ok ? { ok: true, id: r.body.id, published: !!who } : { ok: false, errors: r.body.errors, input: r.body.input };
    return htmlResponse(render(state), r.body.ok ? 200 : r.status, PRIVATE);
  };
  /* Interest on a list (a room or a bounty), stored on the waitlist under its own feature id. */
  const interest = async (feature, render) => {
    const r = await joinWaitlist(request, env, store, { pack, now, allow: [feature] });
    return htmlResponse(render(r.body.ok ? { sent: true } : { form: r.body }), r.body.ok ? 200 : r.status, PRIVATE);
  };

  if (area === 'hub') return read ? htmlResponse(careersHub(pack)) : nf();

  if (area === 'jobs') {
    if (path === '/jobs') return read ? htmlResponse(jobsPage(url.searchParams, jobItems(await catalogue()), now)) : nf();
    if (path === '/jobs/post') return read ? htmlResponse(postJobPage({}, env)) : moderated(validateJob, (s) => postJobPage(s, env));
    return nf();
  }
  if (area === 'mentors') {
    const focusList = c.mentors.focus;
    if (path === '/mentors') return read ? htmlResponse(mentorsPage(url.searchParams, mentorsFrom(await catalogue()), focusList)) : nf();
    if (path === '/mentors/offer') return read ? htmlResponse(offerMentorPage({}, env, { focusList })) : moderated((input) => validateMentorOffer(input, { focus: focusList }), (s) => offerMentorPage(s, env, { focusList }));
    if (path === '/mentors/request') {
      const mentors = mentorsFrom(await catalogue());
      const mentor = mentors.find((m) => m.id === url.searchParams.get('mentor')) || null;
      if (read) return htmlResponse(requestMatchPage({}, env, { focusList, mentor, params: url.searchParams }), 200, { ...PRIVATE, 'x-robots-tag': 'noindex' });
      return moderated((input) => validateMatchRequest(input, { focus: focusList, mentors }), (s) => requestMatchPage(s, env, { focusList }), { publish: false });
    }
    return nf();
  }
  if (area === 'rooms') {
    const rooms = await roomsNow(store, pack);
    if (path === '/rooms') return read ? htmlResponse(roomsPage(rooms)) : nf();
    const room = rooms.find((r) => path === `/rooms/${r.id}`);
    if (!room) return nf();
    return read ? htmlResponse(roomPage(room, { env })) : interest(roomFeature(room.id), (s) => roomPage(room, { ...s, env }));
  }
  if (area === 'bounties') {
    if (path === '/bounties/post') return read ? htmlResponse(postBountyPage({}, env)) : moderated(validateBounty, (s) => postBountyPage(s, env));
    const list = openBounties((await catalogue()).bounties || [], now);
    if (path === '/bounties') return read ? htmlResponse(bountiesPage(list)) : nf();
    const b = list.find((x) => path === `/bounties/${x.id}`);
    if (!b) return nf();
    return read ? htmlResponse(bountyPage(b, { env })) : interest(bountyFeature(b.id), (s) => bountyPage(b, { ...s, env }));
  }
  /* profiles */
  if (path === '/talent/add') return read ? htmlResponse(addProfilePage({}, env)) : moderated(validateProfile, (s) => addProfilePage(s, env));
  if (!read) return nf();
  const p = profilesOf(await catalogue()).find((x) => path === `/talent/${x.slug}`);
  return p ? htmlResponse(profilePage(p)) : nf();
}

/** The owner's room list: each room's state with a switch. Request counts are for the owner only and never shown publicly. */
export function adminRoomsPage(rooms, counts = {}, message = '') {
  const rows = rooms.map((r) => `<li class="card"><p class="card-kicker">${r.open ? 'Open' : 'Opening soon'} · ${counts[roomFeature(r.id)] || 0} asked to join</p><h3><a href="/rooms/${esc(r.id)}">${esc(r.name)}</a></h3><form method="post" action="/admin/rooms"><input type="hidden" name="id" value="${esc(r.id)}"><button class="button small${r.open ? ' ghost' : ' primary'}" name="open" value="${r.open ? '0' : '1'}">${r.open ? 'Mark as opening soon' : 'Open this room'}</button></form></li>`).join('');
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Moderation</a></p><h1>Rooms</h1><p class="lead">Open a room when it is ready. People who asked to join are on the <a href="/admin/waitlist">waitlist</a>, under the room's name, with a CSV to email them.</p>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}</section><section class="section"><ul class="waitlist-lines">${rows}</ul></section>`;
  return layout({ title: 'Rooms', path: '/admin/rooms', body, noindex: true });
}

/** /admin/rooms (GET, POST) and /admin/verify (POST). `who` is the signed-in owner or 'token'; null means sign in first. */
export async function adminCareersRoute(request, who, store, { pack = PACK, now = new Date() } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/admin/rooms' && path !== '/admin/verify') return null;
  if (path === '/admin/rooms' ? !careerOn('rooms', pack) : !careerOn('profiles', pack)) return htmlResponse(notFoundPage(path), 404);
  const method = request.method.toUpperCase();
  if (!who) return method === 'GET' || method === 'HEAD' ? redirect('/admin/login') : new Response('Sign in first', { status: 401, headers: PRIVATE });
  const by = typeof who === 'string' ? who : 'owner';
  if (path === '/admin/verify') {
    if (method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST', ...PRIVATE } });
    const form = await request.formData().catch(() => null);
    const id = Number(form && form.get('id')), on = String((form && form.get('verified')) || '') === '1';
    const row = id ? await store.get(id) : null;
    if (!row || row.kind !== 'talent') return redirect(`/admin?status=approved&m=${encodeURIComponent(`#${id} is not a person's profile`)}`);
    await store.setVerified(id, on, by, now.toISOString());
    return redirect(`/admin?status=${row.status}&m=${encodeURIComponent(`#${id} ${on ? 'verified' : 'no longer verified'}`)}`);
  }
  if (method === 'POST') {
    const form = await request.formData().catch(() => null);
    const id = String((form && form.get('id')) || ''), open = String((form && form.get('open')) || '') === '1';
    const rooms = await roomsNow(store, pack);
    if (!rooms.some((r) => r.id === id)) return redirect('/admin/rooms?m=That+room+was+not+found.');
    const saved = Object.fromEntries(rooms.map((r) => [r.id, r.open]));
    saved[id] = open;
    await store.setSetting(OPEN_SETTING, saved, by);
    return redirect(`/admin/rooms?m=${encodeURIComponent(`${rooms.find((r) => r.id === id).name} is ${open ? 'open' : 'marked as opening soon'}.`)}`);
  }
  let counts = {};
  try { counts = await store.waitlistCounts(); } catch { counts = {}; }
  return htmlResponse(adminRoomsPage(await roomsNow(store, pack), counts, url.searchParams.get('m') || ''), 200, { ...PRIVATE, 'x-robots-tag': 'noindex' });
}
