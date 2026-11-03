/* Proof-of-work profiles: the talent directory, where a person can carry portfolio items (title, what you did, a link, and the
 * sponsor or bounty it was for), with a shareable page at /talent/<slug>. A profile is a 'talent' submission with the items in
 * details.portfolio, moderated like any other. The "Verified" badge shows only when an owner has marked every one of that person's
 * approved entries verified in /admin; there is no login yet, so verified means a person checked, nothing more. */
import { countryByCode } from './countries.mjs';
import { talent } from './content.mjs';
import { geocode } from './places.mjs';

export const PROFILE_LIMITS = { name: 120, headline: 160, about: 1400, item: 120, what: 400, url: 500, ref: 120, items: 6, formItems: 3 };
export const VERIFIED = 'Verified';

/** A URL slug from a person's name: lower-case letters, digits and single hyphens. */
export function personSlug(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'person';
}

const httpsOk = (url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

/** One portfolio item, cleaned, or null: { title, what, link, ref }. ref is a sponsor's name or a bounty id (c-12) and is optional. */
export function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const s = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
  const item = { title: s(x.title, PROFILE_LIMITS.item), what: s(x.what, PROFILE_LIMITS.what), link: s(x.link, PROFILE_LIMITS.url), ref: s(x.ref, PROFILE_LIMITS.ref) || null };
  return item.title.length >= 3 && item.what.length >= 10 && httpsOk(item.link) ? item : null;
}

/** Every person in the talent directory, each with a slug (unique, in directory order), their portfolio, headline and verified state. */
export function profilesOf(cat) {
  const seen = new Map();
  return talent(cat).map((p) => {
    let slug = personSlug(p.name);
    const n = (seen.get(slug) || 0) + 1; seen.set(slug, n); if (n > 1) slug = `${slug}-${n}`;
    const rows = (cat.talentRows || []).filter((t) => t.creator.trim().toLowerCase() === p.name.toLowerCase());
    const portfolio = rows.flatMap((t) => t.portfolio || []).slice(0, PROFILE_LIMITS.items * 2);
    return { ...p, slug, portfolio, headline: (rows.find((t) => t.headline) || {}).headline || '', about: (rows.find((t) => t.blurb) || {}).blurb || '', verified: rows.length > 0 && rows.every((t) => t.verified) };
  });
}

/** Check an "Add your proof of work" form: the person, a line on what they do, and up to three portfolio items (at least one). */
export function validateProfile(input) {
  const errors = {};
  const t = (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
  const name = t('name', PROFILE_LIMITS.name), headline = t('headline', PROFILE_LIMITS.headline), about = t('about', PROFILE_LIMITS.about), url = t('url', PROFILE_LIMITS.url);
  const country = countryByCode(t('country', 2));
  const items = [];
  for (let i = 1; i <= PROFILE_LIMITS.formItems; i++) {
    const raw = { title: t(`p${i}_title`, PROFILE_LIMITS.item), what: t(`p${i}_what`, PROFILE_LIMITS.what), link: t(`p${i}_link`, PROFILE_LIMITS.url), ref: t(`p${i}_ref`, PROFILE_LIMITS.ref) };
    if (!raw.title && !raw.what && !raw.link) continue;
    const item = cleanItem(raw);
    if (item) items.push(item); else errors[`p${i}`] = 'Each piece of work needs a title, a line on what you did (10 characters or more) and an https:// link.';
  }
  if (name.length < 2 || name.length > PROFILE_LIMITS.name) errors.name = 'Your name, as you would like it shown.';
  if (headline.length < 3 || headline.length > PROFILE_LIMITS.headline) errors.headline = 'What you do, in a line.';
  if (!country) errors.country = 'Choose where you are based.';
  if (about.length < 40) errors.about = 'A few lines about you and your work: at least 40 characters.';
  if (about.length > PROFILE_LIMITS.about) errors.about = `Keep it under ${PROFILE_LIMITS.about} characters.`;
  if (url && !httpsOk(url)) errors.url = 'A link starting with https://, or leave it blank.';
  if (!items.length && !Object.keys(errors).some((k) => /^p\d$/.test(k))) errors.p1 = 'Add at least one piece of work: that is the proof.';
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(`${name} ${headline} ${about}`)) errors.about = 'No email addresses here, please.';
  const email = t('submitter_email', 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.submitter_email = 'That email address does not look right.';
  if (String(input.profile_consent ?? '') !== 'yes') errors.profile_consent = 'Please confirm this is you and the work is yours to show.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { kind: 'talent', country: country.code, ...geocode(country.code, t('city', 80)), title: headline, creator: name, medium: null, category: null, year: null, summary: about, url: url || null, start_date: null, end_date: null, prize: null, remote: false, only_country: false, instagram: null, x_handle: null, tiktok: null, youtube: null, submitter_name: name, submitter_email: email || null, details: { headline, portfolio: items } } };
}

