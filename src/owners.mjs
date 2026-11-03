/* Owner sign-in for the moderation queue, the way a person expects it: type your email, get a link, you are in. No password, no operator
 * console. The app knows its owners from OWNER_EMAILS (a Worker secret the deploy lane sets from the owner's list), sends the link through
 * Ontold's notify route (NOTIFY_URL with the NOTIFY_TOKEN bearer), and keeps only hashes of links and sessions in its own database. */
import { PACK } from './site.mjs';
import { ipHash } from './submissions.mjs';

export const LOGIN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const LOGINS_PER_HOUR = 5;
export const SESSION_COOKIE = `${PACK.id}_session`;
const DEFAULT_NOTIFY_URL = 'https://mcp.ontold.site/notify';

/** The owners' addresses, lower-cased, from OWNER_EMAILS (comma, space or newline separated). */
export function ownerEmails(env) {
  return String((env && env.OWNER_EMAILS) || '').split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/** Sign-in by email is possible when owners are listed and mail can be sent. */
export function signInConfigured(env) { return ownerEmails(env).length > 0 && !!(env && env.NOTIFY_TOKEN); }

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function tokenHash(token, env) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${(env && env.RATE_SALT) || PACK.id}:${token}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Send one message through Ontold's notify route. Returns true when the route accepted it (202). `env.MAILER` replaces the network in tests. */
export async function sendMail(env, message) {
  if (env && typeof env.MAILER === 'function') return env.MAILER(message);
  if (!env || !env.NOTIFY_TOKEN) return false;
  const req = new Request(env.NOTIFY_URL || DEFAULT_NOTIFY_URL, { method: 'POST', headers: { authorization: `Bearer ${env.NOTIFY_TOKEN}`, 'content-type': 'application/json', 'user-agent': `${PACK.id}-worker` }, body: JSON.stringify(message) });
  const via = env.NOTIFY && typeof env.NOTIFY.fetch === 'function' ? 'binding' : 'url';
  const r = await (via === 'binding' ? env.NOTIFY.fetch(req) : fetch(req)).catch((e) => { console.error(`mail: ${via} failed: ${e && e.message}`); return null; });
  if (r && !(r.status === 202 || r.ok)) console.error(`mail: notify answered ${r.status} via ${via}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return !!(r && (r.status === 202 || r.ok));
}

/** Begin a sign-in. Always answers the same to the caller so addresses cannot be enumerated; mails only an owner, at most five times an hour. */
export async function beginSignIn(request, env, store, emailRaw, now = new Date()) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email || !ownerEmails(env).includes(email)) return { sent: false, reason: 'not-owner' };
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  if ((await store.recentLogins(email, since)) >= LOGINS_PER_HOUR) return { sent: false, reason: 'rate' };
  const token = randomToken();
  await store.createLogin({ email, token_hash: await tokenHash(token, env), ip_hash: await ipHash(request, env), created_at: now.toISOString(), expires_at: new Date(now.getTime() + LOGIN_TTL_MS).toISOString() });
  const origin = new URL(request.url).origin;
  const link = `${origin}/admin/login?code=${encodeURIComponent(token)}`;
  const site = origin.replace(/^https?:\/\//, '');
  const sent = await sendMail(env, {
    to: email,
    subject: `Sign in to ${site}`,
    text: `Your sign-in link for ${site}:\n\n${link}\n\nIt works once and expires in 15 minutes. If you did not ask for it, ignore this message.`,
    html: `<p>Your sign-in link for <strong>${site}</strong>:</p><p><a href="${link}">${link}</a></p><p>It works once and expires in 15 minutes. If you did not ask for it, ignore this message.</p>`,
  });
  return { sent, reason: sent ? 'sent' : 'mail-failed', link: env && env.MAILER ? link : undefined };
}

/** Redeem a link. Returns { email, cookie } or null. */
export async function finishSignIn(env, store, code, now = new Date()) {
  const token = String(code || '').trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const email = await store.consumeLogin(await tokenHash(token, env), now.toISOString());
  if (!email) return null;
  const session = randomToken();
  await store.createSession({ email, token_hash: await tokenHash(session, env), created_at: now.toISOString(), expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString() });
  return { email, cookie: `${SESSION_COOKIE}=${session}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}` };
}

/** The signed-in owner for this request, or null. */
export async function sessionOwner(request, env, store, now = new Date()) {
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(request.headers.get('cookie') || '');
  if (!m) return null;
  return store.sessionEmail(await tokenHash(decodeURIComponent(m[1]), env), now.toISOString());
}

export async function signOut(request, env, store, now = new Date()) {
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(request.headers.get('cookie') || '');
  if (m) await store.endSession(await tokenHash(decodeURIComponent(m[1]), env), now.toISOString());
  return `${SESSION_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
