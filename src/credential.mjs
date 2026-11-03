/* Verifiable certificates: Open Badges 3.0 (1EdTech) on the W3C Verifiable Credentials Data Model 2.0, signed with a Data Integrity
 * proof using the eddsa-jcs-2022 cryptosuite (JSON Canonicalization Scheme, RFC 8785, then Ed25519). Nothing but WebCrypto, which
 * Cloudflare Workers and Node both have. The private key is the Worker secret WCC_ISSUER_KEY, an Ed25519 private JWK; it never leaves
 * this module and never appears in any output. The public key is published as a did:web document at /.well-known/did.json. */

export const CONTEXTS = ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'];
export const CRYPTOSUITE = 'eddsa-jcs-2022';
export const SKILLS = [
  ['describe', 'Describe', 'Say what you want to build clearly enough that a person or an AI can build it.'],
  ['read', 'Read', 'Read the code that was written and say what each part does.'],
  ['fix', 'Fix', 'Find and fix what is wrong when the AI gets it wrong.'],
  ['ship', 'Ship', 'Put a working project live on the web for real people to use.'],
  ['keep-safe', 'Keep it safe', 'Keep secrets out of code and the people who use it safe.'],
];

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/** RFC 8785 JSON Canonicalization: keys sorted by UTF-16 code units, ECMAScript number and string serialisation, no whitespace. */
export function jcs(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw Error('jcs: non-finite number'); return JSON.stringify(v); }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : jcs(x))).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;
  throw Error(`jcs: cannot canonicalise ${typeof v}`);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** base58btc, the alphabet multibase prefix "z" names. */
export function base58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}
export function unbase58(s) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw Error('base58: bad character'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}

/** An Ed25519 public key as a Multikey: multibase base58btc of the multicodec prefix 0xed01 and the 32 key bytes. */
export const multikey = (raw) => `z${base58(Uint8Array.from([0xed, 0x01, ...raw]))}`;
export function fromMultikey(mk) {
  if (!/^z[1-9A-HJ-NP-Za-km-z]+$/.test(String(mk || ''))) return null;
  const b = unbase58(mk.slice(1));
  return b.length === 34 && b[0] === 0xed && b[1] === 0x01 ? b.slice(2) : null;
}

/** The issuer key from the Worker secret: { privateKey, publicRaw, publicKeyMultibase } or null when it is absent or malformed. */
export async function issuerKey(env = {}) {
  let jwk; try { jwk = JSON.parse(String(env.WCC_ISSUER_KEY || '')); } catch { return null; }
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d || !jwk.x) return null;
  try {
    const privateKey = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', d: jwk.d, x: jwk.x }, { name: 'Ed25519' }, false, ['sign']);
    const publicRaw = unb64u(jwk.x);
    return { privateKey, publicRaw, publicKeyMultibase: multikey(publicRaw) };
  } catch { return null; }
}

/** A fresh keypair as { privateJwk, publicKeyMultibase }: for the key lane and throwaway test keys, never for a committed file. */
export async function generateIssuerKey() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { privateJwk: JSON.stringify({ kty: 'OKP', crv: 'Ed25519', d: jwk.d, x: jwk.x }), publicKeyMultibase: multikey(unb64u(jwk.x)) };
}

export const didFor = (domain) => `did:web:${String(domain).replace(/:/g, '%3A')}`;
export const keyIdFor = (domain) => `${didFor(domain)}#key-1`;

/** The did:web document for /.well-known/did.json: the public key only. */
export function didDocument(domain, publicKeyMultibase, name) {
  const id = didFor(domain), vm = keyIdFor(domain);
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
    id,
    ...(name ? { alsoKnownAs: [`https://${domain}`] } : {}),
    verificationMethod: [{ id: vm, type: 'Multikey', controller: id, publicKeyMultibase }],
    assertionMethod: [vm],
  };
}

/** The bytes eddsa-jcs-2022 signs: SHA-256 of the canonical proof options, then SHA-256 of the canonical document. */
async function hashData(doc, proofOptions) {
  const { proof, ...unsecured } = doc;
  const options = { ...proofOptions }; delete options.proofValue;
  if (unsecured['@context']) options['@context'] = unsecured['@context'];
  const a = await sha256(enc.encode(jcs(options))), b = await sha256(enc.encode(jcs(unsecured)));
  return Uint8Array.from([...a, ...b]);
}

/** Sign a credential. `created` is fixed by the caller so a signature is reproducible (Ed25519 is deterministic). */
export async function signCredential(doc, key, verificationMethod, created) {
  const options = { type: 'DataIntegrityProof', cryptosuite: CRYPTOSUITE, created, verificationMethod, proofPurpose: 'assertionMethod' };
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, await hashData(doc, options)));
  const { proof, ...unsecured } = doc;
  return { ...unsecured, proof: { ...options, proofValue: `z${base58(sig)}` } };
}

/** Check a credential's proof against a public key (raw 32 bytes). Returns { ok, reason }. Never throws. */
export async function verifyCredential(doc, publicRaw, expectedVm) {
  try {
    const p = doc && doc.proof;
    if (!p || p.type !== 'DataIntegrityProof' || p.cryptosuite !== CRYPTOSUITE || p.proofPurpose !== 'assertionMethod') return { ok: false, reason: 'no supported proof' };
    if (expectedVm && p.verificationMethod !== expectedVm) return { ok: false, reason: 'signed by a different key' };
    const sig = unbase58(String(p.proofValue || '').replace(/^z/, ''));
    if (sig.length !== 64) return { ok: false, reason: 'malformed signature' };
    const pub = await crypto.subtle.importKey('raw', publicRaw, { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, pub, sig, await hashData(doc, p));
    return ok ? { ok: true, reason: 'signature valid' } : { ok: false, reason: 'the signature does not match the contents' };
  } catch (e) { return { ok: false, reason: 'could not be checked' }; }
}

/** The recipient as Open Badges asks: a salted SHA-256 of the email, never the address itself. */
export async function hashedEmail(email, salt) {
  const s = salt || b64u(crypto.getRandomValues(new Uint8Array(12)));
  const h = hex(await sha256(enc.encode(`${String(email).trim().toLowerCase()}${s}`)));
  return { type: 'IdentityObject', identityHash: `sha256$${h}`, identityType: 'emailAddress', hashed: true, salt: s };
}

/** Does this email match the hashed recipient? For a holder proving the credential is theirs. */
export async function emailMatches(identity, email) {
  if (!identity || !identity.salt) return false;
  return (await hashedEmail(email, identity.salt)).identityHash === identity.identityHash;
}

/**
 * The unsigned OpenBadgeCredential for a record:
 * { id, name, identity (IdentityObject) | null, project, live, repo, pitch, exercises: [{ name, url }], date, expires, wave }.
 */
export function buildCredential(r, site) {
  const base = `https://${site.domain}`;
  const did = didFor(site.domain);
  const skills = SKILLS.map(([id, name, about]) => ({ type: ['Alignment'], targetName: name, targetDescription: about, targetUrl: `${base}/challenge#skill-${id}`, targetType: 'ceterms:Skill', targetFramework: `${site.name} five skills` }));
  const evidence = [
    { id: r.live, type: ['Evidence'], name: `${r.project}, live`, genre: 'Shipped project', narrative: 'The working project, live on the web.' },
    r.repo ? { id: r.repo, type: ['Evidence'], name: `${r.project}, source code`, genre: 'Source code', narrative: 'The public repository the project was built in.' } : null,
    r.pitch ? { ...(/^https:\/\//.test(r.pitch) ? { id: r.pitch } : {}), type: ['Evidence'], name: 'Demo day pitch', genre: 'Presentation', narrative: /^https:\/\//.test(r.pitch) ? 'The 2-minute demo day pitch.' : String(r.pitch) } : null,
    ...(r.exercises || []).map((x) => ({ id: x.url, type: ['Evidence'], name: `GitHub Skills: ${x.name}`, genre: 'Completed exercise', narrative: 'A GitHub Skills exercise completed during the build.' })),
  ].filter(Boolean);
  return {
    '@context': CONTEXTS,
    id: `${base}/certificate/${r.id}.json`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: site.achievement,
    issuer: { id: did, type: ['Profile'], name: site.name, url: base, ...(site.email ? { email: site.email } : {}) },
    validFrom: `${r.date}T00:00:00Z`,
    ...(r.expires ? { validUntil: `${r.expires}T23:59:59Z` } : {}),
    credentialSubject: {
      type: ['AchievementSubject'],
      name: r.name,
      ...(r.identity ? { identifier: [r.identity] } : {}),
      achievement: {
        id: `${base}/achievements/${site.achievementId || 'level-1'}`,
        type: ['Achievement'],
        achievementType: 'Certificate',
        name: site.achievement,
        description: site.achievementAbout,
        criteria: { narrative: site.criteria },
        image: { id: `${base}/certificate/${r.id}/badge.svg`, type: 'Image', caption: `${site.name} badge` },
        creator: { id: did, type: ['Profile'], name: site.name, url: base },
        alignment: skills,
        tag: ['web development', 'AI-assisted coding', 'shipping'],
      },
    },
    evidence,
    credentialStatus: { id: `${base}/credentials/revocations#${r.id}`, type: '1EdTechRevocationList' },
  };
}

/** LinkedIn's add-to-profile link for a certification (https://addtoprofile.linkedin.com). */
export function linkedInUrl({ name, organizationName, organizationId, date, expires, certUrl, certId }) {
  const p = new URLSearchParams({ startTask: 'CERTIFICATION_NAME', name });
  if (organizationId) p.set('organizationId', String(organizationId)); else p.set('organizationName', organizationName);
  const [y, m] = String(date || '').split('-');
  if (y && m) { p.set('issueYear', y); p.set('issueMonth', String(Number(m))); }
  const [ey, em] = String(expires || '').split('-');
  if (ey && em) { p.set('expirationYear', ey); p.set('expirationMonth', String(Number(em))); }
  p.set('certUrl', certUrl); p.set('certId', certId);
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}
