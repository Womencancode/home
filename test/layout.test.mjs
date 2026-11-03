import test from 'node:test';
import assert from 'node:assert/strict';
import { homeLayout, valid, cleanLayout, renderBlock, DEFAULT_HOME, VARIANTS } from '../src/layout.mjs';
import { HOME_BLOCKS } from '../src/pages/home.mjs';
import worker from '../src/worker.mjs';

test('layouts: a saved one wins when valid, else the pack, else the engine default; junk is refused or cleaned', () => {
  assert.deepEqual(homeLayout([{ block: 'cta' }]), [{ block: 'cta' }]);
  assert.ok(homeLayout(null).length >= DEFAULT_HOME.length - 1);
  for (const bad of [null, [], 'x', [{}], [{ block: '<script>' }], Array(41).fill({ block: 'cta' })]) assert.equal(valid(bad), false);
  assert.deepEqual(cleanLayout([{ block: 'hero', variant: 'manifesto', width: 'wide', evil: 1 }, { block: 'hero', variant: 'nope', width: 'huge' }]), [{ block: 'hero', variant: 'manifesto', width: 'wide' }, { block: 'hero' }]);
});

test('a block renders bare at its defaults and wrapped with classes otherwise; unknown blocks render nothing', () => {
  const reg = { a: () => '<p>a</p>', hero: () => '<p>h</p>' };
  assert.equal(renderBlock(reg, { block: 'a' }, {}), '<p>a</p>');
  assert.equal(renderBlock(reg, { block: 'hero', variant: 'split', width: 'contained' }, {}), '<p>h</p>');
  assert.equal(renderBlock(reg, { block: 'hero', variant: 'manifesto', width: 'full' }, {}), '<div class="blk blk-hero v-manifesto w-full" data-block="hero"><p>h</p></div>');
  assert.equal(renderBlock(reg, { block: 'nope' }, {}), '');
  for (const k of DEFAULT_HOME.map((b) => b.block)) assert.equal(typeof HOME_BLOCKS[k], 'function', k);
});

test('the builder: owners only; a draft changes nothing public until published; reset returns to the default', async () => {
  const env = { ADMIN_TOKEN: 'secret', ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  const login = await worker.fetch(new Request('https://example.test/admin/login', { method: 'POST', body: new URLSearchParams({ token: 'secret' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } }), env);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie.includes('='), 'signed in');
  const as = (path, init = {}) => worker.fetch(new Request(`https://example.test${path}`, { ...init, headers: { ...(init.headers || {}), cookie } }), env);
  assert.equal((await worker.fetch(new Request('https://example.test/admin/layout/draft', { method: 'POST', body: '{}' }), env)).status, 401);
  assert.equal((await as('/admin/layout')).status, 200);
  /* A hero style the site's own default does not use, so the test holds for every pack. */
  const used = new Set(homeLayout(null).filter((b) => b.block === 'hero').map((b) => b.variant || VARIANTS.hero[0]));
  const pick = VARIANTS.hero.find((v) => v !== VARIANTS.hero[0] && !used.has(v)), mark = `v-${pick}`;
  const plan = [{ block: 'cta' }, { block: 'hero', variant: pick }];
  assert.equal((await as('/admin/layout/draft', { method: 'POST', body: JSON.stringify({ layout: plan }) })).status, 200);
  assert.ok(!(await (await worker.fetch(new Request('https://example.test/'), env)).text()).includes(mark), 'draft is not public');
  assert.ok((await (await as('/admin/layout/frame')).text()).includes(mark), 'the preview shows the draft');
  assert.equal((await as('/admin/layout/publish', { method: 'POST' })).status, 200);
  const home = await (await worker.fetch(new Request('https://example.test/'), env)).text();
  assert.ok(home.includes(mark) && home.indexOf('cta-band') < home.indexOf('class="front"'), 'published order and style are public');
  assert.equal((await as('/admin/layout/reset', { method: 'POST' })).status, 200);
  assert.ok(!(await (await worker.fetch(new Request('https://example.test/'), env)).text()).includes(mark));
});
