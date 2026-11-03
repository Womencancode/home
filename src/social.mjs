/* Social profiles and posts. A handle is stored bare ("burnaboy"); a profile link is built from it; a post URL from Instagram, X,
 * TikTok or YouTube becomes an embed. Known creators' handles are data/people.json, kept to ones we are sure of. */
import people from '../data/people.json' with { type: 'json' };
import { fold } from './places.mjs';

export const NETWORKS = {
  instagram: { label: 'Instagram', profile: (h) => `https://www.instagram.com/${h}/`, pattern: /^[a-z0-9._]{1,30}$/i, hosts: ['instagram.com'] },
  x: { label: 'X', profile: (h) => `https://x.com/${h}`, pattern: /^[a-z0-9_]{1,15}$/i, hosts: ['x.com', 'twitter.com'] },
  tiktok: { label: 'TikTok', profile: (h) => `https://www.tiktok.com/@${h}`, pattern: /^[a-z0-9._]{2,24}$/i, hosts: ['tiktok.com'] },
  youtube: { label: 'YouTube', profile: (h) => `https://www.youtube.com/@${h}`, pattern: /^[a-z0-9._-]{3,30}$/i, hosts: ['youtube.com'] },
  linkedin: { label: 'LinkedIn', profile: (h) => `https://www.linkedin.com/${h}/`, pattern: /^(?:in|company|school)\/[a-z0-9._%-]{2,100}$/i, hosts: ['linkedin.com'], path: 2 },
  facebook: { label: 'Facebook', profile: (h) => `https://www.facebook.com/${h}`, pattern: /^[a-z0-9.]{5,50}$/i, hosts: ['facebook.com'] },
};

const host = (u) => u.hostname.replace(/^(www\.|m\.|mobile\.)/, '');

/** A bare handle from "@name", "name" or a profile URL on that network; null when it is not one. */
export function handle(network, raw) {
  const n = NETWORKS[network];
  let s = String(raw || '').trim();
  if (!n || !s) return null;
  if (/^https?:\/\//i.test(s)) {
    let u;
    try { u = new URL(s); } catch { return null; }
    if (!n.hosts.includes(host(u))) return null;
    s = u.pathname.split('/').filter(Boolean).slice(0, n.path || 1).join('/');
  }
  s = s.replace(/^@/, '');
  return n.pattern.test(s) ? s : null;
}

/** Profile links for whatever handles a record carries, in a fixed order. */
export function profileLinks(socials = {}) {
  return Object.keys(NETWORKS).filter((k) => socials[k]).map((k) => ({ network: k, label: NETWORKS[k].label, handle: socials[k], href: NETWORKS[k].profile(socials[k]) }));
}

const PEOPLE = new Map(Object.entries(people).map(([name, s]) => [fold(name), s]));
/** The handles we hold for a named person or organisation, or {}. Every one was read from their own official site or profile. */
export function socialsOf(name) { return PEOPLE.get(fold(name)) || {}; }

/** What a post URL embeds as: { network, id, url } for an Instagram post or reel, an X post, a TikTok video or a YouTube video. */
export function embeddable(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = host(u), parts = u.pathname.split('/').filter(Boolean);
  if (h === 'instagram.com' && ['p', 'reel', 'tv'].includes(parts[0]) && /^[\w-]{5,40}$/.test(parts[1] || '')) return { network: 'instagram', id: parts[1], url: `https://www.instagram.com/${parts[0]}/${parts[1]}/` };
  if ((h === 'x.com' || h === 'twitter.com') && parts[1] === 'status' && /^\d{5,25}$/.test(parts[2] || '')) return { network: 'x', id: parts[2], url: `https://twitter.com/${parts[0]}/status/${parts[2]}` };
  if (h === 'tiktok.com' && parts[1] === 'video' && /^\d{5,25}$/.test(parts[2] || '')) return { network: 'tiktok', id: parts[2], url: `https://www.tiktok.com/${parts[0]}/video/${parts[2]}` };
  if (h === 'youtu.be' && /^[\w-]{11}$/.test(parts[0] || '')) return { network: 'youtube', id: parts[0], url: `https://www.youtube.com/watch?v=${parts[0]}` };
  if (h === 'youtube.com') {
    const id = parts[0] === 'watch' ? u.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : null;
    if (/^[\w-]{11}$/.test(id || '')) return { network: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  return null;
}

const SCRIPTS = { instagram: 'https://www.instagram.com/embed.js', x: 'https://platform.twitter.com/widgets.js', tiktok: 'https://www.tiktok.com/embed.js' };

/** The markup for an embed. Instagram, X and TikTok render a plain link first and upgrade when their script loads; YouTube is a
 * privacy-enhanced iframe. `esc` is the page's escaper. */
export function embedHtml(e, esc) {
  if (!e) return '';
  const link = `<a href="${esc(e.url)}" rel="noopener nofollow ugc">${e.network === 'x' ? 'See the post on X' : e.network === 'tiktok' ? 'Watch on TikTok' : 'See the post on Instagram'}</a>`;
  if (e.network === 'youtube') return `<div class="embed embed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/${esc(e.id)}" title="Video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  if (e.network === 'instagram') return `<div class="embed embed-instagram"><blockquote class="instagram-media" data-instgrm-permalink="${esc(e.url)}" data-instgrm-version="14">${link}</blockquote></div>`;
  if (e.network === 'x') return `<div class="embed embed-x"><blockquote class="twitter-tweet" data-dnt="true" data-theme="dark">${link}</blockquote></div>`;
  return `<div class="embed embed-tiktok"><blockquote class="tiktok-embed" cite="${esc(e.url)}" data-video-id="${esc(e.id)}">${link}</blockquote></div>`;
}

/** The script tags a page needs for the embeds on it, each once. */
export function embedScripts(list) {
  const nets = new Set(list.filter(Boolean).map((e) => e.network));
  return [...nets].filter((n) => SCRIPTS[n]).map((n) => `<script async src="${SCRIPTS[n]}"></script>`).join('');
}

/** The row of profile links, as HTML. */
export function socialRow(socials, esc) {
  const links = profileLinks(socials);
  return links.length ? `<p class="socials">${links.map((l) => `<a class="social ${l.network}" href="${esc(l.href)}" rel="noopener nofollow ugc"><span class="net">${esc(l.label)}</span> @${esc(l.handle)}</a>`).join('')}</p>` : '';
}

/** Content-Security-Policy additions the embeds need. */
export const EMBED_CSP = {
  script: ['https://www.instagram.com', 'https://platform.twitter.com', 'https://www.tiktok.com'],
  frame: ['https://www.instagram.com', 'https://platform.twitter.com', 'https://syndication.twitter.com', 'https://www.tiktok.com', 'https://www.youtube-nocookie.com'],
};
