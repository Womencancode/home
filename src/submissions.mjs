/* The submission lane: validate what a visitor sends, slow down floods, store it as pending, and let a moderator approve or decline.
 * The rules a submission has to meet are the ones on /guidelines: about a real person or work, something that went right, no hate. */
import { PACK } from './site.mjs';
import { countryByCode } from './countries.mjs';
import { CATEGORIES, MEDIA } from './content.mjs';
import { KINDS, CAREER_KINDS } from './store.mjs';
import { accessToken, verifyAccessJwt } from './access.mjs';
import { geocode } from './places.mjs';
import { KINDS as EVENT_KINDS } from './events.mjs';
import { handle, NETWORKS } from './social.mjs';
import { FIELDS, TYPES } from './opportunities.mjs';
import { TOPICS } from './speakers.mjs';

export const LIMITS = { title: 160, creator: 160, summary: 1400, name: 120, email: 200, url: 500, city: 80, perHour: 5 };
/** Form field per network; X is stored as x_handle because x alone is a poor column name. */
export const SOCIAL_FIELDS = { instagram: 'instagram', x: 'x_handle', tiktok: 'tiktok', youtube: 'youtube' };

/** Validate a form or JSON body. Returns { ok, errors, value } where value is the row to insert (without ip_hash and created_at). */
export function validate(input, now = new Date()) {
  const errors = {};
  const text = (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
  const kind = text('kind', 20);
  const country = countryByCode(text('country', 2));
  const title = text('title', LIMITS.title);
  const creator = text('creator', LIMITS.creator);
  const summary = text('summary', LIMITS.summary);
  const url = text('url', LIMITS.url);
  const kindRaw = String(input.kind ?? '').trim();
  const medium = text(kindRaw === 'opportunity' ? 'opp_field' : kindRaw === 'speaker' ? 'speaker_topic' : 'medium', 40).toLowerCase();
  const category = text(kindRaw === 'opportunity' ? 'opp_type' : 'category', 40).toLowerCase();
  const yearRaw = text('year', 6);
  const submitter_name = text('submitter_name', LIMITS.name);
  const submitter_email = text('submitter_email', LIMITS.email);
  const cityRaw = text('city', LIMITS.city);
  const socials = {};
  for (const [network, field] of Object.entries(SOCIAL_FIELDS)) {
    const raw = text(field, 120);
    if (!raw) continue;
    const h = handle(network, raw);
    if (h) socials[field] = h; else errors[field] = `That does not look like ${network === 'instagram' ? 'an' : 'a'} ${NETWORKS[network].label} handle. Type it as @name.`;
  }
  if (!KINDS.includes(kind) || CAREER_KINDS.includes(kind)) errors.kind = 'Choose what you are sending.';
  if (!country) errors.country = 'Choose a country.';
  if (title.length < 3 || title.length > LIMITS.title) errors.title = `A title between 3 and ${LIMITS.title} characters.`;
  if (summary.length < 40) errors.summary = 'Tell us a little more: at least 40 characters.';
  if (summary.length > LIMITS.summary) errors.summary = `Keep it under ${LIMITS.summary} characters.`;
  if ((kind === 'work' || kind === 'talent') && creator.length < 2) errors.creator = 'Who made it, or who is it?';
  if (kind === 'work' && !MEDIA.includes(medium)) errors.medium = 'Pick the kind of work.';
  if (kind === 'story' && category && !CATEGORIES.includes(category)) errors.category = 'Pick a category from the list.';
  let year = null;
  if (yearRaw) {
    year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 1000 || year > now.getUTCFullYear() + 1) errors.year = 'A four-digit year.';
  }
  if (url) {
    try { const u = new URL(url); if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('scheme'); } catch { errors.url = 'A full web address starting with https://'; }
  }
  if (submitter_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitter_email)) errors.submitter_email = 'That email address does not look right.';
  if (String(input.consent ?? '') !== 'yes') errors.consent = 'Please confirm the guidelines.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  const startRaw = text('start_date', 10), endRaw = text(kindRaw === 'opportunity' ? 'opp_deadline' : 'end_date', 10);
  let start_date = null, end_date = null;
  if (kind === 'event') {
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null);
    const todayIso = now.toISOString().slice(0, 10);
    const limit = new Date(now.getTime() + 3 * 366 * 86400000).toISOString().slice(0, 10);
    start_date = day(startRaw);
    end_date = endRaw ? day(endRaw) : start_date;
    if (!start_date) errors.start_date = 'The date it starts.';
    else if (start_date < todayIso) errors.start_date = 'That date has passed. Events here are ones still to come.';
    else if (start_date > limit) errors.start_date = 'Within the next three years, please.';
    if (start_date && (!end_date || end_date < start_date)) errors.end_date = 'The end is on or after the start.';
    else if (start_date && end_date && (Date.parse(end_date) - Date.parse(start_date)) / 86400000 > 62) errors.end_date = 'Two months at most. For a season, give its main days.';
    if (category && !EVENT_KINDS.includes(category)) errors.category = 'Pick a kind of event from the list.';
  }
  let prize = null, remote = false, only_country = false;
  if (kind === 'opportunity') {
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null);
    const todayIso = now.toISOString().slice(0, 10);
    end_date = endRaw ? day(endRaw) : null;
    if (endRaw && !end_date) errors.end_date = 'The closing date, or leave it blank if it is rolling.';
    else if (end_date && end_date < todayIso) errors.end_date = 'That date has passed. Opportunities here are ones still open.';
    if (!TYPES.includes(category)) errors.category = 'Pick what kind of opportunity it is.';
    if (!FIELDS.includes(medium)) errors.medium = 'Pick the field it is for.';
    if (!url) errors.url = 'The organiser\'s page, where people enter or apply.';
    prize = text('prize', 120).slice(0, 120) || null;
    remote = String(input.remote ?? '') === 'yes';
    only_country = String(input.only_country ?? '') === 'yes';
  }
  if (kind === 'speaker') {
    if (creator.length < 2) errors.creator = 'Where they work, or the group they lead.';
    if (!TOPICS.includes(medium)) errors.medium = 'Pick the topic they speak about.';
    if (!url) errors.url = 'A public page about them: a profile, an article or their own site.';
    if (String(input.speaker_consent ?? '') !== 'yes') errors.speaker_consent = 'Only list yourself, or someone who agreed to be listed.';
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(`${title} ${creator} ${summary}`)) errors.summary = 'No email addresses, please. People find speakers through the public page.';
  }
  if (cityRaw.length > LIMITS.city) errors.city = `A city name under ${LIMITS.city} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  const place = geocode(country.code, cityRaw);
  return { ok: true, errors, value: { kind, country: country.code, ...place, instagram: socials.instagram || null, x_handle: socials.x_handle || null, tiktok: socials.tiktok || null, youtube: socials.youtube || null, title, creator: creator || null, medium: kind === 'work' || kind === 'talent' || kind === 'opportunity' || kind === 'speaker' ? medium || null : null, category: kind === 'story' ? category || 'community' : kind === 'event' ? category || 'community' : kind === 'opportunity' ? category : null, prize, remote, only_country, start_date, end_date, year: kind === 'event' && start_date ? Number(start_date.slice(0, 4)) : year, summary, url: url || null, submitter_name: submitter_name || null, submitter_email: submitter_email || null } };
}

/** A one-way hash of the visitor's address with a per-deployment salt, so rate limiting never stores an IP. */
export async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const salt = (env && env.RATE_SALT) || PACK.id;
  const bytes = new TextEncoder().encode(`${salt}:${ip.split(',')[0].trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Verify a Turnstile token when the secret is configured; without one, every request passes (local and staging). */
export async function humanCheck(input, env, request) {
  if (!env || !env.TURNSTILE_SECRET) return true;
  const token = String(input['cf-turnstile-response'] || input.turnstile || '');
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('cf-connecting-ip') || '' });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  return !!j.success;
}

/** Read a request body as a flat object, from a form post or JSON. */
export async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) { const j = await request.json().catch(() => ({})); return j && typeof j === 'object' ? j : {}; }
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : ''])) : {};
}

/** Take a submission: validate, rate limit, store. Returns { status, body } for the caller to render as HTML or JSON. */
export const accept = (request, env, store, now = new Date()) => acceptWith(request, env, store, validate, now);

/** The same lane for any form's own validator, `check(input, now)` returning { ok, errors, value }: honeypot, human check, five an
 * hour per address, stored as pending for a moderator. The career forms (jobs, mentors, bounties, profiles) all come through here. */
export async function acceptWith(request, env, store, check, now = new Date()) {
  const input = await readBody(request);
  const checked = check(input, now);
  if (!checked.ok) {
    if (checked.errors.website) return { status: 200, body: { ok: true, id: null, input, silent: true } };
    return { status: 400, body: { ok: false, errors: checked.errors, input } };
  }
  if (!(await humanCheck(input, env, request))) return { status: 400, body: { ok: false, errors: { turnstile: 'Please complete the human check.' }, input } };
  const hash = await ipHash(request, env);
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  if ((await store.recentCount(hash, since)) >= LIMITS.perHour) return { status: 429, body: { ok: false, errors: { rate: 'That is plenty for one hour. Thank you! Please come back later for the rest.' }, input } };
  const id = await store.insert({ ...checked.value, ip_hash: hash, created_at: now.toISOString() });
  return { status: 201, body: { ok: true, id, input } };
}

/** Is this request allowed into /admin? Two doors:
 *  - a bearer token or admin cookie matching ADMIN_TOKEN;
 *  - a Cloudflare Access identity, when ACCESS_TEAM_DOMAIN and ACCESS_AUD are set: the request's Access JWT must verify against the
 *    team's keys for this application's audience, and, when ADMIN_EMAILS is set, its email must be listed. A bare identity header is
 *    never enough, because a request that did not pass through Access can carry any header.
 *  With neither configured, admin is closed. */
export async function isAdmin(request, env, options = {}) {
  const token = env && env.ADMIN_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization') || '';
    if (auth === `Bearer ${token}`) return true;
    const cookie = request.headers.get('cookie') || '';
    const m = new RegExp(`(?:^|;\\s*)${PACK.id}_admin=([^;]+)`).exec(cookie);
    if (m && safeEqual(decodeURIComponent(m[1]), token)) return true;
  }
  if (env && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const jwt = accessToken(request);
    const claims = jwt ? await verifyAccessJwt(jwt, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, fetcher: options.fetcher, now: options.now }) : null;
    if (!claims) return false;
    const emails = String(env.ADMIN_EMAILS || '').split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const who = String(claims.email || '').toLowerCase();
    return emails.length ? !!(who && emails.includes(who)) : true;
  }
  return false;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
