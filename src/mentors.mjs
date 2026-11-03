/* Mentors: an opt-in directory of people who said yes to being listed, by focus area, plus private requests for a match. Data:
 * data/mentors.json (engine default [], and it stays empty unless every person in it opted in) plus approved 'mentor' submissions.
 * A 'mentee' submission is a request for a match: it is read by the owner in /admin and never shown on any public page. */
import { countryByCode } from './countries.mjs';
import { geocode } from './places.mjs';
import { FOCUS, FOCUS_LABEL } from './careers.mjs';
import list from '../data/mentors.json' with { type: 'json' };

export const MENTORS = list;
export const MENTOR_LIMITS = { name: 120, role: 160, about: 1000, answer: 600, url: 500, email: 200 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const read = (input) => (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
/* A form sends each box as focus_<id>=yes (a flat form body keeps one value per name); JSON may send focus as a list or a string. */
const focusOf = (input, allowed) => { const raw = input.focus; const all = [...(Array.isArray(raw) ? raw : String(raw ?? '').split(',')), ...allowed.filter((f) => String(input[`focus_${f}`] ?? '') === 'yes')].map((x) => String(x).trim()); return allowed.filter((f) => all.includes(f)); };
const httpsOk = (url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

/** A well formed mentor record: id, name, at least one known focus, a country, an https page, and no email anywhere in it. */
export function validMentor(m) {
  return !!m && /^[a-z0-9-]{2,80}$/.test(m.id || '') && typeof m.name === 'string' && m.name.length > 1 && Array.isArray(m.focus) && m.focus.length > 0 && m.focus.every((f) => FOCUS.includes(f))
    && /^[A-Z]{2}$/.test(m.country || '') && /^https:\/\//.test(m.url || '') && m.optedIn === true && !EMAILISH.test(JSON.stringify(m));
}

/** Seed plus approved mentors, filtered by focus and country. */
export const filterMentors = (all, { focus = '', country = '' } = {}) => all.filter((m) => (!focus || m.focus.includes(focus)) && (!country || m.country === country));

/** Check an "Offer to mentor" form. The focus areas go in details; the first is kept in medium for the admin queue. */
export function validateMentorOffer(input, { focus: allowed = FOCUS } = {}) {
  const t = read(input), errors = {};
  const name = t('name', MENTOR_LIMITS.name), role = t('role', MENTOR_LIMITS.role), about = t('about', MENTOR_LIMITS.about), url = t('url', MENTOR_LIMITS.url), email = t('submitter_email', MENTOR_LIMITS.email).toLowerCase();
  const country = countryByCode(t('country', 2)), focus = focusOf(input, allowed);
  if (name.length < 2 || name.length > MENTOR_LIMITS.name) errors.name = 'Your name as you would like it shown.';
  if (role.length < 2 || role.length > MENTOR_LIMITS.role) errors.role = 'What you do and where, in a line.';
  if (!country) errors.country = 'Choose where you are based.';
  if (!focus.length) errors.focus = 'Pick at least one thing you can help with.';
  else if (focus.length > 3) errors.focus = 'Three at most, so people know what you are best for.';
  if (about.length < 40) errors.about = 'A few lines on what you can help with: at least 40 characters.';
  if (about.length > MENTOR_LIMITS.about) errors.about = `Keep it under ${MENTOR_LIMITS.about} characters.`;
  if (!httpsOk(url)) errors.url = 'A public page about your work, starting with https://';
  if (!EMAIL.test(email)) errors.submitter_email = 'Your email, so we can write when someone asks for a match. It is never shown.';
  if (EMAILISH.test(`${name} ${role} ${about}`)) errors.about = 'No email addresses here, please. People reach you through us.';
  if (String(input.mentor_consent ?? '') !== 'yes') errors.mentor_consent = 'Please agree to be listed. Only people who say yes are shown.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { kind: 'mentor', country: country.code, ...geocode(country.code, t('city', 80)), title: name, creator: role, medium: focus[0], category: null, year: null, summary: about, url, start_date: null, end_date: null, prize: null, remote: false, only_country: false, instagram: null, x_handle: null, tiktok: null, youtube: null, submitter_name: name, submitter_email: email, details: { focus, optedIn: true } } };
}

/** Check a "Request a match" form: where you are, where you are going and what is in the way. Private: never rendered publicly. */
export function validateMatchRequest(input, { focus: allowed = FOCUS, mentors = [] } = {}) {
  const t = read(input), errors = {};
  const name = t('name', MENTOR_LIMITS.name), email = t('submitter_email', MENTOR_LIMITS.email).toLowerCase(), url = t('url', MENTOR_LIMITS.url);
  const now = t('now', MENTOR_LIMITS.answer), next = t('next', MENTOR_LIMITS.answer), blocker = t('blocker', MENTOR_LIMITS.answer);
  const country = countryByCode(t('country', 2)), focus = focusOf(input, allowed).slice(0, 1);
  const mentor = mentors.some((m) => m.id === t('mentor', 80)) ? t('mentor', 80) : null;
  if (name.length < 2 || name.length > MENTOR_LIMITS.name) errors.name = 'Your name.';
  if (!EMAIL.test(email)) errors.submitter_email = 'Your email, so we can write back about a match. It is never shown.';
  if (!country) errors.country = 'Choose where you are based.';
  if (!focus.length) errors.focus = 'Pick what you most want help with.';
  for (const [k, v, msg] of [['now', now, 'Where you are now'], ['next', next, 'Where you are going'], ['blocker', blocker, 'What is in the way']]) {
    if (v.length < 20) errors[k] = `${msg}: a sentence or two, at least 20 characters.`;
    else if (v.length > MENTOR_LIMITS.answer) errors[k] = `Keep it under ${MENTOR_LIMITS.answer} characters.`;
  }
  if (url && !httpsOk(url)) errors.url = 'A link starting with https://, or leave it blank.';
  if (String(input.match_consent ?? '') !== 'yes') errors.match_consent = 'Please confirm we may read this and email you about a match.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { kind: 'mentee', country: country.code, city: null, lat: null, lon: null, title: name, creator: null, medium: focus[0], category: null, year: null, summary: `Now: ${now}\nNext: ${next}\nIn the way: ${blocker}`.slice(0, 1400), url: url || null, start_date: null, end_date: null, prize: null, remote: false, only_country: false, instagram: null, x_handle: null, tiktok: null, youtube: null, submitter_name: name, submitter_email: email, details: { focus, now, next, blocker, mentor } } };
}

export { FOCUS, FOCUS_LABEL };
