/* /mentors: the opt-in directory by focus area, how matching works, and the two forms: request a match (private) and offer to mentor. */
import { countryByCode } from '../countries.mjs';
import { SITE, esc, layout, chip } from '../html.mjs';
import { FOCUS_LABEL, filterMentors } from '../mentors.mjs';
import { field, tick, countrySelect, guards, valOf, sentNote } from './forms.mjs';

/** One mentor: where they are, name, role, focus areas, what they help with, their own page and a way to ask for a match. */
export function mentorCard(m) {
  const c = countryByCode(m.country);
  return `<article class="lesson-card mentor-card" id="${esc(m.id)}"><span class="feature-kicker">${c ? `${c.flag} ${esc(m.city ? `${m.city}, ${c.name}` : c.name)}` : ''}</span><b>${esc(m.name)}</b><small>${esc(m.role || '')}</small><span class="opp-fields">${m.focus.map((f) => `<a href="/mentors?focus=${esc(f)}">${esc(FOCUS_LABEL[f] || f)}</a>`).join('')}</span>${m.about ? `<small>${esc(m.about.length > 220 ? `${m.about.slice(0, 217).replace(/\s+\S*$/, '')}...` : m.about)}</small>` : ''}<small><a href="${esc(m.url)}" rel="noopener nofollow" target="_blank">Their page</a></small><a class="button small" href="/mentors/request?mentor=${esc(m.id)}">Request a match</a></article>`;
}

const STEPS = `<div class="career-steps"><article><p class="step-n">01</p><h3>Tell us</h3><p>Where you are, where you are going, and what is actually in the way.</p></article><article><p class="step-n">02</p><h3>We match</h3><p>A person reads every request and looks for a mentor whose path is close to the one you want.</p></article><article><p class="step-n">03</p><h3>Six sessions</h3><p>The plan is six sessions over six months, at a pace you both agree.</p></article></div>`;

/** /mentors with a focus filter. `all` is the opted-in mentors (seed and approved); `focusList` the pack's focus areas. */
export function mentorsPage(params, all, focusList) {
  const focus = focusList.includes(params.get('focus')) ? params.get('focus') : '';
  const list = filterMentors(all, { focus });
  const body = `
<section class="page-head"><p class="eyebrow">Mentors</p><h1>Mentors who have <em>done it</em></h1>
  <p class="lead">People further down the road you want to take, who said yes to giving their time. Ask for a match and a person reads it, or offer to mentor someone yourself.</p>
  <p class="hero-actions"><a class="button primary" href="/mentors/request">Request a match</a> <a class="button ghost" href="/mentors/offer">Offer to mentor</a></p>
  ${all.length ? `<p class="chips">${chip('Every focus', '/mentors')}${focusList.filter((f) => all.some((m) => m.focus.includes(f))).map((f) => `<a class="chip${focus === f ? ' active' : ''}" href="/mentors?focus=${esc(f)}">${esc(FOCUS_LABEL[f])}</a>`).join('')}</p>` : ''}
</section>
<section class="section">${STEPS}</section>
<section class="section">${list.length ? `<div class="lesson-grid">${list.map(mentorCard).join('')}</div>` : `<div class="invite"><p>${all.length ? 'No one is listed for that focus yet.' : 'No mentors are listed yet. We are asking people one at a time, and we only list someone who has said yes.'} You can still request a match: we read every request and look for the right person. <a class="button" href="/mentors/request">Request a match</a></p><p>Further along and up for it? <a href="/mentors/offer">Offer to mentor</a>.</p></div>`}</section>`;
  return layout({ title: 'Mentors', description: `Mentors who have done it, by focus area, and a way to ask for a match, on ${SITE.name}.`, path: '/mentors', body, current: '/mentors' });
}

const focusBoxes = (errors, focusList, input, single = false) => `<fieldset class="field${errors.focus ? ' has-error' : ''}"><legend>${single ? 'What do you most want help with?' : 'What can you help with? Up to three.'}</legend><div class="focus-boxes">${focusList.map((f) => single
  ? `<label class="check"><input type="radio" name="focus" value="${f}"${input.focus === f ? ' checked' : ''}><span>${esc(FOCUS_LABEL[f])}</span></label>`
  : `<label class="check"><input type="checkbox" name="focus_${f}" value="yes"${input[`focus_${f}`] === 'yes' ? ' checked' : ''}><span>${esc(FOCUS_LABEL[f])}</span></label>`).join('')}</div>${errors.focus ? `<p class="error" role="alert">${esc(errors.focus)}</p>` : ''}</fieldset>`;

/** /mentors/request: a private request for a match. Nothing in it is ever shown publicly. */
export function requestMatchPage(state = {}, env = {}, { focusList, mentor = null, params = new URLSearchParams() } = {}) {
  const input = state.input || { mentor: params.get('mentor') || '' }, errors = state.errors || {}, val = valOf(input);
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/mentors">Mentors</a></p><h1>Request a <em>match</em></h1><p class="lead">This stays private. Only the people who run ${esc(SITE.name)} read it, to find you the right mentor, and they will email you. ${mentor ? `You asked about <strong>${esc(mentor.name)}</strong>; we will ask them first.` : ''}</p></section>
<section class="section">${state.ok ? '<div class="notice success" role="status"><h2>Thank you.</h2><p>Your request is in. A person reads every one and will email you about a match. It may take a little while: we would rather find the right person than a fast one.</p></div>' : ''}
<form class="submit-form" method="post" action="/mentors/request" novalidate>
  <input type="hidden" name="mentor" value="${val('mentor')}">
  <div class="field-row">
    ${field(errors, 'name', 'Your name', `<input id="f-name" name="name" type="text" maxlength="120" value="${val('name')}" required autocomplete="name">`)}
    ${field(errors, 'submitter_email', 'Your email', `<input id="f-submitter_email" name="submitter_email" type="email" maxlength="200" value="${val('submitter_email')}" required autocomplete="email">`, 'Never shown. We use it to write to you about a match.')}
  </div>
  ${field(errors, 'country', 'Where you are based', countrySelect('country', input.country))}
  ${focusBoxes(errors, focusList, input, true)}
  ${field(errors, 'now', 'Where you are now', `<textarea id="f-now" name="now" rows="3" maxlength="600" required>${val('now')}</textarea>`, 'Your work today, in a sentence or two.')}
  ${field(errors, 'next', 'Where you are going', `<textarea id="f-next" name="next" rows="3" maxlength="600" required>${val('next')}</textarea>`, 'The role, the raise, the company or the change you want.')}
  ${field(errors, 'blocker', 'What is in the way', `<textarea id="f-blocker" name="blocker" rows="3" maxlength="600" required>${val('blocker')}</textarea>`, 'Be honest. This is the part a good mentor helps with.')}
  ${field(errors, 'url', 'A link about you', `<input id="f-url" name="url" type="url" maxlength="500" value="${val('url')}" placeholder="https://">`, 'Optional: a profile, a portfolio or your site.')}
  ${tick(errors, 'match_consent', 'You may read this and email me about a match.', input.match_consent === 'yes')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Send my request</button></p>
</form></section>`;
  return layout({ title: 'Request a match', description: 'Ask for a mentor: where you are, where you are going and what is in the way. Private, and read by a person.', path: '/mentors/request', body, current: '/mentors', noindex: true });
}

/** /mentors/offer: a mentor who agrees to be listed with name, role, focus, a few lines and a public page. */
export function offerMentorPage(state = {}, env = {}, { focusList } = {}) {
  const input = state.input || {}, errors = state.errors || {}, val = valOf(input);
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/mentors">Mentors</a></p><h1>Offer to <em>mentor</em></h1><p class="lead">Give someone the hour you wish you had been given. We list you with your name, your role, what you help with and a link to your own page, never your email. A person reads every offer first.</p></section>
<section class="section">${sentNote(state, 'offer')}
<form class="submit-form" method="post" action="/mentors/offer" novalidate>
  <div class="field-row">
    ${field(errors, 'name', 'Your name', `<input id="f-name" name="name" type="text" maxlength="120" value="${val('name')}" required autocomplete="name">`)}
    ${field(errors, 'role', 'What you do', `<input id="f-role" name="role" type="text" maxlength="160" value="${val('role')}" placeholder="Staff engineer at a payments company" required>`)}
  </div>
  <div class="field-row">
    ${field(errors, 'country', 'Where you are based', countrySelect('country', input.country))}
    ${field(errors, 'city', 'City', `<input id="f-city" name="city" type="text" maxlength="80" value="${val('city')}">`, 'Optional.')}
  </div>
  ${focusBoxes(errors, focusList, input)}
  ${field(errors, 'about', 'What you can help with', `<textarea id="f-about" name="about" rows="5" maxlength="1000" required>${val('about')}</textarea>`, 'A few lines, the way you would say it to someone at the start of their road.')}
  ${field(errors, 'url', 'A public page about your work', `<input id="f-url" name="url" type="url" maxlength="500" value="${val('url')}" placeholder="https://" required>`, 'A profile or your own site, so people can see your path.')}
  ${field(errors, 'submitter_email', 'Your email', `<input id="f-submitter_email" name="submitter_email" type="email" maxlength="200" value="${val('submitter_email')}" required autocomplete="email">`, 'Never shown. We write to you when someone asks for a match.')}
  ${tick(errors, 'mentor_consent', 'List me as a mentor with my name, role, focus areas, these lines and my page.', input.mentor_consent === 'yes')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Offer to mentor</button></p>
</form></section>`;
  return layout({ title: 'Offer to mentor', description: 'Offer to mentor someone. You are listed with your consent, never with your email.', path: '/mentors/offer', body, current: '/mentors', noindex: !!state.input });
}
