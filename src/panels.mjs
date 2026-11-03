/* Opt-in content panels a pack writes in site.json, so a site can add its own cards, link groups and banners to the home page
 * without new code: "panels": { "<id>": { title, lead, eyebrow, variant: "cards" | "groups" | "rows" | "banner", items, cta, note, owner, labels, on } } and a home
 * layout block { "block": "panels", "id": "<id>" }. Also the "askBox" (a visible opener for the existing Ask dialog) and the
 * "prompts" page (/prompts), the prompts the lessons already carry, collected in one place. All render nothing unless the pack asks. */
import { PACK } from './site.mjs';
import { esc, layout, sectionHead, htmlResponse } from './html.mjs';
import { LESSONS } from './learn.mjs';

const okHref = (h) => typeof h === 'string' && (/^\/(?!\/)/.test(h) || /^#[a-z0-9-]+$/i.test(h) || /^https:\/\/[^\s"<>]+$/.test(h));
const okId = (s) => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s);

/** One link; an outside one opens with noopener and is marked for screen readers. */
function link(l, cls = '') {
  if (!l || !okHref(l.href) || !l.label) return '';
  const out = /^https:/.test(l.href);
  return `<a${cls ? ` class="${cls}"` : ''} href="${esc(l.href)}"${out ? ' rel="noopener"' : ''}>${esc(l.label)}${out ? '<span class="visually-hidden"> (official site)</span>' : ''}</a>`;
}

/** A panel item's picture: a local path only, with its size so nothing shifts, lazy loaded. '' without one. */
export function panelImage(img, cls = 'panel-img') {
  if (!img || typeof img !== 'object' || typeof img.src !== 'string' || !/^\/(?!\/)[a-z0-9/_.-]+$/i.test(img.src)) return '';
  const w = Number.isInteger(img.width) ? img.width : 640, h = Number.isInteger(img.height) ? img.height : 360;
  return `<img class="${cls}" src="${esc(img.src)}" alt="${esc(img.alt || '')}" width="${w}" height="${h}" loading="lazy" decoding="async">`;
}

/** A pack's own page (site.json "pages": { "<id>": { "path": "/film", "eyebrow", "title", "lead", "image", "blocks": [home blocks] } }),
 * built from the same blocks as the home page; null when the path is not one of them. */
export function packPage(path, pack = PACK) {
  const all = pack.pages && typeof pack.pages === 'object' ? Object.entries(pack.pages) : [];
  for (const [id, p] of all) if (okId(id) && p && p.on !== false && typeof p.path === 'string' && /^\/[a-z0-9-]{1,40}$/.test(p.path) && p.path === path && Array.isArray(p.blocks)) return { id, ...p };
  return null;
}
export const packPagePaths = (pack = PACK) => Object.keys(pack.pages && typeof pack.pages === 'object' ? pack.pages : {}).map((k) => packPage((pack.pages[k] || {}).path, pack)).filter(Boolean).map((p) => p.path);

/** The pack's panel `id` as a home section; '' when the pack has no such panel. */
export function panelsBlock(id, pack = PACK) {
  const p = pack.panels && okId(id) ? pack.panels[id] : null;
  if (!p || typeof p !== 'object' || p.on === false) return '';
  const items = Array.isArray(p.items) ? p.items.slice(0, 12) : [];
  const anchor = okId(p.anchor) ? ` id="${p.anchor}"` : '';
  if (p.variant === 'banner') {
    return `<section class="section panel-banner"${anchor}>${p.eyebrow ? `<p class="eyebrow">${esc(p.eyebrow)}</p>` : ''}<h2>${esc(p.title || '')}</h2>${p.lead ? `<p>${esc(p.lead)}</p>` : ''}${p.cta && okHref(p.cta.href) ? `<p>${link(p.cta, 'button primary')}</p>` : ''}</section>`;
  }
  const lab = p.labels && typeof p.labels === 'object' ? p.labels : {};
  const card = (i) => {
    const links = (Array.isArray(i.links) ? i.links : []).filter((l) => l && okHref(l.href) && l.label);
    const bullets = (Array.isArray(i.bullets) ? i.bullets : []).filter((b) => typeof b === 'string');
    const id = okId(i.anchor) ? ` id="${i.anchor}"` : '';
    if (p.variant === 'rows') return row(i, id);
    const pic = panelImage(i.image);
    if (p.variant === 'groups') return `<div class="panel-card panel-group"${id}><h3>${esc(i.title || '')}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ''}<ul class="panel-tools">${links.map((l) => `<li>${link(l)}${l.note ? `<small>${esc(l.note)}</small>` : ''}</li>`).join('')}</ul></div>`;
    return `<div class="panel-card${pic ? ' has-img' : ''}"${id}>${pic}${i.kicker ? `<p class="panel-kicker">${esc(i.kicker)}</p>` : ''}<h3>${esc(i.title || '')}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ''}${bullets.length ? `<ul class="panel-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${i.needs ? `<p class="panel-needs"><b>${esc(lab.needs || 'You will need')}:</b> ${esc(i.needs)}</p>` : ''}${links.length ? `<ul class="panel-links">${links.map((l) => `<li>${link(l)}</li>`).join('')}</ul>` : ''}</div>`;
  };
  /* "rows": what used to stop you, what changes, a real example from the site (and its source), then the links to try it. */
  const row = (i, id) => {
    const links = (Array.isArray(i.links) ? i.links : []).filter((l) => l && okHref(l.href) && l.label);
    const ex = i.example && typeof i.example === 'object' ? i.example : null;
    const part = (k, body) => (body ? `<div class="panel-row-part"><dt>${esc(lab[k] || k)}</dt><dd>${body}</dd></div>` : '');
    const exBody = ex ? [ex.text ? esc(ex.text) : '', link(ex), ex.source ? `<small class="panel-source">Source: ${link(ex.source)}</small>` : ''].filter(Boolean).join(' ') : '';
    const pic = panelImage(i.image, 'panel-img panel-row-img');
    return `<div class="panel-card panel-row${pic ? ' has-img' : ''}"${id}>${pic}<h3>${esc(i.title || '')}</h3><dl>${part('before', i.before ? esc(i.before) : '')}${part('after', i.after ? esc(i.after) : '')}${part('example', exBody)}</dl>${links.length ? `<ul class="panel-links">${links.map((l) => `<li>${link(l)}</li>`).join('')}</ul>` : ''}</div>`;
  };
  const kind = ['groups', 'rows'].includes(p.variant) ? p.variant : 'cards';
  const foot = (p.note ? `<p class="panel-note">${esc(p.note)}</p>` : '') + (p.owner && okHref(p.owner.href) ? `<p class="panel-owner">${link(p.owner)}</p>` : '');
  return `<section class="section panels panels-${kind}"${anchor}>
  ${sectionHead(p.title || '', p.more && okHref(p.more.href) ? p.more : null, p.lead || null, p.eyebrow || '')}
  <div class="panel-grid" style="--panels:${kind === 'rows' ? 1 : Math.min(items.length, 4) || 1}">${items.map(card).join('')}</div>${foot ? `\n  ${foot}` : ''}
</section>`;
}

/** The home block "ask-box": a visible box that opens the site's Ask dialog (/api/ask). Hidden until app.js wires Ask, like the header button. */
export function askBox(pack = PACK) {
  const a = pack.askBox;
  if (!a || typeof a !== 'object') return '';
  return `<section class="section ask-box" aria-labelledby="ask-box-h">
  <h2 id="ask-box-h" class="ask-box-h">${esc(a.title || 'Ask')}</h2>${a.lead ? `<p class="ask-box-lead">${esc(a.lead)}</p>` : ''}
  <button type="button" class="ask-open ask-box-open" aria-haspopup="dialog" hidden><span class="ask-box-ph">${esc(a.placeholder || '')}</span><span class="ask-box-go">${esc(a.button || 'Ask')}</span></button>
</section>`;
}

/** The prompts the lessons already carry: each lesson whose "try" link opens the composer with an idea. */
export function lessonPrompts(lessons = LESSONS) {
  return lessons.map((l) => {
    const href = l.try && l.try.href;
    if (typeof href !== 'string' || !href.startsWith('/create?')) return null;
    const idea = new URLSearchParams(href.slice('/create?'.length)).get('idea');
    return idea ? { prompt: idea, href, lesson: l } : null;
  }).filter(Boolean);
}

export const promptsOn = (pack = PACK) => !!(pack.prompts && typeof pack.prompts === 'object') && lessonPrompts().length > 0;

/** /prompts: every lesson prompt, grouped by the lesson's track, each with a link to try it and to the lesson it came from. */
export function promptsPage(pack = PACK) {
  const c = pack.prompts;
  const all = lessonPrompts();
  const tracks = [...new Set(all.map((p) => p.lesson.track))];
  const body = `<section class="page-head"><p class="eyebrow">${esc(c.eyebrow || 'Learn')}</p><h1>${esc(c.title || 'Prompts')}</h1>${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}</section>
${tracks.map((t) => `<section class="section">${sectionHead(t, null, '')}<ul class="prompt-list">${all.filter((p) => p.lesson.track === t).map((p) => `<li class="panel-card"><p class="prompt-text">${esc(p.prompt)}</p><p class="prompt-links"><a class="button small" href="${esc(p.href)}">${esc(c.tryLabel || 'Try it')}</a> <a href="/learn/${esc(p.lesson.id)}">${esc(c.fromLabel || 'From the lesson')}: ${esc(p.lesson.title)}</a></p></li>`).join('')}</ul></section>`).join('\n')}`;
  return layout({ title: c.title || 'Prompts', description: c.lead || '', path: '/prompts', body, current: '/prompts' });
}

export function promptsRoute(path) {
  if (path !== '/prompts' || !promptsOn()) return null;
  return htmlResponse(promptsPage());
}
