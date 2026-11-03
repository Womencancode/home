import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/site.mjs';
import { MemoryStore } from '../src/store.mjs';
import { ontoldConfig, principalFor, adminOntoldRoute, seal, unseal } from '../src/partners/ontold.mjs';
import { adminPage } from '../src/pages/admin.mjs';

const ON = { ...PACK, ontold: { mcp: true } };
const OFF = { ...PACK, ontold: undefined };
const ENV = { RATE_SALT: 'a-test-salt-that-is-long-enough' };
const OWNER = 'owner@example.test';
const SITE = 'https://example.test';

/** A stand-in for ontold.com: OAuth register, authorize and token, and /mcp with quote, make and tools/list. Records every call. */
function fakeOntold() {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const u = new URL(url); const body = init.body ? String(init.body) : '';
    calls.push({ path: u.pathname, auth: (init.headers || {}).authorization || '', body });
    if (u.pathname === '/oauth/register') return Response.json({ client_id: 'client-1' }, { status: 201 });
    if (u.pathname === '/oauth/token') {
      const f = new URLSearchParams(body);
      if (f.get('grant_type') === 'authorization_code' && f.get('code') === 'good-code' && f.get('code_verifier')) return Response.json({ access_token: 'oimg_access', refresh_token: 'oimr_refresh', expires_in: 3600 });
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    if (u.pathname === '/oauth/revoke') return new Response(null, { status: 200 });
    if (u.pathname === '/mcp') {
      if (init.headers.authorization !== 'Bearer oimg_access') return new Response('{}', { status: 401 });
      const m = JSON.parse(body);
      if (m.method === 'tools/list') return Response.json({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'quote', title: 'What would it cost?' }, { name: 'make' }, { name: 'list_library' }] } });
      const { name, arguments: a } = m.params;
      if (name === 'quote') return Response.json({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'This costs $1.20.' }], structuredContent: { quote_id: 'q_123456', price: '$1.20' } } });
      if (name === 'make' && a.confirm === 'q_123456') return Response.json({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Needs approval.' }], structuredContent: { task_id: 't1', approval_needed: { url: 'https://ontold.com/approve/t1' } } } });
      return Response.json({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'ok' }], structuredContent: {} } });
    }
    return new Response('nope', { status: 404 });
  };
  return { calls, fetcher };
}

const req = (path, init) => new Request(`${SITE}${path}`, init);
const post = (path, fields) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE }, body: new URLSearchParams(fields).toString() });
const route = (r, o, store, fetcher, pack = ON, who = OWNER) => adminOntoldRoute(r, who, ENV, store, { pack, fetcher });

async function connect(store, o) {
  const go = await route(req('/admin/ontold/connect'), o, store, o.fetcher);
  assert.equal(go.status, 303);
  const to = new URL(go.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://ontold.com/oauth/authorize');
  assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(to.searchParams.get('redirect_uri'), `${SITE}/admin/ontold/callback`);
  const back = await route(req(`/admin/ontold/callback?code=good-code&state=${to.searchParams.get('state')}`), o, store, o.fetcher);
  assert.equal(back.status, 303);
  return to;
}

test('off by default: no config, no route, no admin link', async () => {
  assert.equal(ontoldConfig(OFF), null);
  assert.equal(ontoldConfig({ ...PACK, ontold: { mcp: 'yes' } }), null);
  assert.equal(ontoldConfig({ ...PACK, ontold: { mcp: true, origin: 'https://evil.ontold.site' } }), null, 'never a .site address');
  const o = fakeOntold();
  assert.equal((await route(req('/admin/ontold'), o, new MemoryStore(), o.fetcher, OFF)).status, 404);
  assert.equal(o.calls.length, 0, 'nothing is called when off');
  if (!PACK.ontold) assert.ok(!adminPage([], {}, 'pending', '', OWNER, null, {}).includes('/admin/ontold'));
});

test('only a signed-in owner (a person) may act; the ADMIN_TOKEN is not a person', async () => {
  assert.equal(principalFor('token'), null);
  assert.deepEqual(principalFor('Owner@Example.test'), { kind: 'owner', id: 'owner@example.test' });
  const o = fakeOntold();
  assert.equal((await route(req('/admin/ontold'), o, new MemoryStore(), o.fetcher, ON, null)).status, 303);
  assert.equal((await route(req('/admin/ontold/connect'), o, new MemoryStore(), o.fetcher, ON, 'token')).status, 403);
  assert.equal(o.calls.length, 0);
});

test('connecting uses OAuth with PKCE and keeps the token sealed server-side', async () => {
  const store = new MemoryStore(); const o = fakeOntold();
  await connect(store, o);
  const raw = JSON.stringify(store.settings);
  assert.ok(!raw.includes('oimg_access') && !raw.includes('oimr_refresh'), 'tokens are never stored in the clear');
  const home = await route(req('/admin/ontold?m=connected'), o, store, o.fetcher);
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.ok(!html.includes('oimg_access') && !html.includes('oimr_refresh'), 'tokens never reach the browser');
  assert.ok(html.includes('What would it cost?'));
  assert.ok(o.calls.some((c) => c.path === '/mcp' && c.auth === 'Bearer oimg_access'), 'calls go to the MCP as the owner');
});

test('a callback with a state this site did not issue, or for another owner, is refused', async () => {
  const store = new MemoryStore(); const o = fakeOntold();
  const go = await route(req('/admin/ontold/connect'), o, store, o.fetcher);
  const state = new URL(go.headers.get('location')).searchParams.get('state');
  assert.equal((await route(req(`/admin/ontold/callback?code=good-code&state=${state}`), o, store, o.fetcher, ON, 'other@example.test')).status, 400);
  assert.equal((await route(req('/admin/ontold/callback?code=good-code&state=AAAAAAAAAAAAAAAAAAAAAAAA'), o, store, o.fetcher)).status, 400);
  assert.ok(!o.calls.some((c) => c.path === '/oauth/token'));
});

test('quote shows the price and spends nothing; make runs only with the quote the owner agreed to', async () => {
  const store = new MemoryStore(); const o = fakeOntold();
  await connect(store, o);
  const q = await route(post('/admin/ontold/quote', { prompt: 'A poster for our meetup', medium: 'image' }), o, store, o.fetcher);
  const html = await q.text();
  assert.ok(html.includes('Price: $1.20') && html.includes('Nothing has been spent'));
  assert.ok(html.includes('name="confirm" value="q_123456"'));
  assert.ok(!o.calls.some((c) => c.path === '/mcp' && c.body.includes('"make"')), 'quoting never calls make');
  assert.equal((await route(post('/admin/ontold/make', { prompt: 'x', medium: 'image' }), o, store, o.fetcher)).status, 400, 'no confirm, no make');
  assert.ok(!o.calls.some((c) => c.body.includes('"make"')));
  const m = await (await route(post('/admin/ontold/make', { prompt: 'A poster for our meetup', medium: 'image', confirm: 'q_123456' }), o, store, o.fetcher)).text();
  assert.ok(m.includes('href="https://ontold.com/approve/t1"'), 'the approval link Ontold returned is handed to the owner');
});

test('a cross-site POST is refused, and disconnecting forgets and revokes the token', async () => {
  const store = new MemoryStore(); const o = fakeOntold();
  await connect(store, o);
  const evil = req('/admin/ontold/quote', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.test' }, body: 'prompt=x' });
  assert.equal((await route(evil, o, store, o.fetcher)).status, 403);
  assert.equal((await route(post('/admin/ontold/disconnect', {}), o, store, o.fetcher)).status, 303);
  assert.ok(o.calls.some((c) => c.path === '/oauth/revoke'));
  assert.ok(!Object.keys(store.settings).some((k) => k.startsWith('ontold:link:')));
});

test('without RATE_SALT nothing is stored and connecting is refused', async () => {
  const store = new MemoryStore(); const o = fakeOntold();
  assert.equal(await seal({}, { a: 1 }), null);
  assert.deepEqual(await unseal(ENV, await seal(ENV, { a: 1 })), { a: 1 });
  const r = await adminOntoldRoute(req('/admin/ontold/connect'), OWNER, {}, store, { pack: ON, fetcher: o.fetcher });
  assert.equal(r.status, 503);
  assert.equal(o.calls.length, 0);
});
