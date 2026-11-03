/* /waitlist: a short form for a coming-soon feature, the thank-you page, and the owner's view of who is waiting (/admin/waitlist,
 * emails masked) with a CSV export (/admin/waitlist.csv). None of these pages is indexed, and no public page ever shows an email,
 * not even back to the person who typed it. */
import { PACK } from '../site.mjs';
import { esc, layout, htmlResponse } from '../html.mjs';
import { notFoundPage } from './about.mjs';
import { WAITLIST_LIMITS, waitlistFeatures, waitlistOn, joinWaitlist, maskEmail, maskEmailsIn, waitlistCsv } from '../waitlist.mjs';
import { careerOn } from '../careers.mjs';
import { roomFeatures } from '../rooms.mjs';
import { interestFeatures, interestOn } from '../interest.mjs';

/** Whether anything here keeps a list: the pack's waitlist, community rooms (requests for access) or bounties (interest). Leaving the
 * list and the owner's view exist whenever one of them does. */
export const listsOn = (pack = PACK) => waitlistOn(pack) || interestOn(pack) || careerOn('rooms', pack) || careerOn('bounties', pack);
/** Whether /waitlist takes posts: the pack's waitlist, or anything someone can register interest in (cohorts, the challenge, ...). */
const formOn = (pack) => waitlistOn(pack) || interestOn(pack);
/** What the form can name: the pack's waitlist features, then each thing with "Register interest". */
const formFeatures = (pack) => { const own = waitlistFeatures(pack); return [...own, ...interestFeatures(pack).filter((f) => !own.some((o) => o.id === f.id))]; };
const isInterest = (id, pack) => !waitlistFeatures(pack).some((f) => f.id === id) && interestFeatures(pack).some((f) => f.id === id);
/** Every feature the owner's page can name: the pack's own, then each room. A bounty's list shows as "Bounty c-12". */
const knownFeatures = (pack) => [...formFeatures(pack), ...(careerOn('rooms', pack) ? roomFeatures(pack) : [])];

const PRIVATE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

/** The form. `state` carries { errors, feature, use_case } after a post that did not go through. */
export function waitlistPage(params, state = {}, env = {}, pack = PACK) {
  const features = formFeatures(pack);
  const errors = state.errors || {};
  const chosen = state.feature ?? String(params.get('for') || '');
  const interest = isInterest(chosen, pack);
  const thing = interest ? features.find((f) => f.id === chosen) : null;
  const field = (name, label, control, hint) => `<div class="field${errors[name] ? ' has-error' : ''}"><label for="w-${name}">${label}</label>${hint ? `<p class="hint">${hint}</p>` : ''}${control}${errors[name] ? `<p class="error" role="alert">${esc(errors[name])}</p>` : ''}</div>`;
  const turnstile = env.TURNSTILE_SITE_KEY ? `<div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITE_KEY)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : '';
  const body = `
<section class="page-head">
${interest ? `<p class="eyebrow">Register interest</p>
  <h1>Register <em>interest</em></h1>
  <p class="lead">Leave your email for <strong>${esc(thing.label)}</strong> and we will write when it opens, and only about that. Nothing is booked and nothing is charged. Your address is never shown on the site.</p>` : `<p class="eyebrow">Waitlist</p>
  <h1>Be the first to <em>try it</em></h1>
  <p class="lead">Some of what you see here is still being built. Leave your email and we will write when it is ready. Your address is never shown on the site.</p>`}
</section>
<section class="section">
${errors.rate ? `<div class="notice" role="alert"><p>${esc(errors.rate)}</p></div>` : ''}
<form class="submit-form waitlist-form" method="post" action="/waitlist" novalidate>
  ${field('email', 'Your email', `<input id="w-email" name="email" type="email" maxlength="${WAITLIST_LIMITS.email}" autocomplete="email" required>`)}
  ${field('feature', 'What would you like to hear about?', `<select id="w-feature" name="feature" required><option value="">Choose one</option>${features.map((f) => `<option value="${esc(f.id)}"${f.id === chosen ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select>`)}
  ${field('use_case', 'What would you use it for?', `<textarea id="w-use_case" name="use_case" rows="4" maxlength="${WAITLIST_LIMITS.use_case}">${esc(state.use_case || '')}</textarea>`, `Optional, up to ${WAITLIST_LIMITS.use_case} characters. It helps us build the right thing first.`)}
  <div class="trap" aria-hidden="true"><label for="w-website">Website</label><input id="w-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
  <div class="field${errors.consent ? ' has-error' : ''}"><label class="check"><input type="checkbox" name="consent" value="yes" required><span>${interest ? 'Email me when this opens.' : 'Email me when this is ready.'} I can leave the list at any time at /waitlist/leave.</span></label>${errors.consent ? `<p class="error" role="alert">${esc(errors.consent)}</p>` : ''}</div>
  ${turnstile}${errors.turnstile ? `<p class="error" role="alert">${esc(errors.turnstile)}</p>` : ''}
  <p><button class="button primary" type="submit">${interest ? 'Register interest' : 'Join the waitlist'}</button></p>
</form>
</section>`;
  return layout({ title: interest ? 'Register interest' : 'Join the waitlist', description: 'Be the first to hear when a feature that is coming soon is ready.', path: '/waitlist', body, noindex: true });
}

/** The thank-you page, the same for a first join, a repeat and a caught bot. It names the feature, never the address. */
export function waitlistThanksPage(featureId, pack = PACK) {
  const f = formFeatures(pack).find((x) => x.id === featureId);
  const body = `<section class="page-head"><p class="eyebrow">Waitlist</p><h1>Thank you. <em>You are on the list.</em></h1><p class="lead">We will email you when ${f ? `<strong>${esc(f.label)}</strong> is` : 'it is'} ready, and only about that. You can <a href="/waitlist/leave">leave the list</a> at any time.</p><p><a class="button" href="/">Back to the front page</a> <a class="button ghost" href="/waitlist">Join for something else</a></p></section>`;
  return layout({ title: 'You are on the list', path: '/waitlist', body, noindex: true });
}

/** GET and POST /waitlist; 404 when the pack has no waitlist. `pack` and `now` are for tests. */
/** /waitlist/leave: one email address in, every waitlist row for it marked unsubscribed; the same page whatever was on file. */
export function waitlistLeavePage(done = false) {
  const body = done
    ? '<section class="page-head"><p class="eyebrow">Waitlist</p><h1>Done.</h1><p class="lead">If that address was on any waitlist here, it has been taken off, and we will not email it.</p><p><a class="button" href="/">Back to the front page</a></p></section>'
    : '<section class="page-head"><p class="eyebrow">Waitlist</p><h1>Leave the waitlist</h1><p class="lead">Type the address you joined with and it comes off every waitlist on this site.</p></section><section class="section"><form class="submit-form" method="post" action="/waitlist/leave"><div class="field"><label for="w-leave">Email</label><input id="w-leave" name="email" type="email" required maxlength="254" autocomplete="email"></div><button class="button primary" type="submit">Take me off</button></form></section>';
  return layout({ title: 'Leave the waitlist', path: '/waitlist/leave', body, noindex: true });
}

export async function waitlistRoute(request, env, store, { pack = PACK, now = new Date() } = {}) {
  const path = new URL(request.url).pathname;
  if (!listsOn(pack) || (path !== '/waitlist/leave' && !formOn(pack))) return htmlResponse(notFoundPage(path), 404);
  if (path === '/waitlist/leave') {
    if (request.method.toUpperCase() === 'POST') {
      const form = await request.formData().catch(() => null);
      const email = String((form && form.get('email')) || '').trim().toLowerCase().slice(0, 254);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) await store.waitlistLeave(email, now.toISOString());
      return htmlResponse(waitlistLeavePage(true), 200, PRIVATE);
    }
    return htmlResponse(waitlistLeavePage(false), 200, PRIVATE);
  }
  const method = request.method.toUpperCase();
  if (method === 'POST') {
    const r = await joinWaitlist(request, env, store, { pack, now, allow: interestFeatures(pack).map((f) => f.id) });
    if (r.body.ok) return htmlResponse(waitlistThanksPage(r.body.feature, pack), 200, PRIVATE);
    return htmlResponse(waitlistPage(new URLSearchParams(), r.body, env, pack), r.status, PRIVATE);
  }
  if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, POST' } });
  return htmlResponse(waitlistPage(new URL(request.url).searchParams, {}, env, pack), 200, PRIVATE);
}

/** The owner's page: how many are waiting for each feature, and the latest use-case lines with the address masked. */
export function adminWaitlistPage({ counts = {}, latest = [], people = [] } = {}, pack = PACK) {
  const features = knownFeatures(pack);
  const label = (id) => (features.find((f) => f.id === id) || { label: /^bounty-/.test(id) ? `Bounty ${id.slice(7)}` : id }).label;
  const ids = [...features.map((f) => f.id), ...Object.keys(counts).filter((id) => !features.some((f) => f.id === id))];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const rows = ids.map((id) => `<tr><td>${esc(label(id))}</td><td>${counts[id] || 0}</td></tr>`).join('');
  const interestIds = interestFeatures(pack).map((f) => f.id);
  const byItem = interestIds.map((id) => ({ id, rows: people.filter((r) => r.feature === id) }));
  const interestRows = interestIds.map((id) => `<tr><td>${esc(label(id))}</td><td><code>${esc(id)}</code></td><td>${counts[id] || 0}</td></tr>`).join('');
  const lists = byItem.map(({ id, rows: rs }) => `<li class="card interest-item" id="interest-${esc(id)}"><p class="card-kicker">${esc(label(id))} · ${rs.length}</p>${rs.length ? `<ul class="interest-people">${rs.map((r) => `<li>${esc(maskEmail(r.email))} <span class="muted">${esc(String(r.created_at || '').slice(0, 10))}</span></li>`).join('')}</ul>` : '<p class="muted">No one yet.</p>'}</li>`).join('');
  const lines = latest.map((r) => `<li class="card"><p class="card-kicker">${esc(maskEmail(r.email))} · ${esc(label(r.feature))} · ${esc(String(r.created_at || '').slice(0, 10))}</p><p>${esc(maskEmailsIn(r.use_case))}</p></li>`).join('');
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Moderation</a></p><h1>Waitlist</h1><p class="lead">${total} ${total === 1 ? 'person is' : 'people are'} waiting. Addresses are masked here; the export has them whole, for emailing people when a feature is ready. Keep it private.</p><p><a class="button small primary" href="/admin/waitlist.csv">Download CSV (email, feature, date)</a></p></section>
<section class="section"><table class="waitlist-counts"><thead><tr><th>Feature</th><th>Waiting</th></tr></thead><tbody>${rows}</tbody></table></section>
${interestIds.length ? `<section class="section" id="interest"><h2>Registered interest</h2><p class="muted">Who wants what: each cohort, the challenge and each locked day, under its own key. Nothing is booked or charged.</p><table class="waitlist-counts interest-counts"><thead><tr><th>Item</th><th>Key</th><th>Interested</th></tr></thead><tbody>${interestRows}</tbody></table><ul class="waitlist-lines interest-lists">${lists}</ul></section>` : ''}
<section class="section"><h2>What people would use it for</h2><ul class="waitlist-lines">${lines || '<li class="muted">No one has said yet.</li>'}</ul></section>`;
  return layout({ title: 'Waitlist', path: '/admin/waitlist', body, noindex: true });
}

/** GET /admin/waitlist and /admin/waitlist.csv. `who` is the signed-in owner (or 'token'), null when nobody is: then sign in first. */
export async function adminWaitlistRoute(path, who, store, { pack = PACK } = {}) {
  if (!listsOn(pack)) return htmlResponse(notFoundPage(path), 404);
  if (!who) return new Response(null, { status: 303, headers: { location: '/admin/login', 'cache-control': 'no-store' } });
  if (path === '/admin/waitlist.csv') {
    return new Response(waitlistCsv(await store.waitlistExport()), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${pack.id}-waitlist.csv"`, ...PRIVATE } });
  }
  const people = interestOn(pack) ? await store.waitlistExport() : [];
  return htmlResponse(adminWaitlistPage({ counts: await store.waitlistCounts(), latest: await store.waitlistLatest(30), people }, pack), 200, PRIVATE);
}
