/* Spotlight: groups of people (leaders, rising names, creatives) or courses, each a card with a role and a link to where it
 * can be checked. Data is the pack's data/spotlight.json; a group with no entries renders nothing. */
import list from '../../data/spotlight.json' with { type: 'json' };
import { esc, sectionHead } from '../html.mjs';

export const SPOTLIGHT = list;

const initials = (n) => String(n).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** One group as a section of cards; '' when the group is unknown or empty. */
export function spotlightBlock(id) {
  const g = SPOTLIGHT.find((x) => x.id === id);
  if (!g || !(g.people || []).length) return '';
  const card = (p) => `<a class="spot-card" href="${esc(p.url)}" rel="noopener">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : `<span class="spot-initials" aria-hidden="true">${esc(initials(p.name))}</span>`}<span class="spot-text"><b>${esc(p.name)}</b><small>${esc(p.role)}</small></span></a>`;
  return `<section class="section spotlight" id="spot-${esc(g.id)}">${sectionHead(g.title, g.more || null, g.lead || '', g.kicker || '')}<div class="spot-grid">${g.people.map(card).join('')}</div>${g.credit ? `<p class="ch-credits">${esc(g.credit)}</p>` : ''}</section>`;
}
