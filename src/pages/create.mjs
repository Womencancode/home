/* The "create" hero: a headline beside a live-call card, a row of format tiles, and a composer that hands the visitor's idea to the
 * pack's creation partner. Every word and picture comes from site.json ("create"); without it the block renders nothing. */
import { PACK } from '../site.mjs';
import { esc } from '../html.mjs';
import { waitlistOn, waitlistHref } from '../waitlist.mjs';

const ICONS = {
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  advert: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  series: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 3l4 3 4-3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"/>',
  interactive: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15 12h.01M17.5 13.5h.01"/>',
  character: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  remix: '<path d="M4 20l9-9M14 4l1.5 3L19 8.5 15.5 10 14 13l-1.5-3L9 8.5 12.5 7z"/>',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  script: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  audio: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 14h.01"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  rocket: '<path d="M5 15c-1 2-1 4-1 5 1 0 3 0 5-1M14 4c3 0 6 3 6 6l-7 7-6-6z"/><circle cx="15" cy="9" r="1.5"/>',
  research: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  lead: '<path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8z"/>',
  career: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  health: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  auto: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.5"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};

/** An inline line icon by name (unknown names draw nothing). */
export const icon = (name, size = 18) => (ICONS[name] ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>` : '');

const commonsName = (u = '') => decodeURIComponent(String(u).split('File:')[1] || '').replace(/ /g, '_');
const creditFor = (src, credits = []) => credits.find((k) => commonsName(k.page) && decodeURIComponent(String(src)).includes(commonsName(k.page)));
// tiles are links, so the on-picture credit is text; the linked credits stay in the line under the hero
const pic = (src, alt = '', credits = []) => {
  if (!src) return '';
  const k = creditFor(src, credits);
  return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">${k ? `<span class="ch-credit">${esc(k.by)} · ${esc(k.licence)}</span>` : ''}`;
};

/** The hero, the tile row and the composer, from PACK.create; '' when the pack has none. `pack` decides whether the coming-soon call
 * card and soon tiles carry a waitlist link (pack.waitlist), and is for tests. */
export function createHero(cfg = PACK.create, pack = PACK) {
  if (!cfg) return '';
  const waitlist = waitlistOn(pack);
  const join = (id, cls = '') => `<a class="ch-waitlist${cls}" href="${esc(waitlistHref(id))}">Join the waitlist</a>`;
  const { kicker = '', h1 = '', lead = '', cta, call = {}, notes = [], tiles = [], composer } = cfg; /* cfg.credits: [{ by, licence, page }] */
  /* call.aiMade (true or a label) marks the hero's pictures and clip as AI-made, as EU AI Act Article 50(4) asks of realistic media. */
  const aiMade = call.aiMade ? `<span class="ai-made">${esc(typeof call.aiMade === 'string' ? call.aiMade : 'AI-made')}</span>` : '';
  const callCard = `<div class="ch-call">
    <figure class="ch-stage${call.image || call.video ? '' : ' no-photo'}">${call.video ? `<video src="${esc(call.video)}"${call.image ? ` poster="${esc(call.image)}"` : ''} autoplay muted loop playsinline preload="metadata" aria-label="${esc(call.alt || call.name || '')}"></video>` : pic(call.image, call.alt || call.name, cfg.credits)}
      ${aiMade}<figcaption class="ch-tag">${icon('character', 16)}<span><b>${esc(call.name || '')}</b><small>${esc(call.role || '')}</small></span></figcaption>
      ${call.soon ? `<span class="ch-live ch-call-soon"><b>Coming soon</b><small>${esc(typeof call.soon === 'string' ? call.soon : '')}</small>${waitlist ? join(call.waitlist || 'twin') : ''}</span>` : `<span class="ch-live"><b><span aria-hidden="true">●</span> LIVE</b><small>${esc(call.time || '00:12')}</small></span>`}
      ${call.line ? `<p class="ch-bubble">${esc(call.line)}</p>` : ''}
      <span class="ch-controls" aria-hidden="true"><i>${icon('mic', 20)}</i><i>${icon('camera', 20)}</i><i class="c-end"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M3 15.5c5-4.5 13-4.5 18 0l-2.6 2.6-3.4-1.7v-2.6a12 12 0 0 0-6 0v2.6L5.6 18.1z"/></svg></i><i>${icon('more', 20)}</i></span>
    </figure>
    ${call.you ? `<figure class="ch-you">${pic(call.you, '', cfg.credits)}${aiMade}<figcaption>${esc(call.youLabel || 'You')}</figcaption></figure>` : ''}
    ${call.href ? `<a class="ch-call-link" href="${esc(call.href)}" rel="noopener">${esc(call.cta || 'Talk to her')}</a>` : ''}
  </div>`;
  /* A note is text, or { text, arrow: 'down' | 'right' } with a hand-drawn arrow toward the card. */
  const ARROW = { down: '<path d="M60 4c8 22 4 44-22 58"/><path d="M28 50l10 13 13-6"/>', right: '<path d="M4 30c22 14 52 14 82-2"/><path d="M72 18l15 9-11 13"/>' };
  const note = (n, i) => { const t = typeof n === 'string' ? { text: n } : n; const a = ARROW[t.arrow]; return `<p class="ch-note ch-note-${i + 1}" aria-hidden="true"><span>${esc(t.text || '')}</span>${a ? `<svg class="ch-arrow ch-arrow-${t.arrow}" viewBox="0 0 90 66" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${a}</svg>` : ''}</p>`; };
  /* A tile whose partner does not run in the page yet is marked soon and links nowhere, so nobody is sent away; with a waitlist id
     (and a pack waitlist) it carries the one link it can honestly make, to join the waitlist. The tile is a div, so a link may sit in it. */
  const tile = (t) => t.soon ? `<div class="ch-tile is-soon${t.image ? '' : ' no-photo'}"${waitlist && t.waitlist ? '' : ' aria-disabled="true"'}>${pic(t.image, '', cfg.credits)}<span class="ch-tile-label">${icon(t.icon || 'film', 15)}${esc(t.label || '')}</span><span class="ch-soon">Coming soon</span><span class="ch-tile-text"><b>${esc(t.title || '')}</b><small>${esc(t.sub || '')}</small>${waitlist && t.waitlist ? join(t.waitlist, ' ch-tile-waitlist') : ''}</span></div>` : `<a class="ch-tile${t.image ? '' : ' no-photo'}" href="${esc(t.href || '/showcase')}">${pic(t.image, '', cfg.credits)}<span class="ch-tile-label">${icon(t.icon || 'film', 15)}${esc(t.label || '')}</span><span class="ch-tile-text"><b>${esc(t.title || '')}</b><small>${esc(t.sub || '')}</small></span></a>`;
  const chips = (composer && composer.chips) || [];
  const inCopy = !!(composer && composer.place === 'copy'); /* 'copy' puts the prompt bar under the lead, in the first screen */
  const dock = !!(composer && composer.place === 'dock'); /* 'dock' is Ontold's own bar: pinned to the foot of the screen, tabs under it */
  const dockBox = dock ? `<div class="ch-dock"><form class="oc-card" method="get" action="/create">
    <div class="oc-row"><span class="oc-plus" aria-hidden="true">+</span><label class="visually-hidden" for="ch-idea">${esc(composer.placeholder || 'Your idea')}</label><textarea id="ch-idea" name="idea" rows="2" maxlength="2000" placeholder="${esc((chips[0] && chips[0].placeholder) || composer.placeholder || '')}"></textarea></div>
    <div class="oc-tools">${composer.hint ? `<small class="oc-hint">${esc(composer.hint)}</small>` : ''}<button type="submit" class="oc-send">${esc(composer.button || 'Create')} <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg></button></div>
    <div class="oc-tabs" role="radiogroup" aria-label="What to make">${chips.map((c, i) => `<label class="oc-tab"><input type="radio" name="kind" value="${esc(c.id || c.label)}"${c.placeholder ? ` data-placeholder="${esc(c.placeholder)}"` : ''}${i === 0 ? ' checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}</div>
  </form></div>` : '';
  const box = dock ? '' : composer ? `<form class="ch-composer${inCopy ? ' in-copy' : ''}" method="get" action="/create">
    <div class="ch-chips" role="radiogroup" aria-label="What to make">${chips.map((c, i) => `<label class="ch-chip"><input type="radio" name="kind" value="${esc(c.id || c.label)}"${i === 0 ? ' checked' : ''}>${icon(c.icon, 15)}<span>${esc(c.label)}</span></label>`).join('')}</div>
    <div class="ch-input"><span class="ch-plus" aria-hidden="true">+</span><label class="visually-hidden" for="ch-idea">${esc(composer.placeholder || 'Your idea')}</label><textarea id="ch-idea" name="idea" rows="1" maxlength="2000" placeholder="${esc(composer.placeholder || '')}"></textarea></div>
    <div class="ch-foot"><small>${esc(composer.hint || '')}</small><button type="submit" class="button primary">${esc(composer.button || 'Create')} <span aria-hidden="true">→</span></button></div>
  </form>` : '';
  return `<section class="create-hero" aria-labelledby="ch-h1">
  <div class="ch-grid">
    <div class="ch-copy">${kicker ? `<p class="ch-kicker">${esc(kicker)}</p>` : ''}<h1 id="ch-h1">${h1}</h1>${lead ? `<p class="ch-lead">${esc(lead)}</p>` : ''}
      ${inCopy ? box : cta ? `<a class="button primary ch-cta" href="${esc(cta.href)}">${esc(cta.label)} <span aria-hidden="true">→</span></a>` : ''}</div>
    ${callCard}
    ${notes.map(note).join('')}
  </div>
  ${tiles.length ? `<div class="ch-tiles" style="--tiles:${tiles.length}">${tiles.map(tile).join('')}</div>` : ''}
  ${inCopy ? '' : box}
  ${dockBox}
  ${(cfg.credits || []).length && cfg.creditsLine !== false ? `<p class="ch-credits">Photos: ${cfg.credits.map((k) => `<a href="${esc(k.page)}" rel="noopener">${esc(k.by)}</a>, ${esc(k.licence)}`).join(' · ')}, via Wikimedia Commons</p>` : ''}
</section>`;
}

/** The band under the hero: a two-tone headline and a row of icon items, from PACK.create.band. */
export function formatsBand(cfg = PACK.create && PACK.create.band) {
  if (!cfg) return '';
  return `<section class="section ch-band">
  <div class="ch-band-head"><div>${cfg.kicker ? `<p class="ch-kicker">${esc(cfg.kicker)}</p>` : ''}<h2>${esc(cfg.h2 || '')} <em>${esc(cfg.accent || '')}</em></h2></div>${cfg.more ? `<a class="more" href="${esc(cfg.more.href)}">${esc(cfg.more.label)} ↗</a>` : ''}</div>
  <ul class="ch-band-items">${(cfg.items || []).map((i) => `<li>${icon(i.icon, 26)}<span><b>${esc(i.label)}</b><small>${esc(i.sub || '')}</small></span></li>`).join('')}</ul>
</section>`;
}

/** Where /create sends the visitor: the chosen chip's own partner (chip.action, with chip.param if it takes the idea) or the
 * composer's, with the idea filled in; null when no https address is set. */
export function composeTarget(params, cfg = PACK.create) {
  const chip = ((cfg && cfg.composer && cfg.composer.chips) || []).find((c) => (c.id || c.label) === String(params.get('kind') || ''));
  const action = (chip && chip.action) || (cfg && cfg.composer && cfg.composer.action);
  if (!action || !/^https:\/\//.test(action)) return null;
  const idea = String(params.get('idea') || '').trim().slice(0, 2000);
  const kind = String(params.get('kind') || '').trim().slice(0, 40);
  const u = new URL(action);
  const param = chip && chip.action ? chip.param : cfg.composer.param || 'compose';
  if (idea && param) u.searchParams.set(param, chip && chip.prefix ? `${chip.prefix}: ${idea}` : kind && !['idea', 'create'].includes(kind) && !(chip && chip.action) ? `${kind}: ${idea}` : idea);
  return u.href;
}
