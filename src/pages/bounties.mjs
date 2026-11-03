/* /bounties: sponsor briefs with a reward, skills and a deadline; /bounties/<id>: one brief and an "I'm interested" form;
 * /bounties/post: the sponsor's form. Listing only: payment is arranged with the sponsor, and every page says so. */
import { countryByCode } from '../countries.mjs';
import { SITE, esc, layout } from '../html.mjs';
import { PAYMENT_NOTE, rewardText, bountyFeature } from '../bounties.mjs';
import { field, tick, countrySelect, guards, valOf, sentNote } from './forms.mjs';

const dayLabel = (iso) => { try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return iso; } };
const payment = (b) => `<p class="bounty-pay"><strong>Payment:</strong> ${b.payment ? esc(b.payment.label || '') : PAYMENT_NOTE}</p>`;

/** One bounty as a card: reward, title, sponsor, skills, deadline and how payment works. */
export function bountyCard(b) {
  return `<article class="job-card bounty-card" id="${esc(b.id)}">
  <p class="job-top"><span class="pay-badge">${esc(rewardText(b.reward))}</span>${b.deadline ? `<span>Due ${esc(dayLabel(b.deadline))}</span>` : ''}</p>
  <h3><a href="/bounties/${esc(b.id)}">${esc(b.title)}</a></h3>
  <p class="job-org">Sponsored by <a href="${esc(b.sponsorUrl)}" rel="noopener nofollow" target="_blank">${esc(b.sponsor)}</a></p>
  <p class="opp-fields">${b.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</p>
  ${payment(b)}
  <p class="opp-go"><a class="button small primary" href="/bounties/${esc(b.id)}">Read the brief</a></p>
</article>`;
}

/** /bounties: every open brief. */
export function bountiesPage(list) {
  const body = `
<section class="page-head"><p class="eyebrow">Bounties</p><h1>Paid briefs from <em>sponsors</em></h1>
  <p class="lead">A sponsor posts a piece of work with a reward, the skills it needs and a deadline. Say you are interested and we pass it on. Payment: ${PAYMENT_NOTE}</p>
  <p class="hero-actions"><a class="button ghost" href="/bounties/post">Post a bounty</a></p></section>
<section class="section">${list.length ? `<div class="job-grid">${list.map(bountyCard).join('')}</div>` : '<div class="invite"><p>No bounties are open right now. Got a piece of work that needs doing? <a class="button" href="/bounties/post">Post a bounty</a></p></div>'}</section>`;
  return layout({ title: 'Bounties', description: `Paid briefs from sponsors, with the reward, skills and deadline on each, on ${SITE.name}.`, path: '/bounties', body, current: '/bounties' });
}

/** /bounties/<id>: the brief and the interest form. */
export function bountyPage(b, { sent = false, form = {}, env = {} } = {}) {
  const errors = form.errors || {}, c = countryByCode(b.country);
  const body = `
<article class="article"><p class="eyebrow"><a href="/bounties">Bounties</a>${c ? ` · <span aria-hidden="true">${c.flag}</span> ${esc(c.name)}` : ''}${b.deadline ? ` · Due ${esc(dayLabel(b.deadline))}` : ''}</p>
  <h1>${esc(b.title)}</h1>
  <p class="byline">Sponsored by <a href="${esc(b.sponsorUrl)}" rel="noopener nofollow" target="_blank">${esc(b.sponsor)}</a></p>
  <p class="job-pay">${esc(rewardText(b.reward))}</p>
  <p class="article-lead">${esc(b.summary)}</p>
  <p class="opp-fields">${b.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</p>
  ${payment(b)}
  <p class="muted small">The sponsor wrote this brief and a moderator read it before it went up. ${esc(SITE.name)} does not hold or send the reward.</p>
</article>
<section class="section">${sent ? '<div class="notice success" role="status"><h2>Thank you.</h2><p>We have your interest and will pass it to the sponsor. You can <a href="/waitlist/leave">take your address off</a> at any time.</p></div>' : `
<form class="submit-form waitlist-form" method="post" action="/bounties/${esc(b.id)}" novalidate>
  <h2>I'm interested</h2>
  <input type="hidden" name="feature" value="${esc(bountyFeature(b.id))}">
  <div class="field${errors.email ? ' has-error' : ''}"><label for="w-email">Your email</label><p class="hint">Never shown. We pass it to the sponsor only for this brief.</p><input id="w-email" name="email" type="email" maxlength="200" autocomplete="email" required>${errors.email ? `<p class="error" role="alert">${esc(errors.email)}</p>` : ''}</div>
  <div class="field${errors.use_case ? ' has-error' : ''}"><label for="w-use_case">How you would do it</label><p class="hint">A line or two, and a link to work like it. Up to 500 characters.</p><textarea id="w-use_case" name="use_case" rows="4" maxlength="500">${esc(form.use_case || '')}</textarea></div>
  ${tick(errors, 'consent', 'Pass my email and note to the sponsor for this brief. I can leave at any time at /waitlist/leave.')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Say I'm interested</button></p>
</form>`}</section>`;
  return layout({ title: b.title, description: `${rewardText(b.reward)} bounty from ${b.sponsor}: ${b.summary}`.slice(0, 200), path: `/bounties/${b.id}`, body, current: '/bounties', noindex: sent || !!form.errors });
}

/** /bounties/post: the sponsor's brief. */
export function postBountyPage(state = {}, env = {}) {
  const input = state.input || {}, errors = state.errors || {}, val = valOf(input);
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/bounties">Bounties</a></p><h1>Post a <em>bounty</em></h1><p class="lead">A clear piece of work, a reward and a deadline. A person reads every brief before it goes up. Payment: ${PAYMENT_NOTE} You pay the person you choose directly.</p></section>
<section class="section">${sentNote(state, 'brief')}
<form class="submit-form" method="post" action="/bounties/post" novalidate>
  ${field(errors, 'title', 'What needs doing', `<input id="f-title" name="title" type="text" maxlength="160" value="${val('title')}" required>`)}
  <div class="field-row">
    ${field(errors, 'sponsor', 'Sponsor', `<input id="f-sponsor" name="sponsor" type="text" maxlength="120" value="${val('sponsor')}" required>`)}
    ${field(errors, 'url', 'Sponsor\'s website', `<input id="f-url" name="url" type="url" maxlength="500" value="${val('url')}" placeholder="https://" required>`)}
  </div>
  ${field(errors, 'country', 'Sponsor\'s country', countrySelect('country', input.country))}
  <div class="field-row">
    ${field(errors, 'reward', 'Reward', `<input id="f-reward" name="reward" type="text" inputmode="decimal" maxlength="20" value="${val('reward')}" placeholder="1500" required>`)}
    ${field(errors, 'currency', 'Currency', `<input id="f-currency" name="currency" type="text" maxlength="3" value="${val('currency') || 'USD'}" autocapitalize="characters" required>`)}
    ${field(errors, 'deadline', 'Due', `<input id="f-deadline" name="deadline" type="date" value="${val('deadline')}" required>`)}
  </div>
  ${field(errors, 'skills', 'Skills it needs', `<input id="f-skills" name="skills" type="text" maxlength="240" value="${val('skills')}" placeholder="Research, Writing, Design" required>`, 'Separated by commas, up to six.')}
  ${field(errors, 'summary', 'The brief', `<textarea id="f-summary" name="summary" rows="6" maxlength="1400" required>${val('summary')}</textarea>`, 'What to make, what good looks like and how to hand it over. 40 to 1,400 characters.')}
  <div class="field-row">
    ${field(errors, 'submitter_name', 'Your name', `<input id="f-submitter_name" name="submitter_name" type="text" maxlength="120" value="${val('submitter_name')}">`)}
    ${field(errors, 'submitter_email', 'Your email', `<input id="f-submitter_email" name="submitter_email" type="email" maxlength="200" value="${val('submitter_email')}" required>`, 'Never shown. We use it to check the brief and pass on interest.')}
  </div>
  ${tick(errors, 'sponsor_consent', 'I can post this for the sponsor, and the sponsor will arrange payment with the person they choose.', input.sponsor_consent === 'yes')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Send the brief in</button></p>
</form></section>`;
  return layout({ title: 'Post a bounty', description: 'Post a paid brief with a reward, skills and a deadline. Every brief is read by a person.', path: '/bounties/post', body, current: '/bounties', noindex: !!state.input });
}
