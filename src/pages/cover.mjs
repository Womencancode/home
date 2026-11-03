/* The magazine-cover hero (layout hero variant "cover"). The cover star is a real person from the newest story with a proper
 * portrait of them (data/media.json people, portrait: true). The masthead is the site's name in a fashion serif (pack.cover.words,
 * e.g. BLACK in white and ABC in gold) with a strapline under it and the issue on the right; the star's name runs large and italic
 * down the left with the headline under a gold rule; the next stories are cover lines down the right, each a gold heading over a
 * short line; a QR code in the corner opens the cover story. When a cut-out of the portrait exists (scripts/apps/cover_cutouts.py)
 * the star stands in front of the masthead. Everything on it is a real story with its own credited picture. */
import { esc, SITE, absolute, navItems, mastheadOf, mastWords, mastTools } from '../html.mjs';
import { PACK } from '../site.mjs';
import { imageFor, picture, credit, personImage } from '../media.mjs';
import { qrEncode, qrPathData, QR_QUIET_ZONE } from '../qr.mjs';
import { rolesOf, roleScore } from '../roles.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The cover star: { story, name, img } for the first story naming someone with a portrait, else the first story with any picture
 * (name ''), else null. `portrait` (a name to photo lookup) is injectable for tests. */
export function coverStar(stories, portrait = personImage) {
  for (const s of stories || []) for (const name of s.people || []) { const img = portrait(name); if (img && img.portrait) return { story: s, name, img }; }
  const s = (stories || []).find((x) => imageFor(x));
  return s ? { story: s, name: '', img: imageFor(s) } : null;
}

/** "October 2026": the issue month. */
export const issueLabel = (now = new Date()) => `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

/** The issue number: months since the pack's first issue (cover.since, "YYYY-MM"), counting it as No. 1; null without one. */
export function issueNumber(now = new Date(), since = '') {
  const m = /^(\d{4})-(\d{2})$/.exec(since || '');
  if (!m) return null;
  const n = (now.getUTCFullYear() - Number(m[1])) * 12 + now.getUTCMonth() + 1 - Number(m[2]) + 1;
  return n >= 1 ? n : null;
}

/** A headline as { head, line }: when it starts with a person's name, the name heads it and the rest is the line ("Davido" / "wins
 * Album of the Year"); otherwise `fallback` (the category, say) heads it and the whole headline is the line. */
export function splitHeadline(title, names = [], fallback = '') {
  const t = String(title || '').trim();
  for (const name of names || []) {
    if (!name || !t.toLowerCase().startsWith(name.toLowerCase())) continue;
    const after = t.slice(name.length);
    const line = /^['’]s\s/.test(after) ? after.trim() : after.replace(/^[\s,:]+/, '').trim();
    if (line) return { head: name, line };
  }
  return { head: fallback, line: t };
}

/** The cover's QR code for an absolute address, as inline SVG, or '' when the address is too long to encode. */
export function coverQr(url) {
  try {
    const qr = qrEncode(url);
    const n = qr.size + 2 * QR_QUIET_ZONE;
    return `<svg class="mag-qr-code" viewBox="0 0 ${n} ${n}" role="img" aria-label="QR code for this story" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${qrPathData(qr)}" fill="#0b0b0e"/></svg>`;
  } catch { return ''; }
}

/** With cover.lineRoles and the pack's roles, the cover lines as [{ story, head }]: each headed by the role it fits best, a different
 * role per line where the stories allow, so the cover shows the range of jobs; [] when off or nothing fits. */
export function roleLines(stories, n, pack = PACK) {
  const roles = (pack.cover || {}).lineRoles ? rolesOf(pack) : [];
  if (!roles.length || n < 1) return [];
  const min = Number.isInteger(pack.cover.lineMin) ? pack.cover.lineMin : 2; /* one stray word is not a job title */
  const best = stories.map((s) => { let top = null, score = min - 1; for (const r of roles) { const k = roleScore(r, s); if (k > score) { top = r; score = k; } } return top ? { story: s, role: top } : null; }).filter(Boolean);
  const out = [], used = new Set();
  for (const b of best) if (out.length < n && !used.has(b.role.id)) { out.push(b); used.add(b.role.id); }
  for (const b of best) if (out.length < n && !out.includes(b)) out.push(b);
  return out.map((b) => ({ story: b.story, head: b.role.label, role: b.role.id, colour: b.role.colour, ink: b.role.ink }));
}

/** The cover for `stories` (featured, newest first) and the current moment, or '' when no story has a picture. */
export function coverHero({ stories = [], moment = null, now = new Date(), pack = PACK, portrait = personImage } = {}) {
  const star = coverStar(stories, portrait);
  if (!star) return '';
  const { story, name, img } = star;
  const cfg = pack.cover || {};
  const words = Array.isArray(cfg.words) && cfg.words.length ? cfg.words.filter((w) => w && w.text) : [{ text: SITE.name }];
  const mast = mastheadOf(pack); /* the masthead is the site's header: its wordmark links home, the menu, Ask and Language sit inside the card */
  const strap = cfg.strap === 'nav' || (mast && !Array.isArray(cfg.strap)) ? navItems().map(([href, label]) => ({ label, href })) : Array.isArray(cfg.strap) ? cfg.strap.filter((x) => x && (typeof x === 'string' || x.label)) : []; /* 'nav': the cover carries the site menu, and the page drops the header's */ /* "Music" or { label, href } with an on-site href */
  const no = issueNumber(now, cfg.since);
  const count = Number.isInteger(cfg.lines) ? Math.max(0, Math.min(3, cfg.lines)) : 3;
  const byRole = roleLines(stories.filter((s) => s !== story), count, pack);
  const lines = byRole.length ? byRole : stories.filter((s) => s !== story).slice(0, count).map((s) => ({ story: s, ...splitHeadline(s.title, s.people || [], s.category || '') }));
  const main = splitHeadline(story.title, name ? [name] : [], '');
  const big = name || main.line;
  const under = name ? main.line : '';
  const cut = img.cutout && /^\/[a-z0-9/_.-]+$/i.test(img.cutout) ? `<img class="mag-cut" src="${esc(img.cutout)}" alt="" aria-hidden="true" decoding="async">` : '';
  const href = `/story/${story.slug}`;
  /* With a cut-out the star is shot "in studio": a lit backdrop instead of the original photo's background (stage lights, crowds),
   * as a cover shoot would be. cover.studio: false keeps the original photo behind the cut-out. */
  const studio = cut && cfg.studio !== false;
  const qr = cfg.qr === false ? '' : coverQr(absolute(href));
  const by = img.credit && !img.preview && !img.video ? `Photographed by ${img.credit}` : '';
  return `<div class="mag${cut ? ' has-cut' : ''}${studio ? ' is-studio' : ''}" role="region" aria-label="${esc(`${words.map((w) => w.text).join(' ')}, ${issueLabel(now)}${name ? `: ${name}` : ''}`)}">
  <div class="mag-cover">
    ${studio ? '<span class="mag-studio" aria-hidden="true"></span>' : `<a class="mag-photo" href="${esc(href)}" tabindex="-1" aria-hidden="true">${picture(img, { alt: '', widths: [640, 960, 1280], sizes: '(max-width: 900px) 100vw, 760px', eager: true })}</a>`}
    ${mast ? `<header class="mast"><a class="mag-masthead" href="/" aria-label="${esc(SITE.name)} home" translate="no">${mastWords({ cover: { words } })}</a>` : `<p class="mag-masthead" aria-hidden="true">${words.map((w) => { const cls = [w.accent ? 'mh-accent' : '', w.small ? 'mh-small' : ''].filter(Boolean).join(' '); return `<span${cls ? ` class="${cls}"` : ''}>${esc(w.text)}</span>`; }).join(' ')}</p>
    ${cut}`}
    <div class="mag-top">${strap.length ? `<nav class="mag-strapline" aria-label="Sections">${strap.map((x) => { const label = typeof x === 'string' ? x : x.label; const link = typeof x === 'object' && /^\/(?!\/)/.test(x.href || '') ? x.href : ''; return link ? `<a href="${esc(link)}">${esc(label)}</a>` : esc(label); }).join('<span aria-hidden="true"> • </span>')}</nav>` : '<span></span>'}${mast ? '<div class="mast-side">' : ''}<p class="mag-issue">${no ? `No. ${no}<br>` : ''}${esc(issueLabel(now))}${moment ? `<br>${esc(moment.name)}` : ''}</p>${mast ? `${mastTools('/')}</div>` : ''}</div>${mast ? `</header>\n    ${cut}` : ''}
    <a class="mag-main" href="${esc(href)}"><span class="mag-line">${esc(big)}</span>${under ? `<span class="mag-rule" aria-hidden="true"></span><span class="mag-under">${esc(under)}</span>` : ''}</a>
    ${lines.length ? `<ul class="mag-lines">${lines.map((l) => `<li${l.role ? ` data-role="${esc(l.role)}" style="--line:${esc(l.colour)};--line-ink:${esc(l.ink)}"` : ''}><a href="/story/${esc(l.story.slug)}"><span class="mag-head">${esc(l.head)}</span><span class="mag-sub">${esc(l.line || l.story.title)}</span></a></li>`).join('')}</ul>` : ''}
    ${by ? `<p class="mag-by">${esc(by)}</p>` : ''}
    ${qr ? `<a class="mag-qr" href="${esc(href)}">${qr}<span>Scan to read</span></a>` : ''}
  </div>
  <p class="mag-credit">${credit(img)}.${studio ? ' Cut out and set on a studio backdrop for this cover.' : cut ? ' Cut out for this cover.' : ''} <a href="/submit?kind=story">Know someone who belongs on the cover? Tell us.</a></p>
</div>`;
}
