/* /jobs: roles that show their pay, filterable by pay, type and workplace; /jobs/post: the form to send one in for moderation. */
import { SITE, esc, layout } from '../html.mjs';
import { FIELDS, FIELD_LABEL } from '../opportunities.mjs';
import { EMPLOYMENT, EMPLOYMENT_LABEL, WORKPLACE, WORKPLACE_LABEL, PERIODS, PAY_SHOWN, FRESH_DAYS, payText, boardJobs, jobFilters } from '../jobs.mjs';
import { field, tick, countrySelect, guards, valOf, sentNote } from './forms.mjs';

const dayLabel = (iso) => { try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return iso; } };

/** One job: the pay first, then the role, the employer, the type and the workplace, and the day the posting was checked. */
export function jobCard(o) {
  return `<article class="job-card${o.featured ? ' featured' : ''}" id="${esc(o.id)}">
  <p class="job-top"><span class="pay-badge">${PAY_SHOWN}</span>${o.featured ? '<span class="job-featured">Featured</span>' : ''}<span>${esc(EMPLOYMENT_LABEL[o.employment] || '')}</span><span>${esc(WORKPLACE_LABEL[o.workplace] || '')}</span></p>
  <h3><a href="${esc(o.url)}" rel="noopener nofollow" target="_blank">${esc(o.title)}</a></h3>
  <p class="job-org">${esc(o.organiser)}${o.location ? ` · ${esc(o.location)}` : ''}</p>
  <p class="job-pay">${esc(payText(o.pay))}</p>
  ${o.payNote ? `<p class="job-note">${esc(o.payNote)}</p>` : ''}
  <p class="job-checked">Checked ${esc(dayLabel(o.checkedOn))} on ${o.community ? 'the posting, by a moderator' : 'the employer\'s own posting'}.</p>
  <p class="opp-go"><a class="button small primary" href="${esc(o.url)}" rel="noopener nofollow" target="_blank">See the posting</a></p>
</article>`;
}

/** /jobs with its filters. `items` is every opportunity (seed and approved); only jobs with pay, checked lately, are listed. */
export function jobsPage(params, items, now = new Date()) {
  const f = jobFilters(params);
  const all = boardJobs(items, {}, now);
  const list = boardJobs(items, f, now);
  const currencies = [...new Set(['USD', ...all.map((o) => o.pay.currency)])];
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  const body = `
<section class="page-head"><p class="eyebrow">Jobs</p><h1>Jobs that <em>show the pay</em></h1>
  <p class="lead">Every role here shows its pay band, links to the employer's own posting and says when we last checked it. A role we have not checked in ${FRESH_DAYS} days comes off the list. Listing a role is our choice; it does not mean the employer has endorsed ${esc(SITE.name)}.</p>
  <form class="opp-filter job-filter" method="get" action="/jobs">
    <label for="j-pay">Pays at least</label><input id="j-pay" name="pay" type="number" inputmode="numeric" min="0" step="1000" value="${f.pay || ''}" placeholder="100000">
    <label class="visually-hidden" for="j-currency">Currency</label><select id="j-currency" name="currency">${currencies.map((c) => opt(c, c, c === f.currency)).join('')}</select>
    <label class="visually-hidden" for="j-type">Type</label><select id="j-type" name="type">${opt('', 'Any type', !f.type)}${EMPLOYMENT.map((t) => opt(t, EMPLOYMENT_LABEL[t], f.type === t)).join('')}</select>
    <label class="visually-hidden" for="j-where">Where</label><select id="j-where" name="where">${opt('', 'Anywhere', !f.where)}${WORKPLACE.map((w) => opt(w, WORKPLACE_LABEL[w], f.where === w)).join('')}</select>
    <button class="button small" type="submit">Show</button>
  </form>
  <p class="small muted">Pay is compared per year in the currency you choose, using the top of each band. Hourly and day rates count as 2,080 hours or 260 days a year.</p>
</section>
<section class="section">
  ${list.length ? `<div class="job-grid">${list.map(jobCard).join('')}</div>` : `<div class="invite"><p>${all.length ? 'Nothing matches those filters yet. Try a lower amount or another type.' : 'No jobs are listed right now.'} Hiring, and happy to show the pay? <a class="button" href="/jobs/post">Post a job</a></p></div>`}
</section>
<section class="section panel"><h2>Hiring?</h2><p>Post a role with its real pay band and a link to your own posting. A person checks every one before it goes up.</p><p><a class="button primary" href="/jobs/post">Post a job</a></p></section>`;
  return layout({ title: 'Jobs that show the pay', description: `Jobs with real pay bands, each linked to the employer's own posting and checked by a person, on ${SITE.name}.`, path: '/jobs', body, current: '/jobs' });
}

/** /jobs/post: the role, the employer, the band, the type, the workplace and the posting. `state` carries { input, errors, ok, id }. */
export function postJobPage(state = {}, env = {}) {
  const input = state.input || {}, errors = state.errors || {}, val = valOf(input);
  const opt = (list, labels, chosen) => list.map((x) => `<option value="${x}"${chosen === x ? ' selected' : ''}>${esc(labels[x] || x)}</option>`).join('');
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/jobs">Jobs</a></p><h1>Post a job <em>with its pay</em></h1><p class="lead">Every job here shows its pay band. Tell us the role, the band the employer posted and where to apply. A person checks the posting before it goes up.</p></section>
<section class="section">${sentNote(state, 'job')}
<form class="submit-form" method="post" action="/jobs/post" novalidate>
  ${field(errors, 'title', 'Job title', `<input id="f-title" name="title" type="text" maxlength="160" value="${val('title')}" required>`)}
  ${field(errors, 'employer', 'Employer', `<input id="f-employer" name="employer" type="text" maxlength="120" value="${val('employer')}" required>`)}
  <div class="field-row">
    ${field(errors, 'pay', 'Lowest pay', `<input id="f-pay" name="pay_min" type="text" inputmode="decimal" maxlength="20" value="${val('pay_min')}" placeholder="90000" required>`)}
    ${field(errors, 'pay_max', 'Highest pay', `<input id="f-pay_max" name="pay_max" type="text" inputmode="decimal" maxlength="20" value="${val('pay_max')}" placeholder="120000" required>`)}
    ${field(errors, 'currency', 'Currency', `<input id="f-currency" name="currency" type="text" maxlength="3" value="${val('currency') || 'USD'}" autocapitalize="characters" required>`)}
    ${field(errors, 'period', 'Per', `<select id="f-period" name="period">${PERIODS.map((p) => `<option value="${p}"${(input.period || 'year') === p ? ' selected' : ''}>${p}</option>`).join('')}</select>`)}
  </div>
  <div class="field-row">
    ${field(errors, 'employment', 'Type', `<select id="f-employment" name="employment"><option value="">Choose</option>${opt(EMPLOYMENT, EMPLOYMENT_LABEL, input.employment)}</select>`)}
    ${field(errors, 'workplace', 'Where', `<select id="f-workplace" name="workplace"><option value="">Choose</option>${opt(WORKPLACE, WORKPLACE_LABEL, input.workplace)}</select>`)}
    ${field(errors, 'field', 'Field', `<select id="f-field" name="field"><option value="">Choose</option>${opt(FIELDS, FIELD_LABEL, input.field)}</select>`)}
  </div>
  ${field(errors, 'country', 'Country', countrySelect('country', input.country), 'Where the job is, or the employer\'s country for a remote role.')}
  ${field(errors, 'location', 'Location', `<input id="f-location" name="location" type="text" maxlength="120" value="${val('location')}" placeholder="Lagos, or Remote in the UK">`, 'Optional.')}
  ${field(errors, 'url', 'The employer\'s posting', `<input id="f-url" name="url" type="url" maxlength="500" value="${val('url')}" placeholder="https://" required>`, 'Their own careers page or job board, where people apply.')}
  ${field(errors, 'summary', 'About the role', `<textarea id="f-summary" name="summary" rows="5" maxlength="1400" required>${val('summary')}</textarea>`, 'What the job is and who it suits. 40 to 1,400 characters.')}
  ${field(errors, 'deadline', 'Closes', `<input id="f-deadline" name="deadline" type="date" value="${val('deadline')}">`, 'Leave blank if it is open until filled.')}
  <div class="field-row">
    ${field(errors, 'submitter_name', 'Your name', `<input id="f-submitter_name" name="submitter_name" type="text" maxlength="120" value="${val('submitter_name')}">`)}
    ${field(errors, 'submitter_email', 'Your email', `<input id="f-submitter_email" name="submitter_email" type="email" maxlength="200" value="${val('submitter_email')}">`, 'Never shown. Only used if we have a question.')}
  </div>
  ${tick(errors, 'pay_consent', 'The band above is the one the employer posted, or agreed to share.', input.pay_consent === 'yes')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Send the job in</button></p>
</form></section>`;
  return layout({ title: 'Post a job', description: 'Post a job with its real pay band. Every listing is checked by a person.', path: '/jobs/post', body, current: '/jobs', noindex: !!state.input });
}

/** The home page's short list of jobs, '' when none are listed. */
export function jobsRail(items, n = 3, now = new Date()) {
  const list = boardJobs(items, {}, now).slice(0, n);
  return list.length ? `<div class="job-grid">${list.map(jobCard).join('')}</div>` : '';
}

