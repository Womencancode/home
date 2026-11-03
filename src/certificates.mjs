/* Pack file, no engine change: verifiable certificates. /certificate/<id> (the certificate, print-perfect at A4 landscape),
 * /certificate/<id>.json (the signed Open Badges 3.0 credential), /certificate/<id>/badge.svg (the badge, credential baked in),
 * /certificate/<id>/card.svg (the 1200x627 share card), /verify/<id> (the signature checked on the server), /.well-known/did.json
 * (the issuer's public key), /credentials/revocations (the revocation list) and /achievements/<level> (one per level). Each level of the
 * 10-day build has its own certificate (site.json certificate.levels, a record's "level"). Certificates are
 * issued only by a signed-in owner (src/certadmin.mjs) or listed by the founder in data/certificates.json. */
import certs from '../data/certificates.json' with { type: 'json' };
import { PACK } from './site.mjs';
import { SITE, esc, layout, htmlResponse } from './html.mjs';
import { notFoundPage } from './pages/about.mjs';
import { longDate } from './cohorts.mjs';
import { challengeConfig } from './challenge.mjs';
import { httpsUrl } from './tracks.mjs';
import { qrEncode, qrPathData, QR_QUIET_ZONE } from './qr.mjs';
import { credentialsFor } from './certstore.mjs';
import { buildCredential, signCredential, verifyCredential, issuerKey, didDocument, keyIdFor, linkedInUrl, jcs } from './credential.mjs';

export const ID = /^[a-z0-9-]{3,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const CERT = () => PACK.certificate || {};
const base = () => `https://${SITE.domain}`;
const waveName = (id) => String(id || '').replace(/^wave-(\d+)$/, 'Wave $1');
const year = (d) => String(d || '').slice(0, 4) || String(new Date().getUTCFullYear());

/** The levels with a certificate: { 'level-1': { achievement, achievementAbout, criteria, proves }, ... }. */
export const LEVELS = () => (CERT().levels && typeof CERT().levels === 'object' ? CERT().levels : {});
export const LEVEL_IDS = () => Object.keys(LEVELS()).filter((k) => /^level-\d$/.test(k));
/** A record's level: its own when the pack has it, else the first. */
export const levelOf = (c) => (c && LEVEL_IDS().includes(c.level) ? c.level : LEVEL_IDS()[0] || 'level-1');
export const levelNumber = (id) => Number(String(id).replace(/^level-/, '')) || 1;
/** "Level 1: Build it", from the challenge's own level names. */
export const levelName = (id) => { const l = ((challengeConfig() || {}).levels || []).find((x) => x.id === id); return `Level ${levelNumber(id)}${l ? `: ${l.title}` : ''}`; };

/** The site facts a credential carries, for one level's certificate. */
export const credentialSite = (level = levelOf(null)) => { const l = LEVELS()[level] || {}; return { domain: SITE.domain, name: SITE.name, achievementId: level, achievement: l.achievement || `${SITE.name}: ${levelName(level)}`, achievementAbout: l.achievementAbout || '', criteria: l.criteria || '' }; };

/** A certificate record is well formed: id, name, project, its live https link, a date, and optional https repo, screenshot and expiry. */
export const validCert = (c) => !!c && !c.draft && (!c.level || LEVEL_IDS().includes(c.level)) && ID.test(c.id || '') && c.id !== 'sample' && typeof c.name === 'string' && c.name.trim().length > 1
  && typeof c.project === 'string' && !!c.project.trim() && httpsUrl(c.live) && DATE.test(c.date || '') && (!c.repo || httpsUrl(c.repo))
  && (!c.expires || (DATE.test(c.expires) && c.expires > c.date)) && (!c.screenshot || httpsUrl(c.screenshot) || /^\/[a-z0-9/_.-]+$/i.test(c.screenshot));
export const CERTS = certs.filter(validCert);
/** The founder's own first credential, waiting for her four fields. */
export const FOUNDER_DRAFT = certs.find((c) => c && c.draft && c.role === 'founder') || null;

/** The GitHub Skills exercises in the 10 days, for the evidence checklist. */
export const skillsExercises = () => ((challengeConfig() || {}).days || []).filter((d) => /^https:\/\/github\.com\/skills\//.test(d.link || '')).map((d) => ({ name: d.link.replace(/^https:\/\/github\.com\/skills\//, '').replace(/-/g, ' ').replace(/^./, (m) => m.toUpperCase()), url: d.link }));

/** A design sample: fake throughout, marked SAMPLE, never signed, never indexed. */
export const SAMPLE = {
  id: 'sample', sample: true, name: 'Ada Placeholder', wave: 'wave-1', level: 'level-1', project: 'Sample Booking Page', live: `${base()}/examples/day-10-launched.html`,
  repo: 'https://github.com/example/sample-booking-page', pitch: 'A 2-minute demo day pitch (sample)', screenshot: '/examples/shots/day-10-launched.png',
  date: '2026-11-03', exercises: skillsExercises().slice(0, 3),
};

/** The record for an id: an issued one from the store, then the founder's list, then the sample. */
export async function findCert(id, env) {
  if (id === 'sample') return SAMPLE;
  let stored = null; try { stored = await credentialsFor(env).get(id); } catch { stored = null; }
  if (stored) return { ...stored, stored: true };
  return CERTS.find((c) => c.id === id) || null;
}

/** The signed credential for a record: the stored one as issued, or a static record signed now (deterministic, so always the same). */
export async function credentialOf(c, env) {
  if (c.sample) return { ...buildCredential(c, credentialSite(levelOf(c))), name: `SAMPLE, not a real credential: ${credentialSite(levelOf(c)).achievement}` };
  if (c.credential) { try { return JSON.parse(c.credential); } catch { return null; } }
  const key = await issuerKey(env);
  if (!key) return null;
  const identity = c.identityHash && c.salt ? { type: 'IdentityObject', identityHash: c.identityHash, identityType: 'emailAddress', hashed: true, salt: c.salt } : null;
  return signCredential(buildCredential({ ...c, identity }, credentialSite(levelOf(c))), key, keyIdFor(SITE.domain), `${c.date}T00:00:00Z`);
}

/** Check a certificate: signature, issuer key, revocation, expiry, and that the page shows what was signed. */
export async function verifyCert(c, env, now = new Date()) {
  if (!c) return { ok: false, reason: 'No certificate has this ID.' };
  if (c.sample) return { ok: false, reason: 'This is a design sample with placeholder data. It was never issued and is not signed.' };
  const key = await issuerKey(env);
  if (!key) return { ok: false, reason: 'The issuer key is not available on this server, so the signature cannot be checked here.' };
  const vc = await credentialOf(c, env);
  if (!vc) return { ok: false, reason: 'The stored credential could not be read.' };
  const sig = await verifyCredential(vc, key.publicRaw, keyIdFor(SITE.domain));
  if (!sig.ok) return { ok: false, reason: `The signature check failed: ${sig.reason}.`, vc };
  const subj = vc.credentialSubject || {};
  if (subj.name !== c.name || vc.id !== `${base()}/certificate/${c.id}.json`) return { ok: false, reason: 'The credential does not match this certificate.', vc };
  if (c.revoked_at) return { ok: false, revoked: true, reason: `It was revoked by ${SITE.name} on ${longDate(c.revoked_at.slice(0, 10))}${c.revoked_reason ? `: ${c.revoked_reason}` : ''}.`, vc };
  if (vc.validUntil && new Date(vc.validUntil) < now) return { ok: false, reason: `It expired on ${longDate(vc.validUntil.slice(0, 10))}.`, vc };
  return { ok: true, reason: sig.reason, vc };
}

/* ---------- Ornament: an engraved guilloche border and the rosette seal, all SVG, all generated. ---------- */
const f1 = (n) => Math.round(n * 10) / 10;

/** Interlaced sine bands running round a rectangle, the engraved look of a banknote border. */
export function guilloche(w = 1123, h = 794, { inset = 26, amp = 7, waves = 96, strands = 5, color = 'currentColor' } = {}) {
  const W = w - 2 * inset, H = h - 2 * inset, L = 2 * (W + H), steps = 900;
  const at = (s) => {
    s = ((s % L) + L) % L;
    if (s < W) return [inset + s, inset, 0, -1];
    if (s < W + H) return [inset + W, inset + (s - W), 1, 0];
    if (s < 2 * W + H) return [inset + W - (s - W - H), inset + H, 0, 1];
    return [inset, inset + H - (s - 2 * W - H), -1, 0];
  };
  const band = (phase, a, k) => {
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * L, [x, y, nx, ny] = at(s), o = a * Math.sin((2 * Math.PI * k * s) / L + phase);
      d += `${i ? 'L' : 'M'}${f1(x + nx * o)} ${f1(y + ny * o)}`;
    }
    return `<path d="${d}Z"/>`;
  };
  const paths = [];
  for (let i = 0; i < strands; i++) paths.push(band((i * Math.PI * 2) / strands, amp, waves));
  for (let i = 0; i < 3; i++) paths.push(band((i * Math.PI * 2) / 3, amp * 0.45, waves * 2));
  return `<svg class="wcc-gl" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="none" stroke="${color}" stroke-width=".7" vector-effect="non-scaling-stroke">${paths.join('')}</g><rect x="${inset - amp - 6}" y="${inset - amp - 6}" width="${W + 2 * amp + 12}" height="${H + 2 * amp + 12}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/><rect x="${inset + amp + 6}" y="${inset + amp + 6}" width="${W - 2 * amp - 12}" height="${H - 2 * amp - 12}" fill="none" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
}

let sealN = 0;
/** The rosette: a scalloped medal with a rose-curve guilloche, "Women Can Code" round the top, the wave and year round the bottom. */
export function sealSvg({ wave = 'wave-1', date = '', level = 'level-1', size = 220, ribbons = true, cls = 'wcc-seal', extra = '' } = {}) {
  const id = `s${++sealN}`, c = 110, R = 100, lobes = 40;
  let edge = '';
  for (let i = 0; i <= lobes * 4; i++) { const t = (i / (lobes * 4)) * 2 * Math.PI, r = R + 4 * Math.cos(lobes * t); edge += `${i ? 'L' : 'M'}${f1(c + r * Math.sin(t))} ${f1(c - r * Math.cos(t))}`; }
  const rose = [];
  for (let p = 0; p < 6; p++) { let d = ''; for (let i = 0; i <= 360; i++) { const t = (i / 360) * 2 * Math.PI, r = 34 + 10 * Math.cos(9 * t + (p * Math.PI) / 6); d += `${i ? 'L' : 'M'}${f1(c + r * Math.cos(t))} ${f1(c + r * Math.sin(t))}`; } rose.push(`<path d="${d}Z"/>`); }
  const ribbon = ribbons ? `<path d="M74 176 L52 250 L72 238 L84 260 L102 186Z" fill="#5326d9"/><path d="M146 176 L168 250 L148 238 L136 260 L118 186Z" fill="#c9f26b" stroke="#15121f" stroke-width="1.5"/>` : '';
  const h = ribbons ? 266 : 220;
  return `<svg class="${cls}" viewBox="0 0 220 ${h}" width="${size}" height="${f1((size * h) / 220)}" role="img" aria-label="${esc(SITE.name)} seal, Level ${levelNumber(level)}, ${esc(waveName(wave))}, ${esc(year(date))}"${extra}>${ribbon}
<path d="${edge}Z" fill="#15121f"/><circle cx="${c}" cy="${c}" r="88" fill="#5326d9"/><circle cx="${c}" cy="${c}" r="84" fill="none" stroke="#c9f26b" stroke-width="1.2"/><circle cx="${c}" cy="${c}" r="60" fill="#15121f" stroke="#c9f26b" stroke-width="1.2"/>
<g fill="none" stroke="#c9f26b" stroke-width=".6" opacity=".9">${rose.join('')}</g>
<defs><path id="${id}t" d="M${c - 72} ${c} A72 72 0 0 1 ${c + 72} ${c}"/><path id="${id}b" d="M${c - 74} ${c} A74 74 0 0 0 ${c + 74} ${c}"/></defs>
<text font-family="Bricolage Grotesque, Inter, system-ui, sans-serif" font-weight="700" font-size="15" letter-spacing="2.4" fill="#ffffff"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">WOMEN CAN CODE</textPath></text>
<text font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="11.5" letter-spacing="2" fill="#c9f26b" dominant-baseline="hanging"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(waveName(wave).toUpperCase())} · ${esc(year(date))}</textPath></text>
<path d="M82 112 q7 -9 14 0 t14 0 t14 0 t14 0" fill="none" stroke="#c9f26b" stroke-width="3" stroke-linecap="round"/>
<text x="${c}" y="100" text-anchor="middle" font-family="Bricolage Grotesque, Inter, system-ui, sans-serif" font-weight="700" font-size="24" fill="#ffffff">${levelNumber(level)}</text>
<text x="${c}" y="136" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="9" letter-spacing="1.6" fill="#ffffff">LEVEL</text></svg>`;
}

const qrSvg = (url, label) => {
  const qr = qrEncode(url), n = qr.size + 2 * QR_QUIET_ZONE;
  return `<svg class="wcc-qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${qrPathData(qr)}" fill="#15121f"/></svg>`;
};

/** The founder's signature: her signature image when given, otherwise her name typeset; nothing invented when neither is set. */
function signatureHtml(c) {
  const f = CERT().founder || {};
  const img = f.signatureImage && (httpsUrl(f.signatureImage) || /^\/[a-z0-9/_.-]+$/i.test(f.signatureImage)) ? `<img src="${esc(f.signatureImage)}" alt="Signature of ${esc(f.name || 'the founder')}">` : '';
  const mark = img || (f.name ? `<span class="wcc-sig-name">${esc(f.name)}</span>` : (c.sample ? '<span class="wcc-sig-name wcc-sig-todo">Founder signature</span>' : '<span class="wcc-sig-name">&nbsp;</span>'));
  return `<div class="wcc-sig">${mark}<span class="wcc-sig-line"></span><span class="wcc-sig-k">${esc(f.name ? `${f.name}, ${f.title || 'Founder'}` : (f.title || `Founder, ${SITE.name}`))}</span></div>`;
}

export const certUrls = (c) => ({ page: `${base()}/certificate/${c.id}`, json: `${base()}/certificate/${c.id}.json`, verify: `${base()}/verify/${c.id}`, badge: `${base()}/certificate/${c.id}/badge.svg`, card: `${base()}/certificate/${c.id}/card.svg` });

export const linkedInFor = (c) => linkedInUrl({ name: credentialSite(levelOf(c)).achievement, organizationName: SITE.name, organizationId: CERT().linkedinOrganizationId || '', date: c.date, expires: c.expires, certUrl: certUrls(c).verify, certId: c.id });

/** The certificate itself: frame, seal, name, project, signature, QR. */
export function certificateHtml(c) {
  const u = certUrls(c), ch = challengeConfig();
  const shot = c.screenshot ? `<img class="wcc-cert-shot" src="${esc(c.screenshot)}" alt="Screenshot of ${esc(c.project)}" width="320" height="200" loading="lazy">` : '';
  return `<article class="wcc-cert${c.sample ? ' is-sample' : ''}${c.revoked_at ? ' is-revoked' : ''}" aria-label="Verifiable certificate for ${esc(c.name)}">
  ${guilloche()}
  ${c.sample ? '<p class="wcc-cert-stamp" aria-hidden="true">SAMPLE</p>' : ''}${c.revoked_at ? '<p class="wcc-cert-stamp is-void" aria-hidden="true">REVOKED</p>' : ''}
  <div class="wcc-cert-in">
    <header class="wcc-cert-top"><p class="wcc-cert-brand">${esc(SITE.name)}</p><p class="wcc-cert-k">Verifiable certificate${c.sample ? ' · SAMPLE' : ''}</p><p class="wcc-cert-k wcc-cert-ach">${esc(credentialSite(levelOf(c)).achievement)}</p></header>
    <p class="wcc-cert-this">This certifies that</p>
    <h1 class="wcc-cert-name">${esc(c.name)}</h1>
    <p class="wcc-cert-line">completed <b>${esc(levelName(levelOf(c)))}</b> of ${esc(ch ? ch.title : 'the 10-day build')}, ${esc(waveName(c.wave || 'wave-1'))}, and shipped a working project</p>
    <div class="wcc-cert-project">${shot}<div><p class="wcc-cert-pk">The project</p><p class="wcc-cert-pn"><a href="${esc(c.live)}" rel="noopener">${esc(c.project)}</a></p>${c.repo ? `<p class="wcc-cert-repo">${esc(c.repo.replace(/^https:\/\//, ''))}</p>` : ''}</div></div>
    <footer class="wcc-cert-foot">
      ${signatureHtml(c)}
      <div class="wcc-cert-seal">${sealSvg({ wave: c.wave, date: c.date, level: levelOf(c), size: 150 })}</div>
      <div class="wcc-cert-check"><a class="wcc-cert-qr" href="${esc(u.verify)}">${qrSvg(u.verify, `QR code to verify certificate ${c.id}`)}</a><dl><div><dt>Issued</dt><dd>${esc(longDate(c.date))}</dd></div><div><dt>Credential ID</dt><dd>${esc(c.id)}</dd></div>${c.expires ? `<div><dt>Valid until</dt><dd>${esc(longDate(c.expires))}</dd></div>` : ''}<div><dt>Verify</dt><dd>${esc(u.verify.replace(/^https:\/\//, ''))}</dd></div></dl></div>
    </footer>
  </div>
</article>`;
}

export async function certificatePage(c, env) {
  const u = certUrls(c), k = { ...CERT(), ...(LEVELS()[levelOf(c)] || {}) };
  const status = c.sample ? '' : (await verifyCert(c, env));
  const actions = `<section class="wcc-cert-actions no-print" aria-label="Use this certificate">
  ${c.sample ? `<p class="wcc-tba"><b>SAMPLE.</b> Placeholder data to review the design. It is not signed and it does not verify. Real certificates are issued by the founder for each finisher.</p>` : (status.ok ? `<p class="wcc-ok-line"><b>Verified.</b> Signed by ${esc(SITE.name)}. <a href="/verify/${esc(c.id)}">See the check</a></p>` : `<p class="wcc-bad-line"><b>Not valid.</b> ${esc(status.reason)} <a href="/verify/${esc(c.id)}">See the check</a></p>`)}
  <div class="wcc-cert-buttons">
    <a class="button primary" href="${esc(linkedInFor(c))}" rel="noopener">Add to LinkedIn profile</a>
    <a class="button ghost" href="/verify/${esc(c.id)}">Verify</a>
    <a class="button ghost" href="/certificate/${esc(c.id)}.json" download="${esc(c.id)}.json">Download the credential (JSON)</a>
    <a class="button ghost" href="/certificate/${esc(c.id)}/badge.svg" download="${esc(c.id)}-badge.svg">Download the badge</a>
    <button class="button ghost" type="button" data-print>Print or save as PDF</button>
  </div>
  <p class="wcc-cert-proves">${esc(k.proves || `What this proves: you finished ${levelName(levelOf(c))} of the 10-day build.`)}</p>
  <p class="wcc-cert-note">${esc(k.notAccredited || '')} Anyone can check it at <a href="/verify/${esc(c.id)}">${esc(u.verify.replace(/^https:\/\//, ''))}</a>, and wallets that read Open Badges 3.0 can import the JSON.</p>
</section>`;
  const body = `<div class="wcc-cert-page">${certificateHtml(c)}${actions}</div><script src="/wcc-cert.js" defer></script>`;
  return layout({ title: `${c.name}: verifiable certificate`, description: `${c.name} completed ${levelName(levelOf(c))} of the ${SITE.name} 10-day build and shipped ${c.project}. A verifiable certificate (Open Badges 3.0).`, path: `/certificate/${c.id}`, body, noindex: !!c.sample, image: { src: `/certificate/${c.id}/card.svg`, alt: `${c.name}, ${SITE.name} verifiable certificate` } });
}

export async function verifyPage(id, c, env) {
  const v = await verifyCert(c, env);
  const head = v.ok
    ? `<p class="wcc-verdict is-ok" role="status"><span aria-hidden="true">✓</span> <b>Verified:</b> issued by ${esc(SITE.name)} to ${esc(c.name)} on ${esc(longDate(c.date))}.</p>`
    : `<p class="wcc-verdict is-bad" role="status"><span aria-hidden="true">✕</span> <b>Not valid.</b> ${esc(v.reason)}</p>`;
  const facts = c && !c.sample ? `<dl class="wcc-verify-facts"><div><dt>Recipient</dt><dd>${esc(c.name)}</dd></div><div><dt>Certificate</dt><dd>${esc(credentialSite(levelOf(c)).achievement)}</dd></div><div><dt>Project</dt><dd><a href="${esc(c.live)}" rel="noopener">${esc(c.project)}</a></dd></div><div><dt>Credential ID</dt><dd>${esc(c.id)}</dd></div><div><dt>Issued</dt><dd>${esc(longDate(c.date))}</dd></div>
  <div><dt>Format</dt><dd>Open Badges 3.0 on the W3C Verifiable Credentials Data Model 2.0</dd></div><div><dt>Proof</dt><dd>Data Integrity, eddsa-jcs-2022 (Ed25519)</dd></div><div><dt>Issuer key</dt><dd><a href="/.well-known/did.json">${esc(`did:web:${SITE.domain}`)}</a></dd></div><div><dt>Status</dt><dd>${c.revoked_at ? 'Revoked' : 'Not revoked'} (<a href="/credentials/revocations">revocation list</a>)</dd></div></dl>` : '';
  const body = `<section class="page-head wcc-verify"><p class="eyebrow">Verify a certificate</p><h1>Certificate ${esc(id)}</h1>${head}${facts}
  ${c ? `<p><a class="button ghost" href="/certificate/${esc(id)}">See the certificate</a> <a class="button ghost" href="/certificate/${esc(id)}.json">The signed credential (JSON)</a></p>` : ''}
  <p class="wcc-cert-note">The check runs on our server: it recomputes the signature over the credential with the issuer's public key, then looks at the revocation list and the expiry date. ${esc(CERT().notAccredited || '')}</p></section>`;
  return { html: layout({ title: `Verify certificate ${id}`, description: `Check a ${SITE.name} verifiable certificate.`, path: `/verify/${id}`, body, noindex: true }), ok: v.ok };
}

/** The badge: the seal on its own, the signed credential baked in as Open Badges 3.0 asks for SVG (openbadges:credential). */
export function badgeSvg(c, vc) {
  const svg = sealSvg({ wave: c.wave, date: c.date, level: levelOf(c), size: 440, cls: 'wcc-badge', extra: ' xmlns="http://www.w3.org/2000/svg" xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"' });
  const baked = vc ? `<openbadges:credential><![CDATA[${JSON.stringify(vc).replace(/]]>/g, ']]]]><![CDATA[>')}]]></openbadges:credential>` : '';
  return svg.replace(/(<svg[^>]*>)/, `$1${baked}`);
}

/** The 1200x627 share card, per credential, as SVG. */
export function cardSvg(c) {
  const name = c.name.length > 26 ? 64 : 84;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" role="img" aria-label="${esc(c.name)}, ${esc(SITE.name)} verifiable certificate">
<rect width="1200" height="627" fill="#15121f"/>
<g color="#c9f26b" opacity=".85">${guilloche(1200, 627, { inset: 22, amp: 6, waves: 90, strands: 4 }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
<text x="80" y="128" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="24" letter-spacing="4" fill="#c9f26b">VERIFIABLE CERTIFICATE${c.sample ? ' · SAMPLE' : ''}</text>
<text x="80" y="176" font-family="Inter, system-ui, sans-serif" font-size="28" fill="#c8c2da">${esc(SITE.name)} certifies that</text>
<text x="80" y="${176 + name + 20}" font-family="Bricolage Grotesque, Inter, system-ui, sans-serif" font-weight="700" font-size="${name}" letter-spacing="-2" fill="#ffffff">${esc(c.name)}</text>
<text x="80" y="${176 + name + 86}" font-family="Inter, system-ui, sans-serif" font-size="28" fill="#f5f3ff">shipped <tspan font-weight="700" fill="#c9f26b">${esc(c.project)}</tspan></text>
<text x="80" y="${176 + name + 126}" font-family="Inter, system-ui, sans-serif" font-size="28" fill="#f5f3ff">${esc(levelName(levelOf(c)))}, the 10-day build.</text>
<text x="80" y="540" font-family="Inter, system-ui, sans-serif" font-size="22" fill="#c8c2da">${esc(longDate(c.date))} · ID ${esc(c.id)} · Open Badges 3.0</text>
<g transform="translate(880 150)"><circle cx="125" cy="125" r="123" fill="#c9f26b"/>${sealSvg({ wave: c.wave, date: c.date, level: levelOf(c), size: 250 }).replace(/^<svg[^>]*>/, '<g transform="scale(1.136)">').replace(/<\/svg>$/, '</g>')}</g>
</svg>`;
}

const asJson = (data, extra = {}) => new Response(JSON.stringify(data, null, 2), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*', ...extra } });
const svgResponse = (svg, extra = {}) => new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600', ...extra } });

export const CREDENTIAL_PATH = /^\/(?:certificate\/[a-z0-9-]{3,60}(?:\.json|\/badge\.svg|\/card\.svg)?|verify\/[a-z0-9-]{3,60}|\.well-known\/did\.json|credentials\/revocations|achievements\/level-\d)$/;

/** Every public credential route; null for paths that are not ours. */
export async function credentialRoute(path, env = {}) {
  if (!CREDENTIAL_PATH.test(path) && !path.startsWith('/certificate/') && !path.startsWith('/verify/')) return null;
  if (path === '/.well-known/did.json') {
    const key = await issuerKey(env);
    if (!key) return new Response(JSON.stringify({ error: 'issuer key not configured' }), { status: 404, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    return asJson(didDocument(SITE.domain, key.publicKeyMultibase, SITE.name), { 'content-type': 'application/did+json' });
  }
  if (path === '/credentials/revocations') {
    let list = []; try { list = (await credentialsFor(env).list()).filter((r) => r.revoked_at); } catch { list = []; }
    return asJson({ id: `${base()}/credentials/revocations`, issuer: `did:web:${SITE.domain}`, revokedCredentials: list.map((r) => ({ id: `${base()}/certificate/${r.id}.json`, revoked: true, ...(r.revoked_reason ? { revocationReason: r.revoked_reason } : {}) })) }, { 'cache-control': 'no-store' });
  }
  const ach = path.match(/^\/achievements\/(level-\d)$/);
  if (ach) return LEVEL_IDS().includes(ach[1]) ? asJson(buildCredential({ ...SAMPLE, id: 'x', level: ach[1] }, credentialSite(ach[1])).credentialSubject.achievement) : htmlResponse(notFoundPage(path), 404);
  const m = path.match(/^\/(certificate|verify)\/([a-z0-9-]{3,60})(\.json|\/badge\.svg|\/card\.svg)?$/);
  if (!m) return htmlResponse(notFoundPage(path), 404);
  const [, kind, id, part] = m;
  const c = await findCert(id, env);
  const noindex = c && c.sample ? { 'x-robots-tag': 'noindex' } : {};
  if (kind === 'verify') { const v = await verifyPage(id, c, env); return htmlResponse(v.html, c ? 200 : 404, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }); }
  if (!c) return htmlResponse(notFoundPage(path), 404);
  if (part === '/card.svg') return svgResponse(cardSvg(c), noindex);
  const vc = await credentialOf(c, env);
  if (part === '/badge.svg') return svgResponse(badgeSvg(c, c.sample ? null : vc), noindex);
  if (part === '.json') {
    if (!vc) return new Response(JSON.stringify({ error: 'This credential cannot be signed until the issuer key is set.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    return asJson(vc, { 'content-type': 'application/vc+ld+json; charset=utf-8', 'content-disposition': `attachment; filename="${id}.json"`, ...noindex });
  }
  return htmlResponse(await certificatePage(c, env), 200, { 'cache-control': 'no-store', ...noindex });
}

export { jcs };
