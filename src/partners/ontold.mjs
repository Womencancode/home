/* Ontold through its MCP server, for the site owner, as the owner's own Ontold account. Opt-in per pack: site.json "ontold":
 * { "mcp": true }. Off (the default) means no route, no admin link and no outbound call: every page renders as before.
 *
 * Account linking is the one ChatGPT and Claude use (ontold.com/oauth, OAuth 2.1 with PKCE S256, a public client registered with
 * RFC 7591). The owner connects once from /admin/ontold; the tokens stay in this Worker's D1 (site_settings), sealed with AES-GCM
 * under a key derived from the RATE_SALT secret, and never reach the browser. Spending follows Ontold's own rule: make runs a paid
 * job only with confirm set to a quote_id the person agreed to, and an approval_needed link is handed back to the owner.
 *
 * Visitors: nothing yet. principalFor() is the one place that decides who may act; opening it to signed-in visitors with their own
 * Ontold accounts means giving it a visitor session and storing their link under their own key, with no change to the calls. */
import { PACK } from '../site.mjs';
import { esc, layout, htmlResponse } from '../html.mjs';
import { readBody } from '../submissions.mjs';
import { randomToken } from '../owners.mjs';

const DEFAULT_ORIGIN = 'https://ontold.com';
const PROTOCOL = '2025-06-18';
const PENDING_TTL_MS = 10 * 60 * 1000;
const NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** The pack's Ontold settings, or null when off. The origin is ontold.com or a host under it, never a .site address. */
export function ontoldConfig(pack = PACK) {
  const c = pack && pack.ontold;
  if (!c || c.mcp !== true) return null;
  let origin = DEFAULT_ORIGIN;
  if (c.origin !== undefined) {
    try {
      const u = new URL(String(c.origin)); const h = u.hostname.toLowerCase();
      if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || !(h === 'ontold.com' || h.endsWith('.ontold.com'))) return null;
      origin = u.origin;
    } catch { return null; }
  }
  const tools = Array.isArray(c.tools) ? c.tools.filter((t) => typeof t === 'string' && NAME.test(t)) : [];
  const scopes = Array.isArray(c.scopes) ? c.scopes.filter((s) => typeof s === 'string' && /^[a-z]+:[a-z]+$/.test(s)) : [];
  return { origin, tools, scopes, visitors: false };
}
export const ontoldOn = (pack = PACK) => !!ontoldConfig(pack);

/** Who may act through Ontold for this request: the signed-in owner (their email), else null. ADMIN_TOKEN holders are not a person
 * and get nothing. This is the visitor hook: a later visitor session returns { kind: 'visitor', id } here. */
export function principalFor(who) {
  return typeof who === 'string' && who.includes('@') ? { kind: 'owner', id: who.toLowerCase() } : null;
}

/* ---------- sealing: AES-GCM under HKDF(RATE_SALT); without RATE_SALT nothing is stored and connecting is refused */
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
async function sealKey(env) {
  const root = String((env && env.RATE_SALT) || '');
  if (root.length < 16) return null;
  const base = await crypto.subtle.importKey('raw', enc.encode(root), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(`${PACK.id}`), info: enc.encode('ontold-link/v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(env, value) {
  const key = await sealKey(env); if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function unseal(env, sealed) {
  const key = await sealKey(env); const m = /^v1\.([\w-]+)\.([\w-]+)$/.exec(String(sealed || ''));
  if (!key || !m) return null;
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m[1]) }, key, unb64(m[2])))); } catch { return null; }
}
async function hash(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const linkKey = async (p) => `ontold:link:${p.kind}:${await hash(p.id)}`;
const pendingKey = async (state) => `ontold:pending:${await hash(state)}`;
const CLIENT_KEY = 'ontold:client';

/* ---------- OAuth: the same door ChatGPT and Claude use */
const redirectFor = (siteOrigin) => `${siteOrigin}/admin/ontold/callback`;
async function postForm(fetcher, url, fields) {
  const r = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(fields).toString(), redirect: 'error' });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body: j };
}

/** The registered public client for this site's return address, registering once (RFC 7591) and remembering it. */
async function clientFor(cfg, store, siteOrigin, fetcher) {
  const redirect = redirectFor(siteOrigin);
  const have = await store.getSetting(CLIENT_KEY);
  if (have && have.origin === cfg.origin && have.redirect_uri === redirect && have.client_id) return have;
  const r = await fetcher(`${cfg.origin}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ client_name: `${PACK.name || PACK.id} admin`, redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }), redirect: 'error' });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || typeof j.client_id !== 'string') return null;
  const client = { origin: cfg.origin, redirect_uri: redirect, client_id: j.client_id };
  await store.setSetting(CLIENT_KEY, client, 'ontold');
  return client;
}

async function challengeOf(verifier) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier)))); }

/** Start connecting: returns the ontold.com authorize URL to send the owner to, or { error }. */
export async function beginConnect(cfg, p, env, store, siteOrigin, fetcher = fetch, now = Date.now()) {
  if (!(await sealKey(env))) return { error: 'This site has no RATE_SALT secret, so it has nowhere safe to keep the connection. Ask for it to be set, then connect.' };
  const client = await clientFor(cfg, store, siteOrigin, fetcher).catch(() => null);
  if (!client) return { error: 'Ontold did not accept this site as a connection just now. Try again in a minute.' };
  const state = randomToken(); const verifier = `${randomToken()}${randomToken()}`;
  await store.setSetting(await pendingKey(state), await seal(env, { verifier, who: p, exp: now + PENDING_TTL_MS }), 'ontold');
  const u = new URL(`${cfg.origin}/oauth/authorize`);
  u.searchParams.set('response_type', 'code'); u.searchParams.set('client_id', client.client_id); u.searchParams.set('redirect_uri', client.redirect_uri);
  u.searchParams.set('code_challenge', await challengeOf(verifier)); u.searchParams.set('code_challenge_method', 'S256'); u.searchParams.set('state', state);
  u.searchParams.set('resource', `${cfg.origin}/mcp`);
  if (cfg.scopes.length) u.searchParams.set('scope', cfg.scopes.join(' '));
  return { url: u.href };
}

const tokensFrom = (body, now) => (body && typeof body.access_token === 'string' && body.access_token ? { access: body.access_token, refresh: typeof body.refresh_token === 'string' ? body.refresh_token : '', expires: now + Math.max(60, Number(body.expires_in) || 3600) * 1000 - 60000, scope: String(body.scope || '') } : null);

/** Finish connecting from the callback. The state must be one this site issued, unexpired, for this same person. */
export async function finishConnect(cfg, p, env, store, params, fetcher = fetch, now = Date.now()) {
  const state = String(params.get('state') || ''); const code = String(params.get('code') || '');
  if (!/^[\w-]{20,64}$/.test(state)) return { error: 'That return from Ontold did not come from this page. Start again.' };
  const key = await pendingKey(state);
  const pending = await unseal(env, await store.getSetting(key));
  await store.deleteSetting(key);
  if (!pending || pending.exp < now || !pending.who || pending.who.kind !== p.kind || pending.who.id !== p.id) return { error: 'That connection request expired or was for someone else. Start again.' };
  if (params.get('error')) return { error: 'Ontold was not connected. Nothing was changed.' };
  const client = await store.getSetting(CLIENT_KEY);
  if (!client || !code) return { error: 'That return from Ontold was incomplete. Start again.' };
  const r = await postForm(fetcher, `${cfg.origin}/oauth/token`, { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: client.redirect_uri, code_verifier: pending.verifier, resource: `${cfg.origin}/mcp` }).catch(() => ({ ok: false }));
  const t = r.ok && tokensFrom(r.body, now);
  if (!t) return { error: 'Ontold did not finish the connection. Start again.' };
  await store.setSetting(await linkKey(p), await seal(env, { ...t, client_id: client.client_id, at: new Date(now).toISOString() }), p.id);
  return { ok: true };
}

/** The person's link, refreshed when the access token has run out; null when not connected (or the refresh was refused). */
async function liveLink(cfg, p, env, store, fetcher, now) {
  const key = await linkKey(p);
  const link = await unseal(env, await store.getSetting(key));
  if (!link) return null;
  if (link.expires > now) return link;
  if (!link.refresh) return null;
  const r = await postForm(fetcher, `${cfg.origin}/oauth/token`, { grant_type: 'refresh_token', refresh_token: link.refresh, client_id: link.client_id, resource: `${cfg.origin}/mcp` }).catch(() => ({ ok: false }));
  const t = r.ok && tokensFrom(r.body, now);
  if (!t) { if (r.status === 400) await store.deleteSetting(key); return null; }
  const next = { ...link, ...t, refresh: t.refresh || link.refresh };
  await store.setSetting(key, await seal(env, next), p.id);
  return next;
}

export async function connected(cfg, p, env, store) { return !!(p && (await unseal(env, await store.getSetting(await linkKey(p))))); }

export async function disconnect(cfg, p, env, store, fetcher = fetch) {
  const key = await linkKey(p);
  const link = await unseal(env, await store.getSetting(key));
  await store.deleteSetting(key);
  if (link && link.refresh) await postForm(fetcher, `${cfg.origin}/oauth/revoke`, { token: link.refresh, client_id: link.client_id }).catch(() => null);
}

/* ---------- MCP calls, as the person */
let rpcId = 0;
/** One JSON-RPC call to ontold.com/mcp with the person's token. Returns { result } or { error }. */
export async function rpc(cfg, p, env, store, method, params = {}, fetcher = fetch, now = Date.now()) {
  const link = await liveLink(cfg, p, env, store, fetcher, now);
  if (!link) return { error: 'not-connected' };
  const r = await fetcher(`${cfg.origin}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${link.access}`, 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': PROTOCOL }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }), redirect: 'error', signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r) return { error: 'Ontold did not answer just now.' };
  if (r.status === 401) { await store.deleteSetting(await linkKey(p)); return { error: 'not-connected' }; }
  const j = await r.json().catch(() => null);
  if (!j) return { error: `Ontold answered ${r.status}.` };
  if (j.error) return { error: String(j.error.message || 'Ontold refused that call.').slice(0, 300) };
  return { result: j.result };
}

/** What a tool answer says, for the page: its text, its structured data, and the handoffs Ontold gave. */
export function readResult(result) {
  const data = result && result.structuredContent && typeof result.structuredContent === 'object' ? result.structuredContent : null;
  const text = ((result && result.content) || []).filter((c) => c && c.type === 'text').map((c) => String(c.text)).join('\n').slice(0, 8000);
  const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');
  return {
    text, data, isError: !!(result && result.isError),
    quoteId: data && typeof data.quote_id === 'string' ? data.quote_id : '',
    price: data && data.price != null ? String(data.price) : '',
    approvalUrl: data && data.approval_needed ? httpsOnly(data.approval_needed.url) : '',
    libraryUrl: data ? httpsOnly(data.library_url) : '',
  };
}

/* ---------- the admin page */
const shell = (body) => layout({ title: 'Ontold', path: '/admin/ontold', body: `<section class="page-head"><p class="eyebrow"><a href="/admin">Moderation</a></p><h1>Make with Ontold</h1><p class="lead">Use your own Ontold account from here: covers, posters, pictures and words for this site. Ontold shows the price first and nothing is spent until you say yes.</p></section>${body}`, noindex: true });
const page = (body, status = 200) => htmlResponse(shell(body), status, { 'cache-control': 'no-store' });
const note = (m) => (m ? `<p class="notice">${esc(m)}</p>` : '');
const form = (action, inner, button) => `<form method="post" action="${action}" class="admin-form">${inner}<p><button class="button primary" type="submit">${esc(button)}</button></p></form>`;

function resultBlock(r) {
  const parts = [];
  if (r.price) parts.push(`<p><strong>Price: ${esc(r.price)}</strong>. Nothing has been spent.</p>`);
  if (r.approvalUrl) parts.push(`<p><a class="button primary" href="${esc(r.approvalUrl)}" rel="noopener">Approve on Ontold</a> Ontold asks you there; the job starts once you approve.</p>`);
  if (r.libraryUrl) parts.push(`<p><a href="${esc(r.libraryUrl)}" rel="noopener">Open it in your Ontold Library</a></p>`);
  parts.push(`<pre class="small">${esc(r.text)}</pre>`);
  return `<section class="card">${parts.join('')}</section>`;
}

function makeForm(prompt = '', medium = 'image') {
  const media = ['image', 'cover', 'video', 'text', 'speech', 'music'];
  return form('/admin/ontold/quote', `<label>What to make<textarea name="prompt" rows="3" maxlength="2000" required>${esc(prompt)}</textarea></label><label>Kind<select name="medium">${media.map((m) => `<option${m === medium ? ' selected' : ''}>${m}</option>`).join('')}</select></label>`, 'What would it cost?');
}

/** /admin/ontold and its actions. `who` is the signed-in owner (or null); nothing here exists when the pack has it off. */
export async function adminOntoldRoute(request, who, env, store, { pack = PACK, fetcher = (env && env.ONTOLD_FETCH) || fetch, now = Date.now() } = {}) {
  const cfg = ontoldConfig(pack);
  const url = new URL(request.url); const path = url.pathname; const method = request.method;
  if (!cfg) return new Response('Not found', { status: 404 });
  if (!who) return new Response(null, { status: 303, headers: { location: '/admin/login' } });
  const p = principalFor(who);
  if (!p) return page(note('Ontold acts as a person. Sign in with your owner email link to connect your own Ontold account.'), 403);
  if (method === 'POST') {
    const o = request.headers.get('origin');
    if (o && o !== url.origin) return new Response('Forbidden', { status: 403 });
  }
  if (path === '/admin/ontold/connect' && method === 'GET') {
    /* A link, not a form: form-action 'self' would stop a form's redirect to ontold.com. */
    const r = await beginConnect(cfg, p, env, store, url.origin, fetcher, now);
    return r.url ? new Response(null, { status: 303, headers: { location: r.url, 'cache-control': 'no-store' } }) : page(note(r.error), 503);
  }
  if (path === '/admin/ontold/callback' && method === 'GET') {
    const r = await finishConnect(cfg, p, env, store, url.searchParams, fetcher, now);
    return r.ok ? new Response(null, { status: 303, headers: { location: '/admin/ontold?m=connected' } }) : page(note(r.error), 400);
  }
  if (path === '/admin/ontold/disconnect' && method === 'POST') {
    await disconnect(cfg, p, env, store, fetcher);
    return new Response(null, { status: 303, headers: { location: '/admin/ontold?m=disconnected' } });
  }
  const linked = await connected(cfg, p, env, store);
  const connectForm = '<p>Connect your Ontold account once. You sign in on ontold.com and choose what this site may do; you can switch it off there or here at any time.</p><p><a class="button primary" href="/admin/ontold/connect">Connect Ontold</a></p>';
  if (!linked && path !== '/admin/ontold' && method === 'POST') return new Response(null, { status: 303, headers: { location: '/admin/ontold' } });
  const call = async (name, args) => {
    if (cfg.tools.length && !cfg.tools.includes(name)) return { error: 'That tool is not switched on for this site.' };
    const r = await rpc(cfg, p, env, store, 'tools/call', { name, arguments: args }, fetcher, now);
    return r.error ? r : { out: readResult(r.result) };
  };
  const failed = (r) => (r.error === 'not-connected' ? page(note('Your Ontold connection has ended. Connect again.') + connectForm, 401) : page(note(r.error) + makeForm(), 502));
  if (path === '/admin/ontold/quote' && method === 'POST') {
    const b = await readBody(request); const prompt = String(b.prompt || '').trim().slice(0, 2000); const medium = String(b.medium || 'image').slice(0, 30);
    if (!prompt) return page(note('Say what to make.') + makeForm('', medium), 400);
    const r = await call('quote', { medium, prompt });
    if (r.error) return failed(r);
    const q = r.out;
    const go = q.quoteId ? form('/admin/ontold/make', `<input type="hidden" name="prompt" value="${esc(prompt)}"><input type="hidden" name="medium" value="${esc(medium)}"><input type="hidden" name="confirm" value="${esc(q.quoteId)}">`, `Yes, make it${q.price ? ` for ${q.price}` : ''}`) : '';
    return page(resultBlock(q) + go + makeForm(prompt, medium));
  }
  if (path === '/admin/ontold/make' && method === 'POST') {
    const b = await readBody(request); const confirm = String(b.confirm || '');
    /* Only ever with the quote the owner just saw and pressed yes on: no confirm, no make. */
    if (!/^[\w-]{6,128}$/.test(confirm)) return page(note('Ask for the price first.') + makeForm(), 400);
    const r = await call('make', { medium: String(b.medium || 'image').slice(0, 30), prompt: String(b.prompt || '').slice(0, 2000), confirm });
    if (r.error) return failed(r);
    return page(resultBlock(r.out) + makeForm());
  }
  if (path === '/admin/ontold/call' && method === 'POST') {
    const b = await readBody(request); const name = String(b.tool || '');
    let args = {};
    try { args = b.args ? JSON.parse(String(b.args)) : {}; } catch { return page(note('The input is not JSON.'), 400); }
    if (!NAME.test(name) || !args || typeof args !== 'object' || Array.isArray(args)) return page(note('Pick a tool and give its input as a JSON object.'), 400);
    const r = await call(name, args);
    if (r.error) return failed(r);
    return page(resultBlock(r.out));
  }
  if (path !== '/admin/ontold' || method !== 'GET') return new Response('Not found', { status: 404 });
  const m = url.searchParams.get('m');
  const msg = m === 'connected' ? 'Your Ontold account is connected.' : m === 'disconnected' ? 'Disconnected. This site no longer holds your Ontold connection.' : '';
  if (!linked) return page(note(msg) + connectForm);
  const listed = await rpc(cfg, p, env, store, 'tools/list', {}, fetcher, now);
  if (listed.error === 'not-connected') return page(note('Your Ontold connection has ended. Connect again.') + connectForm);
  const tools = ((listed.result && listed.result.tools) || []).filter((t) => t && NAME.test(t.name || '') && (!cfg.tools.length || cfg.tools.includes(t.name)));
  const toolForm = tools.length ? form('/admin/ontold/call', `<label>Tool<select name="tool">${tools.map((t) => `<option value="${esc(t.name)}">${esc(t.title || t.name)}</option>`).join('')}</select></label><label>Input (JSON)<textarea name="args" rows="4">{}</textarea></label>`, 'Run') : note(listed.error || 'Ontold listed no tools for this connection.');
  return page(`${note(msg)}<h2>Make something</h2>${makeForm()}<h2>Every Ontold tool</h2><p class="small muted">Anything that costs money answers with a price and a quote first; it runs only when you call it again with confirm set to that quote.</p>${toolForm}${form('/admin/ontold/disconnect', '', 'Disconnect Ontold')}`);
}
