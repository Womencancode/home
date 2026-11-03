/* What lights the map: someone in a country shared something (no title until a person has read it), or an entry went live. No
 * names, no emails, no pending text ever leave the server. Corrections and declined submissions never appear. */
import { countryByCode } from './countries.mjs';
import { locate } from './places.mjs';

export const WINDOW_MS = 48 * 60 * 60 * 1000;
const SHARED = { story: 'shared a good-news story', work: 'shared a creative work', talent: 'nominated a creator', event: 'shared an event' };

/** Turn submission rows into map events, newest first, each one country, one moment. */
export function eventsFrom(rows, sinceIso) {
  const out = [];
  for (const r of rows) {
    const c = countryByCode(r.country);
    if (!c || !SHARED[r.kind]) continue;
    const at = locate({ country: c.code, city: r.city, lat: r.lat, lon: r.lon }) || {};
    const where = at.precision === 'city' && at.city ? `${at.city}, ${c.name}` : c.name;
    const point = { x: at.x == null ? null : Math.round(at.x * 10) / 10, y: at.y == null ? null : Math.round(at.y * 10) / 10, city: at.precision === 'city' ? at.city : null };
    if (r.created_at >= sinceIso) out.push({ id: `s${r.id}`, type: 'shared', country: c.code, countryName: c.name, slug: c.slug, kind: r.kind, at: r.created_at, ...point, text: `Someone in ${where} ${SHARED[r.kind]}` });
    if (r.status === 'approved' && r.reviewed_at && r.reviewed_at >= sinceIso) out.push({ id: `a${r.id}`, type: 'live', country: c.code, countryName: c.name, slug: c.slug, kind: r.kind, at: r.reviewed_at, ...point, text: `New from ${where}: ${r.title}`, url: r.kind === 'talent' ? `/talent?country=${c.code}` : r.kind === 'event' ? `/event/c-${r.id}` : `/country/${c.slug}${point.city ? `?city=${encodeURIComponent(point.city)}` : ''}` });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The feed for /api/activity?since=ISO. A missing, malformed or older-than-48-hours `since` means the last 48 hours. */
export async function activity(store, sinceParam, now = new Date()) {
  const floor = new Date(now.getTime() - WINDOW_MS).toISOString();
  const asked = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam).toISOString() : floor;
  const since = asked < floor ? floor : asked;
  let rows = [];
  try { rows = await store.recentActivity(since); } catch { rows = []; }
  return { now: now.toISOString(), since, events: eventsFrom(rows, since).slice(0, 40) };
}
