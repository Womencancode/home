/* "I'm a…": the role picker (pack.roles, off by default). A visitor picks a role (?role=<id>, remembered by app.js) and the home
 * page re-forms around it: an intro in the role's colour, then each block's items ranked by the role's fields, topics, tracks and
 * words from the pack's own taxonomies. Nothing is hidden: items that match come first, the rest follow. */
import { PACK } from './site.mjs';
import { esc } from './html.mjs';

const ID = /^[a-z][a-z0-9-]{1,30}$/;
const COLOUR = /^#[0-9a-f]{6}$/i;
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

/** The pack's roles, cleaned: [{ id, label, colour, ink, intro, fields, topics, tracks, tags, lanes, types, words }]; [] when off. */
export function rolesOf(pack = PACK) {
  const cfg = pack && pack.roles;
  if (!cfg || !Array.isArray(cfg.list)) return [];
  return cfg.list.filter((r) => r && ID.test(r.id || '') && r.id !== 'all' && typeof r.label === 'string').map((r) => ({
    id: r.id, label: r.label, short: typeof r.short === 'string' ? r.short : r.label,
    colour: COLOUR.test(r.colour || '') ? r.colour : '#222222', ink: COLOUR.test(r.ink || '') ? r.ink : '#ffffff',
    intro: typeof r.intro === 'string' ? r.intro : '', group: typeof r.group === 'string' ? r.group : '', more: r.more && /^\/(?!\/)/.test(r.more.href || '') && r.more.label ? { href: r.more.href, label: r.more.label } : null,
    fields: list(r.fields), topics: list(r.topics), tracks: list(r.tracks), tags: list(r.tags), lanes: list(r.lanes), types: list(r.types), words: list(r.words),
  }));
}

/** The role a request asks for (?role=<id>), or null; ?role=all and unknown ids are null. */
export function roleFrom(params, pack = PACK) {
  const asked = params && typeof params.get === 'function' ? params.get('role') : '';
  /* Old ids a pack has renamed keep working: "aliases": { "teacher": "secondary-teacher" }. */
  const aliases = (pack && pack.roles && pack.roles.aliases) || {};
  const id = typeof aliases[asked] === 'string' ? aliases[asked] : asked;
  return rolesOf(pack).find((r) => r.id === id) || null;
}

const lower = (xs) => xs.map((x) => String(x).toLowerCase());
const hasAny = (a, b) => a.some((x) => b.includes(x));
const TEXT = ['title', 'name', 'summary', 'blurb', 'eligibility', 'whatToExpect', 'role', 'org', 'organiser', 'source', 'sourceName', 'category', 'tag', 'track'];
const wordRe = (w) => new RegExp(`(^|[^a-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

/** How well an item fits a role: 3 per taxonomy it shares (fields, topics, track, tag, lane, type), 1 per role word in its text. */
export function roleScore(role, item) {
  if (!role || !item) return 0;
  let n = 0;
  if (hasAny(role.fields, lower(item.fields || []))) n += 3;
  if (hasAny(role.topics, lower(item.topics || []))) n += 3;
  if (item.track && role.tracks.includes(item.track)) n += 3;
  if (item.tag && role.tags.includes(item.tag)) n += 3;
  if (item.lane && role.lanes.includes(item.lane)) n += 3;
  if ((item.type || item.kind) && role.types.includes(item.type || item.kind)) n += 3;
  const text = TEXT.map((k) => (typeof item[k] === 'string' ? item[k] : '')).join(' ');
  for (const w of role.words) if (wordRe(w).test(text)) n += 1;
  return n;
}

/** `items` with the role's best fits first (stable within a score); unchanged without a role. */
export function byRole(role, items) {
  if (!role) return items;
  return items.map((x, i) => ({ x, i, s: roleScore(role, x) })).sort((a, b) => b.s - a.s || a.i - b.i).map((o) => o.x);
}

/** How many of `items` fit the role at all. */
export const fitting = (role, items) => (role ? items.filter((x) => roleScore(role, x) > 0).length : 0);

/** A block's eyebrow: "For founders" when something in `items` fits the role, else `fallback`. */
export const roleTag = (role, items, fallback = '') => (role && fitting(role, items) ? `For ${role.short}` : fallback);

/** The "I'm a…" chips: links to /?role=<id>, the chosen one marked, and "Everyone" to clear; '' when the pack has no roles. */
export function rolePicker(role, pack = PACK) {
  const roles = rolesOf(pack);
  if (!roles.length) return '';
  const cfg = pack.roles || {};
  const chip = (r) => `<a class="role-chip${role && role.id === r.id ? ' is-on' : ''}" href="/?role=${esc(r.id)}#for-you" data-role="${esc(r.id)}" style="--chip:${esc(r.colour)};--chip-ink:${esc(r.ink)}"${role && role.id === r.id ? ' aria-current="true"' : ''}>${esc(r.label)}</a>`;
  const all = `<a class="role-chip role-all${role ? '' : ' is-on'}" href="/?role=all" data-role="all"${role ? '' : ' aria-current="true"'}>${esc(cfg.everyone || 'Show me everything')}</a>`;
  /* Grouped (opt-in, when the pack's roles name a "group"): each stage under its own heading, as details so a phone can fold them. */
  const groups = [...new Set(roles.map((r) => r.group).filter(Boolean))];
  const chips = groups.length
    ? `<div class="role-groups">${groups.map((g) => `<details class="role-group" open><summary class="role-group-h">${esc(g)}</summary><div class="role-chips">${roles.filter((r) => r.group === g).map(chip).join('')}</div></details>`).join('')}${roles.some((r) => !r.group) ? `<div class="role-chips">${roles.filter((r) => !r.group).map(chip).join('')}</div>` : ''}<div class="role-chips role-chips-all">${all}</div></div>`
    : `<div class="role-chips">${roles.map(chip).join('')}${all}</div>`;
  return `<nav class="role-picker${groups.length ? ' is-grouped' : ''}" aria-labelledby="role-picker-h" data-roles>
  <p class="role-ask" id="role-picker-h">${esc(cfg.ask || "I'm a…")}</p>
  ${chips}
</nav>`;
}

/** The colour block that leads a role's page: who it is for, the intro line and the best next step; '' without a role. */
export function roleIntro(role, pack = PACK) {
  if (!role) return '';
  const cfg = pack.roles || {};
  return `<section class="role-intro" id="for-you" aria-labelledby="role-intro-h">
  <p class="role-kicker">${esc(cfg.kicker || 'For you')}</p>
  <h2 id="role-intro-h">${esc(role.label)}</h2>
  ${role.intro ? `<p class="role-line">${esc(role.intro)}</p>` : ''}
  ${role.more ? `<p><a class="role-go" href="${esc(role.more.href)}">${esc(role.more.label)}</a></p>` : ''}
  <p class="role-note">${esc(cfg.note || 'Below, everything on the page is in order for you: what fits comes first.')}</p>
</section>`;
}

/** The home block: the picker, and with a role chosen its intro. */
export function rolesBlock(role, pack = PACK) {
  const picker = rolePicker(role, pack);
  return picker ? `<section class="section roles-band">${picker}${roleIntro(role, pack)}</section>` : '';
}
