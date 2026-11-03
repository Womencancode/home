/* Register interest: each cohort, the challenge, each locked challenge day, and anything a pack registers (certifications, a free
 * product) gets a "Register interest" link to the waitlist form, prefilled with that thing's own key, so the owner sees who wants what
 * on /admin/waitlist. Interest is stored in the waitlist table (migrations/0009_waitlist.sql) under the key; nothing here takes money.
 * Keys: cohort-<id>, challenge (the whole run), challenge-day-<n>, challenge-<level id>, and whatever a pack adds with registerInterest. */
import { PACK } from './site.mjs';
import { esc } from './html.mjs';
import { cohortsConfig } from './cohorts.mjs';
import { challengeConfig } from './challenge.mjs';

export const INTEREST_KEY = /^[a-z0-9-]{1,80}$/;
export const INTEREST_LABEL = 'Register interest';

const extra = [];
/** A pack adds its own things: fn(pack) returns [{ id, label }]. */
export const registerInterest = (fn) => { if (typeof fn === 'function') extra.push(fn); };

export const cohortKey = (id) => `cohort-${id}`;
export const challengeKey = () => 'challenge';
export const dayKey = (n) => `challenge-day-${n}`;
export const levelKey = (id) => `challenge-${id}`;

/** Every thing someone can register interest in, well formed and once each: [{ id, label }]. */
export function interestFeatures(pack = PACK) {
  const out = [];
  const c = cohortsConfig(pack);
  if (c) for (const i of c.items) out.push({ id: cohortKey(i.id), label: `${c.title}: ${i.name}` });
  const ch = challengeConfig(pack);
  if (ch) {
    out.push({ id: challengeKey(), label: `${ch.title}${ch.wave ? `, ${ch.wave}` : ''}` });
    for (const l of ch.levels || []) out.push({ id: levelKey(l.id), label: `${ch.title}: ${l.title}` });
    for (const d of ch.days) if (!d.free) out.push({ id: dayKey(d.n), label: `${ch.title}: day ${d.n}, ${d.title}` });
  }
  for (const fn of extra) { try { out.push(...(fn(pack) || [])); } catch { /* a pack's list never breaks the page */ } }
  const seen = new Set();
  return out.filter((f) => f && INTEREST_KEY.test(f.id || '') && typeof f.label === 'string' && f.label.trim() && !seen.has(f.id) && seen.add(f.id));
}
export const interestOn = (pack = PACK) => interestFeatures(pack).length > 0;

/** The address of the form for one thing. */
export const interestHref = (key) => `/waitlist?for=${encodeURIComponent(key)}`;

/** The "Register interest" link for one thing. `name` is read out to screen readers only. */
export const interestLink = (key, name = '', { cls = 'button primary', label = INTEREST_LABEL } = {}) =>
  `<a class="${esc(cls)} interest-link" href="${esc(interestHref(key))}" data-interest="${esc(key)}">${esc(label)}${name ? `<span class="visually-hidden">: ${esc(name)}</span>` : ''}</a>`;
