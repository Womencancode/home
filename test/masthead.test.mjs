import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, mastheadOf } from '../src/html.mjs';
import { coverHero } from '../src/pages/cover.mjs';
import { PACK } from '../src/site.mjs';

const pic = { src: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A.jpg', page: 'https://commons.wikimedia.org/wiki/File:A.jpg', credit: 'A. Photographer', licence: 'CC BY 4.0', portrait: true };
const lead = { slug: 'lead', title: 'RAYE wins the 2026 Mercury Prize', category: 'Music', people: ['RAYE'], countryRecord: { flag: '🇬🇧', name: 'United Kingdom' } };
const cover = { words: [{ text: 'Site' }, { text: 'Name', accent: true }], strap: 'nav', since: '2026-10' };
const OFF = { ...PACK, cover, masthead: undefined };
const ON = { ...PACK, cover, masthead: { mode: 'nav', sticky: true } };
const page = (pack, withCover) => {
  const body = withCover ? coverHero({ stories: [lead], pack, portrait: () => pic }) : '<p>Hi</p>';
  return layout({ title: 'T', path: withCover ? '/' : '/about', body, cover: withCover || undefined }, pack);
};
const headers = (html) => html.match(/<header\b[^>]*>/g) || [];
const between = (html, open, close) => html.slice(html.indexOf(open), html.indexOf(close, html.indexOf(open)));

test('the masthead is off unless a pack asks for it with mode "nav"', () => {
  assert.equal(mastheadOf({}), null);
  assert.equal(mastheadOf({ masthead: { mode: 'other' } }), null);
  assert.deepEqual(mastheadOf({ masthead: { mode: 'nav' } }), { sticky: true });
  assert.deepEqual(mastheadOf({ masthead: { mode: 'nav', sticky: false } }), { sticky: false });
});

test('off, the page and the cover are exactly what they were: the site header, no masthead markup', () => {
  for (const withCover of [false, true]) {
    const off = page(OFF, withCover);
    assert.equal(page({ ...OFF, masthead: { mode: 'none' } }, withCover), off);
    assert.equal(headers(off).length, 1);
    assert.match(off, /<header class="site-header">/);
    assert.ok(!/mast-bar|class="mast"|mast-tools|<noscript>/.test(off));
  }
  assert.match(coverHero({ stories: [lead], pack: OFF, portrait: () => pic }), /<p class="mag-masthead" aria-hidden="true">/);
});

test('on, a cover page has one header, the masthead, with the wordmark, the menu, Ask and Language inside the cover card', () => {
  const html = page(ON, true);
  assert.deepEqual(headers(html), ['<header class="mast">']);
  const mast = between(html, '<header class="mast">', '</header>');
  assert.ok(between(html, '<div class="mag-cover">', '<p class="mag-credit">').includes('<header class="mast">'), 'inside the card');
  assert.match(mast, /<a class="mag-masthead" href="\/" aria-label="[^"]+ home" translate="no"><span>Site<\/span> <span class="mh-accent">Name<\/span><\/a>/);
  assert.match(mast, /<nav class="mag-strapline"/);
  assert.match(mast, /class="ask-open"/);
  assert.match(mast, /<details class="lang-menu">/);
  assert.ok(!html.includes('class="site-header"'));
});

test('on, a page without a cover gets the condensed bar as its one header, sticky, with the menu behind a toggle', () => {
  const html = page(ON, false);
  assert.equal(headers(html).length, 1);
  assert.match(html, /<header class="mast-bar is-sticky">/);
  const bar = between(html, '<header class="mast-bar', '</header>');
  assert.match(bar, /<a class="mast-brand" href="\/"[^>]*><span>Site<\/span> <span class="mh-accent">Name<\/span>/, 'the wordmark comes from the cover words');
  assert.match(bar, /<details class="mast-menu"><summary aria-label="Menu">[\s\S]*<nav class="site-nav" aria-label="Main">/);
  assert.match(bar, /class="ask-open"/);
  assert.match(bar, /<details class="lang-menu">/);
  assert.match(bar, /<!--live-moment-->/);
  assert.ok(!page({ ...ON, masthead: { mode: 'nav', sticky: false } }, false).includes('is-sticky'));
});

test('after a cover the bar is shown by script once the masthead scrolls away; without script it simply shows', () => {
  const html = page(ON, true);
  assert.match(html, /<div class="mast-bar is-sticky" data-after-cover>/);
  assert.match(html, /<noscript><style>\.mast-bar\[data-after-cover\]\{position:sticky;transform:none;visibility:visible\}<\/style><\/noscript>/);
  assert.ok(html.indexOf('<noscript>') < html.indexOf('</head>'));
  const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(js, /\.mast-bar\[data-after-cover\]/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /classList\.add\('is-shown'\)/, 'no observer: the bar shows');
  assert.ok(!page({ ...ON, masthead: { mode: 'nav', sticky: false } }, true).includes('<div class="mast-bar'), 'sticky false: no bar after the cover');
});

test('the Language menu is a details element and every link works without script', () => {
  for (const html of [page(ON, true), page(ON, false)]) {
    for (const m of html.match(/<details class="lang-menu">[\s\S]*?<\/details>/g)) assert.match(m, /href="https:\/\/translate\.google\.com\/translate\?sl=en&amp;tl=fr/);
  }
});

test('Ask, Language, Menu and the wordmark keep their accessible names; phones hide the words, not the names', () => {
  const html = page(ON, true);
  for (const b of html.match(/<button type="button" class="ask-open"[^>]*>/g)) assert.match(b, /aria-label="Ask"/);
  for (const s of html.match(/<details class="lang-menu"><summary[^>]*>/g)) assert.match(s, /aria-label="Read in your language"/);
  assert.match(html, /<summary aria-label="Menu">/);
  assert.match(html, /class="mast-brand" href="\/" aria-label="[^"]+ home(, beta)?"/);
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const mast = css.slice(css.indexOf('/* The masthead as the header'));
  assert.match(mast, /\.mast-label,\.mast-tools \.ask-label,\.mast-tools \.lang-label\{display:inline;position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)/);
});

test('the engine styles the masthead with variables and neutral defaults, no site colours or fonts', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const mast = css.slice(css.indexOf('/* The masthead as the header'));
  for (const v of ['--mast-bg', '--mast-ink', '--mast-accent', '--mast-font', '--mast-line']) assert.ok(mast.includes(`${v}:`), v);
  assert.ok(!/font-family:\s*['"]/.test(mast) && !/--mast-font:['"]/.test(mast), 'no named font');
  assert.deepEqual([...new Set(mast.match(/#[0-9a-f]{3,6}\b/gi) || [])], ['#fff'], 'only white, for type on a photograph');
});
