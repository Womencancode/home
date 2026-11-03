/* /talent/<slug>: a person's shareable proof-of-work page; /talent/add: the form to send a profile with portfolio items in. */
import { SITE, esc, layout, shareBar } from '../html.mjs';
import { socialRow } from '../social.mjs';
import { VERIFIED, PROFILE_LIMITS } from '../profiles.mjs';
import { field, tick, countrySelect, guards, valOf, sentNote } from './forms.mjs';

/** The badge, only for a person an owner has verified. */
export const verifiedBadge = (p) => (p.verified ? `<span class="verified-badge" title="Checked by ${esc(SITE.name)}"><span aria-hidden="true">✓</span> ${VERIFIED}</span>` : '');

const refLine = (ref) => { if (!ref) return ''; const b = /^c-\d+$/.test(ref); return `<p class="small muted">For ${b ? `<a href="/bounties/${esc(ref)}">bounty ${esc(ref)}</a>` : esc(ref)}</p>`; };

/** The page: name, badge, headline, where they are, about, the portfolio, their works and links. */
export function profilePage(p) {
  const body = `
<article class="article profile">
  <p class="eyebrow"><a href="/talent">Talent</a>${p.countries.map((k) => ` · <a href="/country/${esc(k.slug)}"><span aria-hidden="true">${k.flag}</span> ${esc(k.name)}</a>`).join('')}</p>
  <h1>${esc(p.name)} ${verifiedBadge(p)}</h1>
  ${p.headline ? `<p class="byline">${esc(p.headline)}</p>` : p.disciplines.length ? `<p class="byline">${esc(p.disciplines.join(', '))}</p>` : ''}
  ${socialRow(p.socials, esc)}
  ${p.about ? `<p class="article-lead">${esc(p.about)}</p>` : ''}
  ${p.portfolio.length ? `<h2>Proof of work</h2><div class="job-grid">${p.portfolio.map((x) => `<article class="job-card portfolio-item"><h3><a href="${esc(x.link)}" rel="noopener nofollow ugc" target="_blank">${esc(x.title)}</a></h3><p>${esc(x.what)}</p>${refLine(x.ref)}</article>`).join('')}</div>` : ''}
  ${p.works.length ? `<h2>In the showcase</h2><ul class="people">${p.works.map((w) => `<li><a href="/work/${esc(w.slug)}">${esc(w.title)}</a> <span class="muted">${esc(w.medium || '')} ${esc(w.year || '')}</span></li>`).join('')}</ul>` : ''}
  ${p.url ? `<p><a class="button primary" href="${esc(p.url)}" rel="noopener nofollow ugc">Their page</a></p>` : ''}
  ${shareBar(`/talent/${p.slug}`, `${p.name} on ${SITE.name}`)}
  <p class="muted small">${p.verified ? `A person at ${esc(SITE.name)} checked this profile.` : 'Shared with this site and read by a moderator. Not verified yet.'} Something wrong? <a href="/submit?kind=correction&title=${encodeURIComponent(`Correction: ${p.name}`)}">Tell us</a>.</p>
</article>`;
  return layout({ title: p.name, description: (p.headline || p.about || `${p.name} on ${SITE.name}`).slice(0, 200), path: `/talent/${p.slug}`, type: 'profile', body, current: '/talent', jsonld: { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: p.name, ...(p.headline ? { description: p.headline } : {}), ...(p.url ? { url: p.url } : {}) } } });
}

/** /talent/add: the person and up to three pieces of work. */
export function addProfilePage(state = {}, env = {}) {
  const input = state.input || {}, errors = state.errors || {}, val = valOf(input);
  const item = (i) => `<fieldset class="portfolio-in${errors[`p${i}`] ? ' has-error' : ''}"><legend>Piece of work ${i}${i > 1 ? ' (optional)' : ''}</legend>
    ${field(errors, `p${i}_title`, 'Title', `<input id="f-p${i}_title" name="p${i}_title" type="text" maxlength="${PROFILE_LIMITS.item}" value="${val(`p${i}_title`)}">`)}
    ${field(errors, `p${i}_what`, 'What you did', `<textarea id="f-p${i}_what" name="p${i}_what" rows="2" maxlength="${PROFILE_LIMITS.what}">${val(`p${i}_what`)}</textarea>`)}
    <div class="field-row">${field(errors, `p${i}_link`, 'Link', `<input id="f-p${i}_link" name="p${i}_link" type="url" maxlength="500" value="${val(`p${i}_link`)}" placeholder="https://">`)}
    ${field(errors, `p${i}_ref`, 'For (optional)', `<input id="f-p${i}_ref" name="p${i}_ref" type="text" maxlength="${PROFILE_LIMITS.ref}" value="${val(`p${i}_ref`)}" placeholder="A sponsor, or a bounty number like c-12">`)}</div>
    ${errors[`p${i}`] ? `<p class="error" role="alert">${esc(errors[`p${i}`])}</p>` : ''}</fieldset>`;
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/talent">Talent</a></p><h1>Add your <em>proof of work</em></h1><p class="lead">Show what you have made, with links people can check. Once a moderator approves it, your page lives at its own address you can share. The Verified badge is added only when a person here has checked it.</p></section>
<section class="section">${sentNote(state, 'profile')}
<form class="submit-form" method="post" action="/talent/add" novalidate>
  <div class="field-row">
    ${field(errors, 'name', 'Your name', `<input id="f-name" name="name" type="text" maxlength="${PROFILE_LIMITS.name}" value="${val('name')}" required autocomplete="name">`)}
    ${field(errors, 'headline', 'What you do, in a line', `<input id="f-headline" name="headline" type="text" maxlength="${PROFILE_LIMITS.headline}" value="${val('headline')}" placeholder="Product designer for fintech" required>`)}
  </div>
  <div class="field-row">
    ${field(errors, 'country', 'Where you are based', countrySelect('country', input.country))}
    ${field(errors, 'city', 'City', `<input id="f-city" name="city" type="text" maxlength="80" value="${val('city')}">`, 'Optional.')}
  </div>
  ${field(errors, 'about', 'About you and your work', `<textarea id="f-about" name="about" rows="4" maxlength="${PROFILE_LIMITS.about}" required>${val('about')}</textarea>`)}
  ${field(errors, 'url', 'Your own page', `<input id="f-url" name="url" type="url" maxlength="500" value="${val('url')}" placeholder="https://">`, 'Optional: your site or a profile.')}
  ${[1, 2, 3].map(item).join('')}
  ${field(errors, 'submitter_email', 'Your email', `<input id="f-submitter_email" name="submitter_email" type="email" maxlength="200" value="${val('submitter_email')}" autocomplete="email">`, 'Never shown. It helps us verify you later.')}
  ${tick(errors, 'profile_consent', 'This is me, and the work above is mine to show.', input.profile_consent === 'yes')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Send my profile in</button></p>
</form></section>`;
  return layout({ title: 'Add your proof of work', description: `Add a profile with your portfolio to ${SITE.name}. Moderated, and shareable once it is up.`, path: '/talent/add', body, current: '/talent', noindex: !!state.input });
}
