/* Bounties, listing only: a sponsor posts a brief (reward, currency, skills, deadline, sponsor name and link) as a moderated
 * submission, and members say they are interested (an email on the waitlist under bounty-<id>). No money moves through this site:
 * payment is arranged with the sponsor. `payment` is the seam for escrow later (USDC on Base is being designed separately): it is
 * null on every bounty today, and a page shows PAYMENT_NOTE whenever it is null. */
import { countryByCode } from './countries.mjs';

export const PAYMENT_NOTE = 'Arranged with the sponsor for now; escrow coming.';
export const BOUNTY_LIMITS = { title: 160, sponsor: 120, summary: 1400, url: 500, skills: 6, skill: 30 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v) => DAY.test(v || '') && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** How a bounty is paid. Null for now: escrow plugs in here, and nothing else on the site handles money. */
export const paymentFor = () => null;

/** The feature id a bounty's interest list is stored under. */
export const bountyFeature = (id) => `bounty-${id}`;

/** An approved 'bounty' submission as the pages show it. */
export function bountyFromRow(row, details = {}) {
  const reward = details.reward && typeof details.reward === 'object' ? details.reward : {};
  return { id: `c-${row.id}`, kind: 'bounty', community: true, title: row.title, sponsor: row.creator || '', sponsorUrl: row.url || '', country: row.country, summary: row.summary, reward: { amount: Number(reward.amount) || 0, currency: String(reward.currency || '') }, skills: Array.isArray(details.skills) ? details.skills.map(String).slice(0, BOUNTY_LIMITS.skills) : [], deadline: row.end_date || null, payment: paymentFor(row), postedOn: String(row.reviewed_at || row.created_at || '').slice(0, 10) };
}

/** "$2,500" in the bounty's own currency. */
export function rewardText(r) {
  if (!r || !(r.amount > 0) || !/^[A-Z]{3}$/.test(r.currency || '')) return '';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: r.currency, maximumFractionDigits: Number.isInteger(r.amount) ? 0 : 2 }).format(r.amount); } catch { return ''; }
}

/** Bounties still open: no deadline, or a deadline today or later; soonest first. */
export const openBounties = (list, now = new Date()) => list.filter((b) => !b.deadline || b.deadline >= now.toISOString().slice(0, 10)).sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));

/** Skills typed as "Research, Writing, AI": trimmed, de-duplicated, each short. */
export const skillsFrom = (raw) => [...new Set(String(raw ?? '').split(/[,\n]/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean))];

/** Check a "Post a bounty" form. Returns { ok, errors, value }: a 'bounty' submission with reward, skills and payment in details. */
export function validateBounty(input, now = new Date()) {
  const errors = {};
  const t = (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
  const title = t('title', BOUNTY_LIMITS.title), sponsor = t('sponsor', BOUNTY_LIMITS.sponsor), summary = t('summary', BOUNTY_LIMITS.summary), url = t('url', BOUNTY_LIMITS.url);
  const country = countryByCode(t('country', 2));
  const amountRaw = t('reward', 20).replace(/[,\s]/g, ''), amount = /^\d+(\.\d{1,2})?$/.test(amountRaw) ? Number(amountRaw) : NaN;
  const currency = t('currency', 3).toUpperCase(), deadline = t('deadline', 10), skills = skillsFrom(input.skills);
  const email = t('submitter_email', 200).toLowerCase();
  const today = now.toISOString().slice(0, 10), limit = new Date(now.getTime() + 366 * 86400000).toISOString().slice(0, 10);
  if (title.length < 3 || title.length > BOUNTY_LIMITS.title) errors.title = `What needs doing, 3 to ${BOUNTY_LIMITS.title} characters.`;
  if (sponsor.length < 2 || sponsor.length > BOUNTY_LIMITS.sponsor) errors.sponsor = 'Who is sponsoring it.';
  try { const u = new URL(url); if (u.protocol !== 'https:') throw Error('scheme'); } catch { errors.url = 'The sponsor\'s own website, starting with https://'; }
  if (!country) errors.country = 'Choose the sponsor\'s country.';
  if (!(amount > 0) || amount > 10000000) errors.reward = 'The reward, as a number.';
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'A three-letter currency code, like USD, GBP or NGN.';
  if (!skills.length) errors.skills = 'The skills it needs, separated by commas.';
  else if (skills.length > BOUNTY_LIMITS.skills || skills.some((s) => s.length > BOUNTY_LIMITS.skill)) errors.skills = `Up to ${BOUNTY_LIMITS.skills} skills, each a word or two.`;
  if (!realDay(deadline)) errors.deadline = 'The day work is due.';
  else if (deadline < today) errors.deadline = 'That day has passed.';
  else if (deadline > limit) errors.deadline = 'Within the next year, please.';
  if (summary.length < 40) errors.summary = 'The brief: what to make, what good looks like. At least 40 characters.';
  if (summary.length > BOUNTY_LIMITS.summary) errors.summary = `Keep it under ${BOUNTY_LIMITS.summary} characters.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.submitter_email = 'Your email, so we can check the brief with you. It is never shown.';
  if (String(input.sponsor_consent ?? '') !== 'yes') errors.sponsor_consent = 'Please confirm you can post this for the sponsor and that they will arrange payment.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { kind: 'bounty', country: country.code, city: null, lat: null, lon: null, title, creator: sponsor, medium: null, category: null, year: null, summary, url, start_date: null, end_date: deadline, prize: rewardText({ amount, currency }), remote: false, only_country: false, instagram: null, x_handle: null, tiktok: null, youtube: null, submitter_name: t('submitter_name', 120) || null, submitter_email: email, details: { reward: { amount, currency }, skills, payment: null } } };
}
