/* The waitlist: intent capture for features a pack shows as coming soon. A pack switches it on with
 * "waitlist": { "features": [{ "id", "label" }] } in site.json; without it there is no /waitlist and no door to it.
 * An email is personal data: it is stored (migrations/0009_waitlist.sql), exported to the owner as CSV, and never rendered on a public
 * page or written to a log. The owner's admin page shows it masked. */
import { PACK } from './site.mjs';
import { humanCheck, ipHash, readBody } from './submissions.mjs';

export const WAITLIST_LIMITS = { email: 200, use_case: 500, perHour: 5 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAILISH = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;

/** The pack's waitlist features, well formed ones only: [{ id, label }]. */
export function waitlistFeatures(pack = PACK) {
  const list = pack && pack.waitlist && Array.isArray(pack.waitlist.features) ? pack.waitlist.features : [];
  return list.filter((f) => f && /^[a-z0-9-]{1,40}$/.test(f.id || '') && typeof f.label === 'string' && f.label.trim());
}

/** Whether the pack has a waitlist: the page, the footer link and the hero doors show only then. */
export const waitlistOn = (pack = PACK) => waitlistFeatures(pack).length > 0;

/** The address of the form for one feature. */
export const waitlistHref = (id) => `/waitlist?for=${encodeURIComponent(id)}`;

/** Check a form post. Returns { ok, errors, value } with value { feature, email, use_case }; the email is trimmed and lower-cased.
 * `allow` adds feature ids the caller vouches for: a room's or a bounty's own list (room-<id>, bounty-<id>). */
export function validateWaitlist(input, pack = PACK, allow = []) {
  const errors = {};
  const text = (k, max) => String(input[k] ?? '').replace(/\r/g, '').trim().slice(0, max + 1);
  const email = text('email', WAITLIST_LIMITS.email).toLowerCase();
  const feature = text('feature', 80);
  const use_case = text('use_case', WAITLIST_LIMITS.use_case);
  if (!email || email.length > WAITLIST_LIMITS.email || !EMAIL.test(email)) errors.email = 'That email address does not look right.';
  if (!waitlistFeatures(pack).some((f) => f.id === feature) && !allow.includes(feature)) errors.feature = 'Choose what you would like to hear about.';
  if (use_case.length > WAITLIST_LIMITS.use_case) errors.use_case = `Keep it under ${WAITLIST_LIMITS.use_case} characters.`;
  if (String(input.consent ?? '') !== 'yes') errors.consent = 'Tick the box so we may email you when it is ready.';
  if (String(input.website ?? '').trim()) errors.website = 'spam';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors, value: { feature, email, use_case: use_case || null } };
}

/** Take a waitlist post: validate, human check, rate limit, store once per email and feature. Returns { status, body } for the page. A
 * duplicate is not an error (body.duplicate), and a filled honeypot is thanked without storing anything (body.silent). */
export async function joinWaitlist(request, env, store, { pack = PACK, now = new Date(), allow = [] } = {}) {
  const input = await readBody(request);
  const feature = String(input.feature ?? '').trim().slice(0, 80);
  const checked = validateWaitlist(input, pack, allow);
  if (!checked.ok) {
    if (checked.errors.website) return { status: 200, body: { ok: true, silent: true, feature } };
    return { status: 400, body: { ok: false, errors: checked.errors, feature, use_case: String(input.use_case ?? '').slice(0, WAITLIST_LIMITS.use_case) } };
  }
  if (!(await humanCheck(input, env, request))) return { status: 400, body: { ok: false, errors: { turnstile: 'Please complete the human check.' }, feature, use_case: checked.value.use_case || '' } };
  const hash = await ipHash(request, env);
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  if ((await store.waitlistRecentCount(hash, since)) >= WAITLIST_LIMITS.perHour) return { status: 429, body: { ok: false, errors: { rate: 'That is plenty for one hour. Please come back later.' }, feature, use_case: checked.value.use_case || '' } };
  const id = await store.joinWaitlist({ ...checked.value, ip_hash: hash, created_at: now.toISOString() });
  return { status: 200, body: { ok: true, duplicate: !id, feature: checked.value.feature } };
}

/** An address as the owner's admin shows it: first letter of the name and of the domain, then the ending (r*@e*.com). */
export function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  const labels = domain.split('.').filter(Boolean);
  if (!local || labels.length < 2) return '*';
  return `${local[0]}*@${labels[0][0]}*.${labels[labels.length - 1]}`;
}

/** Free text with any address in it masked, so a use-case line never shows an email whole. */
export const maskEmailsIn = (s) => String(s || '').replace(EMAILISH, (m) => maskEmail(m));

/** The owner's export: email, feature, date. Cells are quoted, and one that a spreadsheet would read as a formula is defused. */
export function waitlistCsv(rows) {
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return ['email,feature,date', ...rows.map((r) => [r.email, r.feature, r.created_at].map(cell).join(','))].join('\r\n') + '\r\n';
}
