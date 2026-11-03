/* /train: the funding calculator as a plain GET form (?country=&subject=), so it works with JavaScript off; /train.js only swaps the
 * answer in place as the choice changes. Off unless the pack sets "train" (src/train.mjs). */
import { SITE, esc, layout, sectionHead, htmlResponse } from '../html.mjs';
import { trainConfig, trainPick } from '../train.mjs';
import { notFoundPage } from './about.mjs';

/** The answer for one option: each figure with its amount, what it is, and its source link; then the check line. */
export function trainAnswer(cfg, country, option) {
  if (!country) return `<div class="train-answer" data-train-answer aria-live="polite"><p class="train-prompt">Choose a country to start.</p></div>`;
  if (!option) return `<div class="train-answer" data-train-answer aria-live="polite"><p class="train-prompt">${country.intro ? `${esc(country.intro)} ` : ''}Now choose a ${esc(country.pick.toLowerCase())}.</p></div>`;
  const rows = option.figures.map((f) => `<li class="train-fig"><span class="train-amount">${esc(f.amount)}</span><span class="train-what"><b>${esc(f.label)}</b>${f.note ? `<small>${esc(f.note)}</small>` : ''}<a class="train-src" href="${esc(f.source.url)}" rel="noopener" target="_blank">Source: ${esc(f.source.name)}</a></span></li>`).join('');
  return `<div class="train-answer" data-train-answer aria-live="polite">
  <p class="train-for">${esc(country.label)} · ${esc(option.label)}</p>
  ${rows ? `<ul class="train-figs">${rows}</ul>` : ''}
  ${option.note ? `<p class="train-note">${esc(option.note)}</p>` : ''}
  <p class="train-check"><strong>Check before you apply.</strong> ${esc(cfg.check)}</p>
</div>`;
}

/** The form: country, then subject or route. A submit button stays for no-JS; train.js submits on change. */
export function trainForm(cfg, country, option, { action = '/train', compact = false } = {}) {
  const countries = cfg.countries.map((k) => `<option value="${k.code}"${country && country.code === k.code ? ' selected' : ''}>${esc(k.label)}</option>`).join('');
  const groups = cfg.countries.map((k) => `<optgroup label="${esc(k.label)}: ${esc(k.pick)}">${k.options.map((o) => `<option value="${esc(o.id)}" data-country="${k.code}"${option && option.id === o.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</optgroup>`).join('');
  return `<form class="train-form${compact ? ' is-compact' : ''}" method="get" action="${action}" data-train>
  <div class="train-step"><label for="train-country"><span class="train-n">1</span> Country</label><select id="train-country" name="country"><option value="">Choose</option>${countries}</select></div>
  <div class="train-step"><label for="train-subject"><span class="train-n">2</span> Subject or route</label><select id="train-subject" name="subject"><option value="">Choose</option>${groups}</select></div>
  <button class="button primary train-go" type="submit">Show me</button>
</form>`;
}

/** The home block: the form and, when chosen, the answer; '' when off. */
export function trainBlock(params) {
  const cfg = trainConfig();
  if (!cfg) return '';
  const { country, option } = trainPick(params, cfg);
  return `<section class="section train-band" id="train">${sectionHead(cfg.title, { href: '/train', label: 'The calculator' }, cfg.lead, 'Training funding')}
  <div class="train-sheet">${trainForm(cfg, country, option, { action: '/train', compact: true })}${trainAnswer(cfg, country, option)}</div>
</section><script src="/train.js" defer></script>`;
}

export function trainPage(params) {
  const cfg = trainConfig();
  const { country, option } = trainPick(params, cfg);
  const sources = [...new Map(cfg.countries.flatMap((k) => k.options.flatMap((o) => o.figures.map((f) => [f.source.url, f.source]))))].map(([, s]) => s);
  const body = `
<section class="page-head"><p class="eyebrow">Training funding</p><h1>${esc(cfg.title)}</h1>${cfg.lead ? `<p class="lead">${esc(cfg.lead)}</p>` : ''}</section>
<section class="section"><div class="train-sheet">${trainForm(cfg, country, option)}${trainAnswer(cfg, country, option)}</div></section>
<section class="section">${sectionHead('Where the figures come from', null, 'Every amount above is copied from these pages. They are the ones that count.', 'Sources')}
<ul class="train-sources">${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.name)}</a></li>`).join('')}</ul></section>
<script src="/train.js" defer></script>`;
  const title = option ? `${cfg.title} ${option.label}, ${country.label}` : cfg.title;
  return layout({ title, description: `${cfg.lead || cfg.title} On ${SITE.name}.`.trim(), path: '/train', body, current: '/train' });
}

/** GET /train; null for other paths, 404 when the pack has no calculator. */
export function trainRoute(path, params, method = 'GET') {
  if (path !== '/train') return null;
  if (!trainConfig()) return htmlResponse(notFoundPage(path), 404);
  if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  return htmlResponse(trainPage(params));
}
