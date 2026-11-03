/* Small pieces every career form shares: a labelled field with its error, the country picker, the honeypot and the human check. */
import { COUNTRIES } from '../countries.mjs';
import { esc } from '../html.mjs';

/** A field: label, optional hint, the control, and the error for `name` from `errors` when there is one. */
export const field = (errors, name, label, control, hint = '') => `<div class="field${errors[name] ? ' has-error' : ''}"><label for="f-${name}">${label}</label>${hint ? `<p class="hint">${hint}</p>` : ''}${control}${errors[name] ? `<p class="error" role="alert">${esc(errors[name])}</p>` : ''}</div>`;

/** A checkbox line with its error. */
export const tick = (errors, name, label, checked = false) => `<div class="field${errors[name] ? ' has-error' : ''}"><label class="check"><input type="checkbox" name="${name}" value="yes"${checked ? ' checked' : ''}><span>${label}</span></label>${errors[name] ? `<p class="error" role="alert">${esc(errors[name])}</p>` : ''}</div>`;

/** The country select, `chosen` preselected. */
export const countrySelect = (id, chosen = '', label = 'Choose a country') => `<select id="f-${id}" name="${id}" required><option value="">${esc(label)}</option>${COUNTRIES.map((k) => `<option value="${k.code}"${chosen === k.code ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select>`;

/** The honeypot every form carries, and the Turnstile widget when the site key is set. */
export const guards = (env = {}, errors = {}) => `<div class="trap" aria-hidden="true"><label for="f-website">Website</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>${env.TURNSTILE_SITE_KEY ? `<div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITE_KEY)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}${errors.turnstile ? `<p class="error" role="alert">${esc(errors.turnstile)}</p>` : ''}${errors.rate ? `<p class="error" role="alert">${esc(errors.rate)}</p>` : ''}`;

/** The value a form sends back after an error, escaped for an attribute or a textarea. */
export const valOf = (input) => (k) => esc(input && input[k] != null ? input[k] : '');

/** The thank-you note after a moderated form: in the queue, or published at once when an owner sent it. */
export const sentNote = (state, what) => (state.ok ? `<div class="notice success" role="status"><h2>${state.published ? 'Published.' : 'Thank you.'}</h2><p>${state.published ? `It is live now${state.id ? `, as number ${esc(String(state.id))}` : ''}.` : `Your ${esc(what)} is in the queue${state.id ? ` as number ${esc(String(state.id))}` : ''}. A person reads everything before it goes up, usually within a few days.`}</p></div>` : '');
