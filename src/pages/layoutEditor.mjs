import { esc, layout } from '../html.mjs';
import { VARIANTS, WIDTHS } from '../layout.mjs';
import { HOME_BLOCKS } from './home.mjs';

/* What each block is, in the owner's words. */
const NAMES = { hero: 'Hero: headline, top stories, map and what is on', roles: "I'm a…: the role picker that re-forms the page", 'good-news': 'More good news', headlines: 'From around the web', 'open-doors': 'Open doors', 'more-opportunities': 'More opportunities', showcase: 'From the showcase', cta: 'Take part', learn: 'Learn: a few short lessons', writing: 'Writing: the latest articles', speakers: 'Speakers: a few people to invite', festivals: 'Festivals and competitions open for entries', 'jobs-bounties': 'Careers: jobs that show the pay, and bounties', 'mentors-rooms': 'Careers: mentors and rooms' };

/** /admin/layout: arrange the home page. Drag blocks (or use the arrows), pick a style and a width, add or remove blocks; every change
 * saves the draft and refreshes the preview beside it. Publish makes the draft the page everyone sees. */
export function layoutEditorPage({ draft, published, isDraft }) {
  const catalogue = Object.keys(HOME_BLOCKS).map((k) => ({ block: k, name: NAMES[k] || k, variants: VARIANTS[k] || [] }));
  const body = `
<section class="page-head admin-head"><p class="eyebrow">Owner</p><h1>Arrange the home page</h1>
<p class="lead">Drag the blocks into the order you want, choose how each one looks, and watch the preview. Nothing changes for visitors until you press Publish. You can also ask for it in a sentence: "move Open doors to the top", "make the hero full width".</p></section>
<section class="layout-editor" data-layout-editor>
  <div class="le-panel">
    <ol class="le-list" aria-label="Blocks on the home page"></ol>
    <p class="le-add"><label for="le-add-select">Add a block</label> <select id="le-add-select"></select> <button type="button" class="button small" data-le-add>Add</button></p>
    <p class="le-actions"><span class="le-state" role="status" aria-live="polite">${isDraft ? 'You have an unpublished draft.' : 'Showing what is live.'}</span>
      <button type="button" class="button primary" data-le-publish>Publish</button>
      <button type="button" class="button ghost" data-le-reset>Back to the default</button></p>
  </div>
  <div class="le-preview"><iframe title="Preview of the home page" src="/admin/layout/frame" loading="eager"></iframe></div>
  <script type="application/json" id="le-data">${JSON.stringify({ catalogue, widths: WIDTHS, draft, published }).replace(/</g, '\\u003c')}</script>
</section>
<script src="/admin-layout.js" defer></script>`;
  return layout({ title: 'Arrange the home page', path: '/admin/layout', body, noindex: true });
}
