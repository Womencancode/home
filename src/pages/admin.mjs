import { PACK } from '../site.mjs';
import { countryByCode } from '../countries.mjs';
import { SITE, esc, layout } from '../html.mjs';
import { signInConfigured } from '../owners.mjs';
import { listsOn } from './waitlist.mjs';
import { careerOn, FOCUS_LABEL } from '../careers.mjs';
import { detailsOf } from '../content.mjs';
import { payText } from '../jobs.mjs';
import { rewardText } from '../bounties.mjs';
import { appStoreConfig } from '../appstore.mjs';
import { ontoldOn } from '../partners/ontold.mjs';

const DEFAULT_SLUG = PACK.id;

/** The site's own addresses, from the vars the deploy lane sets, with the Ontold defaults when they are absent. */
export function siteFacts(env = {}, requestUrl = `https://${PACK.id}.ontold.site/`) {
  const here = new URL(requestUrl);
  const slug = DEFAULT_SLUG;
  const environment = env.DEPLOYMENT_ENVIRONMENT || 'development';
  return {
    environment,
    host: here.host,
    liveUrl: env.LIVE_URL || `https://${slug}.ontold.site/`,
    previewUrl: env.PREVIEW_URL || `https://${slug}-preview.ontold.site/`,
    studioUrl: env.STUDIO_URL || `https://ontold.com/apps/${slug}`,
    customDomain: env.CUSTOM_DOMAIN || '',
  };
}

/** "Your site": where this copy is, how to push the preview live, and how a domain is attached. Owners only. */
export function siteCard(site, news = {}) {
  const live = site.environment === 'production';
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };
  const last = news.last_refresh ? new Date(news.last_refresh) : null;
  const rep = news.report;
  const ok = rep ? rep.sources.filter((x) => !x.error).length : 0;
  return `<section class="site-card" aria-labelledby="site-card-h">
  <div class="site-card-head"><p class="eyebrow">Your site</p><h2 id="site-card-h">${live ? 'You are on the live site' : 'You are on the preview'}</h2>
  <p class="lead">${live ? `This is what everyone sees at <strong>${esc(site.host)}</strong>.` : `Only you look at this copy, at <strong>${esc(site.host)}</strong>. Search engines are told to skip it. Nothing here is public until you push it live.`}</p></div>
  <div class="site-steps">
    <article><p class="step-n">1</p><h3>Push live</h3><p>Open ${esc(SITE.name)} in Ontold and press <strong>Push live</strong>. What you see on the preview is copied to <a href="${esc(site.liveUrl)}">${esc(hostOf(site.liveUrl))}</a> and checked before Ontold says it is done.</p><p><a class="button primary" href="${esc(site.studioUrl)}" target="_top">Open in Ontold</a> ${live ? '' : `<a class="button ghost" href="${esc(site.liveUrl)}">See the live site</a>`}</p></article>
    <article><p class="step-n">2</p><h3>Your domain</h3><p>In Ontold, type the domain under <strong>Your domain</strong>, for example ${esc(SITE.domain)}. Ontold points it, and www, at the live site and the certificate follows on its own.</p><p class="small muted">${site.customDomain ? `Attached: <strong>${esc(site.customDomain)}</strong>.` : 'No domain attached yet; the site answers at its ontold.site address meanwhile.'}</p></article>
    <article><p class="step-n">3</p><h3>DNS</h3><p>If the domain's DNS is already hosted by Ontold, there is nothing to set: Ontold creates the records. If it is registered somewhere else, change its two nameservers at your registrar to the ones Ontold's hosting gives the domain, then attach it. That is the only step outside Ontold.</p></article>
  </div>
  <p class="small muted site-news">News reader: ${last ? `last ran ${esc(last.toISOString().slice(0, 16).replace('T', ' '))} UTC, ${ok} of ${rep ? rep.sources.length : 0} sources answered, ${rep ? rep.kept : 0} good-news headlines kept.` : 'has not run yet. It runs every two hours.'} <a href="/admin/news">Review headlines</a> · <a href="/admin/coverage">Pictures: what has a photo and what is missing</a>${listsOn() ? ' · <a href="/admin/waitlist">Waitlist: who is waiting for what</a>' : ''}${careerOn('rooms') ? ' · <a href="/admin/rooms">Rooms: open one when it is ready</a>' : ''}${appStoreConfig() ? ` · <a href="/admin/apps">${esc(appStoreConfig().title)}: apps and makers' questions</a>` : ''}${ontoldOn() ? ' · <a href="/admin/ontold">Make with Ontold: covers, posters and words, as your own Ontold account</a>' : ''}</p>
</section>`;
}

/** The headlines the reader kept, newest first, each with a hide or show switch. */
export function adminNewsPage(items, message = '', news = {}) {
  const rep = news.report;
  const rows = items.map((n) => {
    const c = countryByCode(n.country);
    return `<li class="admin-news${n.hidden ? ' is-hidden' : ''}"><p class="small muted">${c ? `<span aria-hidden="true">${c.flag}</span> ${esc(c.name)}` : esc(n.country)} · ${esc(n.source)} · ${esc(String(n.published_at).slice(0, 10))}${n.hidden ? ' · hidden' : ''}</p><p><a href="${esc(n.url)}" rel="noopener nofollow" target="_blank">${esc(n.title)}</a></p><form method="post" action="/admin/news/hide"><input type="hidden" name="id" value="${n.id}"><button class="button small${n.hidden ? '' : ' ghost'}" name="hidden" value="${n.hidden ? '0' : '1'}">${n.hidden ? 'Show again' : 'Hide'}</button></form></li>`;
  }).join('');
  const sources = rep ? `<details class="sources"><summary>Last run: ${rep.sources.length} sources, ${rep.kept} kept</summary><table><thead><tr><th>Source</th><th>Read</th><th>Kept</th><th>Problem</th></tr></thead><tbody>${rep.sources.map((x) => `<tr><td>${esc(x.name)}${x.country ? ` (${esc(x.country)})` : ''}</td><td>${x.read}</td><td>${x.kept}</td><td>${esc(x.error || '')}</td></tr>`).join('')}</tbody></table></details>` : '';
  const body = `<section class="page-head"><p class="eyebrow"><a href="/admin">Moderation</a></p><h1>Headlines from around the web</h1><p class="lead">Kept automatically when a headline reads as good news. Hide anything that should not be here; it stays hidden when the reader sees it again.</p>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}<form method="post" action="/admin/news/refresh"><button class="button" type="submit">Read the sources now</button></form>${sources}</section><section class="section"><ul class="admin-news-list">${rows || '<li class="muted">Nothing yet. The reader runs every two hours, or press the button.</li>'}</ul></section>`;
  return layout({ title: 'Headlines', path: '/admin/news', body, noindex: true });
}

const KIND_LABEL = { mentor: 'mentor offer', mentee: 'mentorship request (private)', bounty: 'bounty', tribute: 'tribute (no email; name shown only if ticked)' };

/** The structured part of a career submission, for the moderator: a job's band, focus areas, a mentee's answers, a bounty's reward
 * and skills, a profile's portfolio and verified state. '' for a row without details. */
export function detailsBlock(r) {
  const d = detailsOf(r);
  const out = [];
  if (d.pay) out.push(`<p><strong>Pay:</strong> ${esc(payText(d.pay) || JSON.stringify(d.pay))} · ${esc(d.employment || '')} · ${esc(d.workplace || '')}${d.location ? ` · ${esc(d.location)}` : ''}</p>`);
  if (Array.isArray(d.focus) && d.focus.length) out.push(`<p><strong>Focus:</strong> ${esc(d.focus.map((f) => FOCUS_LABEL[f] || f).join(', '))}</p>`);
  if (r.kind === 'mentee') out.push(`<p><strong>Now:</strong> ${esc(d.now || '')}</p><p><strong>Going:</strong> ${esc(d.next || '')}</p><p><strong>In the way:</strong> ${esc(d.blocker || '')}</p>${d.mentor ? `<p><strong>Asked for:</strong> ${esc(d.mentor)}</p>` : ''}`);
  if (d.reward) out.push(`<p><strong>Reward:</strong> ${esc(rewardText(d.reward))} · <strong>Skills:</strong> ${esc((d.skills || []).join(', '))} · <strong>Due:</strong> ${esc(r.end_date || '')} · payment arranged with the sponsor</p>`);
  if (Array.isArray(d.portfolio) && d.portfolio.length) out.push(`<ul>${d.portfolio.map((x) => `<li><a class="outlink" href="${esc(x.link)}" rel="noopener noreferrer nofollow">${esc(x.title)}</a>: ${esc(x.what)}${x.ref ? ` (for ${esc(x.ref)})` : ''}</li>`).join('')}</ul>`);
  return out.join('');
}

/** The verify switch on an approved profile, when the pack has proof-of-work profiles. */
const verifyForm = (r) => (careerOn('profiles') && r.kind === 'talent' && r.status === 'approved' ? `<form class="review" method="post" action="/admin/verify"><input type="hidden" name="id" value="${r.id}"><button class="button small${r.verified_at ? ' ghost' : ''}" name="verified" value="${r.verified_at ? '0' : '1'}">${r.verified_at ? 'Remove Verified' : '✓ Mark Verified'}</button><span class="small muted">${r.verified_at ? ` Verified ${esc(String(r.verified_at).slice(0, 10))} by ${esc(r.verified_by || 'owner')}` : ' Only when you have checked this person and their work.'}</span></form>` : '');

/** The moderation queue. Reached only after isAdmin() passed. `site` and `news` feed the "Your site" card at the top. */
export function adminPage(rows, stats, status, message = '', who = '', site = null, news = {}) {
  const tabs = ['pending', 'approved', 'declined'].map((s) => `<a class="chip${status === s ? ' active' : ''}" href="/admin?status=${s}">${s} (${stats[s] || 0})</a>`).join('');
  const list = rows.map((r) => {
    const c = countryByCode(r.country);
    return `<article class="card admin-card">
  <p class="card-kicker">#${r.id} · ${esc(KIND_LABEL[r.kind] || (r.kind === 'opportunity' && r.category === 'job' ? 'job' : r.kind))} · ${c ? `<span aria-hidden="true">${c.flag}</span> ${esc(c.name)}` : esc(r.country)} · ${esc(r.year || '')} · ${esc(r.medium || r.category || '')} · ${esc(r.created_at.slice(0, 10))}</p>
  <h3>${esc(r.title)}</h3>
  ${r.creator ? `<p class="byline">${esc(r.creator)}</p>` : ''}
  <p>${esc(r.summary)}</p>
  ${detailsBlock(r)}
  ${r.url ? `<p><a class="outlink" href="${esc(r.url)}" rel="noopener noreferrer nofollow">${esc(r.url)}</a></p>` : ''}
  <p class="small muted">From ${esc(r.submitter_name || 'anonymous')}${r.submitter_email ? ` &lt;${esc(r.submitter_email)}&gt;` : ''}${r.review_note ? ` · note: ${esc(r.review_note)}` : ''}</p>
  <form class="review" method="post" action="/admin/review"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="back" value="${esc(status)}"><input name="note" type="text" placeholder="Note (optional)" maxlength="300">${status !== 'approved' ? '<button class="button small primary" name="status" value="approved">Approve</button>' : ''}${status !== 'declined' ? '<button class="button small" name="status" value="declined">Decline</button>' : ''}${status !== 'pending' ? '<button class="button small ghost" name="status" value="pending">Back to pending</button>' : ''}</form>
  ${verifyForm(r)}
</article>`;
  }).join('');
  const body = `${site ? siteCard(site, news) : ''}<section class="page-head"><p class="eyebrow">Moderation${who && who !== 'token' ? ` · ${esc(who)}` : ''}</p><h1>Submissions</h1><p class="admin-add"><span class="muted small">Add to the site, published at once:</span> <a class="button small primary" href="/submit?kind=opportunity">Opportunity</a> <a class="button small" href="/submit?kind=event">Event</a> <a class="button small" href="/submit?kind=story">Story</a> <a class="button small" href="/submit?kind=work">Work</a> <a class="button small" href="/submit?kind=talent">Person</a>${careerOn('jobs') ? ' <a class="button small" href="/jobs/post">Job</a>' : ''}${careerOn('bounties') ? ' <a class="button small" href="/bounties/post">Bounty</a>' : ''}</p><p class="chips">${tabs}</p>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}</section><section class="section">${list || '<p class="muted">Nothing here.</p>'}</section><p class="small"><a href="/admin/logout">Sign out</a></p>`;
  return layout({ title: 'Moderation', path: '/admin', body, noindex: true });
}

/** The sign-in page. By email when owners are listed (the normal way), by token when only ADMIN_TOKEN is set. */
export function adminLoginPage({ env = {}, problem = '', sent = '' } = {}) {
  const byEmail = signInConfigured(env);
  const form = byEmail
    ? `<form method="post" action="/admin/login" class="submit-form"><div class="field"><label for="f-email">Your email</label><p class="hint">The address this site knows as its owner. A sign-in link is sent to it; it works once and expires in 15 minutes.</p><input id="f-email" name="email" type="email" autocomplete="email" required></div><p><button class="button primary" type="submit">Email me a sign-in link</button></p></form>`
    : `<form method="post" action="/admin/login" class="submit-form"><div class="field"><label for="f-token">Admin token</label><input id="f-token" name="token" type="password" autocomplete="current-password" required></div><p><button class="button primary" type="submit">Sign in</button></p></form>`;
  const body = `<section class="page-head"><p class="eyebrow">Moderation</p><h1>Sign in</h1>${problem ? `<p class="error" role="alert">${esc(problem)}</p>` : ''}${sent ? `<div class="notice success" role="status"><p>If <strong>${esc(sent)}</strong> is an owner of this site, a sign-in link is on its way. Open it on this device.</p></div>` : form}</section>`;
  return layout({ title: 'Sign in', path: '/admin/login', body, noindex: true });
}
