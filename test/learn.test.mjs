import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, validLesson, onSite, tracks } from '../src/learn.mjs';
import { learnRoute, learnBlock } from '../src/pages/learn.mjs';

const sample = { id: 'first-prompt', track: 'Basics', title: 'Your first prompt', minutes: 3, summary: 'Ask clearly.', steps: [{ title: 'Say who it is for', text: 'Name the reader.' }, { title: 'Say the shape', text: 'A list, a note.' }], try: { text: 'Write one now.', href: '/create?kind=note' }, sources: [{ title: 'A course', by: 'An org', url: 'https://example.com/' }] };

test('with no lessons, /learn and any lesson path are 404 and the home block is empty', async () => {
  assert.equal(learnRoute('/learn', []).status, 404);
  assert.equal(learnRoute('/learn/anything', []).status, 404);
  assert.equal(learnRoute('/stories', []), null);
  assert.equal(learnBlock(4, []), '');
});

test('a lesson renders its title, every step, the try link and the reviewed-from credit', async () => {
  const r = learnRoute('/learn/first-prompt', [sample]);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<h1>Your first prompt<\/h1>/);
  for (const s of sample.steps) assert.ok(html.includes(s.title) && html.includes(s.text));
  assert.ok(html.includes('href="/create?kind=note"'));
  assert.match(html, /Reviewed from: <a href="https:\/\/example.com\/"/);
  const list = await learnRoute('/learn', [sample]).text();
  assert.ok(list.includes('href="/learn/first-prompt"') && list.includes('Basics'));
  assert.equal(learnRoute('/learn/nope', [sample]).status, 404);
});

test('a try link must stay on this site: external hrefs are rejected', () => {
  assert.ok(validLesson(sample));
  for (const href of ['https://example.com/', '//example.com/', 'example.com', 'javascript:alert(1)', '']) assert.equal(validLesson({ ...sample, try: { text: 't', href } }), false, href);
  assert.equal(validLesson({ ...sample, minutes: 30 }), false);
  assert.ok(onSite('/stories'));
});

test("every lesson in this site's data is valid, with unique ids and an on-site try link", () => {
  assert.ok(Array.isArray(LESSONS));
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
  for (const l of LESSONS) { assert.ok(validLesson(l), `lesson ${l.id} is malformed or links off site`); assert.ok(l.steps.length >= 3 && l.steps.length <= 5, `${l.id} has 3 to 5 steps`); }
  assert.equal(tracks(LESSONS).reduce((n, t) => n + t.lessons.length, 0), LESSONS.length);
});

test('a lesson picture shows on its card and page, and AI-drafted lessons say so', async () => {
  const l = { ...sample, image: { src: '/img/learn/first-prompt.svg', alt: 'A text box' }, drafted: 'ai' };
  const html = await learnRoute('/learn/first-prompt', [l]).text();
  assert.ok(html.includes('src="/img/learn/first-prompt.svg"') && html.includes('alt="A text box"'));
  assert.match(html, /Drafted with AI from the linked sources/);
  assert.match(await learnRoute('/learn', [l]).text(), /class="lesson-card has-pic"/);
  const off = await learnRoute('/learn/first-prompt', [{ ...l, image: { src: 'https://example.com/x.png' }, drafted: undefined }]).text();
  assert.ok(!off.includes('example.com/x.png') && !off.includes('Drafted with AI'));
  for (const x of LESSONS) if (x.image) assert.ok(onSite(x.image.src) && x.image.alt, `${x.id} picture is on site with alt text`);
});
