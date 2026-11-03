/* Jobs with real pay bands: the opportunities "job" kind, extended. A job on /jobs always shows its pay. Each record carries
 * pay { min, max, currency, period }, employment (full-time, part-time, contract, fractional), workplace (remote, hybrid, onsite),
 * featured, the employer's own posting as url and the day someone checked it (checkedOn). Seed jobs live in data/opportunities.json;
 * submitted ones come through /jobs/post as 'opportunity' submissions with the band in details. */
import { countryByCode } from './countries.mjs';
import { FIELDS, JOB_FRESH_DAYS, jobFresh } from './opportunities.mjs';

export const EMPLOYMENT = ['full-time', 'part-time', 'contract', 'fractional'];
export const EMPLOYMENT_LABEL = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', fractional: 'Fractional' };
export const WORKPLACE = ['remote', 'hybrid', 'onsite'];
export const WORKPLACE_LABEL = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On site' };
export const PERIODS = ['year', 'month', 'day', 'hour'];
/** How many of each period make a year, for "pays at least": 12 months, 260 working days, 2,080 working hours. */
export const PER_YEAR = { year: 1, month: 12, day: 260, hour: 2080 };
/** A job checked longer ago than this stops being listed until someone checks it again. */
export const FRESH_DAYS = JOB_FRESH_DAYS;
export const PAY_SHOWN = 'Pay shown';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v) => DAY.test(v || '') && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const amount = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e8 && Math.round(n * 100) === n * 100;

/** A pay band anyone can read: two positive amounts, min at most max, a three-letter currency code and a period. */
export function validPay(p) {
  return !!p && typeof p === 'object' && amount(p.min) && amount(p.max) && p.min <= p.max && /^[A-Z]{3}$/.test(p.currency || '') && PERIODS.includes(p.period);
}

/** "$150,000 to $190,000 a year", in the band's own currency. */
export function payText(p) {
  if (!validPay(p)) return '';
  const whole = Number.isInteger(p.min) && Number.isInteger(p.max);
  let f;
  try { f = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency, maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }); } catch { return ''; }
  const per = { year: 'a year', month: 'a month', day: 'a day', hour: 'an hour' }[p.period];
  return p.min === p.max ? `${f.format(p.min)} ${per}` : `${f.format(p.min)} to ${f.format(p.max)} ${per}`;
}

/** The top of the band over a year, for comparing a day rate with a salary. */
export const yearlyTop = (p) => (validPay(p) ? p.max * PER_YEAR[p.period] : 0);

/** Is this record a job the board can list? A job with a readable band. */
export const isJob = (o) => !!o && o.type === 'job';
export const hasPay = (o) => isJob(o) && validPay(o.pay);

/** Checked recently enough to list: seed jobs by checkedOn, approved ones by the day a moderator approved them. */
export const fresh = (o, now = new Date()) => realDay(o.checkedOn) && jobFresh(o, now);

/** Everything wrong with a job record, for the pack test and the build: [] when it may be listed. */
export function jobProblems(o) {
  const out = [];
  if (!/^[a-z0-9-]{3,80}$/.test(o.id || '')) out.push('id');
  if (typeof o.title !== 'string' || o.title.trim().length < 3) out.push('title');
  if (typeof o.organiser !== 'string' || o.organiser.trim().length < 2) out.push('organiser (the employer)');
  if (!/^https:\/\/[^\s/]+\.[^\s/]+\//.test(o.url || '')) out.push('url (the employer\'s own posting, https)');
  if (!validPay(o.pay)) out.push('pay { min, max, currency, period }');
  if (!realDay(o.checkedOn)) out.push('checkedOn (the day the posting was checked)');
  if (!EMPLOYMENT.includes(o.employment)) out.push(`employment (${EMPLOYMENT.join(', ')})`);
  if (!WORKPLACE.includes(o.workplace)) out.push(`workplace (${WORKPLACE.join(', ')})`);
  if (!Array.isArray(o.fields) || !o.fields.length) out.push('fields');
  if (JSON.stringify(o).includes('\u2014')) out.push('em dash');
  return out;
}

/** The board's filters, cleaned from a query string: pay (at least, per year), currency, employment type and workplace. */
export function jobFilters(params) {
  const pay = Math.max(0, Math.min(10000000, Math.round(Number(String(params.get('pay') || '').replace(/[^\d.]/g, '')) || 0)));
  const currency = /^[A-Z]{3}$/.test(String(params.get('currency') || '').toUpperCase()) ? String(params.get('currency')).toUpperCase() : 'USD';
  const type = EMPLOYMENT.includes(params.get('type')) ? params.get('type') : '';
  const where = WORKPLACE.includes(params.get('where')) ? params.get('where') : '';
  return { pay, currency, type, where };
}

/** Jobs to list: with pay, checked recently, still open, matching the filters; featured first, then the most recently checked. */
export function boardJobs(items, { pay = 0, currency = 'USD', type = '', where = '' } = {}, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return items.filter((o) => hasPay(o) && fresh(o, now) && (!o.deadline || o.deadline >= today))
    .filter((o) => (!pay || (o.pay.currency === currency && yearlyTop(o.pay) >= pay)) && (!type || o.employment === type) && (!where || o.workplace === where))
    .sort((a, b) => (!!b.featured - !!a.featured) || String(b.checkedOn).localeCompare(String(a.checkedOn)) || a.title.localeCompare(b.title));
}

const LIMITS = { title: 160, employer: 120, location: 120, summary: 1400, url: 500 };

/** Check a /jobs/post form. Returns { ok, errors, value } where value is an 'opportunity' submission row with the band in details. */
export function validateJob(input, now = new Date()) {
  const errors = {};
  const t = (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
  const title = t('title', LIMITS.title), employer = t('employer', LIMITS.employer), location = t('location', LIMITS.location), summary = t('summary', LIMITS.summary), url = t('url', LIMITS.url);
  const country = countryByCode(t('country', 2));
  const num = (k) => { const s = t(k, 20).replace(/[,\s]/g, ''); return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };
  const pay = { min: num('pay_min'), max: num('pay_max'), currency: t('currency', 3).toUpperCase(), period: t('period', 5) };
  const employment = t('employment', 12), workplace = t('workplace', 8), field = t('field', 20);
  const deadline = t('deadline', 10);
  if (title.length < 3 || title.length > LIMITS.title) errors.title = `The job title, 3 to ${LIMITS.title} characters.`;
  if (employer.length < 2 || employer.length > LIMITS.employer) errors.employer = 'Who is hiring.';
  if (!country) errors.country = 'Choose the country the job is in, or the employer\'s country for a remote job.';
  if (!amount(pay.min) || !amount(pay.max)) errors.pay = 'The pay band: the lowest and highest the employer will pay.';
  else if (pay.min > pay.max) errors.pay = 'The lowest pay is above the highest. Swap them round.';
  if (!/^[A-Z]{3}$/.test(pay.currency)) errors.currency = 'A three-letter currency code, like USD, GBP, NGN or EUR.';
  if (!PERIODS.includes(pay.period)) errors.period = 'Per year, month, day or hour.';
  if (!EMPLOYMENT.includes(employment)) errors.employment = 'Full-time, part-time, contract or fractional.';
  if (!WORKPLACE.includes(workplace)) errors.workplace = 'Remote, hybrid or on site.';
  if (!FIELDS.includes(field)) errors.field = 'Pick the field it is in.';
  try { const u = new URL(url); if (u.protocol !== 'https:') throw Error('scheme'); } catch { errors.url = 'The employer\'s own job posting, starting with https://'; }
  if (summary.length < 40) errors.summary = 'Tell people about the role: at least 40 characters.';
  if (summary.length > LIMITS.summary) errors.summary = `Keep it under ${LIMITS.summary} characters.`;
  if (deadline && (!realDay(deadline) || deadline < now.toISOString().slice(0, 10))) errors.deadline = 'A closing date still to come, or leave it blank.';
  if (String(input.pay_consent ?? '') !== 'yes') errors.pay_consent = 'Please confirm the band is the one the employer posted or agreed to share.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  const email = t('submitter_email', 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.submitter_email = 'That email address does not look right.';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { kind: 'opportunity', country: country.code, city: null, lat: null, lon: null, title, creator: employer, medium: field, category: 'job', prize: null, remote: workplace === 'remote', only_country: false, start_date: null, end_date: deadline || null, year: null, summary, url, instagram: null, x_handle: null, tiktok: null, youtube: null, submitter_name: t('submitter_name', 120) || null, submitter_email: email || null, details: { pay, employment, workplace, location: location || null, featured: false } } };
}
