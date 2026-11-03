import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/wcc.mjs';
import { storeFor } from '../src/store.mjs';
import { tokenHash } from '../src/owners.mjs';
import { generateIssuerKey, issuerKey, signCredential, verifyCredential, buildCredential, keyIdFor, linkedInUrl, jcs, base58, unbase58, fromMultikey, hashedEmail, emailMatches } from '../src/credential.mjs';
import { credentialSite, linkedInFor, FOUNDER_DRAFT, CERTS, SAMPLE } from '../src/certificates.mjs';
import { ITEMS, priceText } from '../src/certifications.mjs';

const KEY = await generateIssuerKey();           // throwaway, this process only
const OWNER = 'founder@example.com';
const base = { OWNER_EMAILS: OWNER, NOTIFY_TOKEN: 'test', MAILER: async () => true };
const env = { ...base, WCC_ISSUER_KEY: KEY.privateJwk };
const store = storeFor({});
const SESSION = 'ownersessiontokenownersessiontoken', VISITOR = 'visitorsessiontokenvisitorsession';
await store.createSession({ email: OWNER, token_hash: await tokenHash(SESSION, env), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString() });
await store.createSession({ email: 'someone@example.com', token_hash: await tokenHash(VISITOR, env), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString() });
const call = (path, { method = 'GET', cookie = '', form = null, e = env } = {}) => worker.fetch(new Request(`https://womencancode.com${path}`, { method, headers: { ...(cookie ? { cookie: `womencancode_session=${cookie}` } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://womencancode.com' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined }), e, { waitUntil() {} });
const ISSUE = { id: 'test-one', name: 'Test Recipient', email: 'recipient@example.com', project: 'Placeholder Tracker', live: 'https://example.com/tracker', repo: 'https://github.com/example/tracker', pitch: 'https://example.com/pitch', date: '2026-11-03', 'ex_https-github-com-skills-github-pages': 'on' };
const site = credentialSite();
const record = { id: 'rt', name: 'Round Trip', project: 'P', live: 'https://example.com', date: '2026-11-03', exercises: [] };

test('JCS canonicalises as RFC 8785 says, and base58btc round trips', () => {
  assert.equal(jcs({ b: 1, a: [true, null, 'x'], c: { z: 1.5, y: 'é' } }), '{"a":[true,null,"x"],"b":1,"c":{"y":"é","z":1.5}}');
  const bytes = Uint8Array.from([0, 0, 1, 2, 255]);
  assert.deepEqual([...unbase58(base58(bytes))], [...bytes]);
  assert.equal(fromMultikey(KEY.publicKeyMultibase).length, 32);
});

test('sign then verify round trip: an Open Badges 3.0 credential with an eddsa-jcs-2022 proof', async () => {
  const key = await issuerKey(env);
  const vc = await signCredential(buildCredential(record, site), key, keyIdFor(site.domain), '2026-11-03T00:00:00Z');
  assert.deepEqual(vc.type, ['VerifiableCredential', 'OpenBadgeCredential']);
  assert.equal(vc['@context'][0], 'https://www.w3.org/ns/credentials/v2');
  assert.equal(vc.proof.cryptosuite, 'eddsa-jcs-2022');
  assert.match(vc.proof.proofValue, /^z[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  assert.equal((await verifyCredential(vc, key.publicRaw, keyIdFor(site.domain))).ok, true);
  assert.deepEqual(vc.credentialSubject.achievement.alignment.map((a) => a.targetName), ['Describe', 'Read', 'Fix', 'Ship', 'Keep it safe']);
});

test('a tampered credential fails, and so does one signed by another key', async () => {
  const key = await issuerKey(env);
  const vc = await signCredential(buildCredential(record, site), key, keyIdFor(site.domain), '2026-11-03T00:00:00Z');
  const bad = JSON.parse(JSON.stringify(vc)); bad.credentialSubject.name = 'Someone Else';
  assert.equal((await verifyCredential(bad, key.publicRaw)).ok, false);
  const other = await issuerKey({ WCC_ISSUER_KEY: (await generateIssuerKey()).privateJwk });
  assert.equal((await verifyCredential(vc, other.publicRaw)).ok, false);
  const dated = JSON.parse(JSON.stringify(vc)); dated.proof.created = '2027-01-01T00:00:00Z';
  assert.equal((await verifyCredential(dated, key.publicRaw)).ok, false);
});

test('the recipient is a salted hash of the email, never the address', async () => {
  const id = await hashedEmail('Recipient@Example.com');
  assert.match(id.identityHash, /^sha256\$[0-9a-f]{64}$/);
  assert.ok(await emailMatches(id, 'recipient@example.com'));
  assert.ok(!(await emailMatches(id, 'other@example.com')));
});

test('non-owners cannot issue, revoke or see the admin; the owner can issue, and it verifies', async () => {
  assert.equal((await call('/admin/certificates', { e: {} })).status, 404);
  assert.equal((await call('/admin/certificates')).status, 303);
  assert.equal((await call('/admin/certificates/issue', { method: 'POST', form: ISSUE })).status, 403);
  assert.equal((await call('/admin/certificates/issue', { method: 'POST', form: ISSUE, cookie: VISITOR })).status, 403);
  assert.equal((await call('/admin/certificates/issue', { method: 'POST', form: ISSUE, cookie: 'forged-cookie-forged-cookie' })).status, 403);
  assert.equal((await call('/certificate/test-one')).status, 404);
  const admin = await call('/admin/certificates', { cookie: SESSION });
  assert.equal(admin.status, 200);
  const page = await admin.text();
  assert.ok(page.includes('Your own credential') && page.includes('The signing key is set.'));
  const r = await call('/admin/certificates/issue', { method: 'POST', form: ISSUE, cookie: SESSION });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/certificate/test-one');
  const v = await (await call('/verify/test-one')).text();
  assert.ok(v.includes('<b>Verified:</b> issued by WomenCanCode to Test Recipient on 3 November 2026.') || /Verified:<\/b> issued by .+ to Test Recipient on 3 November 2026/.test(v), 'verified line');
  const vc = await (await call('/certificate/test-one.json')).json();
  assert.equal(vc.credentialSubject.identifier[0].hashed, true);
  assert.ok(!JSON.stringify(vc).includes('recipient@example.com'), 'no plain email');
  assert.deepEqual(vc.evidence.map((x) => x.genre), ['Shipped project', 'Source code', 'Presentation', 'Completed exercise']);
  const did = await (await call('/.well-known/did.json')).json();
  assert.equal(did.verificationMethod[0].publicKeyMultibase, KEY.publicKeyMultibase);
  const badge = await (await call('/certificate/test-one/badge.svg')).text();
  assert.ok(badge.includes('<openbadges:credential><![CDATA[') && badge.includes('eddsa-jcs-2022'));
  assert.equal((await call('/admin/certificates/issue', { method: 'POST', form: ISSUE, cookie: SESSION })).status, 400, 'no duplicate id');
  assert.equal((await call('/admin/certificates/revoke', { method: 'POST', form: { id: 'test-one' }, cookie: VISITOR })).status, 403);
});

test('a revoked credential fails verification and is on the revocation list', async () => {
  await call('/admin/certificates/issue', { method: 'POST', form: { ...ISSUE, id: 'test-two' }, cookie: SESSION });
  assert.ok((await (await call('/verify/test-two')).text()).includes('Verified:'));
  assert.equal((await call('/admin/certificates/revoke', { method: 'POST', form: { id: 'test-two', reason: 'Issued in error' }, cookie: SESSION })).status, 303);
  const v = await (await call('/verify/test-two')).text();
  assert.ok(v.includes('Not valid.') && v.includes('revoked') && v.includes('Issued in error'));
  const list = await (await call('/credentials/revocations')).json();
  assert.ok(list.revokedCredentials.some((x) => x.id.endsWith('/certificate/test-two.json')));
});

test('a stored credential edited after signing is not valid', async () => {
  const { credentialsFor } = await import('../src/certstore.mjs');
  const row = await credentialsFor({}).get('test-one');
  const vc = JSON.parse(row.credential); vc.evidence[0].id = 'https://example.com/elsewhere';
  credentialsFor({}).rows.get('test-one').credential = JSON.stringify(vc);
  assert.ok((await (await call('/verify/test-one')).text()).includes('Not valid.'));
});

test('no private key appears in any output', async () => {
  const d = JSON.parse(KEY.privateJwk).d;
  for (const p of ['/certificate/sample', '/certificate/test-two', '/certificate/test-two.json', '/certificate/test-two/badge.svg', '/certificate/test-two/card.svg', '/verify/test-two', '/.well-known/did.json', '/credentials/revocations', '/admin/certificates', '/certifications']) {
    const body = await (await call(p, { cookie: SESSION })).text();
    assert.ok(!body.includes(d) && !body.includes('"d":'), `${p} leaks the key`);
  }
  for (const f of ['../data/certificates.json', '../site/site.json', '../wrangler.json']) assert.ok(!/"d"\s*:/.test(readFileSync(new URL(f, import.meta.url), 'utf8')), f);
});

test('the LinkedIn add-to-profile link carries name, organisation, issue date, ID and URL', () => {
  const u = new URL(linkedInUrl({ name: 'WCC: 10-day build', organizationName: 'Women Can Code', date: '2026-11-03', expires: '2028-05-01', certUrl: 'https://womencancode.com/verify/x', certId: 'x' }));
  assert.equal(u.origin + u.pathname, 'https://www.linkedin.com/profile/add');
  assert.deepEqual(Object.fromEntries(u.searchParams), { startTask: 'CERTIFICATION_NAME', name: 'WCC: 10-day build', organizationName: 'Women Can Code', issueYear: '2026', issueMonth: '11', expirationYear: '2028', expirationMonth: '5', certUrl: 'https://womencancode.com/verify/x', certId: 'x' });
  assert.equal(new URL(linkedInUrl({ name: 'n', organizationId: 123, date: '2026-01-09', certUrl: 'https://a', certId: 'i' })).searchParams.get('organizationId'), '123');
  assert.ok(linkedInFor(SAMPLE).includes('certId=sample'));
});

test('the sample is marked SAMPLE, never verifies, and the wording is honest', async () => {
  const s = await (await call('/certificate/sample')).text();
  for (const k of ['SAMPLE', 'Add to LinkedIn profile', 'What this proves: you finished Level 1 of the 10-day build and shipped a working page to GitHub Pages.', 'Level 1: Build it', 'Women Can Code: Build it, Level 1', 'It is not an accredited or regulated qualification', 'Open Badges 3.0']) assert.ok(s.includes(k), k);
  assert.ok(!/accredited qualification|Ofqual-regulated|regulated qualification\./i.test(s.replace('It is not an accredited or regulated qualification', '')));
  assert.ok((await (await call('/verify/sample')).text()).includes('Not valid.'));
  const card = await (await call('/certificate/sample/card.svg')).text();
  assert.ok(card.includes('viewBox="0 0 1200 627"') && card.includes('Level 1: Build it'));
});

test('each level is its own certificate: its own achievement, criteria and URL, and the admin form picks the level', async () => {
  const one = JSON.parse(await (await call('/achievements/level-1')).text());
  const two = JSON.parse(await (await call('/achievements/level-2')).text());
  assert.equal(one.name, 'Women Can Code: Build it, Level 1');
  assert.equal(two.name, 'Women Can Code: Make it real, Level 2');
  assert.match(one.id, /\/achievements\/level-1$/); assert.match(two.id, /\/achievements\/level-2$/);
  assert.notEqual(one.criteria.narrative, two.criteria.narrative);
  assert.equal((await call('/achievements/10-day-build')).status, 404, 'no separate full 10-day certificate');
  const { readIssueForm, issueForm } = await import('../src/certadmin.mjs');
  assert.equal(readIssueForm({ level: 'level-2' }).record.level, 'level-2');
  assert.equal(readIssueForm({ level: 'nope' }).record.level, 'level-1');
  const form = issueForm({ level: 'level-2' });
  assert.ok(form.includes('<option value="level-1">Level 1: Build it certificate</option>') && form.includes('<option value="level-2" selected>Level 2: Make it real certificate</option>'));
});

test('the founder credential waits for her fields: nothing invented, nothing issued', () => {
  assert.ok(FOUNDER_DRAFT && FOUNDER_DRAFT.draft);
  for (const k of ['name', 'live', 'repo', 'date', 'project']) assert.equal(FOUNDER_DRAFT[k], '', k);
  assert.equal(CERTS.length, 0);
});

test('certifications: no third-party fee shown, a Register interest per item, hidden items never render, only the owner toggles or marks progress', async () => {
  for (const id of ['github-foundations', 'github-copilot', 'google-genai-leader', 'aws-ai-practitioner', 'microsoft-ai-901', 'anthropic-cca-f', 'anthropic-academy']) assert.ok(ITEMS.some((i) => i.id === id), id);
  assert.equal(ITEMS.filter((i) => i.kind === 'course').length, 23);
  assert.equal(priceText(99), 'Check the official page');
  assert.equal(priceText(0), 'Free');
  assert.equal(priceText(null), 'Check the official page');
  let page = await (await call('/certifications')).text();
  assert.ok(!/\$\d|£|USD/.test(page), 'no exam fee on the page');
  assert.ok(page.includes('href="/waitlist?for=cert-google-genai-leader" data-interest="cert-google-genai-leader">Register interest'));
  assert.ok(page.includes('GH-900') && page.includes('Claude Partner Network') && page.includes('AI-900, which is retired'));
  assert.ok(page.includes('0 of 23') && page.includes('Nothing completed yet') && !page.includes('class="is-done"'));
  assert.equal((await call('/admin/certifications/show', { method: 'POST', form: { id: 'aws-ai-practitioner', show: '0' }, cookie: VISITOR })).status, 403);
  assert.equal((await call('/admin/certifications/progress', { method: 'POST', form: { id: 'aa-claude-101', date: '2026-11-01', done: '1' } })).status, 403);
  assert.equal((await call('/admin/certifications/show', { method: 'POST', form: { id: 'aws-ai-practitioner', show: '0' }, cookie: SESSION })).status, 303);
  assert.equal((await call('/admin/certifications/progress', { method: 'POST', form: { id: 'aa-claude-101', date: '2026-11-01', proof: 'https://verify.skilljar.com/c/example', done: '1' }, cookie: SESSION })).status, 303);
  page = await (await call('/certifications')).text();
  assert.ok(!page.includes('AIF-C01'), 'hidden item renders');
  assert.ok(page.includes('1 of 23') && page.includes('https://verify.skilljar.com/c/example'));
  assert.ok((await (await call('/admin/certifications', { cookie: SESSION })).text()).includes('AIF-C01'));
  await call('/admin/certifications/show', { method: 'POST', form: { id: 'aws-ai-practitioner', show: '1' }, cookie: SESSION });
  await call('/admin/certifications/progress', { method: 'POST', form: { id: 'aa-claude-101', done: '0' }, cookie: SESSION });
});

/* WCAG AA for the certificate's own colour pairs. */
const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const lum = (h) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('the certificate, card, seal and verdicts pass WCAG AA contrast', () => {
  const pairs = [['#15121f', '#fbfaf6'], ['#15121f', '#f3efe4'], ['#3a3548', '#f3efe4'], ['#5326d9', '#f3efe4'], ['#1d6b3a', '#f3efe4'], ['#15121f', '#c9f26b'], ['#5a0d1b', '#ffe9ec'], ['#15121f', '#ecf9cf'], ['#3a3548', '#ecf9cf'],
    ['#ffffff', '#15121f'], ['#c9f26b', '#15121f'], ['#c8c2da', '#15121f'], ['#f5f3ff', '#15121f'], ['#ffffff', '#5326d9'], ['#c9f26b', '#5326d9'.replace('5326d9', '15121f')], ['#ffffff', '#3d1aa8']];
  for (const [fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
});
