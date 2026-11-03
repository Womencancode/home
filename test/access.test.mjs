import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyAccessJwt, resetAccessKeys, accessToken } from '../src/access.mjs';
import { isAdmin } from '../src/submissions.mjs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const team = 'ontold';
const aud = 'a'.repeat(64);
const now = 1_800_000_000_000;

function jwt(claims, { key = privateKey, kid = 'k1' } = {}) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid });
  const body = b64({ aud: [aud], iss: `https://${team}.cloudflareaccess.com`, exp: Math.floor(now / 1000) + 600, iat: Math.floor(now / 1000), email: 'mod@example.com', sub: 'x', ...claims });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}
let fetched = 0;
const fetcher = async (url) => { fetched += 1; assert.equal(url, `https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`); return { ok: true, json: async () => ({ keys: [jwk] }) }; };
const opts = { teamDomain: team, aud, fetcher, now };

test('a JWT signed by the team key for this audience verifies, and the keys are cached', async () => {
  resetAccessKeys();
  const claims = await verifyAccessJwt(jwt({}), opts);
  assert.equal(claims.email, 'mod@example.com');
  await verifyAccessJwt(jwt({}), opts);
  assert.equal(fetched, 1, 'second check reuses the cached keys');
});

test('wrong audience, wrong issuer, expired, wrong key or garbage all fail', async () => {
  resetAccessKeys();
  assert.equal(await verifyAccessJwt(jwt({ aud: ['b'.repeat(64)] }), opts), null);
  assert.equal(await verifyAccessJwt(jwt({ iss: 'https://evil.cloudflareaccess.com' }), opts), null);
  assert.equal(await verifyAccessJwt(jwt({ exp: Math.floor(now / 1000) - 1 }), opts), null);
  assert.equal(await verifyAccessJwt(jwt({}, { key: other.privateKey }), opts), null, 'signed by another key');
  assert.equal(await verifyAccessJwt(jwt({}, { kid: 'unknown' }), opts), null, 'unknown kid');
  assert.equal(await verifyAccessJwt('not.a.jwt', opts), null);
  assert.equal(await verifyAccessJwt(jwt({}), { ...opts, aud: '' }), null, 'no audience configured means no Access door');
});

test('the token is read from the Access header or the CF_Authorization cookie', () => {
  assert.equal(accessToken(new Request('https://x/', { headers: { 'cf-access-jwt-assertion': 'abc' } })), 'abc');
  assert.equal(accessToken(new Request('https://x/', { headers: { cookie: 'a=1; CF_Authorization=def' } })), 'def');
  assert.equal(accessToken(new Request('https://x/')), null);
});

test('admin through Access needs a verified JWT, never a bare identity header, and honours ADMIN_EMAILS', async () => {
  resetAccessKeys();
  const env = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud };
  const spoof = new Request('https://womenabc.com/admin', { headers: { 'cf-access-authenticated-user-email': 'mod@example.com' } });
  assert.equal(await isAdmin(spoof, env, { fetcher, now }), false, 'a header without the JWT is nothing');
  assert.equal(await isAdmin(spoof, { ADMIN_EMAILS: 'mod@example.com' }, { fetcher, now }), false, 'ADMIN_EMAILS alone opens nothing without Access configured');
  const real = new Request('https://womenabc.com/admin', { headers: { 'cf-access-jwt-assertion': jwt({}) } });
  assert.equal(await isAdmin(real, env, { fetcher, now }), true);
  assert.equal(await isAdmin(real, { ...env, ADMIN_EMAILS: 'someone-else@example.com' }, { fetcher, now }), false);
  assert.equal(await isAdmin(real, { ...env, ADMIN_EMAILS: 'Mod@Example.com' }, { fetcher, now }), true);
  const forged = new Request('https://womenabc.com/admin', { headers: { 'cf-access-jwt-assertion': jwt({}, { key: other.privateKey }) } });
  assert.equal(await isAdmin(forged, env, { fetcher, now }), false);
});
