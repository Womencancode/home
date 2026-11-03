import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/site.mjs';
import { betaPill, layout } from '../src/html.mjs';

test('the Beta pill shows beside the wordmark only when the pack says "beta": true', () => {
  assert.equal(betaPill({ ...PACK, beta: true }), '<span class="beta-pill">Beta</span>');
  assert.equal(betaPill({ ...PACK, beta: undefined }), '');
  assert.equal(betaPill({ ...PACK, beta: 'yes' }), '', 'only a real true switches it on');
  const shell = layout({ title: 't', path: '/', body: '' });
  const pills = (shell.match(/class="beta-pill"/g) || []).length;
  if (PACK.beta === true) {
    assert.equal(pills, 2, 'in the header wordmark and the footer brand');
    assert.match(shell, /<a class="(?:brand|mast-brand)"[^>]*>[\s\S]*?<span class="beta-pill">Beta<\/span><\/a>/, 'beside the wordmark in the header, or in the masthead bar when the pack uses one');
    assert.match(shell, /<p class="footer-brand">[\s\S]*?<span class="beta-pill">Beta<\/span><\/p>/);
  } else assert.equal(pills, 0, 'absent without the flag');
});
