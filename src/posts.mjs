/* Writing: articles the site publishes in its own words, each with its sources and a picture. Data: data/posts.json (engine
 * default []); with no posts there is no /writing page and no door to it. */
import list from '../data/posts.json' with { type: 'json' };
import { onSite } from './learn.mjs';

/** Is a post well formed: a slug, a title, an ISO date, a summary, at least one section with text, and https sources only? */
export function validPost(p) {
  return !!p && /^[a-z0-9-]{2,80}$/.test(p.slug || '') && typeof p.title === 'string' && p.title.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '')
    && typeof p.summary === 'string' && Array.isArray(p.sections) && p.sections.length > 0 && p.sections.every((s) => s && typeof s.text === 'string' && s.text.length > 0)
    && (!p.image || onSite(p.image.src)) && (p.sources || []).every((s) => s && /^https:\/\//.test(s.url || ''));
}

/** Posts newest first, well-formed ones only. */
export const POSTS = list.filter(validPost).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

export function postBySlug(slug, posts = POSTS) { return posts.find((p) => p.slug === slug) || null; }
