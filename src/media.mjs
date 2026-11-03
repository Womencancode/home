/* Pictures: freely licensed photos from Wikimedia Commons (data/media.json), each shown with its photographer and licence. */
import media from '../data/media.json' with { type: 'json' };
import { esc, localSrc, isCommons } from './html.mjs';
import { fold } from './places.mjs';
import { embeddable } from './social.mjs';

export const MEDIA = media;

/** A Commons rendition at a given width: thumbs change their width segment, originals become a thumb path. */
export function sized(src, width) {
  if (!/^https:\/\/upload\.wikimedia\.org\//.test(src)) return localSrc(src);
  const w = [330, 500, 960].find((x) => x >= width) || 960;
  let path;
  if (src.includes('/thumb/')) path = src.replace(/\/(\d+)px-([^/]+)$/, `/${w}px-$2`);
  else { const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w)\/(\w\w)\/([^/]+)$/.exec(src); path = m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${w}px-${m[4]}` : src; }
  return path.replace('https://upload.wikimedia.org/', '/img/commons/');
}

/** The picture for an event, or null. */
export function eventImage(id) { return MEDIA.events[id] || null; }

/** An <img> with a srcset, lazy by default. `alt` falls back to the caller's words. */
export function picture(img, { alt = '', widths = [500, 960, 1280], sizes = '(max-width: 760px) 100vw, 600px', eager = false, className = '' } = {}) {
  if (!img) return '';
  /* A publisher's picture has one size; a srcset of the same address three times only adds a parse that commas in it can confuse. */
  const resizable = isCommons(img.src);
  const srcset = resizable ? ` srcset="${widths.map((w) => `${esc(sized(img.src, w))} ${w}w`).join(', ')}" sizes="${esc(sizes)}"` : '';
  return `<img class="${esc(className)}" src="${esc(sized(img.src, widths[1] || widths[0]))}"${srcset} alt="${esc(img.alt || alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`;
}

/** "Photo: Tim Fearn, CC BY-SA 3.0, Wikimedia Commons", or for a publisher's share image "Image: Al Jazeera, from the linked article". */
export function credit(img) {
  if (!img) return '';
  if (img.stock) return `<span class="credit">Stock photo: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>, ${img.licenceUrl ? `<a href="${esc(img.licenceUrl)}" rel="noopener nofollow license">${esc(img.licence)}</a>` : esc(img.licence)}${img.provider ? `, via ${esc(img.provider)}` : ''}</span>`;
  if (img.video) return `<span class="credit">Video: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>, YouTube</span>`;
  if (img.preview) return `<span class="credit">Image: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>, from the linked article</span>`;
  return `<span class="credit">Photo: <a href="${esc(img.page)}" rel="noopener nofollow">${esc(img.credit)}</a>, ${img.licenceUrl ? `<a href="${esc(img.licenceUrl)}" rel="noopener nofollow license">${esc(img.licence)}</a>` : esc(img.licence)}, Wikimedia Commons</span>`;
}

const PEOPLE = new Map(Object.entries(MEDIA.people || {}).map(([name, img]) => [fold(name), { ...img, name }]));
/** The photo of a named person, or null. */
export function personImage(name) { return PEOPLE.get(fold(name)) || null; }

const creators = (s) => String(s || '').replace(/,?\s+starring\s+/i, ' and ').split(/\s+and\s+|,\s*/).map((x) => x.trim()).filter(Boolean);
/** The best real picture for a story, work or event: its own, an event's photo, or a photo of its subject. A story's subject is the
 * first person it names; the others are context, and showing one of them would put the wrong face on the card. A work's creators
 * are all its subject. */
export function imageFor(entry) {
  if (entry.image && entry.image.src) return entry.image;
  const v = videoThumb(entry);
  if (entry.rule || entry.kind === 'event') return eventImage(entry.id) || v || stockFor(entry.kind);
  const names = entry.people ? entry.people.slice(0, 1) : creators(entry.creator);
  for (const n of names) { const img = personImage(n); if (img) return img; }
  return v;
}

/** A credited stock photo for a kind of event or a moment (data/media.json "stock"), clearly labelled as stock, or null. Used last. */
export function stockFor(key) { const s = (MEDIA.stock || {})[key]; return s ? { ...s, stock: true, preview: false } : null; }

/** The still of an entry's official YouTube video, credited to its channel, or null. Used only when there is no photo. */
export function videoThumb(entry) {
  const e = entry.video && embeddable(entry.video.url);
  return e && e.network === 'youtube' ? { src: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`, page: e.url, credit: entry.video.channel || 'YouTube', alt: entry.video.title || null, preview: true, video: true } : null;
}
