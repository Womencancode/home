import { T } from '../site.mjs';
import { COUNTRIES, countryByCode } from '../countries.mjs';
import { CATEGORIES, MEDIA } from '../content.mjs';
import { KINDS as EVENT_KINDS } from '../events.mjs';
import { LIMITS } from '../submissions.mjs';
import { citiesOf } from '../places.mjs';
import { FIELDS, FIELD_LABEL, TYPES } from '../opportunities.mjs';
import { esc, layout } from '../html.mjs';
import { TOPICS, TOPIC_LABEL } from '../speakers.mjs';

const KIND_COPY = {
  story: ['A good-news story', 'An award, a record, a first, a launch, a community win. Tell us what happened, who did it and when.'],
  work: ['A creative work', 'A film, album, book, exhibition, collection, game or anything made. Yours or someone else\'s, with a link to the official page if there is one.'],
  event: ['An event', 'A carnival, festival, premiere, exhibition or heritage day still to come. When it starts and ends, and where.'],
  opportunity: ['An opportunity', 'A competition, hackathon, grant, fellowship, call for entries or job people can go for. Where to enter, and when it closes.'],
  speaker: ['A speaker', 'Yourself, or someone who agreed to be listed, for organisers looking for panel speakers. Their name, where they work, the topic and a public profile.'],
  talent: ['A person to list', 'Yourself, or someone whose work people should know. What they do and where to find it.'],
  correction: ['A correction', 'Something on the site is wrong or out of date. Tell us the page and what should change.'],
};

/** The submission form. `state` carries { input, errors, ok, id } after a post; `params` prefills from the link that brought the visitor. */
export function submitPage(params, state = {}, env = {}) {
  const input = state.input || Object.fromEntries(params.entries());
  const errors = state.errors || {};
  const kind = KIND_COPY[input.kind] ? input.kind : 'story';
  const country = countryByCode(input.country);
  const field = (name, label, control, hint) => `<div class="field${errors[name] ? ' has-error' : ''}"><label for="f-${name}">${label}</label>${hint ? `<p class="hint" id="h-${name}">${hint}</p>` : ''}${control}${errors[name] ? `<p class="error" role="alert">${esc(errors[name])}</p>` : ''}</div>`;
  const val = (k) => esc(input[k] || '');
  const turnstile = env.TURNSTILE_SITE_KEY ? `<div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITE_KEY)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : '';
  const done = state.ok && state.published ? `<div class="notice success" role="status"><h2>Published.</h2><p>It is live now, as number ${esc(String(state.id))}. Add another below, or <a href="/admin">go to admin</a>.</p></div>` : state.ok ? `<div class="notice success" role="status"><h2>Thank you.</h2><p>Your submission is in the queue${state.id ? ` as number ${state.id}` : ''}. A moderator reads everything before it goes live, usually within a few days. ${country ? `<a href="/country/${esc(country.slug)}">Back to ${esc(country.name)}</a>.` : '<a href="/">Back to the front page</a>.'}</p></div>` : '';
  const rate = errors.rate ? `<div class="notice" role="alert"><p>${esc(errors.rate)}</p></div>` : '';
  const body = `
<section class="page-head">
  <p class="eyebrow">Submit</p>
  <h1>Share something good</h1>
  <p class="lead">${T('submit.lead.start')} Every submission is read by a person before it is published. Please read the <a href="/guidelines">content guidelines</a>: real people and real work, something that went right, nothing that puts anyone down.</p>
</section>
<section class="section">
${done}${rate}
<form class="submit-form" method="post" action="/submit" novalidate>
  <div class="quick" hidden>
    <div class="field"><label for="f-quick">Tell us in your own words</label><p class="hint">What happened or what it is, who, where and when. Paste a link if you have one. We fill in the form from it and only ask for what is missing.</p>
    <textarea id="f-quick" rows="4" placeholder="${esc(T('submit.example'))}"></textarea></div>
    <p class="quick-actions"><button type="button" class="button primary small quick-go">Fill the form for me</button><span class="muted small">Nothing is sent until you press Send at the end.</span></p>
    <p class="quick-result" aria-live="polite"></p>
  </div>
  <fieldset class="kinds"><legend>What are you sending?</legend>${Object.entries(KIND_COPY).map(([k, [label, hint]]) => `<label class="kind${kind === k ? ' selected' : ''}"><input type="radio" name="kind" value="${k}"${kind === k ? ' checked' : ''}><strong>${label}</strong><span>${hint}</span></label>`).join('')}</fieldset>
  ${field('country', 'Country', `<select id="f-country" name="country" required><option value="">Choose a country</option>${COUNTRIES.map((k) => `<option value="${k.code}"${country && country.code === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>`, 'The country the person or work is from, or most connected to. Diaspora counts.')}
  ${field('city', 'City or town', `<input id="f-city" name="city" type="text" maxlength="${LIMITS.city}" value="${val('city')}" list="city-list" autocomplete="off"><datalist id="city-list">${(country ? citiesOf(country.code) : []).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>`, 'Where it happened or where they are from. It puts a pin on the map. Leave blank if you are not sure.')}
  ${field('title', 'Title', `<input id="f-title" name="title" type="text" maxlength="${LIMITS.title}" value="${val('title')}" required>`, 'A headline for a story; the name of a work; a person\'s name for a profile.')}
  ${field('creator', 'Who', `<input id="f-creator" name="creator" type="text" maxlength="${LIMITS.creator}" value="${val('creator')}">`, 'The person, group or team. Needed for works and profiles.')}
  <div class="field-row">
    ${field('medium', 'Kind of work', `<select id="f-medium" name="medium"><option value="">Choose</option>${MEDIA.map((m) => `<option value="${m}"${input.medium === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>`, 'For works and profiles.')}
    ${field('category', 'Category', `<select id="f-category" name="category"><option value="">Choose</option>${[...new Set([...CATEGORIES, ...EVENT_KINDS])].map((c) => `<option value="${c}"${input.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`, 'For stories and events.')}
    ${field('year', 'Year', `<input id="f-year" name="year" type="number" inputmode="numeric" min="1000" max="2100" value="${val('year')}">`, 'When it happened or came out.')}
  </div>
  <div class="field-row event-dates">
    ${field('start_date', 'Starts', `<input id="f-start_date" name="start_date" type="date" value="${val('start_date')}">`, 'For events: the first day.')}
    ${field('end_date', 'Ends', `<input id="f-end_date" name="end_date" type="date" value="${val('end_date')}">`, 'The last day. Leave blank for one day.')}
  </div>
  <fieldset class="opp-fields-in" hidden><legend>About the opportunity</legend><div class="field-row">
    ${field('opp_type', 'What kind', `<select id="f-opp_type" name="opp_type"><option value="">Choose</option>${TYPES.map((t) => `<option value="${t}"${input.opp_type === t ? ' selected' : ''}>${esc(t.replace(/-/g, ' '))}</option>`).join('')}</select>`)}
    ${field('opp_field', 'Field', `<select id="f-opp_field" name="opp_field"><option value="">Choose</option>${FIELDS.map((f) => `<option value="${f}"${input.opp_field === f ? ' selected' : ''}>${esc(FIELD_LABEL[f])}</option>`).join('')}</select>`)}
    ${field('opp_deadline', 'Closes', `<input id="f-opp_deadline" name="opp_deadline" type="date" value="${val('opp_deadline')}">`, 'Leave blank if it is rolling.')}
  </div>
  ${field('prize', 'Prize, funding or pay', `<input id="f-prize" name="prize" type="text" maxlength="120" value="${val('prize')}" placeholder="$10,000, fully funded, paid role">`)}
  <label class="check"><input type="checkbox" name="remote" value="yes"${input.remote === 'yes' ? ' checked' : ''}> It can be done remotely</label>
  <label class="check"><input type="checkbox" name="only_country" value="yes"${input.only_country === 'yes' ? ' checked' : ''}> Only people in the country above can enter</label>
  </fieldset>
  <fieldset class="speaker-fields-in"${kind === 'speaker' ? '' : ' hidden'}><legend>About the speaker</legend>
  ${field('speaker_topic', 'Topic', `<select id="f-speaker_topic" name="speaker_topic"><option value="">Choose</option>${TOPICS.map((t) => `<option value="${t}"${input.speaker_topic === t ? ' selected' : ''}>${esc(TOPIC_LABEL[t])}</option>`).join('')}</select>`, 'What they speak about. Put the name in Title and where they work in Who.')}
  <div class="field${errors.speaker_consent ? ' has-error' : ''}"><label class="check"><input type="checkbox" name="speaker_consent" value="yes"${input.speaker_consent === 'yes' ? ' checked' : ''}><span>I am this person, or they agreed to be listed.</span></label>${errors.speaker_consent ? `<p class="error" role="alert">${esc(errors.speaker_consent)}</p>` : ''}</div>
  </fieldset>
  ${field('summary', 'Tell us about it', `<textarea id="f-summary" name="summary" rows="6" maxlength="${LIMITS.summary}" required>${val('summary')}</textarea>`, `What happened, why it matters, who was involved. 40 to ${LIMITS.summary} characters. Write it the way you would tell a friend.`)}
  ${field('url', 'Link', `<input id="f-url" name="url" type="url" maxlength="${LIMITS.url}" value="${val('url')}" placeholder="https://">`, 'The official page, the article, the album, the trailer. A link to an Instagram, X, TikTok or YouTube post shows the post itself on the page.')}
  <fieldset class="socials-fields"><legend>Their socials <span class="hint">(optional, shown on the page)</span></legend><div class="field-row">
    ${field('instagram', 'Instagram', `<input id="f-instagram" name="instagram" type="text" maxlength="120" value="${val('instagram')}" placeholder="@name" autocomplete="off" spellcheck="false">`)}
    ${field('x_handle', 'X', `<input id="f-x_handle" name="x_handle" type="text" maxlength="120" value="${val('x_handle')}" placeholder="@name" autocomplete="off" spellcheck="false">`)}
    ${field('tiktok', 'TikTok', `<input id="f-tiktok" name="tiktok" type="text" maxlength="120" value="${val('tiktok')}" placeholder="@name" autocomplete="off" spellcheck="false">`)}
    ${field('youtube', 'YouTube', `<input id="f-youtube" name="youtube" type="text" maxlength="120" value="${val('youtube')}" placeholder="@channel" autocomplete="off" spellcheck="false">`)}
  </div></fieldset>
  <div class="field-row">
    ${field('submitter_name', 'Your name', `<input id="f-submitter_name" name="submitter_name" type="text" maxlength="${LIMITS.name}" value="${val('submitter_name')}">`, 'Shown as "shared by" if you like. Leave blank to stay anonymous.')}
    ${field('submitter_email', 'Your email', `<input id="f-submitter_email" name="submitter_email" type="email" maxlength="${LIMITS.email}" value="${val('submitter_email')}">`, 'Never shown. Only used if a moderator has a question.')}
  </div>
  <div class="trap" aria-hidden="true"><label for="f-website">Website</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
  <div class="field${errors.consent ? ' has-error' : ''}"><label class="check"><input type="checkbox" name="consent" value="yes"${input.consent === 'yes' ? ' checked' : ''}><span>I have read the <a href="/guidelines">guidelines</a>. This is true to the best of my knowledge, it is positive, and I have the right to share any link or words I am sending.</span></label>${errors.consent ? `<p class="error" role="alert">${esc(errors.consent)}</p>` : ''}</div>
  ${turnstile}${errors.turnstile ? `<p class="error" role="alert">${esc(errors.turnstile)}</p>` : ''}
  <p><button class="button primary" type="submit">Send it in</button></p>
</form>
</section>`;
  return layout({ title: 'Submit a story, a work or a person', description: T('submit.description'), path: '/submit', body, current: '/submit', noindex: !!state.input });
}
