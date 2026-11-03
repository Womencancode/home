/* Page layouts: a page is an ordered list of blocks, each { block, variant?, width?, style? }. A site pack sets its default in
 * site.json ("layout": { "home": [...] }); the owner can save their own from /admin/layout. Unknown blocks render nothing. */
import { PACK } from './site.mjs';

/** The engine's own home layout, used when a pack names none. */
export const DEFAULT_HOME = [
  { block: 'hero', variant: 'split' }, { block: 'good-news' }, { block: 'headlines' }, { block: 'open-doors' },
  { block: 'more-opportunities' }, { block: 'showcase' }, { block: 'cta' },
];

/** Widths a block can take: contained (the page column), wide (to the edges of the content area) or full (edge to edge). */
export const WIDTHS = ['contained', 'wide', 'full'];

/** The home layout to render: a saved one if valid, else the pack's, else the engine default. */
export function homeLayout(saved) {
  const pick = valid(saved) ? saved : valid(PACK.layout && PACK.layout.home) ? PACK.layout.home : DEFAULT_HOME;
  return pick.map((b) => ({ ...b }));
}

/** A layout is a non-empty list of objects that each name a block. */
export function valid(list) {
  return Array.isArray(list) && list.length > 0 && list.length <= 40 && list.every((b) => b && typeof b.block === 'string' && /^[a-z-]{2,40}$/.test(b.block));
}

/** Presentation options per block: the first of each list is the default and adds nothing to the markup. */
export const VARIANTS = {
  hero: ['split', 'stacked', 'spotlight', 'manifesto', 'create', 'cover'],
  'good-news': ['grid', 'carousel', 'list'],
  showcase: ['grid', 'carousel', 'list'],
  'open-doors': ['grid', 'carousel', 'list'],
  'more-opportunities': ['grid', 'carousel', 'list'],
};

/** One block's HTML. Defaults render bare; any other variant or width wraps it in classes the stylesheet styles. */
export function renderBlock(registry, b, x) {
  const draw = registry[b.block];
  if (!draw) return '';
  const html = draw(x, b);
  const options = VARIANTS[b.block] || [];
  const variant = options.includes(b.variant) && b.variant !== options[0] ? b.variant : '';
  const width = WIDTHS.includes(b.width) && b.width !== 'contained' ? b.width : '';
  if (!html || (!variant && !width)) return html;
  return `<div class="blk blk-${b.block}${variant ? ` v-${variant}` : ''}${width ? ` w-${width}` : ''}" data-block="${b.block}">${html}</div>`;
}

/** A layout reduced to known fields and values, so nothing else a browser sends is stored. */
export function cleanLayout(list) {
  return list.filter((b) => b && typeof b.block === 'string').slice(0, 40).map((b) => {
    const out = { block: b.block };
    if ((VARIANTS[b.block] || []).includes(b.variant)) out.variant = b.variant;
    if (WIDTHS.includes(b.width)) out.width = b.width;
    if (b.strip === false) out.strip = false;
    if (b.picker === false) out.picker = false;
    if (b.aside === 'roles') out.aside = 'roles';
    if (typeof b.group === 'string' && /^[a-z0-9-]{1,40}$/.test(b.group)) out.group = b.group;
    return out;
  });
}
