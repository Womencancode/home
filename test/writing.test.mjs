import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTS, validPost, postBySlug } from '../src/posts.mjs';
import { writingRoute, writingBlock } from '../src/pages/writing.mjs';

const post = (o = {}) => ({ slug: 'first-post', date: '2026-10-30', tag: 'Your data', title: 'A first post', summary: 'In plain words.', image: { src: '/img/writing/first-post.svg', alt: 'A shield' }, sections: [{ text: 'Opening line.' }, { title: 'Then', text: 'One paragraph.\n\nAnother paragraph.' }], sources: [{ title: 'A page', by: 'An org', url: 'https://example.com/page', date: '2026-10-01' }], drafted: 'ai', ...o });

test('with no posts, /writing and any post path are 404 and the home block is empty', () => {
  assert.equal(writingRoute('/writing', []).status, 404);
  assert.equal(writingRoute('/writing/anything', []).status, 404);
  assert.equal(writingRoute('/learn', []), null);
  assert.equal(writingBlock(3, []), '');
});

test('a post renders its title, date, sections as paragraphs, picture, sources and the AI line', async () => {
  const r = writingRoute('/writing/first-post', [post()]);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<h1>A first post<\/h1>/);
  assert.ok(html.includes('30 October 2026') && html.includes('<h2>Then</h2>') && html.includes('<p>Another paragraph.</p>'));
  assert.ok(html.includes('src="/img/writing/first-post.svg"') && html.includes('alt="A shield"'));
  assert.match(html, /<a href="https:\/\/example.com\/page" rel="noopener" target="_blank">A page<\/a>, An org \(2026-10-01\)/);
  assert.match(html, /Drafted with AI from the linked sources\. Check the links/);
  assert.match(await writingRoute('/writing/first-post', [post({ reviewed: true })]).text(), /reviewed by our editor/);
  assert.match(html, /"@type":"Article"/);
  assert.equal(writingRoute('/writing/nope', [post()]).status, 404);
});

test('the list and home block show newest first and link each post', async () => {
  const two = [post({ slug: 'newer', title: 'Newer', date: '2026-10-30' }), post({ slug: 'older', title: 'Older', date: '2026-09-01' })];
  const list = await writingRoute('/writing', two).text();
  assert.ok(list.indexOf('href="/writing/newer"') < list.indexOf('href="/writing/older"'));
  assert.match(writingBlock(1, two), /href="\/writing\/newer"/);
  assert.ok(!writingBlock(1, two).includes('/writing/older'));
});

test('malformed posts are refused: bad slug or date, no text, off-site picture or a non-https source', () => {
  assert.ok(validPost(post()));
  assert.equal(validPost(post({ slug: 'Bad Slug' })), false);
  assert.equal(validPost(post({ date: '30/10/2026' })), false);
  assert.equal(validPost(post({ sections: [] })), false);
  assert.equal(validPost(post({ sections: [{ title: 'x', text: '' }] })), false);
  assert.equal(validPost(post({ image: { src: 'https://example.com/x.png' } })), false);
  assert.equal(validPost(post({ sources: [{ title: 'x', url: 'http://example.com/' }] })), false);
});

test("every post in this site's data is valid and unique, newest first, with a picture that has alt text", () => {
  assert.equal(new Set(POSTS.map((p) => p.slug)).size, POSTS.length);
  for (let i = 0; i < POSTS.length; i += 1) {
    assert.ok(validPost(POSTS[i]), POSTS[i].slug);
    if (POSTS[i].image) assert.ok(POSTS[i].image.alt, `${POSTS[i].slug} has alt text`);
    if (i) assert.ok(POSTS[i - 1].date >= POSTS[i].date);
    assert.equal(postBySlug(POSTS[i].slug), POSTS[i]);
  }
});
