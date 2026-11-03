import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, profileLinks, socialsOf, embeddable, embedHtml, embedScripts, socialRow } from '../src/social.mjs';
import { esc } from '../src/html.mjs';
import PEOPLE_DATA from '../data/people.json' with { type: 'json' };

test('handles come from @name, name or a profile URL, and anything else is refused', () => {
  assert.equal(handle('instagram', '@adalovelacehq'), 'adalovelacehq');
  assert.equal(handle('instagram', 'https://www.instagram.com/adalovelacehq/?hl=en'), 'adalovelacehq');
  assert.equal(handle('x', 'https://twitter.com/adalovelacehq'), 'adalovelacehq');
  assert.equal(handle('x', 'https://x.com/adalovelacehq'), 'adalovelacehq');
  assert.equal(handle('tiktok', 'https://www.tiktok.com/@adalovelacehq'), 'adalovelacehq');
  assert.equal(handle('youtube', '@AdaLovelaceHQ'), 'AdaLovelaceHQ');
  assert.equal(handle('x', 'https://instagram.com/adalovelacehq'), null, 'another network');
  assert.equal(handle('x', 'way_too_long_for_an_x_handle'), null);
  assert.equal(handle('instagram', 'javascript:alert(1)'), null);
  assert.equal(handle('instagram', '<script>'), null);
});

test('known creators carry their handles, and links are built, never stored', () => {
  assert.deepEqual(socialsOf('Nobody We Know'), {});
  assert.deepEqual(socialsOf('BEYONCÉ'), socialsOf('Beyonce'), 'names match without case or accents');
  for (const [name, socials] of Object.entries(PEOPLE_DATA)) {
    assert.deepEqual(socialsOf(name.toUpperCase()), socials, name);
    for (const [network, h] of Object.entries(socials)) assert.equal(handle(network, h), h, `${name} ${network}: ${h} is a handle the site would accept`);
  }
  assert.deepEqual(profileLinks({ x: 'adalovelacehq', instagram: 'adalovelacehq' }).map((l) => l.href), ['https://www.instagram.com/adalovelacehq/', 'https://x.com/adalovelacehq']);
  assert.match(socialRow({ instagram: 'adalovelacehq' }, esc), /href="https:\/\/www\.instagram\.com\/adalovelacehq\/"/);
  assert.equal(socialRow({}, esc), '');
});

test('every creator in the data holds valid handles, where any are recorded', () => {
  for (const [name, socials] of Object.entries(PEOPLE_DATA)) {
    assert.ok(Object.keys(socials).length >= 1, `${name} has at least one handle`);
    for (const [network, h] of Object.entries(socials)) assert.equal(handle(network, h), h, `${name} ${network}`);
  }
});

test('post URLs from Instagram, X, TikTok and YouTube embed; everything else stays a link', () => {
  assert.deepEqual(embeddable('https://www.instagram.com/p/C1a2b3c4d5/?igsh=x'), { network: 'instagram', id: 'C1a2b3c4d5', url: 'https://www.instagram.com/p/C1a2b3c4d5/' });
  assert.equal(embeddable('https://www.instagram.com/reel/C9z8y7x6w5/').network, 'instagram');
  assert.deepEqual(embeddable('https://x.com/adalovelacehq/status/1364123456789012480'), { network: 'x', id: '1364123456789012480', url: 'https://twitter.com/adalovelacehq/status/1364123456789012480' });
  assert.equal(embeddable('https://www.tiktok.com/@adalovelacehq/video/7290123456789012345').network, 'tiktok');
  assert.equal(embeddable('https://youtu.be/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  assert.equal(embeddable('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3').id, 'dQw4w9WgXcQ');
  assert.equal(embeddable('https://www.youtube.com/shorts/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  for (const no of ['https://www.instagram.com/adalovelacehq/', 'https://x.com/adalovelacehq', 'https://example.com/p/abc', 'javascript:alert(1)', '', null]) assert.equal(embeddable(no), null, String(no));
  const yt = embedHtml(embeddable('https://youtu.be/dQw4w9WgXcQ'), esc);
  assert.match(yt, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  const ig = embedHtml(embeddable('https://www.instagram.com/p/C1a2b3c4d5/'), esc);
  assert.match(ig, /class="instagram-media"[^>]*data-instgrm-permalink="https:\/\/www\.instagram\.com\/p\/C1a2b3c4d5\/"/);
  assert.match(ig, /<a href="https:\/\/www\.instagram\.com\/p\/C1a2b3c4d5\/"/, 'a plain link before the script loads');
  const scripts = embedScripts([embeddable('https://x.com/a/status/123456789'), embeddable('https://x.com/b/status/987654321'), embeddable('https://youtu.be/dQw4w9WgXcQ'), null]);
  assert.equal(scripts, '<script async src="https://platform.twitter.com/widgets.js"></script>', 'one script per network, none for YouTube');
});

test('LinkedIn and Facebook profiles parse from their URLs; share links do not', () => {
  assert.equal(handle('linkedin', 'https://www.linkedin.com/company/womeninstem/about/'), 'company/womeninstem');
  assert.equal(handle('linkedin', 'https://www.linkedin.com/feed/'), null);
  assert.equal(handle('facebook', 'https://www.facebook.com/WomenInStemTV'), 'WomenInStemTV');
  assert.deepEqual(profileLinks({ linkedin: 'company/womeninstem' }).map((l) => l.href), ['https://www.linkedin.com/company/womeninstem/']);
});

test('a story tags the people and organisations it names only when it holds their handles', async () => {
  const { default: worker } = await import('../src/worker.mjs');
  const { SEED_STORIES } = await import('../src/content.mjs');
  for (const story of SEED_STORIES.filter((x) => (x.orgs || []).length || (x.people || []).length).slice(0, 12)) {
    const r = await worker.fetch(new Request(`https://womenabc.com/story/${story.slug}`), { ASSETS: { fetch: async () => new Response('', { status: 404 }) } });
    assert.equal(r.status, 200, story.slug);
    const t = await r.text();
    for (const name of [...(story.people || []), ...(story.orgs || [])]) {
      const links = profileLinks(socialsOf(name));
      if (links.length) assert.match(t, new RegExp(`<strong>${esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</strong>`), `${story.slug}: ${name} is tagged`);
      else assert.ok(!t.includes(`<strong>${esc(name)}</strong>`), `${story.slug}: ${name} has no handles, so is not tagged`);
    }
  }
});
