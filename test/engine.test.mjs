import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PACK, T, fill } from '../src/site.mjs';

const code = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((f) => f.endsWith('.mjs') || f.endsWith('.js')).map((f) => [`${dir}/${f}`, readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8')]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the engine names no site and no audience: those live in the site pack', () => {
  const words = [PACK.name, PACK.domain, PACK.audience.label].filter(Boolean);
  for (const [file, src] of [...code('src'), ...code('src/pages'), ...code('public')]) {
    if (file === 'public/map.js') continue;
    const body = strip(src);
    for (const w of words) assert.ok(!body.includes(w), `${file} hard-codes "${w}"; move it to site/site.json`);
  }
});

test('the pack is complete: every T() key the engine asks for exists, and placeholders fill', () => {
  const asked = new Set();
  for (const [, src] of [...code('src'), ...code('src/pages')]) for (const m of src.matchAll(/\bT\('([^']+)'/g)) asked.add(m[1]);
  for (const k of asked) assert.equal(typeof PACK.copy[k], 'string', `site pack has no copy for ${k}`);
  assert.throws(() => T('no.such.key'), /no copy/);
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
  assert.ok(PACK.about.sections.length && PACK.guidelines.sections.length);
});

test('sign-in mail goes through the NOTIFY service binding when the Worker has one, else by URL', async () => {
  const { sendMail } = await import('../src/owners.mjs');
  let seen = null;
  const ok = await sendMail({ NOTIFY_TOKEN: 't', NOTIFY: { fetch: async (req) => { seen = { url: req.url, auth: req.headers.get('authorization'), body: await req.json() }; return new Response('{}', { status: 202 }); } } }, { to: 'a@example.test', subject: 's', text: 't' });
  assert.equal(ok, true);
  assert.equal(seen.auth, 'Bearer t');
  assert.equal(seen.body.to, 'a@example.test');
  assert.equal(await sendMail({ NOTIFY_TOKEN: 't', NOTIFY: { fetch: async () => new Response('no', { status: 401 }) } }, { to: 'a@example.test', subject: 's', text: 't' }), false);
});
