/* Pack file: /admin/certificates, where only a signed-in owner issues certificates. Approve a finisher's submitted project (a "work"
 * submission), fill in the evidence, issue (build the Open Badges 3.0 credential, sign it with WCC_ISSUER_KEY, store it), and revoke.
 * Owner means a live admin session for an address in OWNER_EMAILS; the operator token, a visitor or a forged cookie cannot issue. */
import { SITE, esc, layout, htmlResponse } from './html.mjs';
import { notFoundPage } from './pages/about.mjs';
import { storeFor } from './store.mjs';
import { ownerEmails, signInConfigured, sessionOwner } from './owners.mjs';
import { readBody } from './submissions.mjs';
import { httpsUrl } from './tracks.mjs';
import { longDate } from './cohorts.mjs';
import { credentialsFor } from './certstore.mjs';
import { buildCredential, signCredential, issuerKey, keyIdFor, hashedEmail } from './credential.mjs';
import { credentialSite, validCert, skillsExercises, FOUNDER_DRAFT, CERTS, ID, LEVEL_IDS, levelOf, levelName } from './certificates.mjs';

const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
const redirect = (to) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store' } });

/** The signed-in owner's address, or null. */
export async function certOwner(request, env) {
  const email = await sessionOwner(request, env, storeFor(env)).catch(() => null);
  return email && ownerEmails(env).includes(String(email).toLowerCase()) ? email : null;
}

const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const shortId = () => [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Turn the form into a record, or a list of problems. */
export function readIssueForm(body, exercises = skillsExercises()) {
  const t = (k, n = 200) => String(body[k] || '').trim().slice(0, n);
  const picked = exercises.filter((x) => body[`ex_${slug(x.url)}`] === 'on' || body[`ex_${slug(x.url)}`] === '1');
  const r = {
    id: t('id', 60) || `${slug(t('name')) || 'cert'}-${shortId()}`, name: t('name', 120), email: t('email', 200).toLowerCase(), project: t('project', 140),
    live: t('live', 500), repo: t('repo', 500), pitch: t('pitch', 500), screenshot: t('screenshot', 500), wave: /^wave-\d{1,3}$/.test(t('wave')) ? t('wave') : 'wave-1', level: levelOf({ level: t('level', 20) }),
    date: t('date', 10), expires: t('expires', 10), exercises: picked, submission_id: Number(body.submission_id) || null,
  };
  const problems = [];
  if (!ID.test(r.id) || r.id === 'sample') problems.push('The credential ID must be 3 to 60 lower-case letters, numbers or dashes.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) problems.push('The recipient\'s email is needed. Only a salted hash of it goes in the credential.');
  if (!validCert({ ...r, repo: r.repo || undefined, screenshot: r.screenshot || undefined, expires: r.expires || undefined })) problems.push('Name, project, a live https link and the date (YYYY-MM-DD) are needed; the repo and screenshot must be https links and any expiry after the date.');
  if (r.pitch && /^https?:/.test(r.pitch) && !httpsUrl(r.pitch)) problems.push('The pitch link must be https.');
  return { record: r, problems };
}

/** Issue: sign and store. Returns { ok, id } or { ok: false, problems }. */
export async function issue(env, body, owner, now = new Date()) {
  const { record: r, problems } = readIssueForm(body);
  if (problems.length) return { ok: false, problems, record: r };
  const key = await issuerKey(env);
  if (!key) return { ok: false, problems: ['The signing key is not set on this server (Worker secret WCC_ISSUER_KEY). See the pack README.'], record: r };
  const store = credentialsFor(env);
  if (CERTS.some((c) => c.id === r.id) || (await store.get(r.id))) return { ok: false, problems: [`A certificate with the ID ${r.id} already exists.`], record: r };
  const identity = await hashedEmail(r.email);
  const vc = await signCredential(buildCredential({ ...r, identity }, credentialSite(r.level)), key, keyIdFor(SITE.domain), now.toISOString().replace(/\.\d{3}Z$/, 'Z'));
  const { email, ...kept } = r;
  await store.insert({ ...kept, credential: JSON.stringify(vc), issued_by: owner, issued_at: now.toISOString() });
  return { ok: true, id: r.id };
}

const field = (name, label, value = '', { type = 'text', hint = '', required = false } = {}) => `<label class="wcc-f"><span>${esc(label)}${required ? ' <i>(needed)</i>' : ''}</span><input name="${name}" type="${type}" value="${esc(value || '')}"${required ? ' required' : ''}>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;

export function issueForm(pre = {}, problems = []) {
  const ex = skillsExercises();
  const on = new Set((pre.exercises || []).map((x) => x.url));
  return `<form class="wcc-issue" method="post" action="/admin/certificates/issue">
  ${problems.length ? `<ul class="wcc-bad-line" role="alert">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
  <input type="hidden" name="submission_id" value="${esc(pre.submission_id || '')}">
  <div class="wcc-issue-grid">
  ${field('name', 'Recipient name, as it should appear', pre.name, { required: true })}
  ${field('email', 'Recipient email (hashed, never stored)', pre.email, { type: 'email', required: true })}
  ${field('project', 'Project name', pre.project, { required: true })}
  ${field('live', 'Live project URL', pre.live, { type: 'url', required: true, hint: 'https only' })}
  ${field('repo', 'Repository URL', pre.repo, { type: 'url' })}
  ${field('pitch', 'Demo day pitch (a video link or one line)', pre.pitch)}
  ${field('screenshot', 'Screenshot URL (optional)', pre.screenshot, { hint: 'https, or a path on this site' })}
  <label class="wcc-f"><span>Certificate <i>(needed)</i></span><select name="level" required>${LEVEL_IDS().map((l) => `<option value="${esc(l)}"${levelOf(pre) === l ? ' selected' : ''}>${esc(levelName(l))} certificate</option>`).join('')}</select><small>Each level is its own certificate. Issue Level 1 and Level 2 separately.</small></label>
  ${field('wave', 'Wave', pre.wave || 'wave-1')}
  ${field('date', 'Issue date', pre.date, { type: 'date', required: true })}
  ${field('expires', 'Valid until (optional)', pre.expires, { type: 'date' })}
  ${field('id', 'Credential ID (optional)', pre.id, { hint: 'Left blank, one is made from the name' })}
  </div>
  <fieldset class="wcc-ex"><legend>GitHub Skills exercises completed</legend>${ex.map((x) => `<label><input type="checkbox" name="ex_${slug(x.url)}"${on.has(x.url) ? ' checked' : ''}> ${esc(x.name)}</label>`).join('')}</fieldset>
  <p><button class="button primary" type="submit">Sign and issue</button> <small>Issuing signs the credential with the site's key. You can revoke it later; you cannot edit it.</small></p>
</form>`;
}

export function adminCertificatesPage({ owner, works = [], issued = [], pre = null, problems = [], message = '', keyReady = false }) {
  const draft = FOUNDER_DRAFT ? { ...FOUNDER_DRAFT, live: FOUNDER_DRAFT.live || '', exercises: [] } : null;
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Admin</a></p><h1>Certificates</h1>
  <p class="lead">Approve a finisher's project, choose the level she finished, fill in the evidence, then sign and issue her verifiable certificate (Open Badges 3.0). Level 1 and Level 2 are issued separately. Signed in as ${esc(owner)}.</p>
  ${message ? `<p class="wcc-ok-line" role="status">${esc(message)}</p>` : ''}
  ${keyReady ? '<p class="wcc-ok-line">The signing key is set.</p>' : '<p class="wcc-bad-line"><b>The signing key is not set.</b> Issuing is off until the Worker secret WCC_ISSUER_KEY exists. The pack README says how it is made.</p>'}</section>
<section class="section"><h2>Finishers' projects</h2>${works.length ? `<ul class="wcc-admin-list">${works.map((w) => `<li><div><b>${esc(w.title)}</b> <span class="wcc-pill">${esc(w.status)}</span><br><small>${esc(w.submitter_name || w.creator || '')} · <a href="${esc(w.url)}" rel="noopener">${esc(w.url)}</a></small></div><div class="wcc-admin-acts">${w.status === 'pending' ? `<form method="post" action="/admin/certificates/approve"><input type="hidden" name="id" value="${w.id}"><button class="button small ghost">Approve project</button></form>` : ''}${w.status === 'approved' ? `<a class="button small primary" href="/admin/certificates?from=${w.id}#issue">Prepare certificate</a>` : ''}</div></li>`).join('')}</ul>` : '<p>No submitted projects yet. Finishers submit theirs at <a href="/submit?kind=work">/submit</a>.</p>'}</section>
${draft ? `<section class="section"><h2>Your own credential</h2><p>You are the first customer. Fill in your name as it should appear, your project's live and repository links, and the date, then sign it. ${draft.name && draft.live && draft.date ? '' : 'Nothing is filled in for you.'} <a class="button small ghost" href="/admin/certificates?draft=founder#issue">Prepare mine</a></p></section>` : ''}
<section class="section" id="issue"><h2>Issue a certificate</h2>${issueForm(pre || {}, problems)}</section>
<section class="section"><h2>Issued</h2>${issued.length ? `<ul class="wcc-admin-list">${issued.map((c) => `<li><div><b><a href="/certificate/${esc(c.id)}">${esc(c.name)}</a></b> ${c.revoked_at ? '<span class="wcc-pill is-void">revoked</span>' : '<span class="wcc-pill">valid</span>'}<br><small>${esc(levelName(levelOf(c)))} · ${esc(c.project)} · ${esc(longDate(c.date))} · ID ${esc(c.id)} · by ${esc(c.issued_by)}</small></div>${c.revoked_at ? '' : `<form class="wcc-admin-acts" method="post" action="/admin/certificates/revoke"><input type="hidden" name="id" value="${esc(c.id)}"><input name="reason" placeholder="Reason (shown on verify)" aria-label="Reason for revoking ${esc(c.name)}"><button class="button small ghost">Revoke</button></form>`}</li>`).join('')}</ul>` : '<p>None yet.</p>'}</section>`;
  return layout({ title: 'Certificates', description: 'Issue and revoke verifiable certificates.', path: '/admin/certificates', body, noindex: true });
}

/** /admin/certificates and its posts. 404 when admin is not set up; sign-in first otherwise. */
export async function adminCertificatesRoute(request, env = {}, now = new Date()) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  if (!(signInConfigured(env) || env.ADMIN_TOKEN)) return htmlResponse(notFoundPage(path), 404);
  const owner = await certOwner(request, env);
  if (!owner) return method === 'GET' ? redirect('/admin/login') : new Response(JSON.stringify({ error: 'only a signed-in owner can do this' }), { status: 403, headers: { 'content-type': 'application/json', ...NO_STORE } });
  if (method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('Cross-site request refused', { status: 403, headers: NO_STORE });
  }
  const subs = storeFor(env), certs = credentialsFor(env);
  const page = async (extra = {}, status = 200) => {
    const works = [...await subs.byStatus('pending'), ...await subs.byStatus('approved')].filter((w) => w.kind === 'work');
    return htmlResponse(adminCertificatesPage({ owner, works, issued: await certs.list(), keyReady: !!(await issuerKey(env)), ...extra }), status, NO_STORE);
  };
  if (path === '/admin/certificates/approve' && method === 'POST') {
    const b = await readBody(request); const w = await subs.get(Number(b.id));
    if (!w || w.kind !== 'work') return redirect('/admin/certificates?m=That+project+was+not+found.');
    await subs.review(w.id, 'approved', `approved for a certificate by ${owner}`, now.toISOString());
    return redirect(`/admin/certificates?from=${w.id}&m=${encodeURIComponent(`Approved ${w.title}.`)}#issue`);
  }
  if (path === '/admin/certificates/issue' && method === 'POST') {
    const r = await issue(env, await readBody(request), owner, now);
    if (!r.ok) return page({ pre: r.record, problems: r.problems }, 400);
    return redirect(`/certificate/${r.id}`);
  }
  if (path === '/admin/certificates/revoke' && method === 'POST') {
    const b = await readBody(request);
    const ok = await certs.revoke(String(b.id || ''), String(b.reason || '').trim().slice(0, 200), now.toISOString());
    return redirect(`/admin/certificates?m=${encodeURIComponent(ok ? `Revoked ${b.id}.` : 'Nothing was revoked.')}`);
  }
  if (path !== '/admin/certificates' || method !== 'GET') return new Response('Not found', { status: 404, headers: NO_STORE });
  let pre = null;
  const from = Number(url.searchParams.get('from'));
  if (from) { const w = await subs.get(from); if (w && w.kind === 'work' && w.status === 'approved') pre = { submission_id: w.id, name: w.submitter_name || w.creator, email: w.submitter_email, project: w.title, live: w.url, date: now.toISOString().slice(0, 10), exercises: [] }; }
  if (url.searchParams.get('draft') === 'founder' && FOUNDER_DRAFT) pre = { ...FOUNDER_DRAFT, id: FOUNDER_DRAFT.id, exercises: [] };
  return page({ pre, message: url.searchParams.get('m') || '' });
}
