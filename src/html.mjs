/* HTML building blocks: escaping, the page shell, and the small components every page shares. Pages are plain template strings so
 * that a change to the markup is a change to one file and nothing has to be compiled to see it. */
import { profileLinks, socialsOf } from './social.mjs';
import { PACK, T } from './site.mjs';
import { LESSONS } from './learn.mjs';
import { POSTS } from './posts.mjs';
import { speakersEnabled } from './speakers.mjs';
import { festivalsOn, festivalsInNav } from './partners/festivals.mjs';
import { waitlistOn } from './waitlist.mjs';
import { appStoreConfig, appStoreInNav } from './appstore.mjs';
import { careersNav, careersFooter } from './careers.mjs';
import { tributesOn } from './tributes.mjs';
import { trainOn } from './train.mjs';
import { gapOn } from './gap.mjs';
import { cohortsConfig } from './cohorts.mjs';
import { challengeConfig } from './challenge.mjs';

export const SITE = { name: PACK.name, domain: PACK.domain, tagline: PACK.tagline };

/** Escape text for an HTML text node or a double-quoted attribute. */
export function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The pack's optional skins ("skins": ["emerald"], each a file at public/skins/<id>.css), well formed ids only. */
export const skinsOf = (pack = PACK) => (Array.isArray(pack.skins) ? pack.skins : []).filter((s) => typeof s === 'string' && /^[a-z0-9-]{2,30}$/.test(s));
/** The stylesheet for the chosen skin ("skin": "emerald"), after skin.css; nothing when no variant is chosen. */
export const skinLink = (pack = PACK) => (skinsOf(pack).includes(pack.skin) ? `\n<link rel="stylesheet" href="/skins/${pack.skin}.css" data-skin="${pack.skin}">` : '');

/** The small "Beta" pill beside the wordmark, when the pack says "beta": true; nothing otherwise. */
export const betaPill = (pack = PACK) => (pack.beta === true ? '<span class="beta-pill">Beta</span>' : '');

/** The absolute URL for a path on the public site. */
export function absolute(path, origin = `https://${SITE.domain}`) { return new URL(path, origin).href; }

const NAV = [
  ...careersNav(),
  ['/opportunities', 'Opportunities'],
  ...(festivalsInNav() ? [['/festivals', 'Festivals']] : []),
  ['/open-doors', 'Open doors'],
  ['/watch', 'Watch'],
  ['/countries', 'Countries'],
  ['/events', 'Events'],
  ['/map', 'Map'],
  ['/stories', 'Stories'],
  ...(LESSONS.length ? [['/learn', 'Learn']] : []),
  ...(POSTS.length ? [['/writing', 'Writing']] : []),
  ...(speakersEnabled() ? [['/speakers', 'Speakers']] : []),
  ...(appStoreInNav() ? [['/apps', appStoreConfig().title]] : []),
  ...(cohortsConfig() && cohortsConfig().nav ? [['/cohorts', esc(cohortsConfig().copy.navLabel)]] : []),
  ...(challengeConfig() && challengeConfig().nav ? [['/challenge', esc(challengeConfig().copy.navLabel)]] : []),
].filter(([href]) => !(PACK.navHide || []).includes(href)); /* the footer still links every page */
/* Opt-in: "navLabels" renames a menu item ({ "/learn": "Learning" }), "navExtra" adds items first ([{ href, label }]). */
for (const n of NAV) if (PACK.navLabels && typeof PACK.navLabels[n[0]] === 'string') n[1] = esc(PACK.navLabels[n[0]]);
if (Array.isArray(PACK.navExtra)) NAV.unshift(...PACK.navExtra.filter((x) => x && /^\/[^\s"<>]*$/.test(x.href || '') && x.label).map((x) => [x.href, esc(x.label)]));
/** Opt-in header buttons ("headerActions": [{ href, label, primary }]) in place of the share button; the share button otherwise. */
const headerActions = () => (Array.isArray(PACK.headerActions) && PACK.headerActions.length
  ? `<span class="head-actions">${PACK.headerActions.filter((a) => a && /^\/[^\s"<>]*$/.test(a.href || '') && a.label).map((a) => `<a class="button small${a.primary ? ' primary' : ' ghost'}" href="${esc(a.href)}">${esc(a.label)}</a>`).join('')}</span>`
  : '<a class="button small" href="/submit">Share something good</a>');
/** Opt-in footer columns ("footerColumns": [{ title, links: [{ href, label }] }]), after the engine's own; on-site links only. */
const footerColumns = () => (Array.isArray(PACK.footerColumns) ? PACK.footerColumns : []).map((c) => {
  const links = (Array.isArray(c && c.links) ? c.links : []).filter((l) => l && /^\/[^\s"<>]*$/.test(l.href || '') && l.label);
  return links.length ? `\n    <div><h2>${esc(c.title || '')}</h2><ul>${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul></div>` : '';
}).join('');
const CAREERS_FOOTER = careersFooter();

/** The header menu as [href, label] pairs (the magazine cover's strapline can carry it instead, see pages/cover.mjs). */
export const navItems = () => NAV.map(([href, label]) => [href, label]);

/** The <body> attributes: has-cover for the magazine-cover front page, and with a role chosen (src/roles.mjs) its id and colour. */
export function bodyAttrs(page = {}) {
  const r = page.role && /^[a-z][a-z0-9-]{1,30}$/.test(page.role.id || '') ? page.role : null;
  const cls = [page.cover ? 'has-cover' : '', r ? 'has-role' : ''].filter(Boolean).join(' ');
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');
  const style = r ? [hex(r.colour) && `--role-colour:${r.colour}`, hex(r.ink) && `--role-ink:${r.ink}`].filter(Boolean).join(';') : '';
  return `${cls ? ` class="${cls}"` : ''}${r ? ` data-role="${r.id}"` : ''}${style ? ` style="${style}"` : ''}`;
}

/** The page shell. `page` carries title, description, path, body (HTML), and optionally image ({ src, alt }: the page's own picture,
 * served as a local copy so link previews show it), type, noindex, jsonld and current. Without an image the PNG card is shared. */
export function layout(page, pack = PACK) {
  const mast = mastheadOf(pack);
  const title = page.title ? `${page.title} · ${SITE.name}` : `${SITE.name}: ${SITE.tagline}`;
  const description = page.description || SITE.tagline;
  const url = absolute(page.path || '/');
  const own = page.image && page.image.src ? page.image : null;
  const image = own ? absolute(localSrc(own.src)) : absolute('/og.png');
  const imageAlt = own ? (own.alt || page.title || SITE.name) : `${SITE.name}: ${SITE.tagline}`;
  const nav = NAV.map(([href, label]) => `<a href="${href}"${page.current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const jsonld = page.jsonld ? `<script type="application/ld+json">${JSON.stringify(page.jsonld).replace(/</g, '\\u003c')}</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${page.noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="${PACK.theme || '#0b0b0e'}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="${esc(page.type || 'website')}">
<meta property="og:title" content="${esc(page.title || SITE.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
${own ? '' : '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:type" content="image/png">\n'}<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title || SITE.name)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="${esc(SITE.name)}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${esc(SITE.name)} good news" href="/feed.xml">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/skin.css">${skinLink()}${mast && page.cover ? MAST_NOSCRIPT : ''}
${jsonld}
</head>
<body${bodyAttrs(page)}>
<a class="skip" href="#main">Skip to content</a>
${mast ? mastBar(page, nav, pack) : `<header class="site-header">
  <a class="brand" href="/" aria-label="${esc(SITE.name)} home${PACK.beta === true ? ', beta' : ''}" translate="no">${T('wordmark')}${betaPill()}</a>
  <!--live-moment-->
  <nav class="site-nav" aria-label="Main">${nav}</nav>
  <button type="button" class="ask-open" aria-haspopup="dialog" hidden><span aria-hidden="true">🎙</span> <span class="ask-label">Ask</span></button>
  ${languageMenu(page.path || '/')}
  ${headerActions()}
</header>`}
${page.ticker || ''}
<dialog class="ask" aria-label="${T('ask.name')}"><form method="dialog" class="ask-close-f"><button class="ask-close" aria-label="Close">×</button></form><p class="eyebrow">${T('ask.name')}</p><h2>What are you looking for?</h2><p class="muted small">Say it or type it: "AI competitions I can enter from Nigeria", "what's on in London this week".</p><form class="ask-form" action="/api/ask"><input name="q" type="search" placeholder="Ask anything" autocomplete="off"><button type="button" class="ask-mic" aria-label="Speak">🎙</button><button class="button small primary" type="submit">Ask</button></form><p class="ai-note small">Ask searches this site's own pages. When a written answer appears, it is made by AI: check the links it gives.</p><div class="ask-out" aria-live="polite"></div></dialog>
<main id="main">
${page.body}
</main>
<footer class="site-footer">
  <div class="footer-grid">
    <div><p class="footer-brand">${T('wordmark')}${betaPill()}</p><p class="footer-abc">${T('abc')}</p><p>${esc(SITE.tagline)} ${T('footer.line')}</p></div>
    <div><h2>Explore</h2><ul><li><a href="/opportunities">Opportunities</a></li><li><a href="/watch">Watch</a></li><li><a href="/countries">Every country</a></li><li><a href="/map">Map</a></li><li><a href="/events">Events</a></li><li><a href="/stories">Good news</a></li><li><a href="/showcase">Creative showcase</a></li><li><a href="/talent">Talent directory</a></li><li><a href="/open-doors">Open doors</a></li>${CAREERS_FOOTER.explore.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}${LESSONS.length ? '<li><a href="/learn">Learn</a></li>' : ''}${POSTS.length ? '<li><a href="/writing">Writing</a></li>' : ''}${speakersEnabled() ? '<li><a href="/speakers">Speakers</a></li>' : ''}${festivalsOn() ? '<li><a href="/festivals">Film festivals</a></li>' : ''}${appStoreConfig() ? `<li><a href="/apps">${esc(appStoreConfig().title)}</a></li>` : ''}${trainOn() ? '<li><a href="/train">Training funding</a></li>' : ''}${gapOn() ? '<li><a href="/why">The representation gap</a></li>' : ''}</ul></div>
    <div><h2>Take part</h2><ul><li><a href="/submit">Submit a story or work</a></li>${cohortsConfig() ? `<li><a href="/cohorts">${esc(cohortsConfig().copy.navLabel)}</a></li>` : ''}${challengeConfig() ? `<li><a href="/challenge">${esc(challengeConfig().title)}</a></li>` : ''}${tributesOn() ? '<li><a href="/tributes">Name a teacher who changed your life</a></li>' : ''}${CAREERS_FOOTER.takePart.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}${appStoreConfig() ? '<li><a href="/apps/publish">Publish your app</a></li>' : ''}${waitlistOn() ? '<li><a href="/waitlist">Waitlist</a></li>' : ''}<li><a href="/guidelines">Content guidelines</a></li><li><a href="/about">About ${esc(SITE.name)}</a></li><li><a href="/feed.xml">RSS feed</a></li></ul></div>${footerColumns()}
  </div>
  <p class="footer-note">Positive by design. Every story is about something that went right. Corrections welcome through the <a href="/submit?kind=correction">submission form</a>.</p>
</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}

/** The masthead setting, pack.masthead { mode: 'nav', sticky }: { sticky } when on, null when off (the default). docs/masthead.md. */
export function mastheadOf(pack = PACK) {
  const m = pack && pack.masthead;
  return m && m.mode === 'nav' ? { sticky: m.sticky !== false } : null;
}

/** The wordmark from the pack's cover words (the same spans as the cover masthead), or the copy wordmark when it has none. */
export function mastWords(pack = PACK) {
  const words = ((pack.cover || {}).words || []).filter((w) => w && w.text);
  return words.length ? words.map((w) => { const cls = [w.accent ? 'mh-accent' : '', w.small ? 'mh-small' : ''].filter(Boolean).join(' '); return `<span${cls ? ` class="${cls}"` : ''}>${esc(w.text)}</span>`; }).join(' ') : T('wordmark');
}

/** Ask and Language for the masthead and its bar, each with an accessible name that survives phones showing only the icon. */
export function mastTools(path) {
  return `<div class="mast-tools"><button type="button" class="ask-open" aria-haspopup="dialog" aria-label="Ask" hidden><span aria-hidden="true">🎙</span> <span class="ask-label">Ask</span></button>${languageMenu(path)}</div>`;
}

/* Without script the bar after the cover is not hidden: it sits above the cover, in the page. */
const MAST_NOSCRIPT = '\n<noscript><style>.mast-bar[data-after-cover]{position:sticky;transform:none;visibility:visible}</style></noscript>';

/** The condensed masthead bar: small wordmark, the menu behind a toggle, Ask and Language. On a page without a cover it is the
 * header; after a cover (page.cover) it is a bar app.js shows once the cover's masthead has scrolled away. `nav` is the menu's links. */
export function mastBar(page, nav, pack = PACK) {
  const m = mastheadOf(pack);
  if (!m || (page.cover && !m.sticky)) return '';
  const tag = page.cover ? 'div' : 'header';
  return `<${tag} class="mast-bar${m.sticky ? ' is-sticky' : ''}"${page.cover ? ' data-after-cover' : ''}><div class="mast-bar-in">
  <a class="mast-brand" href="/" aria-label="${esc(SITE.name)} home${pack.beta === true ? ', beta' : ''}" translate="no">${mastWords(pack)}${betaPill(pack)}</a>
  <!--live-moment-->
  <details class="mast-menu"><summary aria-label="Menu"><span class="mast-menu-icon" aria-hidden="true"></span><span class="mast-label">Menu</span></summary><nav class="site-nav" aria-label="Main">${nav}</nav></details>
  ${mastTools(page.path || '/')}
</div></${tag}>`;
}

/** A section heading with an optional "see all" link and an optional numbered eyebrow ("01", "Live map"). */
export function sectionHead(title, more, lead, number = '') {
  return `<div class="section-head"><div>${number ? `<p class="section-n">${esc(number)}</p>` : ''}<h2>${esc(title)}</h2>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}</div>${more ? `<a class="more" href="${esc(more.href)}">${esc(more.label)}</a>` : ''}</div>`;
}

/** Share links for a page: the device's own share sheet where it exists (app.js reveals it), then WhatsApp, X, Facebook, LinkedIn,
 * Telegram, email and copy. Plain links, no third-party scripts. `path` is the page's own path. */
export function shareBar(path, title, { label = 'Share' } = {}) {
  const url = `https://${SITE.domain}${path}`;
  const u = encodeURIComponent(url), t = encodeURIComponent(title), both = encodeURIComponent(`${title} ${url}`);
  const nets = [
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${both}`],
    ['x', 'X', `https://x.com/intent/post?text=${t}&url=${u}`],
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['linkedin', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['telegram', 'Telegram', `https://t.me/share/url?url=${u}&text=${t}`],
    ['email', 'Email', `mailto:?subject=${t}&body=${both}`],
  ];
  return `<div class="share" data-share-url="${esc(url)}" data-share-title="${esc(title)}"><span class="share-label">${esc(label)}</span>
  <button type="button" class="share-btn share-native" hidden>Share…</button>
  ${nets.map(([k, name, href]) => `<a class="share-btn share-${k}" href="${esc(href)}"${k === 'email' ? '' : ' target="_blank" rel="noopener nofollow"'}>${esc(name)}</a>`).join('')}
  <button type="button" class="share-btn share-copy" hidden>Copy link</button></div>`;
}

/** Languages offered in the header, each as [code, its own name]. Google Translate covers all of them; Chrome's on-device translator
 * covers some, and app.js uses it first where it can. */
export const LANGUAGES = [['fr', 'Français'], ['pt', 'Português'], ['es', 'Español'], ['sw', 'Kiswahili'], ['yo', 'Yorùbá'], ['ig', 'Igbo'], ['ha', 'Hausa'], ['am', 'አማርኛ'], ['zu', 'isiZulu'], ['ak', 'Twi'], ['so', 'Soomaali'], ['ht', 'Kreyòl ayisyen'], ['ar', 'العربية'], ['wo', 'Wolof'], ['ln', 'Lingála'], ['rw', 'Kinyarwanda']];

/** "Read in your language": each language links to Google Translate's copy of this page, so it works without JavaScript; app.js
 * offers the visitor's own browser language first and translates on the device when Chrome can. */
export function languageMenu(path) {
  const page = encodeURIComponent(`https://${SITE.domain}${path}`);
  return `<details class="lang-menu"><summary aria-label="Read in your language"><span aria-hidden="true">🌐</span> <span class="lang-label">Language</span></summary>
  <div class="lang-panel"><p class="lang-note">Read this page in your language</p><ul>${LANGUAGES.map(([code, name]) => `<li><a lang="${code}" hreflang="${code}" data-lang="${code}" href="https://translate.google.com/translate?sl=en&amp;tl=${code}&amp;u=${page}" rel="noopener nofollow">${esc(name)}</a></li>`).join('')}</ul>
  <button type="button" class="lang-reset" hidden>Back to English</button></div></details>`;
}

/** The live badge beside the logo while a big moment is on, e.g. "● BHM" linking to its line-up. */
export function liveBadge(m) {
  return m ? `<a class="live-badge" href="${esc(m.href)}" title="${esc(m.name)}"><span class="live-dot" aria-hidden="true"></span><span>${esc(m.label)}</span><span class="visually-hidden"> is on now</span></a>` : '';
}

/** A small label chip. */
export function chip(text, href) {
  return href ? `<a class="chip" href="${esc(href)}">${esc(text)}</a>` : `<span class="chip">${esc(text)}</span>`;
}

const placeLine = (x, country) => `<p class="card-place"><a href="/country/${esc(country.slug)}${x.city ? `?city=${encodeURIComponent(x.city)}` : ''}"><span aria-hidden="true">${country.flag}</span> ${x.city ? `${esc(x.city)}, ` : ''}${esc(country.name)}</a></p>`;

/** The picture at the top of a card, with its credit. `img` comes from media.imageFor(); none means the flag-and-colour cover. */
export function cardMedia(img, label, flag, { lead = false } = {}) {
  if (!img) return `<div class="card-media no-photo" aria-hidden="true"><span class="cover-flag">${flag}</span></div>`;
  const widths = [500, 960];
  const srcset = isCommons(img.src) ? ` srcset="${widths.map((w) => `${esc(sizedSrc(img.src, w))} ${w}w`).join(', ')}" sizes="${lead ? '(max-width: 760px) 100vw, 760px' : '(max-width: 760px) 100vw, 380px'}"` : '';
  return `<figure class="card-media" data-flag="${esc(flag || '')}"><img src="${esc(sizedSrc(img.src, widths[0]))}"${srcset} alt="${esc(img.alt || label)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><figcaption class="credit">${img.stock ? `Stock photo: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>, ${esc(img.licence)}` : img.video ? `Video: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>` : img.preview ? `Image: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>` : `Photo: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>, ${esc(img.licence)}`}</figcaption></figure>`;
}

/** A publisher's picture served from this site: /img/p/<the address, base64url>. The Worker fetches it once, keeps a copy at the edge
 * and serves it from here, so a publisher refusing hotlinks or a browser blocking cross-site images cannot break it. */
export function localSrc(src) {
  if (!/^https?:\/\//.test(src || '') || /^https:\/\/images\.unsplash\.com\//.test(src)) return src;
  const b = typeof Buffer !== 'undefined' ? Buffer.from(src, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(src)));
  return `/img/p/${b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
/** The address a /img/p/ path stands for, or ''. */
export function fromLocal(code) {
  try { const b = code.replace(/-/g, '+').replace(/_/g, '/'); return typeof Buffer !== 'undefined' ? Buffer.from(b, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b))); } catch { return ''; }
}
export const isCommons = (src) => /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(src || '');

/** A Commons rendition at a width (the same rule as media.sized, kept here so html.mjs imports nothing); anything else is served locally. */
export function sizedSrc(src, width) {
  if (!/^https:\/\/upload\.wikimedia\.org\//.test(src)) return localSrc(src);
  const w = [330, 500, 960].find((x) => x >= width) || 960;
  let path;
  if (src.includes('/thumb/')) path = src.replace(/\/(\d+)px-([^/]+)$/, `/${w}px-$2`);
  else { const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w)\/(\w\w)\/([^/]+)$/.exec(src); path = m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${w}px-${m[4]}` : src; }
  return path.replace('https://upload.wikimedia.org/', '/img/commons/');
}

/** A story card. `country` is the resolved country record; `lead` makes it the large first card of a grid; `img` is its picture. */
export function storyCard(story, country, { lead = false, img = null } = {}) {
  return `<article class="card story-card cat-${esc(story.category)}${lead ? ' card-lead' : ''}${img ? ' has-photo' : ''}">
  ${cardMedia(img, story.title, country.flag, { lead })}
  <p class="card-kicker"><span class="cat">${esc(story.category)}</span><span>${esc(story.date ? monthYear(story.date) : story.year)}</span>${story.fresh ? '<span class="new-pill">New</span>' : ''}</p>
  <h3><a href="/story/${esc(story.slug)}">${esc(story.title)}</a></h3>
  <p class="card-text">${esc(story.summary)}</p>
  ${placeLine(story, country)}
  ${story.community ? '<p class="card-note">Shared by the community</p>' : ''}
</article>`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Mar 2026" from "2026-03-26". */
export function monthYear(iso) { return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`; }

/** A creative work card, with its creator's photo when there is one. */
export function workCard(work, country, { img = null } = {}) {
  return `<article class="card work-card med-${esc(work.medium)}${img ? ' has-photo' : ''}">
  ${cardMedia(img, work.creator, country.flag)}
  <p class="card-kicker"><span class="cat">${esc(work.medium)}</span><span>${esc(work.year)}</span></p>
  <h3><a href="/work/${esc(work.slug)}">${esc(work.title)}</a></h3>
  <p class="byline">${esc(work.creator)}</p>
  <p class="card-text">${esc(work.blurb)}</p>
  ${placeLine(work, country)}
  ${work.community ? '<p class="card-note">Shared by the community</p>' : ''}
</article>`;
}

/** A country tile for grids. */
export function countryTile(country, counts = {}) {
  const n = (counts.stories || 0) + (counts.works || 0);
  return `<a class="tile" href="/country/${esc(country.slug)}" data-name="${esc(country.name.toLowerCase())}"><span class="tile-flag" aria-hidden="true">${country.flag}</span><span class="tile-name">${esc(country.name)}</span><span class="tile-count">${n ? String(n).padStart(2, '0') : 'open'}</span></a>`;
}

/** The empty state that invites a submission. */
export function invite(country, kind) {
  const q = new URLSearchParams();
  if (country) q.set('country', country.code);
  if (kind) q.set('kind', kind);
  return `<div class="invite"><p>${country ? `Nothing here yet for ${esc(country.name)}.` : 'Nothing here yet.'} Know something good? <a class="button" href="/submit?${q}">Be the first to share it</a></p></div>`;
}

/** "From around the web": headlines from each country's leading news sites, linked to the publisher. `country` names the page. */
export function newsList(items, { country = null, empty = '' } = {}) {
  if (!items.length) return empty ? `<p class="muted">${empty}</p>` : '';
  const day = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); } catch { return ''; } };
  return `<ul class="news-list">${items.map((n) => `<li class="news-item${n.image ? ' has-image' : ''}">${n.image ? `<img src="${esc(localSrc(n.image))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="112" height="72">` : ''}<div><p class="news-meta"><span class="news-source">${esc(n.source)}</span> · <time datetime="${esc(n.published_at)}">${esc(day(n.published_at))}</time>${!country && n.country ? ` · ${esc(n.countryName || n.country)}` : ''}</p><h3><a href="${esc(n.url)}" rel="noopener nofollow" target="_blank">${esc(n.title)}</a></h3>${n.summary ? `<p>${esc(n.summary.length > 200 ? `${n.summary.slice(0, 197).replace(/\s+\S*$/, '')}…` : n.summary)}</p>` : ''}</div></li>`).join('')}</ul>`;
}

/** The HTML `Response` for a rendered page. */
export function htmlResponse(html, status = 200, extra = {}) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=60, stale-while-revalidate=600' : 'no-store', ...extra } });
}

/** Schema.org sameAs for a named person or organisation: the profile links we hold for them, each read from their own site. */
export function sameAs(name) {
  return profileLinks(socialsOf(name)).map((l) => l.href);
}
