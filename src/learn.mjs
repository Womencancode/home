/* Learn: short lessons written in the site's own words, each ending with a next step on this site. Data: data/lessons.json
 * (engine default []); with no lessons there is no /learn page and no door to it. */
import list from '../data/lessons.json' with { type: 'json' };

export const LESSONS = list;

/** Is a lesson well formed: an id, 2 to 10 minutes, at least one step, and a try link that stays on this site? */
export function validLesson(l) {
  return !!l && /^[a-z0-9-]{2,60}$/.test(l.id || '') && typeof l.title === 'string' && typeof l.track === 'string' && Number.isInteger(l.minutes) && l.minutes >= 2 && l.minutes <= 10
    && Array.isArray(l.steps) && l.steps.length > 0 && l.steps.every((s) => s && s.title && s.text) && !!l.try && onSite(l.try.href);
}

/** An on-site path: starts with one '/', never '//' or a scheme. */
export function onSite(href) { return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//'); }

/** Lessons grouped by track, in the order tracks first appear: [{ track, lessons }]. */
export function tracks(lessons = LESSONS) {
  const out = [];
  for (const l of lessons) { let t = out.find((x) => x.track === l.track); if (!t) out.push(t = { track: l.track, lessons: [] }); t.lessons.push(l); }
  return out;
}

export function lessonById(id, lessons = LESSONS) { return lessons.find((l) => l.id === id) || null; }
