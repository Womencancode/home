/* Cloudflare Access in front of the moderation queue. When Access protects a host, every request carries a signed JWT
 * (Cf-Access-Jwt-Assertion header, or the CF_Authorization cookie) issued by the team's Access instance. This verifies it properly:
 * RS256 against the team's published keys, the audience of this application, the expiry and the issuer. A header alone is never
 * trusted, because a request that did not come through Access can carry any header it likes. */

const CERTS_TTL_MS = 60 * 60 * 1000;
let certCache = { url: '', at: 0, keys: [] };

const b64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

/** The team's current signing keys, cached for an hour. `fetcher` is injectable for tests. */
export async function accessKeys(teamDomain, fetcher = fetch, now = Date.now()) {
  const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  if (certCache.url === url && now - certCache.at < CERTS_TTL_MS && certCache.keys.length) return certCache.keys;
  const r = await fetcher(url);
  if (!r.ok) throw new Error(`access certs ${r.status}`);
  const j = await r.json();
  const keys = Array.isArray(j.keys) ? j.keys : [];
  certCache = { url, at: now, keys };
  return keys;
}

/** Forget cached keys (tests, or a key rotation the cache has not seen). */
export function resetAccessKeys() { certCache = { url: '', at: 0, keys: [] }; }

/** The JWT from a request that came through Access, or null. */
export function accessToken(request) {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header.trim();
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('cookie') || '');
  return m ? decodeURIComponent(m[1]) : null;
}

/** Verify an Access JWT. Returns the payload ({ email, sub, aud, exp, ... }) or null when anything does not hold. */
export async function verifyAccessJwt(token, { teamDomain, aud, fetcher = fetch, now = Date.now() } = {}) {
  if (!token || !teamDomain || !aud) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = decodeJson(parts[0]); payload = decodeJson(parts[1]); } catch { return null; }
  if (!header || header.alg !== 'RS256' || !header.kid || !payload) return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) return null;
  if (payload.iss !== `https://${teamDomain}.cloudflareaccess.com`) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf * 1000 > now + 60000) return null;
  let keys;
  try { keys = await accessKeys(teamDomain, fetcher, now); } catch { return null; }
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    /* A key the cache has not seen: refresh once. */
    resetAccessKeys();
    try { keys = await accessKeys(teamDomain, fetcher, now); } catch { return null; }
    jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
  }
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return ok ? payload : null;
  } catch { return null; }
}
